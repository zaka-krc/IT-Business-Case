-- Seed Data gegenereerd op 2026-01-25T22:49:16.801Z

USE bestell_app;

-- Users Seeden
INSERT INTO users (salesforce_external_id, first_name, last_name, email, password_hash, street, house_number, zipcode) 
VALUES ('82efe1c8-a391-4b5a-8240-e17ea2952d3e', 'Yazid', 'El Yazghi', 'yaya250@live.fr', '$2b$10$249zsaCbXwu9Sr6NCNatKe/Q9hJHEvnGABRG2xYnRuL9lkw88ixkq', 'Rue du Paruck', '56', '1080');
INSERT INTO users (salesforce_external_id, first_name, last_name, email, password_hash, street, house_number, zipcode) 
VALUES ('647f1db2-da2c-4899-b6bb-5efab7c497ef', 'test', 'test', 'test@test.com', '$2b$10$uIr0oQdxXo1JldaMjHjDz.Gf5w6H.UQKIRBJmueTfc8dg6joTu2uO', '', '', '');

-- Producten Seeden
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('5f119284-838e-4693-ba35-0e9229653bd9', 'PROD-001', 'Premium Laptop Pro', 'Beschrijving voor Premium Laptop Pro', 999, 460, 'images/laptop.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('4fd30a3a-d77b-4644-ac44-936a52b15cf8', 'PROD-002', 'Smartphone X', 'Beschrijving voor Smartphone X', 799, 399, 'images/smartphone.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('1c57bc01-6905-42b9-9d35-e769bb692e3d', 'PROD-003', 'Noise-Cancel Hoofdtelefoon', 'Beschrijving voor Noise-Cancel Hoofdtelefoon', 299, 267, 'images/headphones.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('2d1559a6-98e9-4e17-9c81-6af82e5540b9', 'PROD-004', 'Smartwatch Series 5', 'Beschrijving voor Smartwatch Series 5', 199, 361, 'images/smartwatch.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('c2b79f21-2e41-48b1-bd75-409214312277', 'PROD-005', 'UltraTabs 10', 'Beschrijving voor UltraTabs 10', 450, 362, 'images/smartphone.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('9b47c07c-7937-4e30-bda1-615fc0e01bc5', 'PROD-006', 'Gaming Laptop', 'Beschrijving voor Gaming Laptop', 1499, 158, 'images/laptop.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('d8c05751-21b9-4ef9-b8dc-30e11bf614c1', 'PROD-007', 'Draadloze Oordopjes', 'Beschrijving voor Draadloze Oordopjes', 129, 206, 'images/headphones.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('60edf0b5-59a6-4a80-a46a-91a22e800b6d', 'PROD-008', '4K Action Camera', 'Beschrijving voor 4K Action Camera', 349, 397, 'images/smartphone.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('66605117-9f6e-43ca-86c0-12044fcaa080', 'PROD-009', 'Fitness Tracker', 'Beschrijving voor Fitness Tracker', 89, 183, 'images/smartwatch.png');
INSERT INTO products (salesforce_external_id, product_code, name, description, price, stock, image_url) 
VALUES ('64c08551-dff4-4310-8fd2-f784f5c4027e', 'PROD-010', 'E-Reader Touch', 'Beschrijving voor E-Reader Touch', 119, 311, 'images/smartphone.png');
