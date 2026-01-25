const mysql = require('mysql2/promise');
const fs = require('fs');
require('dotenv').config();
const bcrypt = require('bcrypt');
const crypto = require('crypto');

// Database configuratie uit .env of standaarden
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true // Nodig om meerdere queries in één keer uit te voeren
};

async function initDatabase() {
    let connection;
    try {
        // 1. Verbind zonder database te selecteren
        console.log('Verbinden met MySQL...');
        connection = await mysql.createConnection(dbConfig);

        // 2. Database aanmaken
        console.log("Database 'bestell_app' aanmaken indien niet bestaat...");
        await connection.query(`CREATE DATABASE IF NOT EXISTS bestell_app`);

        // 3. Database selecteren
        await connection.query(`USE bestell_app`);
        console.log("Database 'bestell_app' geselecteerd.");

        // 4. Schema uitvoeren
        console.log('Tabellen aanmaken...');
        const schema = fs.readFileSync('schema.sql', 'utf8');
        await connection.query(schema);
        console.log('Tabellen aangemaakt.');

        // 5. Seed data genereren en invoegen
        console.log('Seed data genereren...');
        const users = JSON.parse(fs.readFileSync('users.json', 'utf8'));

        // Hulpfunctie voor UUIDs
        const generateUUID = () => crypto.randomUUID();

        // Users Seeden
        for (const u of users) {
            // Check of user al bestaat om dubbele keys te voorkomen
            const [rows] = await connection.query('SELECT id FROM users WHERE email = ?', [u.email]);
            if (rows.length === 0) {
                const salt = await bcrypt.genSalt(10);
                const hash = await bcrypt.hash(u.password, salt);
                const uuid = generateUUID();

                await connection.execute(
                    `INSERT INTO users (salesforce_external_id, first_name, last_name, email, password_hash, street, house_number, zipcode) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [uuid, u.firstName, u.lastName, u.email, hash, u.address.street, u.address.number, u.address.zipcode]
                );
            }
        }
        console.log('Users toegevoegd.');

        // Producten checken en toevoegen als leeg
        const [productsExist] = await connection.query('SELECT count(*) as count FROM products');
        if (productsExist[0].count == 0) {
            console.log('Producten toevoegen...');
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

            for (const p of products) {
                const uuid = generateUUID();
                const stock = Math.floor(Math.random() * (500 - 100 + 1)) + 100;
                const code = `PROD-${p.id.toString().padStart(3, '0')}`;

                await connection.execute(
                    `INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    [uuid, code, p.name, `Beschrijving voor ${p.name}`, p.price, stock, p.image]
                );
            }
            console.log('Producten toegevoegd.');
        } else {
            console.log('Producten bestaan al, sla seeden over.');
        }

        console.log('✅ Database setup succesvol voltooid!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Fout bij database setup:', error);
        process.exit(1);
    } finally {
        if (connection) connection.end();
    }
}

initDatabase();
