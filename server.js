const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');

const app = express();
const PORT = 3000;

// Versleutelingssleutel
const SECRET_KEY = 'IT-Business-Case-Secret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.')); // Statische bestanden serveren vanuit de huidige map

// RabbitMQ Verbindings-URL
// Formaat: amqp://gebruikersnaam:wachtwoord@ip-adres
// Let op: 'guest' gebruiker werkt meestal alleen op localhost. Je hebt waarschijnlijk een aangepaste gebruiker nodig voor externe toegang.
// RabbitMQ Verbindings-URL
// Formaat: amqps://gebruikersnaam:wachtwoord@ip-adres:poort
const RABBITMQ_URL = 'amqps://admin:admin123@10.2.160.224:5671';
const QUEUE_NAME = 'salesforce_queue';

// SSL Opties
const CA_CERT_PATH = './certs/ca_certificate.pem';
let sslOptions = {};
try {
    if (fs.existsSync(CA_CERT_PATH)) {
        sslOptions = {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            servername: 'rabbitmq-server', // Wijzig SNI om overeen te komen met de CN in het certificaat
            checkServerIdentity: (host, cert) => {
                // Hostnaamverificatie OVERSLAAN om IP-verbinding met eenvoudige zelfondertekende certificaten toe te staan
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

        await channel.assertQueue(QUEUE_NAME, {
            durable: true
        });

        // Bestelling splitsen in individuele productberichten
        // Verwachte datastructuur van frontend:
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

            // Versleutelen voor verzending
            const encryptedMessage = CryptoJS.AES.encrypt(messageString, SECRET_KEY).toString();

            channel.sendToQueue(QUEUE_NAME, Buffer.from(encryptedMessage));
        }

        // Verbindung sluiten na een korte vertraging om te zorgen dat buffers leeg zijn
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

        // Basisvalidatie
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

// Consumentenlogica
async function consumeMessages() {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        await channel.assertQueue(QUEUE_NAME, { durable: true });

        const messages = [];
        let msg;

        // Ophalen van 1 bericht per keer
        for (let i = 0; i < 1; i++) {
            msg = await channel.get(QUEUE_NAME);
            if (!msg) break;

            // Retourneer de ruwe versleutelde string (cijfertekst)
            // Hier NIET ontsleutelen. De consument zal ontsleutelen.
            const content = msg.content.toString();

            messages.push(content);
            channel.ack(msg); // Bericht bevestigen om uit de wachtrij te verwijderen
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

// Server Starten
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`RabbitMQ Target: ${RABBITMQ_URL}`);
});
