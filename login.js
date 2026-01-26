function showRegister() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('register-section').style.display = 'block';
}

function showLogin() {
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('register-section').style.display = 'none';
}

document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');

    // LOGIN
    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(loginForm);
        const payload = Object.fromEntries(formData);

        // Trim inputs
        payload.email = payload.email.trim();
        payload.password = payload.password.trim();

        fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    alert(`Welkom terug, ${data.user.firstName}!`);
                    window.location.href = 'index.html'; // Or referrer
                } else {
                    alert(data.message);
                }
            })
            .catch(err => console.error(err));
    });

    // REGISTER
    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(registerForm);
        const payload = Object.fromEntries(formData);

        // Trim inputs
        payload.email = payload.email.trim();
        payload.password = payload.password.trim();
        payload.firstName = payload.firstName.trim();
        payload.lastName = payload.lastName.trim();

        // Simple validation check
        if (payload.password.length < 4) {
            alert('Wachtwoord moet minstens 4 tekens bevatten.');
            return;
        }

        fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    localStorage.setItem('user', JSON.stringify(data.user));
                    alert(`Account aangemaakt! Welkom, ${data.user.firstName}.`);
                    window.location.href = 'index.html';
                } else {
                    alert(data.message);
                }
            })
            .catch(err => console.error(err));
    });
});
