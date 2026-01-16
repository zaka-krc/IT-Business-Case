const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');

// Configuratie (Overgenomen uit server.js)
const RABBITMQ_URL = 'amqps://admin:admin123@10.2.160.224:5671';
const QUEUE_NAME = 'salesforce_queue';
const SECRET_KEY = 'IT-Business-Case-Secret';
const CA_CERT_PATH = './certs/ca_certificate.pem';

// SSL Opties (Nodig voor specifieke RabbitMQ setup)
let sslOptions = {};
try {
    if (fs.existsSync(CA_CERT_PATH)) {
        sslOptions = {
            ca: [fs.readFileSync(CA_CERT_PATH)],
            servername: 'rabbitmq-server',
            checkServerIdentity: (host, cert) => undefined 
        };
    }
} catch (err) {
    console.error("Certificaat niet gevonden:", err);
}

async function startSapConverter() {
    try {
        console.log("🔄 SAP Converter wordt gestart...");
        
        const connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        
        await channel.assertQueue(QUEUE_NAME, { durable: true });
        
        console.log(`[*] Wachten op versleutelde berichten in '${QUEUE_NAME}'...`);

        channel.consume(QUEUE_NAME, (msg) => {
            if (msg !== null) {
                try {
                    // 1. Bericht binnenhalen (Dit is versleutelde tekst)
                    const encryptedContent = msg.content.toString();
                    
                    // 2. Decrypten met de sleutel
                    const bytes = CryptoJS.AES.decrypt(encryptedContent, SECRET_KEY);
                    const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
                    
                    if (!decryptedString) throw new Error("Decryptie leverde lege tekst op");

                    const data = JSON.parse(decryptedString);
                    
                    // 3. Omzetten naar SAP XML (De "Mapping")
                    const sapXml = `
<ORDERS05>
    <IDOC BEGIN="1">
        <E1EDK01 SEGMENT="1">
            <CURCY>EUR</CURCY>
            <BELNR>${Date.now()}</BELNR> <!-- Tijdelijk ordernummer -->
            <BSART>OR</BSART>
        </E1EDK01>
        <E1EDKA1 SEGMENT="1">
            <PARVW>AG</PARVW>
            <PARTN>${data.voornaam} ${data.naam}</PARTN>
            <STRAS>${data.adress}</STRAS>
        </E1EDKA1>
        <E1EDP01 SEGMENT="1">
            <POSEX>000010</POSEX>
            <MATNR>${data.productid}</MATNR>
            <ARKTX>${data.productname}</ARKTX>
            <MENGE>${data['product hoeveelheid']}</MENGE>
        </E1EDP01>
    </IDOC>
</ORDERS05>`; 

                    console.log("\n✅ SUCCES: Vertaald naar SAP IDoc XML:");
                    console.log(sapXml);
                    
                    // 4. Bevestigen aan RabbitMQ dat het gelukt is
                    channel.ack(msg);
                    
                } catch (err) {
                    console.error("❌ Fout bij verwerken:", err.message);
                    // Toch acken om blokkades te voorkomen tijdens demo
                    channel.ack(msg); 
                }
            }
        });
        
    } catch (error) {
        console.error("❌ Kan geen verbinding maken met RabbitMQ:", error);
    }
}

startSapConverter();