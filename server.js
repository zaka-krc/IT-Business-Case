const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

// Versleutelingssleutel
const SECRET_KEY = process.env.SECRET_KEY || 'default-dev-secret';

// MySQL Configuratie
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'bestell_app',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// RabbitMQ Verbindings-URL
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EXCHANGE_NAME = 'salesforce_exchange';
const QUEUE_NAME = 'salesforce_queue';
const BACKUP_QUEUE_NAME = 'salesforce_backup_local';
const CA_CERT_PATH = './certs/ca_certificate.pem';

// SSL voor RabbitMQ
let sslOptions = {};
try {
    if (fs.existsSync(CA_CERT_PATH)) {
        sslOptions = {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            servername: 'rabbitmq-server',
            checkServerIdentity: () => undefined
        };
    }
} catch (err) {
    console.error("Error reading CA certificate:", err);
}

// --- PRODUCTEN ENDPOINT ---
app.get('/api/products', async (req, res) => {
    try {
        // Zorg dat de kolomnamen matchen met wat de frontend verwacht (image vs image_url)
        const [rows] = await pool.execute('SELECT id, name, price, image_url as image, stock, description FROM products');
        res.json(rows);
    } catch (error) {
        console.error('Error fetching products:', error);
        // Geef specifieke fout terug voor debugging (in productie verbergen!)
        res.status(500).json({ error: 'Failed to fetch products', details: error.message });
    }
});

// --- AUTHENTICATIE & GEBRUIKERSBEHEER (MySQL) ---

// REGISTER
app.post('/api/register', async (req, res) => {
    let { email, password, firstName, lastName } = req.body;

    // Validatie en Trimming
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ status: 'error', message: 'Alle velden zijn verplicht.' });
    }

    email = email.trim();
    password = password.trim();
    firstName = firstName.trim();
    lastName = lastName.trim();

    try {
        // Check bestaande user
        const [existing] = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).json({ status: 'error', message: 'Gebruiker bestaat al.' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const salesforceId = crypto.randomUUID();

        // Insert - Let op de kolomnamen uit schema.sql
        const [result] = await pool.execute(
            `INSERT INTO users (salesforce_external_id, email, password_hash, first_name, last_name, street, house_number, zipcode) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [salesforceId, email, hashedPassword, firstName, lastName, '', '', '']
        );

        res.json({
            status: 'success',
            user: {
                id: result.insertId,
                firstName,
                lastName,
                email,
                salesforce_external_id: salesforceId
            }
        });

    } catch (error) {
        console.error('Register SQL Error:', error);
        // Stuur de echte SQL foutmelding terug voor debugging
        res.status(500).json({ status: 'error', message: 'Database fout bij registreren: ' + error.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email en wachtwoord verplicht.' });
    }

    email = email.trim();
    password = password.trim();

    try {
        const [rows] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);

        if (rows.length === 0) {
            return res.status(401).json({ status: 'error', message: 'Ongeldige inloggegevens (User not found).' });
        }

        const user = rows[0];
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ status: 'error', message: 'Ongeldige inloggegevens (Password mismatch).' });
        }

        res.json({
            status: 'success',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                salesforce_external_id: user.salesforce_external_id,
                address: {
                    street: user.street,
                    number: user.house_number,
                    zipcode: user.zipcode
                }
            }
        });
    } catch (error) {
        console.error('Login SQL Error:', error);
        res.status(500).json({ status: 'error', message: 'Login mislukt: ' + error.message });
    }
});

// UPDATE USER (Adres)
app.put('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    const { street, number, zipcode } = req.body;

    try {
        const [result] = await pool.execute(
            'UPDATE users SET street = ?, house_number = ?, zipcode = ? WHERE id = ?',
            [street, number, zipcode, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'Gebruiker niet gevonden om te updaten.' });
        }

        // Fetch updated user to return
        const [rows] = await pool.execute('SELECT * FROM users WHERE id = ?', [userId]);
        const user = rows[0];

        res.json({
            status: 'success',
            message: 'Adres bijgewerkt.',
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                salesforce_external_id: user.salesforce_external_id,
                address: {
                    street: user.street,
                    number: user.house_number,
                    zipcode: user.zipcode
                }
            }
        });
    } catch (error) {
        console.error('Update Error:', error);
        res.status(500).json({ status: 'error', message: 'Update mislukt.' });
    }
});

// DELETE USER
app.delete('/api/user/:id', async (req, res) => {
    const userId = req.params.id;
    try {
        const [result] = await pool.execute('DELETE FROM users WHERE id = ?', [userId]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ status: 'error', message: 'Gebruiker niet gevonden.' });
        }

        res.json({ status: 'success', message: 'Account verwijderd.' });
    } catch (error) {
        console.error('Delete Error:', error);
        res.status(500).json({ status: 'error', message: 'Delete mislukt.' });
    }
});

// --- ORDERS & RABBITMQ ---

// RabbitMQ Sender
async function sendToQueue(data) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        await channel.assertQueue(BACKUP_QUEUE_NAME, { durable: true });
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');
        await channel.bindQueue(BACKUP_QUEUE_NAME, EXCHANGE_NAME, '');

        const { items, customer, orderId, totalOrderPrice } = data;

        const messagePayload = {
            orderId: orderId,
            orderDate: new Date().toISOString(),
            customer: customer,
            items: items,
            totalAmount: totalOrderPrice
        };

        const encryptedMessage = CryptoJS.AES.encrypt(JSON.stringify(messagePayload), SECRET_KEY).toString();

        channel.publish(EXCHANGE_NAME, '', Buffer.from(encryptedMessage), { persistent: true });

        console.log(`Message sent to ${EXCHANGE_NAME} for Order ${orderId}`);

        setTimeout(() => { if (connection) connection.close(); }, 500);
        return true;
    } catch (error) {
        console.error('RabbitMQ Error:', error);
        if (connection) try { connection.close(); } catch (e) { }
        throw error;
    }
}

// Bestelling plaatsen (Met Transactie & Stock Check)
app.post('/api/send', async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const { items, customer } = req.body;

        if (!items || items.length === 0 || !customer) {
            throw new Error('Invalid order data');
        }

        // Valideer en update stock voor elk item
        const processedItems = [];
        let totalOrderPrice = 0;

        for (const item of items) {
            // Lock de row voor update
            const [rows] = await connection.execute('SELECT * FROM products WHERE id = ? FOR UPDATE', [item.id]);

            if (rows.length === 0) throw new Error(`Product ${item.id} niet gevonden`);
            const product = rows[0];

            if (product.stock < item.quantity) {
                throw new Error(`Onvoldoende voorraad voor ${product.name}. Beschikbaar: ${product.stock}`);
            }

            // Update stock
            await connection.execute('UPDATE products SET stock = stock - ? WHERE id = ?', [item.quantity, item.id]);

            processedItems.push({
                productId: product.id,
                salesforceId: product.salesforce_external_id,
                productName: product.name,
                quantity: item.quantity,
                unitPrice: product.price,
                totalPrice: product.price * item.quantity
            });
            totalOrderPrice += product.price * item.quantity;
        }

        // Als DB updates gelukt zijn, stuur naar RabbitMQ
        // Gebruik salesforce_external_id van user als die er is (check via email in DB of stuur gewoon mee van frontend als die geupdate is)

        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

        await sendToQueue({
            orderId,
            customer,
            items: processedItems,
            totalOrderPrice
        });

        await connection.commit();
        res.json({ status: 'success', message: 'Order processed successfully', orderId });

    } catch (error) {
        await connection.rollback();
        console.error('Order Transaction Error:', error);
        res.status(500).json({ status: 'error', message: error.message || 'Order failed' });
    } finally {
        connection.release();
    }
});

// Consumer Endpoints (Ongewijzigd, alleen connectie fix)
async function consumeMessages(queueName = QUEUE_NAME) {
    // ... bestaande logica kan hier blijven of simpeler
    // Voor nu even simpele implementatie om het werkend te houden zoals voorheen
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        await channel.assertQueue(queueName, { durable: true });

        const messages = [];
        let msg = await channel.get(queueName);
        if (msg) {
            const content = msg.content.toString();
            try {
                const bytes = CryptoJS.AES.decrypt(content, SECRET_KEY);
                const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
                messages.push(decrypted);
                channel.ack(msg);
            } catch (e) { console.error(e); channel.nack(msg, false, false); }
        }

        setTimeout(() => { if (connection) connection.close(); }, 200);
        return messages;
    } catch (e) {
        console.error(e);
        if (connection) connection.close();
        return [];
    }
}

app.get('/api/consume', async (req, res) => {
    const msgs = await consumeMessages(QUEUE_NAME);
    res.json({ status: 'success', data: msgs });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log('Connected to MySQL');
});