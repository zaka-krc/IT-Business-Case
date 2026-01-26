const sqlite3 = require('sqlite3').verbose();

// 1. Verbinding maken
const db = new sqlite3.Database('./dev.db', (err) => {
    if (err) console.error('Fout bij openen database:', err.message);
    else console.log('✅ Verbonden met de SQLite database.');
});

db.serialize(() => {
    // 2. Users Tabel
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salesforce_external_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        street TEXT,
        house_number TEXT,
        zipcode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("Fout bij aanmaken users tabel:", err.message);
        else console.log("✅ Users tabel aangemaakt/bestaat al.");
    });

    // 3. Products Tabel met ALLE kolommen
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salesforce_external_id TEXT UNIQUE,
        product_code TEXT UNIQUE,
        name TEXT NOT NULL,
        description TEXT,
        price REAL NOT NULL,
        stock INTEGER NOT NULL DEFAULT 0,
        image_url TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("Fout bij aanmaken products tabel:", err.message);
        else console.log("✅ Products tabel aangemaakt/bestaat al.");
    });

    // 4. Seed data toevoegen als producten tabel leeg is
    db.get("SELECT COUNT(*) as count FROM products", [], (err, row) => {
        if (err) {
            console.error("Fout bij checken products:", err.message);
            return;
        }

        if (row.count === 0) {
            console.log("📦 Products tabel is leeg, seed data toevoegen...");
            const stmt = db.prepare(`
                INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            const crypto = require('crypto');
            const products = [
                { code: 'PROD-001', name: 'Premium Laptop Pro', price: 999.00, stock: 150, image: 'images/laptop.png' },
                { code: 'PROD-002', name: 'Smartphone X', price: 799.00, stock: 200, image: 'images/smartphone.png' },
                { code: 'PROD-003', name: 'Noise-Cancel Hoofdtelefoon', price: 299.00, stock: 75, image: 'images/headphones.png' },
                { code: 'PROD-004', name: 'Smartwatch Series 5', price: 199.00, stock: 100, image: 'images/smartwatch.png' },
                { code: 'PROD-005', name: 'UltraTabs 10', price: 450.00, stock: 50, image: 'images/smartphone.png' },
                { code: 'PROD-006', name: 'Gaming Laptop', price: 1499.00, stock: 30, image: 'images/laptop.png' },
                { code: 'PROD-007', name: 'Draadloze Oordopjes', price: 129.00, stock: 300, image: 'images/headphones.png' },
                { code: 'PROD-008', name: '4K Action Camera', price: 349.00, stock: 80, image: 'images/smartphone.png' },
                { code: 'PROD-009', name: 'Fitness Tracker', price: 89.00, stock: 150, image: 'images/smartwatch.png' },
                { code: 'PROD-010', name: 'E-Reader Touch', price: 119.00, stock: 120, image: 'images/smartphone.png' }
            ];

            products.forEach(p => {
                stmt.run(
                    crypto.randomUUID(),
                    p.code,
                    p.name,
                    `Beschrijving voor ${p.name}`,
                    p.price,
                    p.stock,
                    p.image
                );
            });
            
            stmt.finalize(() => {
                console.log("✅ Products seed data toegevoegd.");
            });
        } else {
            console.log(`✅ Products tabel bevat al ${row.count} items.`);
        }
    });
});

module.exports = db;