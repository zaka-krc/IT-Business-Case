require('dotenv').config();
const amqp = require('amqplib');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();
const CryptoJS = require("crypto-js");

// --- CONFIGURATIE ---
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const SECRET_KEY = process.env.SECRET_KEY;
const EXCHANGE_NAME = 'salesforce_exchange';
const MY_BACKUP_QUEUE = 'salesforce_backup_local';
const RETENTION_DAYS = 90;
const DB_FILE = './backup.db';

// SSL Opties (voor RabbitMQ verbinding)
// Fix for self-signed certificates if needed
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// --- DATABASE INITIALISATIE ---
const db = new sqlite3.Database(DB_FILE, (err) => {
    if (err) console.error("❌ Kan backup database niet openen:", err.message);
    else console.log(`🗄️  Verbonden met Backup SQLite: ${DB_FILE}`);
});

db.serialize(() => {
    // We voegen 'order_external_id' toe voor traceability
    db.run(`CREATE TABLE IF NOT EXISTS salesforce_backup (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_external_id TEXT,
        encrypted_blob TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

function runQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve(this);
        });
    });
}

// --- FUNCTIES ---
async function cleanupOldRecords() {
    try {
        const sql = `DELETE FROM salesforce_backup WHERE created_at < datetime('now', '-' || ? || ' days')`;
        const result = await runQuery(sql, [RETENTION_DAYS]);
        if (result.changes > 0) console.log(`🗑️  ${result.changes} oude backup records verwijderd.`);
    } catch (error) {
        console.error("❌ Fout bij opschonen:", error);
    }
}

async function saveToDatabase(encryptedString, orderId) {
    try {
        const sql = `INSERT INTO salesforce_backup (order_external_id, encrypted_blob) VALUES (?, ?)`;
        await runQuery(sql, [orderId, encryptedString]);
        console.log(`💾 Backup geslaagd! OrderID: ${orderId}`);
        return true;
    } catch (error) {
        console.error("❌ Fout bij schrijven naar Backup DB:", error);
        return false;
    }
}

// --- WORKER START ---
async function startWorker() {
    console.log("🚀 Backup Worker gestart...");

    // Initial cleanup
    await cleanupOldRecords();
    // Schedule cleanup every 24h
    setInterval(cleanupOldRecords, 24 * 60 * 60 * 1000);

    try {
        const sslOptions = { checkServerIdentity: () => undefined };
        const connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        // 1. Zorg dat de Exchange bestaat (Fanout)
        await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });

        // 2. Maak onze queue aan
        await channel.assertQueue(MY_BACKUP_QUEUE, { durable: true });

        // 3. Bind queue aan exchange
        await channel.bindQueue(MY_BACKUP_QUEUE, EXCHANGE_NAME, '');

        console.log(`👂 Luisteren naar berichten op: ${MY_BACKUP_QUEUE}`);

        channel.consume(MY_BACKUP_QUEUE, async (msg) => {
            if (msg !== null) {
                const rawContent = msg.content.toString();
                let orderId = 'UNKNOWN';

                try {
                    // Traceability: Decrypt to get ID
                    // We try to decrypt just to get the Order ID for the metadata
                    const bytes = CryptoJS.AES.decrypt(rawContent, SECRET_KEY);
                    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

                    if (decryptedString) {
                        const data = JSON.parse(decryptedString);
                        if (data.orderId) {
                            orderId = String(data.orderId);
                        }
                    }
                } catch (e) {
                    console.warn(`⚠️ Kon bericht niet decrypten voor ID extractie (verkeerde key?): ${e.message}`);
                }

                // We save the ORIGINAL encrypted content (Zero Knowledge principle largely preserved for the blob)
                // But we store the ID alongside it for the user's requirement.
                const success = await saveToDatabase(rawContent, orderId);

                if (success) channel.ack(msg);
                else channel.nack(msg, false, false); // Nack if DB fails? Or requeue?
            }
        });

    } catch (error) {
        console.error('❌ RabbitMQ Fout in Backup Worker:', error.message);
        // Retail logic or exit
        setTimeout(startWorker, 5000);
    }
}

// Graceful shutdown
const kill = require('tree-kill'); // Not needed for self-termination but good practice context
process.on('SIGINT', () => {
    db.close(() => {
        console.log('Backup Database gesloten.');
        process.exit(0);
    });
});

startWorker();
