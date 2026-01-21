const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');
const db = require('./database'); 

const app = express();
const PORT = 3000;

// Encryption Key
const SECRET_KEY = 'IT-Business-Case-Secret';

app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// RabbitMQ Config
const RABBITMQ_URL = 'amqps://admin:admin123@10.2.160.224:5671';
const QUEUE_NAME = 'salesforce_queue';
const CA_CERT_PATH = './certs/ca_certificate.pem';

let sslOptions = {};
try {
    if (fs.existsSync(CA_CERT_PATH)) {
        sslOptions = {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            servername: 'rabbitmq-server',
            checkServerIdentity: (host, cert) => undefined
        };
    }
} catch (err) {
    console.error("Certificaat error:", err);
}

// Hulpfunctie: Update voorraad in database
function checkAndUpdateStock(productId, amount) {
    return new Promise((resolve, reject) => {
        db.get("SELECT stock FROM products WHERE id = ?", [productId], (err, row) => {
            if (err) return reject(err);
            if (!row) return reject(new Error(`Product ${productId} niet gevonden`));
            
            if (row.stock < amount) {
                return reject(new Error(`Te weinig voorraad! Beschikbaar: ${row.stock}`));
            }

            const newStock = row.stock - amount;
            db.run("UPDATE products SET stock = ? WHERE id = ?", [newStock, productId], (err) => {
                if (err) return reject(err);
                console.log(`✅ Voorraad afgeboekt voor ${productId}. Over: ${newStock}`);
                resolve(true);
            });
        });
    });
}

async function sendToQueue(data) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        const { items, customer } = data;

        for (const item of items) {
            // Eerst voorraad checken en afboeken!
            await checkAndUpdateStock(item.id, item.quantity);

            const messagePayload = {
                productid: item.id,
                productname: item.name,
                "totaal prijs": item.price * item.quantity,
                "product hoeveelheid": item.quantity,
                adress: customer.adress,
                naam: customer.naam,
                voornaam: customer.voornaam
            };

            const encryptedMessage = CryptoJS.AES.encrypt(JSON.stringify(messagePayload), SECRET_KEY).toString();
            channel.sendToQueue(QUEUE_NAME, Buffer.from(encryptedMessage));
        }

        setTimeout(() => { if (connection) connection.close(); }, 500);
        return true;

    } catch (error) {
        console.error('Fout:', error.message);
        if (connection) connection.close();
        throw error;
    }
}

app.post('/api/send', async (req, res) => {
    try {
        const orderData = req.body;
        
        if (!orderData || !orderData.items || orderData.items.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Geen items' });
        }

        await sendToQueue(orderData);
        res.json({ status: 'success', message: 'Order verwerkt en voorraad bijgewerkt!' });

    } catch (error) {
        // Als het fout gaat (bijv. te weinig voorraad), sturen we die melding terug naar de frontend
        res.status(400).json({ status: 'error', message: error.message });
    }
});

// Consumer endpoint (deze had je al)
app.get('/api/consume', async (req, res) => {
    // ... (rest van jouw consumer code kan hier blijven staan) ...
    res.json({ status: 'info', message: 'Gebruik sap-converter.js voor consumeren' });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});