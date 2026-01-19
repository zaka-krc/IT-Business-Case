require('dotenv').config();
const express = require('express');
const amqp = require('amqplib');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

const QUEUE_NAME = 'orders_queue';

async function sendToRabbitMQ(orderData) {
    const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    channel.sendToQueue(
        QUEUE_NAME,
        Buffer.from(JSON.stringify(orderData)),
        { persistent: true }
    );
    
    console.log('✅ Message envoyé à RabbitMQ:', orderData.orderNumber);
    setTimeout(() => connection.close(), 500);
}

app.post('/api/order', async (req, res) => {
    try {
        await sendToRabbitMQ(req.body);
        res.status(200).json({ status: 'success', message: 'Commande en cours de traitement' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.listen(3000, () => console.log('🚀 Serveur Publisher sur http://localhost:3000'));