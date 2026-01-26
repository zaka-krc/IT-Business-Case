document.addEventListener('DOMContentLoaded', () => {
    // Applicatietoestand
    /*const products = [
        { id: 1, name: 'Premium Laptop Pro', price: 999.00, image: 'images/laptop.png' },
        { id: 2, name: 'Smartphone X', price: 799.00, image: 'images/smartphone.png' },
        { id: 3, name: 'Noise-Cancel Hoofdtelefoon', price: 299.00, image: 'images/headphones.png' },
        { id: 4, name: 'Smartwatch Series 5', price: 199.00, image: 'images/smartwatch.png' },
        { id: 5, name: 'UltraTabs 10', price: 450.00, image: 'images/smartphone.png' },
        { id: 6, name: 'Gaming Laptop', price: 1499.00, image: 'images/laptop.png' },
        { id: 7, name: 'Draadloze Oordopjes', price: 129.00, image: 'images/headphones.png' },
        { id: 8, name: '4K Action Camera', price: 349.00, image: 'images/smartphone.png' },
        { id: 9, name: 'Fitness Tracker', price: 89.00, image: 'images/smartwatch.png' },
        { id: 10, name: 'E-Reader Touch', price: 119.00, image: 'images/smartphone.png' }
    ];
*/

let products = [];

async function loadProducts() {
    try {
        // We maken een nieuwe route in de server die de producten uit de DB haalt
        const response = await fetch('http://localhost:3000/api/products');
        products = await response.json();
        renderProducts(); // Teken de producten pas als de data er is
    } catch (error) {
        console.error("Fout bij laden producten:", error);
    }
}

    let cart = [];

    // DOM Elementen
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

    async function loadProducts() {
    try {
        const response = await fetch('http://localhost:3000/api/products');
        if (!response.ok) throw new Error('Netwerk respons was niet ok');
        products = await response.json();
        console.log("Producten geladen uit DB:", products); // Debug lijn
        renderProducts();
    } catch (error) {
        console.error("Fout bij laden producten:", error);
        productGrid.innerHTML = "<p>Fout bij laden van producten. Start de server!</p>";
    }
}
    
    // Initialisatie
    async function init() {
        await loadProducts(); // Wacht tot de producten binnen zijn
        updateCartUI();
        checkUserStatus();
    }

    async function fetchProducts() {
        try {
            const response = await fetch('http://localhost:3000/api/products');
            products = await response.json();
            renderProducts();
        } catch (error) {
            console.error('Failed to fetch products:', error);
            productGrid.innerHTML = '<p style="text-align:center; color:red;">Kan producten niet laden.</p>';
        }
    }

    function checkUserStatus() {
        const userJson = localStorage.getItem('user');
        const userLabel = document.getElementById('user-label');
        const userActions = document.getElementById('user-actions');

        if (userJson) {
            const user = JSON.parse(userJson);
            userLabel.textContent = user.firstName;
            userActions.innerHTML = `
                <a href="profile.html" style="text-decoration: none; color: var(--dark-bg); font-weight: 600; display: flex; align-items: center; gap: 0.5rem;">
                    <ion-icon name="person-circle-outline" size="large" style="color: var(--primary-color);"></ion-icon>
                    <span>${user.firstName}</span>
                </a>
            `;
        }
    }

    // Producten Renderen
    function renderProducts() {
    if (products.length === 0) {
        productGrid.innerHTML = "<p>Producten laden...</p>";
        return;
    }

    productGrid.innerHTML = products.map(product => {
        // Gebruik het plaatje uit de DB, of een placeholder als die ontbreekt
        const imgUrl = product.image || 'images/placeholder.png'; 
        const isOutOfStock = product.stock <= 0;

        return `
        productGrid.innerHTML = products.map(product => {
            const isOutOfStock = product.stock <= 0;
            const btnClass = isOutOfStock ? 'add-btn disabled' : 'add-btn';
            const btnText = isOutOfStock ? 'Out of Stock' : 'Toevoegen +';
            const btnAttr = isOutOfStock ? 'disabled' : `onclick="addToCart(${product.id})"`;
            const stockColor = isOutOfStock ? 'color: red;' : 'color: green;';

            return `
            <div class="product-card">
                <img src="${imgUrl}" alt="${product.name}" class="product-image">
                <div class="product-info">
                    <h3 class="product-name">${product.name}</h3>
                    <p>Voorraad: ${product.stock}</p>
                    <div class="product-price">€ ${product.price.toFixed(2)}</div>
                    <button class="add-btn" onclick="addToCart(${product.id})" ${isOutOfStock ? 'disabled' : ''}>
                        ${isOutOfStock ? 'Uitverkocht' : 'Toevoegen +'}
                    </button>
                </div>
            </div>`;
    }).join('');
}


    // Winkelmand Logica
    window.addToCart = (productId) => {
        const product = products.find(p => p.id === productId);
        const existingItem = cart.find(item => item.id === productId);

        if (existingItem) {
            if (existingItem.quantity < product.stock) {
                existingItem.quantity += 1;
            } else {
                alert('Niet meer voorraad beschikbaar!');
                return;
            }
        } else {
            if (product.stock > 0) {
                cart.push({ ...product, quantity: 1 });
            }
        }

        updateCartUI();
        openCart();
    };

    window.handleManualQuantityChange = (productId, input) => {
        const item = cart.find(i => i.id === productId);
        if (!item) return;

        let val = parseInt(input.value);

        // Validatie: check NaN en minstens 1
        if (isNaN(val) || val < 1) {
            val = 1;
        }

        // Validatie: check stock
        if (val > item.stock) {
            val = item.stock;
            alert(`Maximale voorraad voor ${item.name} is ${item.stock}`);
        }

        // Update state en UI
        item.quantity = val;
        input.value = val;
        updateCartUI();
    };

    window.updateQuantity = (productId, change) => {
        const item = cart.find(i => i.id === productId);
        if (!item) return;

        let newQty = item.quantity + change;

        // Minimaal 1 (of verwijderen bij 0, afhankelijk van UX. Hier kiezen we voor verwijderen bij 0 via de min knop)
        if (newQty <= 0) {
            const confirmDelete = confirm("Item verwijderen?");
            if (confirmDelete) {
                cart.splice(cart.indexOf(item), 1);
                updateCartUI();
                return;
            } else {
                newQty = 1;
            }
        }

        // Maximaal stock
        if (newQty > item.stock) {
            newQty = item.stock;
            alert(`Niet meer voorraad beschikbaar! Max: ${item.stock}`);
        }

        item.quantity = newQty;
        updateCartUI();
    };

    function updateCartUI() {
        // Badge bijwerken
        const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
        cartCountElement.textContent = totalItems;

        // Winkelmand items renderen
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
                        <div class="cart-controls" style="display: flex; align-items: center; gap: 5px;">
                            <button class="qty-btn" onclick="updateQuantity(${item.id}, -1)">-</button>
                            <input type="number" 
                                   class="qty-input" 
                                   value="${item.quantity}" 
                                   min="1" 
                                   max="${item.stock}" 
                                   onchange="handleManualQuantityChange(${item.id}, this)"
                                   style="width: 50px; text-align: center; border: 1px solid #ddd; border-radius: 4px; padding: 2px;">
                            <button class="qty-btn" onclick="updateQuantity(${item.id}, 1)">+</button>
                        </div>
                    </div>
                </div>
            `).join('');
        }

        // Totaal bijwerken
        const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotalElement.textContent = `€ ${total.toFixed(2)}`;
    }

    // Navigatie & UI Status
    function openCart() {
        cartOverlay.classList.add('open');
        backdrop.classList.add('active');
        showCartView();
    }

    function closeCart() {
        cartOverlay.classList.remove('open');
        backdrop.classList.remove('active');
    }

    function showCartView() {
        cartView.style.display = 'block';
        nextBtn.textContent = 'Volgende';
    }

    // Oude interne checkout-view is verwijderd


    function goToCheckout() {
        // Opslaan in localStorage
        localStorage.setItem('techno_cart', JSON.stringify(cart));
        window.location.href = 'checkout.html';
    }

    // Event Listeners (Gebeurtenisluisteraars)
    cartIcon.addEventListener('click', openCart);
    closeCartBtn.addEventListener('click', closeCart);
    backdrop.addEventListener('click', closeCart);

    // Logica voor de belangrijkste actieknop (Volgende)
    nextBtn.addEventListener('click', () => {
        if (cart.length > 0) {
            goToCheckout();
        }
    });







    init();
});
