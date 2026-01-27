const express = require('express');
require('dotenv').config();
const bodyParser = require('body-parser');
const cors = require('cors');
const amqp = require('amqplib');
const CryptoJS = require("crypto-js");
const fs = require('fs');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const db = require('./database');

const app = express();
const PORT = 3000;

// Versleutelingssleutel
const SECRET_KEY = process.env.SECRET_KEY || 'default-dev-secret';

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static('.'));

// RabbitMQ Verbindings-URL
const RABBITMQ_URL = process.env.RABBITMQ_URL;
const EXCHANGE_NAME = 'salesforce_exchange';
const QUEUE_NAME = 'salesforce_queue';
const RESPONSE_QUEUE_NAME = 'salesforce_response_queue'; // New queue for feedback
const BACKUP_QUEUE_NAME = 'salesforce_backup_local';
const CA_CERT_PATH = './certs/ca_certificate.pem';

// SSL voor RabbitMQ
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
    console.error("Fout bij lezen CA certificaat:", err);
}

// --- RABBITMQ SEND FUNCTIE ---
async function sendToQueue(orderData) {
    let connection;
    try {
        connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();

        // 1. Assert Exchange (Fanout)
        await channel.assertExchange(EXCHANGE_NAME, 'fanout', { durable: true });

        // Versleutel de data
        const encrypted = CryptoJS.AES.encrypt(JSON.stringify(orderData), SECRET_KEY).toString();

        // 2. Publish to Exchange (Routing key is empty for fanout)
        channel.publish(EXCHANGE_NAME, '', Buffer.from(encrypted), { persistent: true });
        console.log(`📤 Order ${orderData.orderId} gepubliceerd op Exchange '${EXCHANGE_NAME}'`);

        await channel.close();
        await connection.close();
    } catch (error) {
        console.error('RabbitMQ Send Error:', error);
        if (connection) await connection.close();
        throw error;
    }
}

// --- PRODUCTEN ENDPOINT ---
app.get('/api/products', (req, res) => {
    db.all("SELECT id, name, price, image_url, stock, description, product_code FROM products", [], (err, rows) => {
        if (err) {
            console.error('Fout bij ophalen producten:', err);
            return res.status(500).json({ error: err.message });
        }
        // Map image_url to image for frontend compatibility
        const products = rows.map(row => ({
            ...row,
            image: row.image_url
        }));
        res.json(products);
    });
});

// --- AUTHENTICATIE & GEBRUIKERSBEHEER (SQLite) ---

// REGISTER
app.post('/api/register', async (req, res) => {
    let { email, password, firstName, lastName } = req.body;

    // Validatie en Trimming
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ status: 'error', message: 'Alle velden zijn verplicht.' });
    }

    email = email.trim();
    password = password.trim();
    firstName = firstName.trim();
    lastName = lastName.trim();

    try {
        // Check bestaande user
        db.get('SELECT id FROM users WHERE email = ?', [email], async (err, existingUser) => {
            if (err) {
                console.error('Registreer DB Fout:', err);
                return res.status(500).json({ status: 'error', message: 'Database fout: ' + err.message });
            }

            if (existingUser) {
                return res.status(400).json({ status: 'error', message: 'Gebruiker bestaat al.' });
            }

            // Hash password
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash(password, salt);
            const salesforceId = crypto.randomUUID();

            // Insert new user
            db.run(
                `INSERT INTO users (salesforce_external_id, email, password_hash, first_name, last_name, street, house_number, zipcode, city, country, role) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'user')`,
                [salesforceId, email, hashedPassword, firstName, lastName, '', '', '', '', ''],
                function (err) {
                    if (err) {
                        console.error('Insert User Error:', err);
                        return res.status(500).json({ status: 'error', message: 'Database fout bij registreren: ' + err.message });
                    }

                    res.json({
                        status: 'success',
                        user: {
                            id: this.lastID,
                            firstName,
                            lastName,
                            email,
                            salesforce_external_id: salesforceId,
                            role: 'user'
                        }
                    });
                }
            );
        });

    } catch (error) {
        console.error('Register Error:', error);
        res.status(500).json({ status: 'error', message: 'Registreren mislukt: ' + error.message });
    }
});

// LOGIN
app.post('/api/login', async (req, res) => {
    let { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ status: 'error', message: 'Email en wachtwoord verplicht.' });
    }

    email = email.trim();
    password = password.trim();

    try {
        db.get('SELECT * FROM users WHERE email = ?', [email], async (err, user) => {
            if (err) {
                console.error('Login DB Error:', err);
                return res.status(500).json({ status: 'error', message: 'Database fout: ' + err.message });
            }

            if (!user) {
                return res.status(401).json({ status: 'error', message: 'Ongeldige inloggegevens (User not found).' });
            }

            const validPassword = await bcrypt.compare(password, user.password_hash);

            if (!validPassword) {
                return res.status(401).json({ status: 'error', message: 'Ongeldige inloggegevens (Password mismatch).' });
            }

            res.json({
                status: 'success',
                user: {
                    id: user.id,
                    email: user.email,
                    firstName: user.first_name,
                    lastName: user.last_name,
                    role: user.role,
                    salesforce_external_id: user.salesforce_external_id,
                    address: {
                        street: user.street,
                        number: user.house_number,
                        zipcode: user.zipcode,
                        city: user.city,
                        country: user.country
                    }
                }
            });
        });
    } catch (error) {
        console.error('Login Error:', error);
        res.status(500).json({ status: 'error', message: 'Login mislukt: ' + error.message });
    }
});

// UPDATE USER (Adres)
app.put('/api/user/:id', (req, res) => {
    const userId = req.params.id;
    const { street, number, zipcode, city, country } = req.body;

    db.run(
        'UPDATE users SET street = ?, house_number = ?, zipcode = ?, city = ?, country = ? WHERE id = ?',
        [street, number, zipcode, city, country, userId],
        function (err) {
            if (err) {
                console.error('Update Error:', err);
                return res.status(500).json({ status: 'error', message: 'Update mislukt: ' + err.message });
            }

            if (this.changes === 0) {
                return res.status(404).json({ status: 'error', message: 'Gebruiker niet gevonden om te updaten.' });
            }

            // Fetch updated user to return
            db.get('SELECT * FROM users WHERE id = ?', [userId], (err, user) => {
                if (err) {
                    return res.status(500).json({ status: 'error', message: 'Fout bij ophalen user: ' + err.message });
                }

                res.json({
                    status: 'success',
                    message: 'Adres bijgewerkt.',
                    user: {
                        id: user.id,
                        email: user.email,
                        firstName: user.first_name,
                        lastName: user.last_name,
                        salesforce_external_id: user.salesforce_external_id,
                        address: {
                            street: user.street,
                            number: user.house_number,
                            zipcode: user.zipcode,
                            city: user.city,
                            country: user.country
                        }
                    }
                });
            });
        }
    );
});

// DELETE USER
app.delete('/api/user/:id', (req, res) => {
    const userId = req.params.id;

    db.run('DELETE FROM users WHERE id = ?', [userId], function (err) {
        if (err) {
            console.error('Delete Error:', err);
            return res.status(500).json({ status: 'error', message: 'Delete mislukt: ' + err.message });
        }

        if (this.changes === 0) {
            return res.status(404).json({ status: 'error', message: 'Gebruiker niet gevonden.' });
        }

        res.json({ status: 'success', message: 'Account verwijderd.' });
    });
});

// --- ADMIN MIDDELWARE & ENDPOINTS ---

// Middleware om te checken of iemand admin of super-admin is
const checkAdmin = (req, res, next) => {
    const requesterId = req.headers['x-user-id']; // Frontend moet dit meesturen
    if (!requesterId) return res.status(401).json({ error: 'Niet geautoriseerd (Geen ID)' });

    db.get('SELECT role FROM users WHERE id = ?', [requesterId], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Niet geautoriseerd (User onbekend)' });

        if (user.role === 'admin' || user.role === 'super-admin') {
            req.userRole = user.role; // Opslaan voor later gebruik
            req.requesterId = requesterId;
            next();
        } else {
            return res.status(403).json({ error: 'Toegang geweigerd: Alleen voor admins.' });
        }
    });
};

// Check specifiek voor Super-Admin
const checkSuperAdmin = (req, res, next) => {
    const requesterId = req.headers['x-user-id'];
    db.get('SELECT role FROM users WHERE id = ?', [requesterId], (err, user) => {
        if (err || !user) return res.status(401).json({ error: 'Niet geautoriseerd' });

        if (user.role === 'super-admin') {
            next();
        } else {
            return res.status(403).json({ error: 'Alleen Super-Admin mag dit doen.' });
        }
    });
};

// 1. Create User (Admin/Super-Admin)
app.post('/api/admin/users', checkAdmin, async (req, res) => {
    let { firstName, lastName, email, password, role, street, number, zipcode } = req.body;
    const requesterRole = req.userRole;

    // RBAC Checks
    if (requesterRole === 'admin') {
        if (role === 'admin' || role === 'super-admin') {
            return res.status(403).json({ error: "Admins kunnen alleen 'user' aanmaken." });
        }
        // Forceer role naar user als admin het aanmaakt (redundant check, maar veilig)
        role = 'user';
    }

    if (requesterRole === 'super-admin') {
        if (role === 'super-admin') {
            return res.status(403).json({ error: "Er kan maar één Super-Admin zijn." });
        }
    }

    // Validatie
    if (!email || !password || !firstName || !lastName) {
        return res.status(400).json({ error: "Vul alle verplichte velden in." });
    }

    try {
        // Hash password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const salesforceId = crypto.randomUUID();

        db.run(
            `INSERT INTO users (salesforce_external_id, email, password_hash, first_name, last_name, street, house_number, zipcode, role) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [salesforceId, email, hashedPassword, firstName, lastName, street, number, zipcode, role || 'user'],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: "Email bestaat al." });
                    }
                    return res.status(500).json({ error: err.message });
                }
                res.json({ message: "Gebruiker succesvol aangemaakt.", id: this.lastID });
            }
        );
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// 2. Haal alle users op (Admin Only)
app.get('/api/admin/users', checkAdmin, (req, res) => {
    db.all("SELECT id, first_name, last_name, email, role, street, house_number, zipcode FROM users", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// 2. Wijzig een user (Admin: NAW, Super-Admin: Roles/Admins)
app.put('/api/admin/users/:id', checkAdmin, (req, res) => {
    const targetUserId = req.params.id;
    const { firstName, lastName, email, role, street, number, zipcode } = req.body;
    const requesterRole = req.userRole;
    const requesterId = req.requesterId;

    // Beveiliging: Voorkom dat je je eigen rol aanpast (Accidental lockout)
    if (targetUserId == requesterId && role && role !== requesterRole) {
        return res.status(400).json({ error: "Je mag je eigen rol niet wijzigen." });
    }

    // Ophalen target user om te checken wie we aanpassen
    db.get('SELECT role FROM users WHERE id = ?', [targetUserId], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ error: "Gebruiker niet gevonden" });

        // REGEL: Admin kan geen admins/super-admins aanpassen, en geen rollen wijzigen naar admin
        if (requesterRole === 'admin') {
            if (targetUser.role === 'admin' || targetUser.role === 'super-admin') {
                return res.status(403).json({ error: "Admins kunnen geen andere admins wijzigen." });
            }
            if (role && (role === 'admin' || role === 'super-admin')) {
                return res.status(403).json({ error: "Admins kunnen geen gebruikers promoveren." });
            }
        }

        // REGEL: Super-Admin kan geen andere Super-Admin maken
        if (requesterRole === 'super-admin' && role === 'super-admin' && targetUser.role !== 'super-admin') {
            return res.status(403).json({ error: "Er kan maar één Super-Admin zijn." });
        }

        const sql = `UPDATE users SET first_name = ?, last_name = ?, email = ?, role = ?, street = ?, house_number = ?, zipcode = ? WHERE id = ?`;
        db.run(sql, [firstName, lastName, email, role || targetUser.role, street, number, zipcode, targetUserId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Gebruiker succesvol bijgewerkt." });
        });
    });
});

// 3. Verwijder User (Admin/Super-Admin regels)
app.delete('/api/admin/users/:id', checkAdmin, (req, res) => {
    const targetUserId = req.params.id;
    const requesterRole = req.userRole;
    const requesterId = req.requesterId;

    if (targetUserId == requesterId) {
        return res.status(400).json({ error: "Je kunt jezelf niet verwijderen via het admin paneel." });
    }

    db.get('SELECT role FROM users WHERE id = ?', [targetUserId], (err, targetUser) => {
        if (err || !targetUser) return res.status(404).json({ error: "Gebruiker niet gevonden" });

        // REGEL: Admin mag GEEN admin/super-admin verwijderen
        if (requesterRole === 'admin' && (targetUser.role === 'admin' || targetUser.role === 'super-admin')) {
            return res.status(403).json({ error: "Admins kunnen geen andere admins of super-admins verwijderen." });
        }

        // REGEL: Alleen Super-Admin kan Admins verwijderen (Eigenlijk al gedekt hierboven, maar voor duidelijkheid)
        // Super-Admin kan iedereen verwijderen behalve zichzelf (check bovenaan)

        db.run('DELETE FROM users WHERE id = ?', [targetUserId], function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Gebruiker verwijderd." });
        });
    });
});

// 4. Update Product (Admin)
app.put('/api/admin/products/:id', checkAdmin, (req, res) => {
    const { name, stock, price } = req.body;
    const productId = req.params.id;

    db.run("UPDATE products SET name = ?, stock = ?, price = ? WHERE id = ?", [name, stock, price, productId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ message: "Product bijgewerkt." });
    });
});

// 5. Create Product (Admin)
app.post('/api/admin/products', checkAdmin, (req, res) => {
    const { name, stock, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: "Naam en prijs zijn verplicht." });
    }

    const productCode = 'PROD-' + crypto.randomBytes(4).toString('hex').toUpperCase();

    db.run(
        "INSERT INTO products (name, price, stock, product_code, image_url, description) VALUES (?, ?, ?, ?, ?, ?)",
        [name, price, stock || 0, productCode, 'images/placeholder.png', 'Nieuw product'],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ message: "Product aangemaakt.", id: this.lastID });
        }
    );
});

// 6. Delete Product (Admin)
app.delete('/api/admin/products/:id', checkAdmin, (req, res) => {
    const productId = req.params.id;

    db.run("DELETE FROM products WHERE id = ?", [productId], function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: "Product niet gevonden." });
        res.json({ message: "Product verwijderd." });
    });
});

// --- ORDERS ---
// Bestelling plaatsen
app.post('/api/send', (req, res) => {
    const orderData = req.body;

    // 1. Validatie
    if (!orderData || !orderData.items || orderData.items.length === 0 || !orderData.customer) {
        return res.status(400).json({ status: 'error', message: 'Mandje is leeg of gegevens ontbreken' });
    }

    // 2. Loop door items voor validatie, stock update EN ophalen product_code
    const enrichedItems = [];
    let totalAmount = 0;

    // We gebruiken een Promise.all om alle DB operaties netjes af te wachten
    const processItems = orderData.items.map(async (item) => {
        return new Promise((resolve, reject) => {
            // Check en update stock
            // Eerst halen we de huidige info op (waaronder product_code)
            db.get("SELECT price, stock, product_code, name FROM products WHERE id = ?", [item.id], (err, productRow) => {
                if (err) return reject(new Error("Database fout bij ophalen product " + item.id));
                if (!productRow) return reject(new Error(`Product ${item.id} niet gevonden`));

                if (productRow.stock < item.quantity) {
                    return reject(new Error(`Niet genoeg voorraad voor ${productRow.name}. Beschikbaar: ${productRow.stock}`));
                }

                // Update stock (Simple decrement for now)
                db.run("UPDATE products SET stock = stock - ? WHERE id = ?", [item.quantity, item.id], (updateErr) => {
                    if (updateErr) return reject(new Error("Fout bij updaten voorraad " + productRow.name));

                    // Succes! Voeg verrijkte item toe
                    resolve({
                        ...item,
                        productCode: productRow.product_code, // CRITICAL: Add code from DB
                        name: productRow.name, // Ensure accurate name
                        price: productRow.price // Ensure accurate price (security)
                    });
                });
            });
        });
    });

    Promise.all(processItems)
        .then((items) => {
            enrichedItems.push(...items);

            // Herbereken totaal op basis van DB prijzen
            totalAmount = enrichedItems.reduce((sum, i) => sum + (i.price * i.quantity), 0);
            const itemsSummary = enrichedItems.map(i => `${i.quantity}x ${i.name}`).join(', ');
            const userId = orderData.userId || 0;

            console.log("✅ Voorraad bijgewerkt en items verrijkt with Product Codes.");

            // A. Opslaan in SQLite 'orders' tabel
            db.run(
                "INSERT INTO orders (user_id, total_amount, status, items_summary) VALUES (?, ?, 'Pending', ?)",
                [userId, totalAmount, itemsSummary],
                async function (err) {
                    if (err) {
                        console.error("Order Save Error:", err);
                        return res.status(500).json({ status: 'error', message: 'Order opslaan mislukt' });
                    }

                    const newOrderId = this.lastID || Date.now();

                    // C. NEW: Insert into order_items table for structural storage
                    const itemInsertStmt = db.prepare("INSERT INTO order_items (order_id, product_code, quantity, price, name) VALUES (?, ?, ?, ?, ?)");
                    enrichedItems.forEach(item => {
                        itemInsertStmt.run(newOrderId, item.productCode, item.quantity, item.price, item.name);
                    });
                    itemInsertStmt.finalize();

                    // Update orderData voor RabbitMQ
                    const finalOrderPayload = {
                        ...orderData,
                        orderId: newOrderId,
                        totalAmount: totalAmount,
                        items: enrichedItems // NOW CONTAINS productCode
                    };

                    console.log(`DEBUG SERVER: sending payload with codes:`, JSON.stringify(finalOrderPayload.items.map(i => i.productCode)));

                    // B. Stuur naar RabbitMQ
                    try {
                        await sendToQueue(finalOrderPayload);
                        res.json({
                            status: 'success',
                            message: 'Bestelling geplaatst! Status: Pending.',
                            orderId: newOrderId
                        });
                    } catch (mqErr) {
                        console.error('RabbitMQ fout:', mqErr);
                        res.status(500).json({ status: 'error', message: 'Order communicatie mislukt.' });
                    }
                }
            );
        })
        .catch(err => {
            console.error("Order process error:", err);
            res.status(400).json({ status: 'error', message: err.message });
        });
});

// --- CONSUMER ENDPOINTS ---
// --- ACHTERGROND MESSAGE WORKER ---
// Luistert naar status updates van de Salesforce worker en update de lokale database
async function startResponseWorker() {
    console.log("📨 Start Response Worker...");
    try {
        const connection = await amqp.connect(RABBITMQ_URL, sslOptions);
        const channel = await connection.createChannel();
        await channel.assertQueue(RESPONSE_QUEUE_NAME, { durable: true });

        channel.consume(RESPONSE_QUEUE_NAME, async (msg) => {
            if (msg) {
                try {
                    const content = msg.content.toString();
                    const bytes = CryptoJS.AES.decrypt(content, SECRET_KEY);
                    const decrypted = JSON.parse(bytes.toString(CryptoJS.enc.Utf8));

                    console.log(`📨 Feedback ontvangen voor Order ${decrypted.orderId}: ${decrypted.status}`);

                    if (decrypted.status === 'success' && decrypted.orderId) {
                        // Status 'success' = Closed Won in SF → Mark as Completed
                        db.run("UPDATE orders SET status = 'Completed', salesforce_id = ? WHERE id = ?",
                            [decrypted.salesforceId, decrypted.orderId],
                            (err) => {
                                if (err) console.error("Update Order Status Error:", err);
                                else console.log(`✅ Order ${decrypted.orderId} status bijgewerkt naar Completed.`);
                            }
                        );
                    } else if (decrypted.status === 'created' && decrypted.orderId) {
                        // Status 'created' = Opportunity aangemaakt in SF → Mark as Processing
                        db.run("UPDATE orders SET status = 'Processing', salesforce_id = ? WHERE id = ?",
                            [decrypted.salesforceId, decrypted.orderId],
                            (err) => {
                                if (err) console.error("Update Order Status Error:", err);
                                else console.log(`📦 Order ${decrypted.orderId} status bijgewerkt naar Processing (SF Opportunity aangemaakt).`);
                            }
                        );
                    }

                    channel.ack(msg);
                } catch (e) {
                    console.error("Response Worker Fout:", e);
                    channel.nack(msg, false, false); // Requeue indien nodig, of dead-letter
                }
            }
        });
    } catch (e) {
        console.error("Response Worker Connectie Fout:", e);
    }
}

// Start de worker
startResponseWorker();

// --- CONSUMER ENDPOINTS (Voor Frontend Polling - Optioneel/Legacy) ---
// Oude /api/consume endpoint mag blijven voor debug, maar frontend gebruikt nu /api/orders
// ... (code verwijderd of hierboven herschreven) ... 

app.get('/api/orders/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all("SELECT * FROM orders WHERE user_id = ? ORDER BY order_date DESC", [userId], (err, rows) => {
        if (err) return res.status(500).json({ status: 'error', message: err.message });
        res.json({ status: 'success', orders: rows });
    });
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`RabbitMQ Target: ${RABBITMQ_URL}`);
    console.log(`Fanout Exchange: ${EXCHANGE_NAME}`);
    console.log(`Queues: ${QUEUE_NAME}, ${BACKUP_QUEUE_NAME}`);
});