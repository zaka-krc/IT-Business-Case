document.addEventListener('DOMContentLoaded', () => {
    const consumeBtn = document.getElementById('consume-btn');
    const messagesDisplay = document.getElementById('messages-display');

    if (consumeBtn) {
        consumeBtn.addEventListener('click', () => {
            messagesDisplay.textContent = 'Bericht ophalen...';

            fetch('http://localhost:3000/api/consume')
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        const messages = data.data; // This is now an array of encrypted strings
                        if (messages.length === 0) {
                            messagesDisplay.textContent = 'Geen berichten in de wachtrij (queue is leeg).';
                        } else {
                            try {
                                const encryptedMsg = messages[0];
                                const secretKey = 'IT-Business-Case-Secret';

                                // Decrypt
                                const bytes = CryptoJS.AES.decrypt(encryptedMsg, secretKey);
                                const decryptedString = bytes.toString(CryptoJS.enc.Utf8);
                                const decryptedJson = JSON.parse(decryptedString);

                                messagesDisplay.textContent = JSON.stringify(decryptedJson, null, 2);
                            } catch (e) {
                                console.error('Decryption failed:', e);
                                messagesDisplay.textContent = 'Fout bij decryptie (sleutel onjuist of data corrupt).';
                            }
                        }
                    } else {
                        messagesDisplay.textContent = 'Fout bij ophalen: ' + data.message;
                    }
                })
                .catch(err => {
                    console.error('Consumer error:', err);
                    messagesDisplay.textContent = 'Kon niet verbinden met server.';
                });
        });
    }
});
