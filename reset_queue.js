const amqp = require('amqplib');
require('dotenv').config();

// Fix for self-signed certificates
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672';
const QUEUE_NAME = 'salesforce_queue';

async function reset() {
    console.log('🗑️  Deleting queue to reset configuration...');
    try {
        const sslOptions = {
            checkServerIdentity: () => undefined,
        };
        const conn = await amqp.connect(RABBITMQ_URL, sslOptions);
        const ch = await conn.createChannel();
        await ch.deleteQueue(QUEUE_NAME);
        console.log(`✅ Queue '${QUEUE_NAME}' deleted.`);
        await conn.close();
    } catch (e) {
        console.error('Error:', e.message);
    }
}

reset();
