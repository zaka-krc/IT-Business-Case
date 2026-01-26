const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./dev.db');

db.all("SELECT * FROM users", [], (err, rows) => {
    if (err) {
        console.error("❌ SQL Error:", err.message);
    } else {
        console.log(`✅ Aantal users in database: ${rows.length}`);
        if (rows.length > 0) {
            console.log("Users:", rows);
        } else {
            console.log("⚠️ De tabel is leeg.");
        }
    }
});
