document.addEventListener('DOMContentLoaded', () => {
    const orderItemsList = document.getElementById('order-items-list');
    const orderTotalDisplay = document.getElementById('order-total-display');
    const checkoutForm = document.getElementById('checkout-form');

    let cart = [];
    try {
        const storedCart = localStorage.getItem('techno_cart');
        if (storedCart) cart = JSON.parse(storedCart);
    } catch (e) {
        console.error("Failed to load cart", e);
    }

    if (cart.length === 0) {
        alert("Je winkelmandje is leeg.");
        window.location.href = 'index.html';
        return;
    }

    const userJson = localStorage.getItem('user');
    if (!userJson) {
        alert("Je moet ingelogd zijn om te kunnen afrekenen.");
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userJson);
    document.getElementById('firstName').value = user.firstName || '';
    document.getElementById('lastName').value = user.lastName || '';
    document.getElementById('email').value = user.email || '';

    if (user.address) {
        document.getElementById('street').value = user.address.street || '';
        document.getElementById('houseNumber').value = user.address.number || '';
        document.getElementById('zipcode').value = user.address.zipcode || '';
    }

    let total = 0;
    orderItemsList.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `<div class="order-row"><span>${item.quantity}x ${item.name}</span><span>€ ${itemTotal.toFixed(2)}</span></div>`;
    }).join('');

    orderTotalDisplay.textContent = `Totaal: € ${total.toFixed(2)}`;

    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(checkoutForm);
// checkout.js
document.addEventListener('DOMContentLoaded', () => {
    const orderItemsList = document.getElementById('order-items-list');
    const orderTotalDisplay = document.getElementById('order-total-display');
    const checkoutForm = document.getElementById('checkout-form');

    let cart = JSON.parse(localStorage.getItem('techno_cart') || '[]');
    const user = JSON.parse(localStorage.getItem('user') || '{}');

    let total = 0;
    orderItemsList.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `<div class="order-row"><span>${item.quantity}x ${item.name}</span><span>€ ${itemTotal.toFixed(2)}</span></div>`;
    }).join('');
    orderTotalDisplay.textContent = `Totaal: € ${total.toFixed(2)}`;

    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const formData = new FormData(checkoutForm);

        const orderData = {
            totalAmount: total, // NU TOEGEVOEGD
            items: cart.map(item => ({ id: item.id, name: item.name, price: item.price, quantity: item.quantity })),
            customer: {
                voornaam: formData.get('firstName'),
                naam: formData.get('lastName'),
                email: formData.get('email'),
                straat: formData.get('street'),
                huisnummer: formData.get('houseNumber'),
                postcode: formData.get('zipcode')
            }
        };

        // Send to Backend
        fetch('http://localhost:3000/api/send', {
parent of f3e7394 (saleforces update)
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(res => res.json())
        .then(data => {
            if (data.status === 'success') {
                alert('Bestelling geplaatst!');
                localStorage.removeItem('techno_cart');
                window.location.href = 'index.html';
            }
        });
    });
});

        fetch('https://10.2.160.224:3000/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.status === 'success') {
                alert(`Bedankt ${formData.get('firstName')}! Je bestelling is geplaatst.`);
                localStorage.removeItem('techno_cart');
                window.location.href = 'index.html';
            } else {
                alert('Er ging iets mis: ' + data.message);
            }
        })
        .catch(err => {
            console.error('Order error:', err);
            alert('Kon geen verbinding maken met de server.');
        });
    });
});