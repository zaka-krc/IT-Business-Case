const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Slaat de database op als een bestand 'stock.db' in dezelfde map
const dbPath = path.resolve(__dirname, 'stock.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database error:', err.message);
    } else {
        console.log('📦 Verbonden met lokale SQLite voorraad-database.');
    }
});

// Maak tabel aan en vul met dummy data als hij nog leeg is
db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        name TEXT,
        stock INTEGER
    )`);

    // Voeg testdata toe (ALLEEN als het ID nog niet bestaat)
    const stmt = db.prepare("INSERT OR IGNORE INTO products (id, name, stock) VALUES (?, ?, ?)");
    
    // Jouw producten uit de frontend:
    stmt.run("MAT-001", "Laptop", 50);      // 50 stuks
    stmt.run("MAT-002", "Monitor", 20);     // 20 stuks
    stmt.run("MAT-003", "Toetsenbord", 10); // 10 stuks
    
    stmt.finalize();
});

module.exports = db;