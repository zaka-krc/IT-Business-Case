const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');
const jsforce = require('jsforce');

const app = express();
const PORT = process.env.PORT || 3000;
const USERS_FILE = './users.json';

// --- 1. SALESFORCE CONFIGURATIE ---
const oauth2 = new jsforce.OAuth2({
    loginUrl: 'https://login.salesforce.com',
    clientId: '3MVG9HtWXcDGV.nG3qUYju8IbcRm9JClKqYRVzhsU.lWB8LIg5LV2SN0QbBgeaPK3baUSY2rLzQyO26JRgBtp',
    clientSecret: 'D79E50D9B6827096EB416BDF57887999A0EF248FB64F955A763289F4E78E47E9',
    redirectUri: 'https://10.2.160.224:3000/oauth/callback'
});

let sfConnection;

// --- 2. RABBITMQ CONFIGURATIE ---
const SECRET_KEY = process.env.SECRET_KEY || 'IT-Business-Case-Secret';
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_NAME = 'salesforce_queue';

const CA_CERT_PATH = './certs/ca_certificate.pem';
let sslOptions = {};
if (fs.existsSync(CA_CERT_PATH)) {
    sslOptions = {
        ca: [fs.readFileSync(CA_CERT_PATH)],
        servername: 'rabbitmq-server',
        checkServerIdentity: () => undefined
    };
}

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// --- 3. AUTOMATISCHE SALESFORCE WORKER ---
// server.js - Voeg deze functie toe boven je routes
const startSalesforceWorker = async () => {
    if (!sfConnection) return;
    try {
        const connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        console.log("Salesforce Worker gestart...");

        channel.consume(QUEUE_NAME, async (msg) => {
            if (msg !== null) {
                try {
                    const bytes = CryptoJS.AES.decrypt(msg.content.toString(), SECRET_KEY);
                    const data = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

                    await sfConnection.sobject("Order__c").create({
                        Name: data.orderId,
                        Total_Amount__c: data.totalAmount || 0,
                        Customer_Name__c: `${data.customer.voornaam} ${data.customer.naam}`,
                        Address__c: `${data.customer.straat} ${data.customer.huisnummer}, ${data.customer.postcode}`
                    });

                    channel.ack(msg);
                    console.log("Bestelling succesvol naar Salesforce verzonden:", data.orderId);
                } catch (err) {
                    console.error("Verwerkingsfout:", err.message);
                }
            }
        });
    } catch (error) {
        console.error("Connectiefout worker:", error.message);
    }
};

// Pas je callback route aan zodat de worker start na inloggen
app.get('/oauth/callback', async (req, res) => {
    const conn = new jsforce.Connection({ oauth2: oauth2 });
    try {
        await conn.authorize(req.query.code);
        sfConnection = conn;
        startSalesforceWorker(); // START DE AUTOMATISCHE VERWERKING HIER
        res.send("<h1>Verbonden!</h1><p>Bestellingen worden nu automatisch verzonden.</p>");
    } catch (err) {
        res.status(500).send("Fout: " + err.message);
    }
});

app.post('/api/send', async (req, res) => {
    try {
        const connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        const orderData = { ...req.body, orderId: `ORD-${Date.now()}` };
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(orderData), SECRET_KEY).toString();
        
        channel.sendToQueue(QUEUE_NAME, Buffer.from(encrypted));
        res.json({ status: 'success', orderId: orderData.orderId });
        setTimeout(() => connection.close(), 500);
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Gebruikersbeheer routes behouden (register/login/put)
// ... (bestaande loadUsers/saveUsers en auth routes hieronder invoegen indien nodig)

app.listen(PORT, () => console.log(`Server draait op poort ${PORT}`));