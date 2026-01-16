const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');

const app = express();
const PORT = 3000;

// Versleutelingssleutel
const SECRET_KEY = process.env.SECRET_KEY || 'default-dev-secret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Statische bestanden serveren vanuit de huidige map

// RabbitMQ Verbindings-URL
// Formaat: amqps://gebruikersnaam:wachtwoord@ip-adres:poort
const RABBITMQ_URL = process.env.RABBITMQ_URL;

// Exchange en Queue configuratie
const EXCHANGE_NAME = 'salesforce_exchange';  // Consistent met backup-worker
const QUEUE_NAME = 'salesforce_queue';
const BACKUP_QUEUE_NAME = 'salesforce_backup_local';

// SSL Opties
const CA_CERT_PATH = './certs/ca_certificate.pem';
let sslOptions = {};
try {
    if (fs.existsSync(CA_CERT_PATH)) {
        sslOptions = {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            servername: 'rabbitmq-server',
            checkServerIdentity: (host, cert) => {
                return undefined;
            }
        };
    } else {
        console.warn(`Warning: CA Certificate not found at ${CA_CERT_PATH}. Connection might fail.`);
    }
} catch (err) {
    console.error("Error reading CA certificate:", err);
}

async function sendToQueue(data) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        // Fanout exchange aanmaken
        await channel.assertExchange(EXCHANGE_NAME, 'fanout', {
            durable: true
        });

        // Beide queues aanmaken
        await channel.assertQueue(QUEUE_NAME, {
            durable: true
        });
        await channel.assertQueue(BACKUP_QUEUE_NAME, {
            durable: true
        });

        // Queues binden aan de fanout exchange
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');
        await channel.bindQueue(BACKUP_QUEUE_NAME, EXCHANGE_NAME, '');

        const { items, customer } = data;

        if (!items || !Array.isArray(items) || !customer) {
            throw new Error('Invalid data structure');
        }

        // Genereer een uniek order-ID
        const orderId = `ORD-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        const totalOrderPrice = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);

        const messagePayload = {
            orderId: orderId,
            orderDate: new Date().toISOString(),
            customer: {
                voornaam: customer.voornaam,
                naam: customer.naam,
                email: customer.email,
                straat: customer.straat,
                huisnummer: customer.huisnummer,
                postcode: customer.postcode
            },
            items: items.map(item => ({
                productId: item.id,
                productName: item.name,
                quantity: item.quantity,
                unitPrice: item.price,
                totalPrice: item.price * item.quantity
            })),
            totalAmount: totalOrderPrice
        };

        const messageString = JSON.stringify(messagePayload);

        // Versleutelen voor verzending
        const encryptedMessage = CryptoJS.AES.encrypt(messageString, SECRET_KEY).toString();

        // Publiceren naar de fanout exchange (wordt naar alle gebonden queues gestuurd)
        channel.publish(EXCHANGE_NAME, '', Buffer.from(encryptedMessage), {
            persistent: true
        });

        console.log(`Message sent to fanout exchange '${EXCHANGE_NAME}'`);

        // Verbinding sluiten na een korte vertraging
        setTimeout(() => {
            if (connection) connection.close();
        }, 500);
        return true;

    } catch (error) {
        console.error('RabbitMQ Error:', error);
        if (connection) {
            try { connection.close(); } catch (e) { }
        }
        throw error;
    }
}

// Routes
app.post('/api/send', async (req, res) => {
    try {
        const orderData = req.body;

        // Basisvalidatie
        if (!orderData || !orderData.items || orderData.items.length === 0 || !orderData.customer) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields or empty cart' });
        }

        await sendToQueue(orderData);

        res.json({ status: 'success', message: 'Order processed and sent to RabbitMQ (fanout to all queues)' });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// Consumentenlogica - kan van elke queue lezen
async function consumeMessages(queueName = QUEUE_NAME) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        await channel.assertQueue(queueName, { durable: true });

        const messages = [];
        let msg;

        // Ophalen van 1 bericht per keer
        for (let i = 0; i < 1; i++) {
            msg = await channel.get(queueName);
            if (!msg) break;

            const content = msg.content.toString();

            try {
                // Ontsleutelen
                const bytes = CryptoJS.AES.decrypt(content, SECRET_KEY);
                const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
                const decryptedJson = JSON.parse(decryptedString);

                messages.push(decryptedJson);
            } catch (err) {
                console.error("Decryption error:", err);
                messages.push({ error: "Failed to decrypt message" });
            }

            channel.ack(msg);
        }

        setTimeout(() => {
            if (connection) connection.close();
        }, 500);

        return messages;

    } catch (error) {
        console.error('Consumer Error:', error);
        if (connection) {
            try { connection.close(); } catch (e) { }
        }
        throw error;
    }
}

app.get('/api/consume', async (req, res) => {
    try {
        const messages = await consumeMessages(QUEUE_NAME);
        res.json({ status: 'success', data: messages });
    } catch (error) {
        console.error('Consumer Endpoint Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to consume messages' });
    }
});

// Extra endpoint om van de backup queue te lezen
app.get('/api/consume/backup', async (req, res) => {
    try {
        const messages = await consumeMessages(BACKUP_QUEUE_NAME);
        res.json({ status: 'success', data: messages });
    } catch (error) {
        console.error('Backup Consumer Endpoint Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to consume backup messages' });
    }
});

// Server Starten
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`RabbitMQ Target: ${RABBITMQ_URL}`);
    console.log(`Fanout Exchange: ${EXCHANGE_NAME}`);
    console.log(`Queues: ${QUEUE_NAME}, ${BACKUP_QUEUE_NAME}`);
});