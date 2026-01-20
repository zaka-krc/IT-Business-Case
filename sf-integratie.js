const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const jsforce = require('jsforce');
const fs = require('fs');
require('dotenv').config();

// Negeer certificaatfouten voor RabbitMQ (voor de 'self-signed certificate' error)
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const SECRET_KEY = process.env.SECRET_KEY;
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const QUEUE_NAME = 'salesforce_queue';

async function startSalesforceWorker() {
    // 1. Initialiseer Salesforce Verbinding
    const conn = new jsforce.Connection({
        oauth2: {
            loginUrl: process.env.SF_LOGIN_URL || 'https://login.salesforce.com',
            clientId: process.env.SF_CLIENT_ID,
            clientSecret: process.env.SF_CLIENT_SECRET,
            redirectUri: 'http://localhost:3000'
        }
    });

    try {
        const username = process.env.SF_USERNAME.trim();
        const password = process.env.SF_PASSWORD.trim();
        const token = process.env.SF_TOKEN.trim();

        console.log(`🚀 Inloggen bij Salesforce: ${username}`);
        await conn.login(username, password + token);
        console.log("✅ Salesforce verbinding geslaagd!");

        // 2. Verbinden met RabbitMQ
        console.log("🔌 Verbinden met RabbitMQ...");
        
        // Optioneel: SSL Opties (als je een CA-certificaat hebt)
        const sslOptions = {
            checkServerIdentity: () => undefined, // Negeer hostname mismatch
        };

        const mqConn = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await mqConn.createChannel();
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        channel.prefetch(1); 

        console.log(`📥 Worker actief. Wachten op orders in '${QUEUE_NAME}'...`);

        channel.consume(QUEUE_NAME, async (msg) => {
            if (msg !== null) {
                try {
                    // --- STAP A: Ontsleutelen ---
                    const encryptedContent = msg.content.toString();
                    const bytes = CryptoJS.AES.decrypt(encryptedContent, SECRET_KEY);
                    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
                    
                    if (!decryptedString) throw new Error("Decryptie mislukt. Controleer je SECRET_KEY!");
                    
                    const data = JSON.parse(decryptedString);
                    console.log(`📦 Order ontvangen: ${data.orderId} voor ${data.customer.email}`);

                    // --- STAP B: Zoek of maak Contact ---
                    let contactId;
                    const existingContact = await conn.sobject("Contact")
                        .find({ Email: data.customer.email })
                        .limit(1)
                        .execute();

                    if (existingContact.length > 0) {
                        contactId = existingContact[0].Id;
                        console.log(`🔍 Bestaand contact gevonden: ${contactId}`);
                    } else {
                        const newContact = await conn.sobject("Contact").create({
                            FirstName: data.customer.voornaam,
                            LastName: data.customer.naam,
                            Email: data.customer.email,
                            MailingStreet: `${data.customer.straat} ${data.customer.huisnummer}`,
                            MailingPostalCode: data.customer.postcode
                        });
                        contactId = newContact.id;
                        console.log(`👤 Nieuw contact aangemaakt: ${contactId}`);
                    }

                    // --- STAP C: Maak Opportunity (Verkoopkans) ---
                    const opportunity = await conn.sobject("Opportunity").create({
                        Name: `Order ${data.orderId}`,
                        StageName: 'Closed Won',
                        CloseDate: new Date().toISOString().split('T')[0],
                        Amount: data.totalAmount,
                        ContactId: contactId,
                        Description: `Items: ${data.items.map(i => i.productName).join(', ')}`
                    });

                    if (opportunity.success) {
                        console.log(`✨ Salesforce succesvol bijgewerkt voor Order: ${data.orderId}`);
                        channel.ack(msg); // Bevestig aan RabbitMQ
                    } else {
                        throw new Error("Salesforce Opportunity creatie mislukt");
                    }

                } catch (err) {
                    console.error("⚠️ Fout bij verwerken bericht:", err.message);
                    // Bij fout: zet bericht na 10 seconden terug in de wachtrij
                    setTimeout(() => channel.nack(msg), 10000);
                }
            }
        });

    } catch (error) {
        console.error("💀 Worker kon niet starten:", error.message);
        process.exit(1);
    }
}

startSalesforceWorker();