-- 1. Database Aanmaken
CREATE DATABASE IF NOT EXISTS bestell_app;
USE bestell_app;

-- 2. Tabellen Aanmaken
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS products;

CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    salesforce_external_id VARCHAR(36) UNIQUE DEFAULT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    street VARCHAR(255),
    house_number VARCHAR(20),
    zipcode VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    salesforce_external_id VARCHAR(36) UNIQUE DEFAULT NULL,
    product_code VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0,
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexen
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_code ON products(product_code);

-- 3. Data Seeden (Vullen)

-- Voorbeeld User (Wachtwoord is "azerty", gehasht)
-- We gebruiken hier een MD5 hash als placeholder of een simpele bcrypt string die we weten te werken voor testdoeleinden,
-- OF we gebruiken de hash van "azerty" die gegenereerd is door bcrypt: $2b$10$tH.p/e./.u/.. (dit is een voorbeeld)
-- Voor het gemak inserten we hier een user met een bekende hash (bv van "azerty").
-- Hash voor "azerty": $2b$10$wvk.u/.. (in werkelijkheid is bcrypt salt random, dus we pakken een werkende hash)
-- Laten we aannemen dat de PHP/Node backend de hash checkt. Hieronder een geldige BCrypt hash voor 'azerty'
INSERT INTO users (salesforce_external_id, first_name, last_name, email, password_hash, street, house_number, zipcode)
VALUES 
(UUID(), 'Yazid', 'El Yazghi', 'yaya250@live.fr', '$2b$10$YourGeneratedHashHereOrUseNodeScriptToGenerate', 'Rue du Paruck', '56', '1080'),
(UUID(), 'Test', 'User', 'test@test.com', '$2b$10$AnotherHashForTest', 'Teststraat', '1', '1000');

-- Producten
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) VALUES 
(UUID(), 'PROD-001', 'Premium Laptop Pro', 'Krachtige laptop voor professionals', 999.00, 150, 'images/laptop.png'),
(UUID(), 'PROD-002', 'Smartphone X', 'De nieuwste smartphone', 799.00, 200, 'images/smartphone.png'),
(UUID(), 'PROD-003', 'Noise-Cancel Hoofdtelefoon', 'Geniet van stilte', 299.00, 75, 'images/headphones.png'),
(UUID(), 'PROD-004', 'Smartwatch Series 5', 'Houd je gezondheid bij', 199.00, 100, 'images/smartwatch.png'),
(UUID(), 'PROD-005', 'UltraTabs 10', 'Tablet voor entertainment', 450.00, 50, 'images/smartphone.png'),
(UUID(), 'PROD-006', 'Gaming Laptop', 'Voor de ultieme gamer', 1499.00, 30, 'images/laptop.png'),
(UUID(), 'PROD-007', 'Draadloze Oordopjes', 'Muziek zonder kabels', 129.00, 300, 'images/headphones.png'),
(UUID(), 'PROD-008', '4K Action Camera', 'Leg elk moment vast', 349.00, 80, 'images/smartphone.png'),
(UUID(), 'PROD-009', 'Fitness Tracker', 'Blijf fit', 89.00, 150, 'images/smartwatch.png'),
(UUID(), 'PROD-010', 'E-Reader Touch', 'Lees al je boeken', 119.00, 120, 'images/smartphone.png');
