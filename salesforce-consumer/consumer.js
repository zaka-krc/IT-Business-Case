require('dotenv').config();
const amqp = require('amqplib');
const axios = require('axios');

// ========================================
// CONFIGURATION
// ========================================
const QUEUE_NAME = 'orders_queue';
let salesforceToken = null;
let salesforceInstanceUrl = null;

// ========================================
// 1. AUTHENTIFICATION SALESFORCE
// ========================================
async function getSalesforceToken() {
  try {
    console.log('🔐 Connexion à Salesforce...');
    
    const response = await axios.post(
      `${process.env.SF_LOGIN_URL}/services/oauth2/token`,
      null,
      {
        params: {
          grant_type: 'password',
          client_id: process.env.SF_CLIENT_ID,
          client_secret: process.env.SF_CLIENT_SECRET,
          username: process.env.SF_USERNAME,
          password: process.env.SF_PASSWORD + process.env.SF_SECURITY_TOKEN
        }
      }
    );

    salesforceToken = response.data.access_token;
    salesforceInstanceUrl = response.data.instance_url;
    
    console.log('✅ Connecté à Salesforce:', salesforceInstanceUrl);
    return true;
  } catch (error) {
    console.error('❌ Erreur connexion Salesforce:', error.response?.data || error.message);
    return false;
  }
}

// ========================================
// 2. CRÉER UN ACCOUNT DANS SALESFORCE
// ========================================
async function createAccount(customerName, customerEmail) {
  try {
    const response = await axios.post(
      `${salesforceInstanceUrl}/services/data/v59.0/sobjects/Account`,
      {
        Name: customerName,
        Type: 'Customer',
        Phone: '0000000000' // Champ requis selon votre config
      },
      {
        headers: {
          'Authorization': `Bearer ${salesforceToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Account créé:', response.data.id);
    return response.data.id;
  } catch (error) {
    console.error('❌ Erreur création Account:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// 3. CRÉER UNE COMMANDE DANS SALESFORCE
// ========================================
async function createSalesforceOrder(orderData) {
  try {
    console.log('📦 Traitement commande:', orderData);

    // Étape 1 : Créer ou récupérer l'Account
    const accountId = await createAccount(orderData.customerName, orderData.customerEmail);

    // Étape 2 : Créer l'Order
    const orderResponse = await axios.post(
      `${salesforceInstanceUrl}/services/data/v59.0/sobjects/Order`,
      {
        AccountId: accountId,
        Status: 'Draft',
        EffectiveDate: new Date().toISOString().split('T')[0],
        Description: `Commande: ${orderData.orderNumber || 'N/A'}`,
        // Champs personnalisés (si créés à l'étape 1)
        Customer_Email__c: orderData.customerEmail,
        Customer_Name__c: orderData.customerName
      },
      {
        headers: {
          'Authorization': `Bearer ${salesforceToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const orderId = orderResponse.data.id;
    console.log('✅ Commande créée dans Salesforce:', orderId);

    return orderId;
  } catch (error) {
    console.error('❌ Erreur création commande:', error.response?.data || error.message);
    throw error;
  }
}

// ========================================
// 4. CONSUMER RABBITMQ
// ========================================
async function startConsumer() {
  try {
    // Connexion à RabbitMQ
    console.log('🐰 Connexion à RabbitMQ...');
    const connection = await amqp.connect(process.env.RABBITMQ_URL);
    const channel = await connection.createChannel();

    // Créer/vérifier la queue
    await channel.assertQueue(QUEUE_NAME, { durable: true });
    console.log(`✅ En écoute sur la queue: ${QUEUE_NAME}`);
    console.log('⏳ En attente de commandes...\n');

    // Consommer les messages
    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        try {
          const orderData = JSON.parse(msg.content.toString());
          console.log('\n📨 Nouveau message reçu:');
          console.log(JSON.stringify(orderData, null, 2));

          // Créer la commande dans Salesforce
          await createSalesforceOrder(orderData);

          // Confirmer le traitement du message
          channel.ack(msg);
          console.log('✅ Message traité avec succès\n');
        } catch (error) {
          console.error('❌ Erreur traitement message:', error.message);
          // Rejeter le message (il sera remis dans la queue)
          channel.nack(msg, false, true);
        }
      }
    }, { noAck: false });

  } catch (error) {
    console.error('❌ Erreur consumer:', error.message);
    process.exit(1);
  }
}

// ========================================
// 5. DÉMARRAGE
// ========================================
async function main() {
  console.log('🚀 Démarrage du consumer Salesforce...\n');
  
  // D'abord s'authentifier à Salesforce
  const authenticated = await getSalesforceToken();
  
  if (!authenticated) {
    console.error('❌ Impossible de démarrer sans authentification Salesforce');
    process.exit(1);
  }

  // Puis démarrer le consumer RabbitMQ
  await startConsumer();
}

// Lancer le programme
main();