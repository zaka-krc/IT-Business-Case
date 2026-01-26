const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./dev.db');
const bcrypt = require('bcrypt');
const crypto = require('crypto');

async function createSuperAdmin() {
    const email = 'super@test.com';
    const password = 'password123';
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(password, salt);
    const sfId = crypto.randomUUID();

    db.serialize(() => {
        db.run("DELETE FROM users WHERE email = ?", [email]);

        const stmt = db.prepare("INSERT INTO users (salesforce_external_id, email, password_hash, first_name, last_name, street, house_number, zipcode, role) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
        stmt.run(sfId, email, hash, 'Super', 'Admin', 'TestStraat', '1', '1234AB', 'super-admin');
        stmt.finalize();

        console.log("Super Admin created: super@test.com / password123");
    });

    db.close();
}

createSuperAdmin();
