const amqp = require('amqplib');
require('dotenv').config(); // Load environment variables
const CryptoJS = require("crypto-js");
const fs = require('fs');
const path = require('path');

// Configuratie
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqps://admin:admin123@10.2.160.224:5671';
const EXCHANGE_NAME = 'salesforce_exchange';
const QUEUE_NAME = 'sap_idoc_queue'; // Dedicated queue for SAP
const SECRET_KEY = process.env.SECRET_KEY || 'default-dev-secret';
const CA_CERT_PATH = './certs/ca_certificate.pem';
const OUTPUT_DIR = './idocs_out';

// Zorg dat output map bestaat
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR);
}

// SSL Opties
let sslOptions = {};
try {
    if (fs.existsSync(CA_CERT_PATH)) {
        sslOptions = {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            servername: 'rabbitmq-server',
            checkServerIdentity: () => undefined
        };
    }
} catch (err) {
    console.error("Certificaat niet gevonden:", err);
}

// Helper om datum te formateren naar SAP formaat (YYYYMMDD)
function toSAPDate(date) {
    return new Date(date).toISOString().slice(0, 10).replace(/-/g, '');
}

async function startSapWorker() {
    try {
        console.log("🔄 SAP IDoc Worker wordt gestart...");

        const connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        // Assert Exchange (moet matchen met server.js)
        await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });

        // Assert Dedicated Queue
        await channel.assertQueue(QUEUE_NAME, { durable: true });

        // Bind Queue to Exchange (Fanout: ontvangt alle berichten van de exchange)
        await channel.bindQueue(QUEUE_NAME, EXCHANGE_NAME, '');

        console.log(`✅ SAP Worker Verbonden met RabbitMQ!`);
        console.log(`[*] Wachten op orders in '${QUEUE_NAME}' via Exchange '${EXCHANGE_NAME}'...`);

        channel.consume(QUEUE_NAME, (msg) => {
            if (msg !== null) {
                try {
                    // 1. Decrypt
                    const encryptedContent = msg.content.toString();
                    const bytes = CryptoJS.AES.decrypt(encryptedContent, SECRET_KEY);
                    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);

                    if (!decryptedString) throw new Error("Decryptie faalde");

                    const order = JSON.parse(decryptedString);
                    console.log(`\n📦 Nieuwe order ontvangen voor SAP: Order #${order.orderId}`);

                    // 2. Map & Generate IDocs
                    // We genereren DEBMAS (Klant) en ORDERS (Bestelling) in één keer of apart.
                    // Voor nu: aparte bestanden.

                    const timestamp = Date.now();
                    const customerId = order.customer.email; // Use email as unique mapping key just in case

                    // --- GENERATE ORDERS05 IDOC ---
                    const orderXml = generateOrders05(order);
                    const orderFileName = `ORDERS_${order.orderId}_${timestamp}.xml`;
                    fs.writeFileSync(path.join(OUTPUT_DIR, orderFileName), orderXml);
                    console.log(`   ✅ ORDERS05 IDoc opgeslagen: ${orderFileName}`);

                    // --- GENERATE DEBMAS07 IDOC (Customer) ---
                    const customerXml = generateDebmas07(order.customer);
                    const custFileName = `DEBMAS_${order.orderId}_${timestamp}.xml`;
                    fs.writeFileSync(path.join(OUTPUT_DIR, custFileName), customerXml);
                    console.log(`   ✅ DEBMAS07 IDoc opgeslagen: ${custFileName}`);

                    // 3. Ack
                    channel.ack(msg);

                } catch (err) {
                    console.error("❌ Fout bij verwerken IDoc:", err.message);
                    channel.ack(msg); // Ack to prevent loop on malformed data
                }
            }
        });

    } catch (error) {
        console.error("❌ Kan geen verbinding maken met RabbitMQ:", error);
    }
}

// --- IDOC TEMPLATES ---

function generateOrders05(data) {
    const today = toSAPDate(new Date());

    // Items mapping
    const itemsXml = data.items.map((item, index) => `
        <E1EDP01 SEGMENT="1">
            <POSEX>${String((index + 1) * 10).padStart(6, '0')}</POSEX>
            <MATNR>${item.productCode || 'UNKNOWN'}</MATNR>
            <ARKTX>${item.name}</ARKTX>
            <MENGE>${item.quantity}</MENGE>
            <VRKME>ST</VRKME> <!-- Stuks -->
            <NETPR>${item.price}</NETPR>
            <WAER2>EUR</WAER2>
        </E1EDP01>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<ORDERS05>
    <IDOC BEGIN="1">
        <EDI_DC40 SEGMENT="1">
            <TABNAM>EDI_DC40</TABNAM>
            <DIRECT>2</DIRECT>
            <IDOCTYP>ORDERS05</IDOCTYP>
            <MESTYP>ORDERS</MESTYP>
            <SNDPOR>SAP_PI</SNDPOR>
            <SNDPRT>LS</SNDPRT>
            <RCVPOR>S4HANA</RCVPOR>
            <RCVPRT>LS</RCVPRT>
            <CREDAT>${today}</CREDAT>
            <BSTZDAT>${today}</BSTZDAT> 
        </EDI_DC40>
        <E1EDK01 SEGMENT="1">
            <CURCY>EUR</CURCY>
            <BELNR>${data.orderId}</BELNR>
            <BSART>OR</BSART> <!-- Standard Order -->
            <RECIPNT_NO>${data.userId}</RECIPNT_NO>
        </E1EDK01>
        <E1EDK14 SEGMENT="1">
            <QUALF>008</QUALF>
            <ORGID>1710</ORGID> <!-- Sales Org (Example) -->
        </E1EDK14>
        <E1EDK14 SEGMENT="1">
            <QUALF>007</QUALF>
            <ORGID>10</ORGID> <!-- Dist Channel -->
        </E1EDK14>
        <E1EDK14 SEGMENT="1">
            <QUALF>006</QUALF>
            <ORGID>00</ORGID> <!-- Division -->
        </E1EDK14>
        <E1EDKA1 SEGMENT="1">
            <PARVW>AG</PARVW> <!-- Sold-To -->
            <PARTN>${data.customer.email}</PARTN> <!-- Mapping key -->
            <NAME1>${data.customer.voornaam} ${data.customer.naam}</NAME1>
            <STRAS>${data.customer.straat} ${data.customer.huisnummer}</STRAS>
            <ORT01>${data.customer.stad || ''}</ORT01>
            <PSTLZ>${data.customer.postcode || ''}</PSTLZ>
            <LAND1>${data.customer.land || 'BE'}</LAND1>
            <TELF1>${data.customer.email}</TELF1>
        </E1EDKA1>
        ${itemsXml}
    </IDOC>
</ORDERS05>`;
}

function generateDebmas07(customer) {
    const today = toSAPDate(new Date());
    // Mappen van klantgegevens naar IDoc
    // Let op: SAP heeft strikte lengtes, hier simpel gehouden
    return `<?xml version="1.0" encoding="UTF-8"?>
<DEBMAS07>
    <IDOC BEGIN="1">
        <EDI_DC40 SEGMENT="1">
            <IDOCTYP>DEBMAS07</IDOCTYP>
            <MESTYP>DEBMAS</MESTYP>
            <CREDAT>${today}</CREDAT>
        </EDI_DC40>
        <E1KNA1M SEGMENT="1">
            <ANRED>Firma</ANRED> <!-- Default Title -->
            <NAME1>${customer.voornaam} ${customer.naam}</NAME1>
            <SORTL>${customer.naam.substring(0, 10).toUpperCase()}</SORTL>
            <STRAS>${customer.straat} ${customer.huisnummer}</STRAS>
            <ORT01>${customer.stad || ''}</ORT01>
            <PSTLZ>${customer.postcode || ''}</PSTLZ>
            <LAND1>${customer.land || 'BE'}</LAND1>
            <SPRAS>N</SPRAS>
            <STCEG>${customer.vat_number || ''}</STCEG>
        </E1KNA1M>
        <E1KNB1M SEGMENT="1">
            <BUKRS>1710</BUKRS> <!-- Company Code -->
            <AKONT>140000</AKONT> <!-- Recon Account -->
        </E1KNB1M>
        <E1KNVVM SEGMENT="1">
            <VKORG>1710</VKORG>
            <VTWEG>10</VTWEG>
            <SPART>00</SPART>
            <WAERS>EUR</WAERS>
            <KTGRD>01</KTGRD>
        </E1KNVVM>
    </IDOC>
</DEBMAS07>`;
}

startSapWorker();
