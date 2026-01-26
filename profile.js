document.addEventListener('DOMContentLoaded', () => {
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userJson);
    document.getElementById('welcome-msg').textContent = `Profiel van ${user.firstName}`;

    // Fill form
    if (user.address) {
        document.getElementById('p-street').value = user.address.street || '';
        document.getElementById('p-number').value = user.address.number || '';
        document.getElementById('p-zipcode').value = user.address.zipcode || '';
    }

    // VEILIGHEID: Verberg/Disable delete knop voor Super-Admin
    if (user.role === 'super-admin') {
        const deleteBtn = document.getElementById('delete-account-btn');
        if (deleteBtn) {
            deleteBtn.disabled = true;
            deleteBtn.style.backgroundColor = '#ccc';
            deleteBtn.style.cursor = 'not-allowed';
            deleteBtn.textContent = 'Account verwijderen niet toegestaan (Super-Admin)';

            // Verwijder event listener effectief door de knop te clonen en te vervangen (snelle hack) of gewoon de listener in logic te blokkeren
            // Maar disabled attribute zou genoeg moeten zijn voor UI.
            // Voor de zekerheid ook de container aanpassen:
            const dangerZone = document.querySelector('.danger-zone');
            if (dangerZone) {
                dangerZone.style.opacity = '0.5';
            }
        }
    }

    // LOGOUT
    document.getElementById('logout-btn').addEventListener('click', () => {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    // UPDATE ADDRESS
    document.getElementById('address-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const street = document.getElementById('p-street').value;
        const number = document.getElementById('p-number').value;
        const zipcode = document.getElementById('p-zipcode').value;

        fetch(`/api/user/${user.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ street, number, zipcode })
        })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    user.address = { street, number, zipcode };
                    localStorage.setItem('user', JSON.stringify(user));
                    alert('Adresgegevens opgeslagen!');
                } else {
                    alert(data.message);
                }
            })
            .catch(err => console.error(err));
    });

    // DELETE ACCOUNT
    document.getElementById('delete-account-btn').addEventListener('click', () => {
        if (confirm('Weet je zeker dat je je account wilt verwijderen?')) {
            fetch(`/api/user/${user.id}`, {
                method: 'DELETE'
            })
                .then(res => res.json())
                .then(data => {
                    if (data.status === 'success') {
                        localStorage.removeItem('user');
                        alert('Je account is verwijderd.');
                        window.location.href = 'index.html';
                    }
                })
                .catch(err => console.error(err));
        }
    });
});
