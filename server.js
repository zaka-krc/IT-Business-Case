const express = require('express');
const bodyParser = require('body-parser');
const amqp = require('amqplib');

const app = express();
const port = 3000;

// Instellingen voor RabbitMQ (kopieer dit precies)
const RABBITMQ_URL = 'amqps://student:XYR4yqc.cxh4zug6vje@rabbitmq-exam.rmq3.cloudamqp.com/mxifnklj';
const EXCHANGE_NAME = 'exchange.5ac84f7b-8c1c-42ee-ba23-47fc3ccb314d';
const ROUTING_KEY = '5ac84f7b-8c1c-42ee-ba23-47fc3ccb314d';

// Middleware
app.use(bodyParser.json());
app.use(express.static('public')); // Zorgt dat index.html zichtbaar is

// Functie om verbinding te maken en bericht te sturen
async function sendToRabbitMQ(msgData) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL);
        const channel = await connection.createChannel();

        // Exchange aanmaken (voor zekerheid)
        await channel.assertExchange(EXCHANGE_NAME, 'direct', { durable: true });

        // Bericht omzetten naar JSON string
        const message = JSON.stringify({
            type: "SAP_ORDER",
            data: msgData,
            date: new Date().toISOString()
        });

        // Publiceren naar de exchange
        channel.publish(EXCHANGE_NAME, ROUTING_KEY, Buffer.from(message), { persistent: true });
        
        console.log(`[x] Verzonden naar RabbitMQ: Order ${msgData.orderId}`);

        // Netjes afsluiten
        setTimeout(() => {
            connection.close();
        }, 500);

    } catch (error) {
        console.error("Fout in RabbitMQ:", error);
        throw error;
    }
}

// Route waar de frontend naar toe stuurt
app.post('/api/send-order', async (req, res) => {
    const orderData = req.body;
    console.log("Ontvangen van frontend:", orderData);

    try {
        await sendToRabbitMQ(orderData);
        res.json({ status: 'success', message: 'Order verstuurd!' });
    } catch (error) {
        res.status(500).json({ status: 'error', message: 'Kon niet verbinden met RabbitMQ' });
    }
});

// Server starten
app.listen(port, () => {
    console.log(`Server draait op http://localhost:${port}`);
});