require('dotenv').config();
console.log("Gebruikersnaam:", process.env.SF_USERNAME);
console.log("Client ID aanwezig:", !!process.env.SF_CLIENT_ID);
console.log("Secret Key aanwezig:", !!process.env.SECRET_KEY);