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
        window.location.href = 'index.html';
        return;
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
