-- Database Initialisatie Script
-- Gebruik: Importeren in MySQL database

CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    salesforce_external_id VARCHAR(36) UNIQUE DEFAULT NULL, -- UUID voor Salesforce sync
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL, -- Veilig gehasht wachtwoord
    street VARCHAR(255),
    house_number VARCHAR(20),
    zipcode VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
    id INT AUTO_INCREMENT PRIMARY KEY,
    salesforce_external_id VARCHAR(36) UNIQUE DEFAULT NULL, -- UUID voor Salesforce sync
    product_code VARCHAR(50) UNIQUE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    price DECIMAL(10, 2) NOT NULL,
    stock INT NOT NULL DEFAULT 0, -- Voorraad management
    image_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Indexen voor performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_products_code ON products(product_code);
