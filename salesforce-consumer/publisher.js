const amqp = require('amqplib');

// ========================================
// PUBLIER UNE COMMANDE DANS RABBITMQ
// ========================================
async function publishOrder(orderData) {
  try {
    // Connexion à RabbitMQ
    const connection = await amqp.connect('amqp://localhost');
    const channel = await connection.createChannel();
    
    const queue = 'orders_queue';
    
    // Créer la queue si elle n'existe pas
    await channel.assertQueue(queue, { durable: true });
    
    // Publier le message
    channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(orderData)),
      { persistent: true }
    );
    
    console.log('✅ Commande publiée:', orderData.orderNumber);
    
    // Fermer la connexion
    setTimeout(() => {
      connection.close();
    }, 500);
  } catch (error) {
    console.error('❌ Erreur publication:', error.message);
  }
}

// ========================================
// EXEMPLE D'UTILISATION
// ========================================

// Exemple 1 : Commande simple
const order1 = {
  orderNumber: 'CMD-001',
  customerName: 'Marie Dubois',
  customerEmail: 'marie.dubois@example.com',
  orderDate: '2026-01-19',
  totalAmount: 149.99
};

// Exemple 2 : Autre commande
const order2 = {
  orderNumber: 'CMD-002',
  customerName: 'Pierre Martin',
  customerEmail: 'pierre.martin@example.com',
  orderDate: '2026-01-19',
  totalAmount: 299.50
};

// Publier les commandes
publishOrder(order1);

// Attendre un peu puis publier la deuxième
setTimeout(() => {
  publishOrder(order2);
}, 1000);