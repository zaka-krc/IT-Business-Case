document.addEventListener('DOMContentLoaded', () => {
    // Application State
    const products = [
        { id: 1, name: 'Premium Laptop Pro', price: 999.00, image: 'images/laptop.png' },
        { id: 2, name: 'Smartphone X', price: 799.00, image: 'images/smartphone.png' },
        { id: 3, name: 'Noise-Cancel Hoofdtelefoon', price: 299.00, image: 'images/headphones.png' },
        { id: 4, name: 'Smartwatch Series 5', price: 199.00, image: 'images/smartwatch.png' },
        { id: 5, name: 'UltraTabs 10', price: 450.00, image: 'images/smartphone.png' },
        { id: 6, name: 'Gaming Laptop', price: 1499.00, image: 'images/laptop.png' },
        { id: 7, name: 'Draadloze Oordopjes', price: 129.00, image: 'images/headphones.png' },
        { id: 8, name: '4K Action Camera', price: 349.00, image: 'images/smartphone.png' },
    ];

    let cart = [];

    // DOM Elements
    const productGrid = document.getElementById('product-grid');
    const cartIcon = document.getElementById('cart-icon');
    const cartOverlay = document.getElementById('cart-overlay');
    const closeCartBtn = document.getElementById('close-cart');
    const backdrop = document.getElementById('backdrop');
    const cartItemsContainer = document.getElementById('cart-items');
    const cartTotalElement = document.getElementById('cart-total');
    const cartCountElement = document.getElementById('cart-count');

    const cartView = document.getElementById('cart-view');
    const checkoutView = document.getElementById('checkout-view');
    const nextBtn = document.getElementById('next-btn');
    const backBtn = document.getElementById('back-btn');
    const checkoutForm = document.getElementById('order-form');

    // Initialization
    function init() {
        renderProducts();
        updateCartUI();
    }

    // Render Products
    function renderProducts() {
        productGrid.innerHTML = products.map(product => `
            <div class="product-card">
                <img src="${product.image}" alt="${product.name}" class="product-image">
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <div class="product-price">€ ${product.price.toFixed(2)}</div>
                    <button class="add-btn" onclick="addToCart(${product.id})">
                        Toevoegen +
                    </button>
                </div>
            </div>
        `).join('');
    }

    // Cart Logic
    window.addToCart = (productId) => {
        const product = products.find(p => p.id === productId);
        const existingItem = cart.find(item => item.id === productId);

        if (existingItem) {
            existingItem.quantity += 1;
        } else {
            cart.push({ ...product, quantity: 1 });
        }

        updateCartUI();
        openCart();
    };

    window.updateQuantity = (productId, change) => {
        const itemIndex = cart.findIndex(item => item.id === productId);
        if (itemIndex === -1) return;

        cart[itemIndex].quantity += change;

        if (cart[itemIndex].quantity <= 0) {
            cart.splice(itemIndex, 1);
        }

        updateCartUI();
    };

    function updateCartUI() {
        // Update badge
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountElement.textContent = totalItems;

        // Render cart items
        if (cart.length === 0) {
            cartItemsContainer.innerHTML = '<p style="text-align:center; color: #888;">Je winkelmandje is leeg.</p>';
            nextBtn.style.display = 'none';
        } else {
            nextBtn.style.display = 'block';
            cartItemsContainer.innerHTML = cart.map(item => `
                <div class="cart-item">
                    <img src="${item.image}" alt="${item.name}">
                    <div class="cart-item-details">
                        <div class="cart-item-title">${item.name}</div>
                        <div class="cart-item-price">€ ${(item.price * item.quantity).toFixed(2)}</div>
                        <div class="cart-controls">
                            <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                            <span>${item.quantity}</span>
                            <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // Update Total
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotalElement.textContent = `€ ${total.toFixed(2)}`;
    }

    // Navigation & UI State
    function openCart() {
        cartOverlay.classList.add('open');
        backdrop.classList.add('active');
        showCartView(); // Reset to cart view when opening
    }

    function closeCart() {
        cartOverlay.classList.remove('open');
        backdrop.classList.remove('active');
    }

    function showCartView() {
        cartView.style.display = 'block';
        checkoutView.classList.remove('active');
        checkoutView.style.display = 'none'; // Ensure hidden
        nextBtn.textContent = 'Volgende';
    }

    function showCheckoutView() {
        cartView.style.display = 'none';
        checkoutView.style.display = 'block';
        nextBtn.textContent = 'Verzenden';
        // Small delay to allow display:block to apply before adding active class for animation
        setTimeout(() => checkoutView.classList.add('active'), 10);
    }

    // Event Listeners
    cartIcon.addEventListener('click', openCart);
    closeCartBtn.addEventListener('click', closeCart);
    backdrop.addEventListener('click', closeCart);

    // Logic for the main action button (Next / Send)
    nextBtn.addEventListener('click', () => {
        if (checkoutView.style.display === 'block') {
            // We are in checkout mode, act as "Verzenden"
            submitOrder();
        } else {
            // We are in cart mode, act as "Volgende"
            if (cart.length > 0) {
                showCheckoutView();
            }
        }
    });

    backBtn.addEventListener('click', showCartView);

    function submitOrder() {
        if (!checkoutForm.checkValidity()) {
            checkoutForm.reportValidity();
            return;
        }

        const formData = new FormData(checkoutForm);

        // Construct detailed order payload
        const orderDetails = {
            items: cart.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                quantity: item.quantity
            })),
            customer: {
                voornaam: formData.get('firstName'),
                naam: formData.get('lastName'),
                adress: formData.get('address')
            }
        };

        // Send to Backend Bridge
        fetch('http://localhost:3000/api/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderDetails)
        })
            .then(response => response.json())
            .then(data => {
                console.log('Server Request Success:', data);
                alert(`Bedankt ${formData.get('firstName')}! Je bestelling is verzonden.`);

                // Reset
                cart = [];
                updateCartUI();
                closeCart();
                checkoutForm.reset();
            })
            .catch(error => {
                console.error('Error:', error);
                alert('Kan geen verbinding maken met de backend service.\nZorg ervoor dat "node backend.js" draait in de terminal!');
            });
        // Reset view state happens in closeCart > showCartView next time
    }



    init();
});
