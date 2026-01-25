const sqlite3 = require('sqlite3').verbose();

// 1. Verbinding maken
const db = new sqlite3.Database('./dev.db', (err) => {
    if (err) console.error('Fout bij openen database:', err.message);
    else console.log('✅ Verbonden met de SQLite database.');
});

db.serialize(() => {
    // 2. Verwijder de tabel als die bestaat (voor de zekerheid tijdens het testen)
    // db.run("DROP TABLE IF EXISTS products"); 

    // 3. Maak de tabel aan met ALLE kolommen
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        name TEXT,
        sku TEXT UNIQUE,
        stock INTEGER,
        price REAL,
        image TEXT
    )`, (err) => {
        if (err) console.error("Fout bij aanmaken tabel:", err.message);
    });

    // 4. Voeg data toe (Let op de 6 vraagtekens voor de 6 kolommen)
    const stmt = db.prepare("INSERT OR IGNORE INTO products (id, name, sku, stock, price, image) VALUES (?, ?, ?, ?, ?, ?)");
    
    stmt.run(1, 'Premium Laptop Pro', 'LAP01', 10, 999.00, 'images/laptop.png');
    stmt.run(2, 'Smartphone X', 'PHN02', 15, 799.00, 'images/smartphone.png');
    stmt.run(3, 'Noise-Cancel Headphone', 'HP03', 20, 299.00, 'images/headphones.png');
    
    stmt.finalize(() => {
        console.log("✅ Database succesvol gevuld met producten.");
    });
});

module.exports = db;