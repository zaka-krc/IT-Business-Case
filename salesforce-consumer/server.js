const express = require('express');
const amqp = require('amqplib');
const app = express();

app.use(express.json()); // Pour lire le JSON envoyé par le site
app.use(express.static('public')); // Pour servir ton fichier HTML

const QUEUE_NAME = 'orders_queue';

// Fonction pour envoyer à RabbitMQ
async function sendToQueue(orderData) {
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    channel.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(orderData)), { persistent: true });
    setTimeout(() => connection.close(), 500);
}

// Route appelée par ton site web
app.post('/api/order', async (req, res) => {
    try {
        const orderData = req.body;
        console.log('🌐 Commande reçue du site:', orderData.orderNumber);
        
        await sendToQueue(orderData);
        
        res.status(200).json({ message: 'Commande envoyée avec succès !' });
    } catch (error) {
        res.status(500).json({ error: 'Erreur lors de la publication' });
    }
});

app.listen(3000, () => console.log('🚀 Serveur web lancé sur http://localhost:3000'));