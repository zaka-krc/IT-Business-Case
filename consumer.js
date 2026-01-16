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
                        const messages = data.data; // Dit is nu een array van gedecrypte objecten
                        if (messages.length === 0) {
                            messagesDisplay.textContent = 'Geen berichten in de wachtrij (queue is leeg).';
                        } else {
                            // Toon het eerste bericht
                            messagesDisplay.textContent = JSON.stringify(messages[0], null, 2);
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
