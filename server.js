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

let sfConnection; // Actieve sessie opslag

// --- 2. RABBITMQ & ENCRYPTIE ---
const SECRET_KEY = process.env.SECRET_KEY || 'IT-Business-Case-Secret';
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_NAME = 'salesforce_queue';
const EXCHANGE_NAME = 'salesforce_exchange';

const CA_CERT_PATH = './certs/ca_certificate.pem';
let sslOptions = {};
if (fs.existsSync(CA_CERT_PATH)) {
    sslOptions = {
        ca: [fs.readFileSync(CA_CERT_PATH)],
        servername: 'rabbitmq-server',
        checkServerIdentity: () => undefined
    };
}

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// --- 3. GEBRUIKERS BEHEER (Voor login.js en profile.js) ---
const loadUsers = () => {
    if (!fs.existsSync(USERS_FILE)) return [];
    return JSON.parse(fs.readFileSync(USERS_FILE));
};

const saveUsers = (users) => {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
};

app.post('/api/register', (req, res) => {
    const users = loadUsers();
    const newUser = { id: Date.now(), ...req.body, address: {} };
    users.push(newUser);
    saveUsers(users);
    res.json({ status: 'success', user: newUser });
});

app.post('/api/login', (req, res) => {
    const users = loadUsers();
    const user = users.find(u => u.email === req.body.email && u.password === req.body.password);
    if (user) res.json({ status: 'success', user });
    else res.status(401).json({ status: 'error', message: 'Ongeldige login' });
});

app.put('/api/user/:id', (req, res) => {
    let users = loadUsers();
    const index = users.findIndex(u => u.id == req.params.id);
    if (index !== -1) {
        users[index].address = req.body;
        saveUsers(users);
        res.json({ status: 'success', user: users[index] });
    } else res.status(404).json({ message: 'User not found' });
});

// --- 4. SALESFORCE AUTH ROUTES ---
app.get('/api/auth/salesforce', (req, res) => {
    res.redirect(oauth2.getAuthorizationUrl({ scope: 'api id web refresh_token' }));
});

app.get('/oauth/callback', async (req, res) => {
    const conn = new jsforce.Connection({ oauth2: oauth2 });
    try {
        await conn.authorize(req.query.code);
        sfConnection = conn;
        res.send("<h1>Verbonden!</h1><p>De VM is nu gekoppeld aan Salesforce.</p>");
    } catch (err) {
        res.status(500).send("Fout: " + err.message);
    }
});

// --- 5. BESTELLINGEN (RabbitMQ) ---
app.post('/api/send', async (req, res) => {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
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

// --- 6. CONSUMER (Naar Salesforce) ---
app.get('/api/consume', async (req, res) => {
    if (!sfConnection) return res.status(401).json({ error: "Log eerst in via /api/auth/salesforce" });

    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        const msg = await channel.get(QUEUE_NAME);

        if (msg) {
            const bytes = CryptoJS.AES.decrypt(msg.content.toString(), SECRET_KEY);
            const data = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

           const result = await sfConnection.sobject("Order__c").create({
                Name: data.orderId,
                Total_Amount__c: data.totalAmount || 0,
                Customer_Name__c: `${data.customer.voornaam} ${data.customer.naam}`,
                Address__c: data.customer.straat || "" // Let op: in checkout.js gebruik je 'straat', niet 'adress'

            });

            channel.ack(msg);
            res.json({ status: 'success', sf_id: result.id });
        } else res.json({ message: "Queue leeg" });
        setTimeout(() => connection.close(), 500);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => console.log(`Server: https://10.2.160.224:${PORT}`));