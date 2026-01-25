const fs = require('fs');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Hulpfunctie voor UUIDs
const generateUUID = () => crypto.randomUUID();

// Lees users
const usersFile = './users.json';
let users = [];
try {
    users = JSON.parse(fs.readFileSync(usersFile, 'utf8'));
} catch (e) {
    console.error("Geen users.json gevonden");
}

// Producten uit script.js halen (hardcoded array parseren is lastig, we nemen de lijst hier over zoals gezien in script.js)
const products = [
    { id: 1, name: 'Premium Laptop Pro', price: 999.00, image: 'images/laptop.png' },
    { id: 2, name: 'Smartphone X', price: 799.00, image: 'images/smartphone.png' },
    { id: 3, name: 'Noise-Cancel Hoofdtelefoon', price: 299.00, image: 'images/headphones.png' },
    { id: 4, name: 'Smartwatch Series 5', price: 199.00, image: 'images/smartwatch.png' },
    { id: 5, name: 'UltraTabs 10', price: 450.00, image: 'images/smartphone.png' },
    { id: 6, name: 'Gaming Laptop', price: 1499.00, image: 'images/laptop.png' },
    { id: 7, name: 'Draadloze Oordopjes', price: 129.00, image: 'images/headphones.png' },
    { id: 8, name: '4K Action Camera', price: 349.00, image: 'images/smartphone.png' },
    { id: 9, name: 'Fitness Tracker', price: 89.00, image: 'images/smartwatch.png' },
    { id: 10, name: 'E-Reader Touch', price: 119.00, image: 'images/smartphone.png' }
];

async function generateSeed() {
    let sql = `-- Seed Data gegenereerd op ${new Date().toISOString()}\n\n`;
    sql += `USE bestell_app;\n\n`; // Aanname database naam, pas aan indien nodig

    // Users Seeden
    sql += `-- Users Seeden\n`;
    for (const u of users) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(u.password, salt); // Hash het plaintext wachtwoord uit JSON
        const uuid = generateUUID();

        // Escapen van strings voor SQL (simpele replace)
        const fn = u.firstName.replace(/'/g, "''");
        const ln = u.lastName.replace(/'/g, "''");

        sql += `INSERT INTO users (salesforce_external_id, first_name, last_name, email, password_hash, street, house_number, zipcode) 
VALUES ('${uuid}', '${fn}', '${ln}', '${u.email}', '${hash}', '${u.address.street}', '${u.address.number}', '${u.address.zipcode}');\n`;
    }

    // Producten Seeden
    sql += `\n-- Producten Seeden\n`;
    for (const p of products) {
        const uuid = generateUUID();
        const stock = Math.floor(Math.random() * (500 - 100 + 1)) + 100; // Random stock tussen 100 en 500
        const code = `PROD-${p.id.toString().padStart(3, '0')}`;

        sql += `INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('${uuid}', '${code}', '${p.name.replace(/'/g, "''")}', 'Beschrijving voor ${p.name}', ${p.price}, ${stock}, '${p.image}');\n`;
    }

    fs.writeFileSync('seed_data.sql', sql);
    console.log('seed_data.sql is gegenereerd!');
}

generateSeed();
