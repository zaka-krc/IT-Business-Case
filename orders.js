document.addEventListener('DOMContentLoaded', () => {
    const ordersList = document.getElementById('orders-list');

    // Check login
    const userJson = localStorage.getItem('user');
    if (!userJson) {
        window.location.href = 'login.html';
        return;
    }

    const user = JSON.parse(userJson);

    function fetchOrders() {
        fetch(`/api/orders/${user.id}`)
            .then(res => res.json())
            .then(data => {
                if (data.status === 'success') {
                    renderOrders(data.orders);
                } else {
                    ordersList.innerHTML = `<p style="color: red;">Fout bij ophalen orders: ${data.message}</p>`;
                }
            })
            .catch(err => {
                console.error("Fetch error:", err);
                ordersList.innerHTML = `<p style="color: red;">Kan geen verbinding maken met de server.</p>`;
            });
    }

    function renderOrders(orders) {
        if (orders.length === 0) {
            ordersList.innerHTML = `<p style="text-align: center; color: #888;">Je hebt nog geen bestellingen geplaatst.</p>`;
            return;
        }

        ordersList.innerHTML = orders.map(order => `
            <div class="order-card">
                <div>
                    <h3 style="margin: 0 0 0.5rem 0;">Order #${order.id}</h3>
                    <p style="color: #666; margin: 0; font-size: 0.9rem;">
                        ${new Date(order.order_date).toLocaleString('nl-NL')}
                    </p>
                    <p style="margin: 0.5rem 0 0 0; font-weight: 500;">
                        ${order.items_summary}
                    </p>
                </div>
                <div style="text-align: right;">
                    <div style="font-weight: bold; font-size: 1.1rem; margin-bottom: 0.5rem;">
                        € ${order.total_amount.toFixed(2)}
                    </div>
                    <span class="status-badge status-${order.status}">
                        ${order.status}
                    </span>
                 </div>
            </div>
        `).join('');
    }

    // Initial fetch
    fetchOrders();

    // Auto-refresh every 5 seconds to show status updates
    setInterval(fetchOrders, 5000);
});
