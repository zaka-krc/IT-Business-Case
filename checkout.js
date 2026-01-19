document.addEventListener('DOMContentLoaded', () => {
    const orderItemsList = document.getElementById('order-items-list');
    const orderTotalDisplay = document.getElementById('order-total-display');
    const checkoutForm = document.getElementById('checkout-form');

    // Load cart from localStorage
    let cart = [];
    try {
        const storedCart = localStorage.getItem('techno_cart');
        if (storedCart) {
            cart = JSON.parse(storedCart);
        }
    } catch (e) {
        console.error("Failed to load cart", e);
    }

    if (cart.length === 0) {
        alert("Je winkelmandje is leeg. Je wordt teruggestuurd naar de winkel.");
        return;
    }

    // CHECK LOGIN STATUS
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        alert("Je moet ingelogd zijn om te kunnen afrekenen.");
        // Save redirect url maybe?
        window.location.href = 'login.html';
        return;
    }

    // Auto-fill user data
    const user = JSON.parse(userJson);
    document.getElementById('firstName').value = user.firstName || '';
    document.getElementById('lastName').value = user.lastName || '';
    document.getElementById('email').value = user.email || '';

    if (user.address) {
        document.getElementById('street').value = user.address.street || '';
        document.getElementById('houseNumber').value = user.address.number || '';
        document.getElementById('zipcode').value = user.address.zipcode || '';
    }

    // Set header user info
    const userActions = document.getElementById('user-actions');
    if (userActions) {
        userActions.innerHTML = `
            <a href="profile.html" style="text-decoration: none; color: var(--dark-bg); font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                <ion-icon name="person-circle-outline" size="large" style="color: var(--primary-color);"></ion-icon>
                <span>${user.firstName}</span>
            </a>
        `;
    }

    // Render Order Summary
    let total = 0;
    orderItemsList.innerHTML = cart.map(item => {
        const itemTotal = item.price * item.quantity;
        total += itemTotal;
        return `
            <div class="order-row">
                <span>${item.quantity}x ${item.name}</span>
                <span>€ ${itemTotal.toFixed(2)}</span>
            </div>
        `;
    }).join('');

    orderTotalDisplay.textContent = `Totaal: € ${total.toFixed(2)}`;

    // Handle Form Submission
    checkoutForm.addEventListener('submit', (e) => {
        e.preventDefault();

        const formData = new FormData(checkoutForm);

        const orderData = {
            items: cart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
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
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        })
            .then(response => response.json())
            .then(data => {
                if (data.status === 'success') {
                    alert(`Bedankt ${formData.get('firstName')}! Je bestelling is geplaatst.`);
                    localStorage.removeItem('techno_cart'); // Clear cart
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
