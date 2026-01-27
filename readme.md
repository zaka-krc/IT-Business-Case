Bestell-App Backend
Dit is het backend-systeem voor de Bestel-App, gebouwd met Node.js en Express. Het systeem beheert producten, gebruikers en bestellingen, en integreert met RabbitMQ voor asynchrone orderverwerking naar externe systemen zoals Salesforce.

🚀 Kenmerken
Gebruikersbeheer: Registratie en login met wachtwoord-hashing via bcrypt.

Role-Based Access Control (RBAC): Onderscheid tussen gebruikers, admins en super-admins voor beveiligde endpoints.

Productcatalogus: Volledig beheer (CRUD) van producten voor admins.

Orderverwerking:

Voorraadcontrole en automatische updates bij bestellingen.

Integratie met RabbitMQ via een fanout exchange voor schaalbare berichtgeving.

Asynchrone feedback-loop: Een achtergrond worker luistert naar status-updates van Salesforce om lokale bestelstatussen bij te werken (bijv. van 'Pending' naar 'Completed').

Beveiliging:

AES-encryptie van ordergegevens die via RabbitMQ worden verzonden.

Ondersteuning voor SSL-verbindingen met de RabbitMQ-server via CA-certificaten.

🛠️ Technologieën
Framework: Express.js

Database: SQLite3 (via sqlite3 driver)

Messaging: RabbitMQ (via amqplib)

Encryptie/Beveiliging: CryptoJS, bcrypt

Testing: Jest & Supertest

📋 Vereisten
Node.js (v14 of hoger aanbevolen)

Een draaiende RabbitMQ-instantie

Een .env bestand (zie hieronder)

⚙️ Installatie
Installeer de afhankelijkheden:

Bash

npm install
Configureer je omgevingsvariabelen in een .env bestand in de root:

Extrait de code

RABBITMQ_URL=amqps://gebruiker:wachtwoord@jouw-server:5671
SECRET_KEY=jouw-geheime-sleutel-voor-encryptie
Zorg dat het CA-certificaat aanwezig is in ./certs/ca_certificate.pem als je gebruikmaakt van SSL voor RabbitMQ.

🚦 Gebruik
Start de server:

Bash

npm start
Dit start de applicatie via start.js. De API is standaard bereikbaar op http://localhost:3000.

Ontwikkelmodus:

Bash

npm run server
Tests uitvoeren:

Bash

npm test
🔌 API Endpoints
Gebruiker & Producten
GET /api/products: Haal alle producten op.

POST /api/register: Registreer een nieuwe gebruiker.

POST /api/login: Inloggen en gebruikersgegevens ophalen.

POST /api/send: Plaats een bestelling (verstuurt data naar RabbitMQ).

Admin (Vereist x-user-id header)
GET /api/admin/users: Lijst van alle gebruikers.

POST /api/admin/products: Nieuw product toevoegen.

PUT /api/admin/products/:id: Bestaand product wijzigen.

DELETE /api/admin/users/:id: Gebruiker verwijderen.

🏗️ Architectuur
Het systeem maakt gebruik van een Response Worker (startResponseWorker). Deze functie blijft op de achtergrond draaien om berichten te consumeren van de salesforce_response_queue. Wanneer Salesforce een bestelling heeft verwerkt, werkt deze worker de status in de lokale SQLite database bij naar 'Processing' of 'Completed'.