const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = 3000;

// Versleutelingssleutel
const SECRET_KEY = process.env.SECRET_KEY || 'default-dev-secret';

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

// --- RABBITMQ SEND FUNCTIE ---
async function sendToQueue(orderData) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        // Versleutel de data
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(orderData), SECRET_KEY).toString();

        channel.sendToQueue(QUEUE_NAME, Buffer.from(encrypted), { persistent: true });
        console.log(`📤 Order ${orderData.orderId} verzonden naar RabbitMQ`);

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('RabbitMQ Send Error:', error);
        if (connection) await connection.close();
        throw error;
    }
}

// --- PRODUCTEN ENDPOINT ---
app.get('/api/products', (req, res) => {
    db.all("SELECT id, name, price, image_url, stock, description, product_code FROM products", [], (err, rows) => {
        if (err) {
            console.error('Error fetching products:', err);
            return res.status(500).json({ error: err.message });
        }
        // Map image_url to image for frontend compatibility
        const products = rows.map(row => ({
            ...row,
            image: row.image_url
        }));
        res.json(products);
    });
});

// --- AUTHENTICATIE & GEBRUIKERSBEHEER (SQLite) ---

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
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, existingUser) => {
            if (err) {
                console.error('Register DB Error:', err);
                return res.status(500).json({ status: 'error', message: 'Database fout: ' + err.message });
            }

            if (existingUser) {
                return res.status(400).json({ status: 'error', message: 'Gebruiker bestaat al.' });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            const salesforceId = crypto.randomUUID();

            // Insert new user
            db.run(
                `INSERT INTO users (salesforce_external_id, email, password_hash, first_name, last_name, street, house_number, zipcode) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [salesforceId, email, hashedPassword, firstName, lastName, '', '', ''],
                function (err) {
                    if (err) {
                        console.error('Insert User Error:', err);
                        return res.status(500).json({ status: 'error', message: 'Database fout bij registreren: ' + err.message });
                    }

                    res.json({
                        status: 'success',
                        user: {
                            id: this.lastID,
                            firstName,
                            lastName,
                            email,
                            salesforce_external_id: salesforceId
                        }
                    });
                }
            );
        });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ status: 'error', message: 'Registreren mislukt: ' + error.message });
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
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Login DB Error:', err);
                return res.status(500).json({ status: 'error', message: 'Database fout: ' + err.message });
            }

            if (!user) {
                return res.status(401).json({ status: 'error', message: 'Ongeldige inloggegevens (User not found).' });
            }

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
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ status: 'error', message: 'Login mislukt: ' + error.message });
    }
});

// UPDATE USER (Adres)
app.put('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const { street, number, zipcode } = req.body;

    db.run(
        'UPDATE users SET street = ?, house_number = ?, zipcode = ? WHERE id = ?',
        [street, number, zipcode, userId],
        function (err) {
            if (err) {
                console.error('Update Error:', err);
                return res.status(500).json({ status: 'error', message: 'Update mislukt: ' + err.message });
            }

            if (this.changes === 0) {
                return res.status(404).json({ status: 'error', message: 'Gebruiker niet gevonden om te updaten.' });
            }

            // Fetch updated user to return
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) {
                    return res.status(500).json({ status: 'error', message: 'Fout bij ophalen user: ' + err.message });
                }

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
            });
        }
    );
});

// DELETE USER
app.delete('/api/user/:id', (req, res) => {
    const userId = req.params.id;

    db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
        if (err) {
            console.error('Delete Error:', err);
            return res.status(500).json({ status: 'error', message: 'Delete mislukt: ' + err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ status: 'error', message: 'Gebruiker niet gevonden.' });
        }

        res.json({ status: 'success', message: 'Account verwijderd.' });
    });
});

// --- ORDERS ---
// Bestelling plaatsen
app.post('/api/send', (req, res) => {
    const orderData = req.body;

    // 1. Validatie
    if (!orderData || !orderData.items || orderData.items.length === 0 || !orderData.customer) {
        return res.status(400).json({ status: 'error', message: 'Mandje is leeg of gegevens ontbreken' });
    }

    // We pakken het eerste item uit de bestelling om de voorraad te checken
    const item = orderData.items[0];

    // 2. SQL Query: Verminder de voorraad alleen als er genoeg is (stock >= quantity)
    const sql = `UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?`;

    db.run(sql, [item.quantity, item.id, item.quantity], async function (err) {
        if (err) {
            console.error("Database fout:", err.message);
            return res.status(500).json({ status: 'error', message: 'Interne database fout' });
        }

        // 'this.changes' is 0 als de WHERE clause niet klopte (dus niet genoeg voorraad)
        if (this.changes === 0) {
            return res.status(400).json({
                status: 'error',
                message: `Helaas, niet genoeg voorraad voor ${item.name}!`
            });
        }

        // 3. Voorraad is afgeschreven, nu pas naar RabbitMQ sturen
        try {
            console.log(`✅ Voorraad gereserveerd voor ${item.name}. Bericht sturen naar RabbitMQ...`);

            // Genereer Order ID en bereken totaalbedrag
            orderData.orderId = Date.now(); // Numeriek ID
            orderData.totalAmount = orderData.items.reduce((sum, i) => sum + (i.price * i.quantity), 0);

            console.log("DEBUG SERVER: sending orderData", JSON.stringify(orderData));

            await sendToQueue(orderData);
            res.json({
                status: 'success',
                message: 'Bestelling gelukt! Voorraad is bijgewerkt en data is onderweg naar Salesforce.'
            });
        } catch (error) {
            console.error('RabbitMQ fout:', error);
            res.status(500).json({ status: 'error', message: 'Database bijgewerkt, maar RabbitMQ verbinding mislukt.' });
        }
    });
});

// --- CONSUMER ENDPOINTS ---
async function consumeMessages(queueName = QUEUE_NAME) {
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
            } catch (e) {
                console.error('Decrypt Error:', e);
                channel.nack(msg, false, false);
            }
        }

        setTimeout(() => { if (connection) connection.close(); }, 200);
        return messages;
    } catch (e) {
        console.error('Consume Error:', e);
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
    console.log(`RabbitMQ Target: ${RABBITMQ_URL}`);
    console.log(`Fanout Exchange: ${EXCHANGE_NAME}`);
    console.log(`Queues: ${QUEUE_NAME}, ${BACKUP_QUEUE_NAME}`);
});