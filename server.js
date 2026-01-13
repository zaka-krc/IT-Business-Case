const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");

const app = express();
const PORT = 3000;

// Encryption Key
const SECRET_KEY = 'IT-Business-Case-Secret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Serve static files from current directory

// RabbitMQ Connection URL (default local instance)
// RabbitMQ Connection URL
// Format: amqp://username:password@ip-address
// Note: 'guest' user usually only works on localhost. You likely need a custom user for remote access.
const RABBITMQ_URL = 'amqp://admin:admin123@10.2.160.224';
const QUEUE_NAME = 'salesforce_queue';

async function sendToQueue(data) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        await channel.assertQueue(QUEUE_NAME, {
            durable: true
        });

        // Split order into individual product messages
        // Expected data structure from frontend:
        // {
        //   items: [{ id, name, price, quantity }, ...],
        //   customer: { voornaam, naam, adress }
        // }

        const { items, customer } = data;

        if (!items || !Array.isArray(items) || !customer) {
            throw new Error('Invalid data structure');
        }

        for (const item of items) {
            const messagePayload = {
                productid: item.id,
                productname: item.name,
                "totaal prijs": item.price * item.quantity,
                "product hoeveelheid": item.quantity,
                adress: customer.adress,
                naam: customer.naam,
                voornaam: customer.voornaam
            };

            const messageString = JSON.stringify(messagePayload);

            // Encrypt before sending
            const encryptedMessage = CryptoJS.AES.encrypt(messageString, SECRET_KEY).toString();

            channel.sendToQueue(QUEUE_NAME, Buffer.from(encryptedMessage));
            // console.log(`[x] Sent (Encrypted) '${encryptedMessage}'`);
        }

        // Close connection after a short delay to ensure buffers are drained
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
        // console.log('Received order payload:', JSON.stringify(orderData, null, 2));

        // Basic validation
        if (!orderData || !orderData.items || orderData.items.length === 0 || !orderData.customer) {
            return res.status(400).json({ status: 'error', message: 'Missing required fields or empty cart' });
        }

        await sendToQueue(orderData);

        res.json({ status: 'success', message: 'Order processed and sent to RabbitMQ' });
    } catch (error) {
        console.error('Server Error:', error);
        res.status(500).json({ status: 'error', message: 'Internal Server Error' });
    }
});

// Consumer Logic
async function consumeMessages() {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        await channel.assertQueue(QUEUE_NAME, { durable: true });

        const messages = [];
        let msg;

        // Fetch 1 message at a time
        for (let i = 0; i < 1; i++) {
            msg = await channel.get(QUEUE_NAME);
            if (!msg) break;

            // Return the raw encrypted string (ciphertext)
            // Do NOT decrypt here. Consumer will decrypt.
            const content = msg.content.toString();

            messages.push(content);
            channel.ack(msg); // Acknowledge message to remove from queue
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
        const messages = await consumeMessages();
        res.json({ status: 'success', data: messages });
    } catch (error) {
        console.error('Consumer Endpoint Error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to consume messages' });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`RabbitMQ Target: ${RABBITMQ_URL}`);
});
