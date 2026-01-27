const sqlite3 = require('sqlite3').verbose();

// 1. Verbinding maken
const db = new sqlite3.Database('./dev.db', (err) => {
    if (err) console.error('Fout bij openen database:', err.message);
    else console.log('✅ Verbonden met de SQLite database.');
});

db.serialize(() => {
    // 2. Gebruikers (Users) Tabel
    db.run(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        salesforce_external_id TEXT UNIQUE,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        street TEXT,
        house_number TEXT,
        zipcode TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
        if (err) console.error("Fout bij aanmaken users tabel:", err.message);
        else {
            console.log("✅ Users tabel gecontroleerd.");

            // Migratie: Check of 'role' kolom bestaat (voor bestaande databases)
            db.all("PRAGMA table_info(users)", (err, columns) => {
                const hasRole = columns.some(col => col.name === 'role');
                if (!hasRole) {
                    console.log("⚠️ Kolom 'role' ontbreekt, wordt toegevoegd...");
                    db.run("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'user'", (err) => {
                        if (err) console.error("Fout bij toevoegen role kolom:", err.message);
                        else console.log("✅ Kolom 'role' succesvol toegevoegd.");
                        seedSuperAdmin();
                    });
                } else {
                    seedSuperAdmin();
                }
            });
        }
    });

    function seedSuperAdmin() {
        // Seed Super Admin
        const superAdminEmail = 'yaya250@live.fr';
        db.get('SELECT * FROM users WHERE email = ?', [superAdminEmail], async (err, user) => {
            if (err) return console.error("Fout bij zoeken super-admin:", err);

            if (!user) {
                console.log("👤 Super-admin niet gevonden, wordt aangemaakt...");
                const bcrypt = require('bcrypt');
                const crypto = require('crypto');
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash('Admin123!', salt); // Default wachtwoord, gebruiker moet dit wijzigen
                const sfId = crypto.randomUUID();

                db.run(`INSERT INTO users (salesforce_external_id, first_name, last_name, email, password_hash, role) 
                        VALUES (?, 'Super', 'Admin', ?, ?, 'super-admin')`,
                    [sfId, superAdminEmail, hashedPassword],
                    (err) => {
                        if (err) console.error("Fout bij aanmaken super-admin:", err);
                        else console.log("✅ Super-admin account aangemaakt: " + superAdminEmail);
                    });
            } else if (user.role !== 'super-admin') {
                console.log("⚠️ Gebruiker gevonden, maar rol is geen super-admin. Updaten...");
                db.run("UPDATE users SET role = 'super-admin' WHERE email = ?", [superAdminEmail], (err) => {
                    if (err) console.error("Fout bij promoten super-admin:", err);
                    else console.log("✅ Gebruiker gepromoveerd tot super-admin.");
                });
            } else {
                console.log("✅ Super-admin check OK.");
            }
        });
    }

    // 3. Producten Tabel
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

    // 3b. Orders Tabel
    db.run(`CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        order_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        total_amount REAL NOT NULL,
        status TEXT DEFAULT 'Pending',
        salesforce_id TEXT,
        items_summary TEXT,
        FOREIGN KEY(user_id) REFERENCES users(id)
    )`, (err) => {
        if (err) console.error("Fout bij aanmaken orders tabel:", err.message);
        else console.log("✅ Orders tabel aangemaakt/bestaat al.");
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
