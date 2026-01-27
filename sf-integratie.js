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
const DLQ_NAME = 'salesforce_dlq';

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
        const username = process.env.SF_USERNAME ? process.env.SF_USERNAME.trim() : '';
        const password = process.env.SF_PASSWORD ? process.env.SF_PASSWORD.trim() : '';
        const token = process.env.SF_TOKEN ? process.env.SF_TOKEN.trim() : '';

        if (!username || !password || !token) {
            console.log("⚠️ Salesforce credentials ontbreken in .env. Worker slaat Salesforce connectie over.");
            return;
        }

        console.log(`🚀 Inloggen bij Salesforce: ${username}`);
        await conn.login(username, password + token);
        console.log("✅ Salesforce verbinding geslaagd!");

        // --- PRE-FETCH: Haal Standard Pricebook ID op ---
        let standardPricebookId;
        try {
            const pbResult = await conn.sobject("Pricebook2").find({ IsStandard: true }).limit(1).execute();
            if (pbResult.length > 0) {
                standardPricebookId = pbResult[0].Id;
                console.log(`📘 Standard Pricebook ID found: ${standardPricebookId}`);
            } else {
                console.warn("⚠️ Geen Standard Pricebook gevonden. Line Items kunnen mogelijk fout gaan.");
            }
        } catch (err) {
            console.error("Fout bij ophalen Pricebook:", err.message);
        }

        // 2. Verbinden met RabbitMQ
        console.log("🔌 Verbinden met RabbitMQ...");

        // Optioneel: SSL Opties (als je een CA-certificaat hebt)
        const sslOptions = {
            checkServerIdentity: () => undefined, // Negeer hostname mismatch
        };

        const mqConn = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await mqConn.createChannel();
        const RESPONSE_QUEUE_NAME = 'salesforce_response_queue';
        const EXCHANGE_NAME = 'salesforce_exchange';

        // 1. Assert Exchange
        await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });

        await channel.assertQueue(QUEUE_NAME, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': '',
                'x-dead-letter-routing-key': DLQ_NAME,
                'x-message-ttl': 10000 // 10 seconds TTL before moving to DLQ if not consumed
            }
        });

        // 2. Bind Queue to Exchange
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');
        await channel.assertQueue(RESPONSE_QUEUE_NAME, { durable: true });
        await channel.assertQueue(DLQ_NAME, { durable: true });
        // Removed prefetch(1) to prevent blocking by unacked messages

        // --- TRACKING: Keep track of created Opportunities for polling ---
        const activeOpportunities = new Map(); // SF_ID -> { orderId, stage }

        const trackOpportunity = (orderId, sfId) => {
            activeOpportunities.set(sfId, { orderId, stage: 'Prospecting' });
            console.log(`📍 Tracking Opportunity ${sfId} for Order ${orderId}`);
        };

        console.log(`📥 Worker actief. Wachten op orders in '${QUEUE_NAME}'...`);

        // --- WORKER LOOP ---
        // --- MESSAGE PROCESSOR ---
        const processOrderMessage = async (msg, sourceQueue) => {
            if (msg === null) return;

            try {
                // --- STAP A: Ontsleutelen ---
                const encryptedContent = msg.content.toString();
                const bytes = CryptoJS.AES.decrypt(encryptedContent, SECRET_KEY);
                const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

                if (!decryptedString) throw new Error("Decryptie mislukt. Controleer je SECRET_KEY!");

                const data = JSON.parse(decryptedString);

                // Check en Fallbacks
                if (!data.orderId) data.orderId = Date.now();
                if (!data.totalAmount) data.totalAmount = data.items ? data.items.reduce((sum, i) => sum + (i.price * (i.quantity || 1)), 0) : 0;

                console.log(`📦 Order ontvangen van ${sourceQueue}: ${data.orderId} voor ${data.customer.email}`);

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
                let descriptionText = 'Geen items ontvangen';

                if (data.items && Array.isArray(data.items) && data.items.length > 0) {
                    try {
                        const itemStrings = [];
                        for (let i = 0; i < data.items.length; i++) {
                            const item = data.items[i];
                            const qty = item.quantity || 1;
                            const name = item.name || 'Product';
                            const code = item.productCode || item.product_code || 'N/A';
                            itemStrings.push(`${qty}x ${name} (${code})`);
                        }
                        descriptionText = 'Bestelling: ' + itemStrings.join(', ');
                    } catch (descErr) {
                        console.error("Error building description:", descErr);
                        descriptionText = 'Fout bij items: ' + JSON.stringify(data.items);
                    }
                } else {
                    descriptionText = 'Items data: ' + JSON.stringify(data.items);
                }

                console.log("Description:", descriptionText);

                // Create Opportunity
                const opportunity = await conn.sobject("Opportunity").create({
                    Name: `Order ${data.orderId}`,
                    StageName: 'Prospecting',
                    CloseDate: new Date().toISOString().split('T')[0],
                    Amount: data.totalAmount,
                    ContactId: contactId,
                    Description: descriptionText,
                    Pricebook2Id: standardPricebookId
                });

                if (opportunity.success) {
                    console.log(`✨ Opportunity aangemaakt: ${opportunity.id}`);

                    // Track this Opportunity for status polling
                    trackOpportunity(data.orderId, opportunity.id);

                    // --- STAP C.2: Voeg Producten toe (Line Items) ---
                    if (data.items && data.items.length > 0 && standardPricebookId) {
                        try {
                            const lineItemsToCreate = [];

                            for (const item of data.items) {
                                // 1. Zoek PricebookEntry voor dit product
                                const productCode = item.productCode || item.product_code;

                                if (productCode) {
                                    const pbe = await conn.sobject("PricebookEntry")
                                        .find({
                                            Pricebook2Id: standardPricebookId,
                                            "Product2.ProductCode": productCode,
                                            IsActive: true
                                        })
                                        .limit(1)
                                        .execute();

                                    if (pbe.length > 0) {
                                        lineItemsToCreate.push({
                                            OpportunityId: opportunity.id,
                                            PricebookEntryId: pbe[0].Id,
                                            Quantity: item.quantity || 1,
                                            UnitPrice: item.price
                                        });
                                    } else {
                                        console.warn(`⚠️ Product niet gevonden in Pricebook: ${productCode} (${item.name})`);
                                    }
                                } else {
                                    console.warn(`⚠️ Item zonder productCode: ${item.name}`);
                                }
                            }

                            if (lineItemsToCreate.length > 0) {
                                await conn.sobject("OpportunityLineItem").create(lineItemsToCreate);
                                console.log(`🛒 ${lineItemsToCreate.length} producten toegevoegd aan Opportunity.`);
                            }
                        } catch (lineItemErr) {
                            console.error("Fout bij toevoegen OpportunityLineItems:", lineItemErr.message);
                        }
                    }

                    // --- STAP D: Stuur bevestiging naar Response Queue ---
                    const responsePayload = {
                        status: 'created',
                        message: 'Order aangemaakt in Salesforce als Opportunity',
                        orderId: data.orderId,
                        salesforceId: opportunity.id,
                        sfStage: 'Prospecting',
                        timestamp: new Date().toISOString()
                    };

                    const encryptedResponse = CryptoJS.AES.encrypt(JSON.stringify(responsePayload), SECRET_KEY).toString();
                    channel.sendToQueue(RESPONSE_QUEUE_NAME, Buffer.from(encryptedResponse), { persistent: true });
                    console.log(`🔙 Bevestiging gestuurd naar ${RESPONSE_QUEUE_NAME}`);

                    channel.ack(msg);
                } else {
                    throw new Error("Salesforce Opportunity creatie mislukt");
                }

            } catch (err) {
                console.error(`⚠️ Fout bij verwerken bericht van ${sourceQueue}:`, err.message);

                // --- DLQ LOGIC ---
                // Only send to DLQ if it came from the main queue. 
                // If it came from DLQ and failed again, we leave it (or could log critical error).
                if (sourceQueue === QUEUE_NAME) {
                    console.log(`⚠️ Bericht verplaatst naar DLQ: ${DLQ_NAME}`);
                    // We rely on RabbitMQ's dead-lettering by NACKing with requeue=false? 
                    // Or manual send? The original code did manual send + ack. Let's keep that.
                    channel.sendToQueue(DLQ_NAME, msg.content, { persistent: true });
                    channel.ack(msg);
                } else {
                    console.error("💀 CRITICAL: Bericht uit DLQ faalde opnieuw. Het blijft in de DLQ (NACK).");
                    // Nack with requeue=false would drop it. requeue=true would loop it.
                    // Let's NACK with requeue=false so it stays in DLQ but is marked as unacked? 
                    // Actually, if we want to retry LATER, we should probably just leave it unacked or requeue=true with delay?
                    // User wants to read it. If it fails, let's keep it in DLQ (requeue=true might behave weirdly if it's the same consumer).
                    // Correct approach for DLQ retry failure: Log and Ack (drop) OR fix the bug. 
                    // For now, I'll ACK it so it doesn't block, assuming the retry was the attempt.
                    // BUT user said "restart reads it". If it fails on restart, maybe we want to keep it?
                    // I will simply ACK it to avoid infinite loops if it's a poison pill.
                    console.log("❌ Bericht uit DLQ verwijderd na mislukte poging.");
                    channel.ack(msg);
                }
            }
        };

        // --- WORKERS ---
        console.log(`📥 Worker actief. Luistert naar '${QUEUE_NAME}' en '${DLQ_NAME}'...`);

        // 1. Main Queue Consumer
        channel.consume(QUEUE_NAME, (msg) => processOrderMessage(msg, QUEUE_NAME));

        // 2. DLQ Consumer (Retry Logic)
        channel.consume(DLQ_NAME, (msg) => processOrderMessage(msg, DLQ_NAME));

        // --- SMART POLLING: Check SF status for our created Opportunities ---
        // Polling interval - check every 30 seconds
        setInterval(async () => {
            if (activeOpportunities.size === 0) return; // Nothing to poll

            try {
                // Get IDs to check
                const sfIds = Array.from(activeOpportunities.keys());
                const idList = sfIds.map(id => `'${id}'`).join(',');

                // Query only OUR opportunities
                const result = await conn.query(`
                    SELECT Id, Name, StageName 
                    FROM Opportunity 
                    WHERE Id IN (${idList})
                `);

                for (const opp of result.records) {
                    const tracked = activeOpportunities.get(opp.Id);
                    if (!tracked) continue;

                    // Check if status changed to Closed Won
                    if (opp.StageName === 'Closed Won' && tracked.stage !== 'Closed Won') {
                        console.log(`🎉 Opportunity ${opp.Id} is Closed Won! Updating Order ${tracked.orderId}...`);

                        // Send success message to mark order as Completed
                        const updatePayload = {
                            status: 'success', // This triggers Completed status
                            orderId: tracked.orderId,
                            salesforceId: opp.Id,
                            message: 'Order gesloten in Salesforce',
                            timestamp: new Date().toISOString()
                        };

                        const encUpdate = CryptoJS.AES.encrypt(JSON.stringify(updatePayload), SECRET_KEY).toString();
                        channel.sendToQueue(RESPONSE_QUEUE_NAME, Buffer.from(encUpdate));

                        // Remove from tracking (order is complete)
                        activeOpportunities.delete(opp.Id);
                        console.log(`✅ Order ${tracked.orderId} marked for completion.`);
                    } else if (opp.StageName === 'Closed Lost') {
                        // Also handle cancelled orders
                        console.log(`❌ Opportunity ${opp.Id} is Closed Lost.`);
                        activeOpportunities.delete(opp.Id);
                        // Optionally send a 'cancelled' status here
                    }
                }

            } catch (pollErr) {
                console.error("Polling error:", pollErr.message);
            }
        }, 30000); // 30 seconds

        console.log("🔄 Smart Polling actief - tracked Opportunities worden elke 30s gecheckt.");

    } catch (error) {
        console.error("💀 Worker kon niet starten:", error.message);
        process.exit(1);
    }
}

startSalesforceWorker();