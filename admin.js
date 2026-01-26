// Auth Check bij laden
const userJson = localStorage.getItem('user');
if (!userJson) {
    window.location.href = 'login.html';
}

const currentUser = JSON.parse(userJson);
if (currentUser.role !== 'admin' && currentUser.role !== 'super-admin') {
    alert("Geen toegang! U bent geen beheerder.");
    window.location.href = 'index.html';
}

// Toon gebruikersinfo in header
document.getElementById('admin-user-info').textContent = currentUser.firstName;

// Toon admin badge als je admin bent
if (currentUser.role === 'admin' || currentUser.role === 'super-admin') {
    const badgeContainer = document.getElementById('admin-badge-container');
    if (badgeContainer) badgeContainer.style.display = 'block';
}

// State
let products = [];
let users = [];
let sortState = { key: 'id', asc: true };

// Init
document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    loadProducts();
    if (currentUser.role === 'super-admin' || currentUser.role === 'admin') {
        loadUsers();
    }
    setupSearch();
    setupForms();
});

// --- TABS & UI ---
function setupTabs() {
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // UI
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');

            // Secties
            document.querySelectorAll('.section').forEach(s => s.style.display = 'none');
            document.getElementById(`${tab.dataset.tab}-section`).style.display = 'block';
        });
    });
}

// --- DATA FETCHING ---
const headers = {
    'Content-Type': 'application/json',
    'x-user-id': currentUser.id
};

async function loadProducts() {
    try {
        const res = await fetch('/api/products');
        products = await res.json();
        renderProducts(products);
    } catch (e) {
        console.error("Fout bij laden producten:", e);
    }
}

async function loadUsers() {
    try {
        const res = await fetch('/api/admin/users', { headers });
        if (!res.ok) throw new Error("Geen toegang");
        users = await res.json();
        renderUsers(users);
    } catch (e) {
        console.error("Fout bij laden gebruikers:", e);
        document.getElementById('user-list').innerHTML = `<tr><td colspan="5" style="color:red; text-align:center;">Toegang geweigerd of fout opgetreden.</td></tr>`;
    }
}

// --- RENDERING ---
function renderProducts(list) {
    const tbody = document.getElementById('product-list');
    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #7f8c8d;">Geen producten gevonden.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(p => `
        <tr>
            <td data-label="ID"><span style="font-family: monospace; background: #f1f3f5; padding: 2px 6px; border-radius: 4px;">#${p.id}</span></td>
            <td data-label="Product" style="font-weight: 500;">${p.name}</td>
            <td data-label="Prijs" style="color: var(--primary-color); font-weight: 700;">€ ${parseFloat(p.price).toFixed(2)}</td>
            <td data-label="Voorraad">
                <span style="color: ${p.stock < 10 ? '#e74c3c' : '#2ecc71'}; font-weight: 600;">
                    ${p.stock} stuks
                </span>
            </td>
            <td data-label="Acties">
                <button class="action-btn edit-btn" onclick="openEditPopup('product', ${p.id})">
                    <ion-icon name="pencil-outline"></ion-icon>
                </button>
                <button class="action-btn delete-btn" onclick="deleteProduct(${p.id})">
                    <ion-icon name="trash-outline"></ion-icon>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderUsers(list) {
    const tbody = document.getElementById('user-list');

    if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 2rem; color: #7f8c8d;">Geen gebruikers gevonden.</td></tr>`;
        return;
    }

    tbody.innerHTML = list.map(u => `
        <tr>
            <td data-label="ID"><span style="font-family: monospace; background: #f1f3f5; padding: 2px 6px; border-radius: 4px;">#${u.id}</span></td>
            <td data-label="Naam" style="font-weight: 500;">${u.first_name} ${u.last_name}</td>
            <td data-label="Email"><a href="mailto:${u.email}" style="color: var(--secondary-color); text-decoration: none;">${u.email}</a></td>
            <td data-label="Rol"><span class="role-badge role-${u.role}">${u.role}</span></td>
            <td data-label="Acties">
                <button class="action-btn edit-btn" onclick="openEditPopup('user', ${u.id})">
                    <ion-icon name="pencil-outline"></ion-icon>
                </button>
                ${(currentUser.role === 'super-admin' || (currentUser.role === 'admin' && u.role === 'user')) && u.id != currentUser.id
            ? `<button class="action-btn delete-btn" onclick="deleteUser(${u.id})">
                        <ion-icon name="trash-outline"></ion-icon>
                   </button>`
            : ''}
            </td>
        </tr>
    `).join('');
}

// --- GENERIC POPUP LOGICA ---
window.closePopup = () => {
    document.getElementById('popup-overlay').classList.remove('active');
    document.getElementById('popup-dynamic-fields').innerHTML = ''; // Clean up
};

window.openEditPopup = (type, id) => {
    const isProduct = type === 'product';
    // Let op: id kan string/number zijn, vergelijking veilig maken
    const item = isProduct ? products.find(p => p.id == id) : users.find(u => u.id == id);

    if (!item) return;

    // Set Hidden Fields
    document.getElementById('popup-id').value = id;
    document.getElementById('popup-type').value = type;
    document.getElementById('popup-title').textContent = isProduct ? 'Product Bewerken' : 'Gebruiker Bewerken';

    const container = document.getElementById('popup-dynamic-fields');
    let html = '';

    if (isProduct) {
        // Product Fields
        html = `
            <div class="form-group">
                <label>Product Naam</label>
                <input type="text" id="edit-prod-name" value="${item.name}" required>
            </div>
            <div class="form-group">
                <label>Prijs (€)</label>
                <input type="number" id="edit-prod-price" step="0.01" value="${item.price}" required>
            </div>
            <div class="form-group">
                <label>Voorraad Aantal</label>
                <input type="number" id="edit-prod-stock" value="${item.stock}" required>
            </div>
        `;
    } else {
        // User Fields
        html = `
            <div class="form-group">
                <label>Voornaam</label>
                <input type="text" id="edit-user-first" value="${item.first_name}" required>
            </div>
            <div class="form-group">
                <label>Achternaam</label>
                <input type="text" id="edit-user-last" value="${item.last_name}" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="edit-user-email" value="${item.email}" required>
            </div>
            
            <div class="form-group" id="role-edit-group">
                <label>Rol (Alleen Super-Admin)</label>
                <select id="edit-user-role" class="filter-select" style="width:100%">
                    <option value="user" ${item.role === 'user' ? 'selected' : ''}>Gebruiker</option>
                    <option value="admin" ${item.role === 'admin' ? 'selected' : ''}>Administrator</option>
                    <option value="super-admin" ${item.role === 'super-admin' ? 'selected' : ''}>Super Admin</option>
                </select>
            </div>

            <div style="border-top: 1px solid #eee; margin: 1.5rem 0; padding-top: 1rem;">
                <h4 style="margin-bottom: 1rem; color: #7f8c8d;">Adresgegevens</h4>
                <div class="form-group">
                    <label>Straat</label>
                    <input type="text" id="edit-user-street" value="${item.street || ''}">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Nummer</label>
                        <input type="text" id="edit-user-number" value="${item.house_number || ''}">
                    </div>
                    <div class="form-group">
                        <label>Postcode</label>
                        <input type="text" id="edit-user-zipcode" value="${item.zipcode || ''}">
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // Post-render logic (Roles disabling)
    if (!isProduct) {
        const roleSelect = document.getElementById('edit-user-role');
        if (currentUser.role !== 'super-admin') {
            roleSelect.disabled = true;
        } else {
            // Super admin prevent self-downgrade logic
            if (parseInt(item.id) === parseInt(currentUser.id)) {
                roleSelect.disabled = true;
            }
        }
    }

    document.getElementById('popup-overlay').classList.add('active');
};

// --- NIEUW: CREATE POPUP LOGICA ---
window.openCreatePopup = (type) => {
    // Reset fields
    document.getElementById('popup-id').value = ''; // Leeg ID = Create Mode
    document.getElementById('popup-type').value = type;
    document.getElementById('popup-title').textContent = type === 'product' ? 'Nieuw Product Toevoegen' : 'Nieuwe Gebruiker Toevoegen';

    const container = document.getElementById('popup-dynamic-fields');
    let html = '';

    if (type === 'product') {
        html = `
            <div class="form-group">
                <label>Product Naam</label>
                <input type="text" id="edit-prod-name" placeholder="Naam" required>
            </div>
            <div class="form-group">
                <label>Prijs (€)</label>
                <input type="number" id="edit-prod-price" step="0.01" placeholder="0.00" required>
            </div>
            <div class="form-group">
                <label>Voorraad Aantal</label>
                <input type="number" id="edit-prod-stock" placeholder="0" required>
            </div>
        `;
    } else {
        // User Fields (Empty)
        html = `
            <div class="form-group">
                <label>Voornaam</label>
                <input type="text" id="edit-user-first" placeholder="Voornaam" required>
            </div>
            <div class="form-group">
                <label>Achternaam</label>
                <input type="text" id="edit-user-last" placeholder="Achternaam" required>
            </div>
            <div class="form-group">
                <label>Email</label>
                <input type="email" id="edit-user-email" placeholder="Email" required>
            </div>
             <div class="form-group">
                <label>Wachtwoord</label>
                <input type="password" id="edit-user-password" placeholder="Wachtwoord" required>
            </div>
            
            <div class="form-group" id="role-edit-group">
                <label>Rol</label>
                <select id="edit-user-role" class="filter-select" style="width:100%">
                    <option value="user" selected>Gebruiker</option>
                    ${currentUser.role === 'super-admin' ? '<option value="admin">Administrator</option>' : ''}
                </select>
                ${currentUser.role !== 'super-admin' ? '<small style="color:#7f8c8d; display:block; margin-top:0.3rem;">Als admin kunt u alleen gebruikers aanmaken.</small>' : ''}
            </div>

            <div style="border-top: 1px solid #eee; margin: 1.5rem 0; padding-top: 1rem;">
                <h4 style="margin-bottom: 1rem; color: #7f8c8d;">Adresgegevens (Optioneel)</h4>
                <div class="form-group">
                    <label>Straat</label>
                    <input type="text" id="edit-user-street" placeholder="Straat">
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                    <div class="form-group">
                        <label>Nummer</label>
                        <input type="text" id="edit-user-number" placeholder="Nr">
                    </div>
                    <div class="form-group">
                        <label>Postcode</label>
                        <input type="text" id="edit-user-zipcode" placeholder="1234AB">
                    </div>
                </div>
            </div>
        `;
    }

    container.innerHTML = html;

    // RBAC: Als admin, role select is disabled of verborgen (hierboven al geregeld via HTML injection logic)
    if (type === 'user' && currentUser.role !== 'super-admin') {
        const roleSelect = document.getElementById('edit-user-role');
        roleSelect.disabled = true; // Visueel disabled, value blijft 'user'
    }

    document.getElementById('popup-overlay').classList.add('active');
};

function setupForms() {
    document.getElementById('popup-form').addEventListener('submit', async (e) => {
        e.preventDefault();

        const type = document.getElementById('popup-type').value;
        const id = document.getElementById('popup-id').value;
        const isCreate = !id; // Als ID leeg is, is het Create Mode

        let data = {};
        let endpoint = '';
        let method = isCreate ? 'POST' : 'PUT';

        if (type === 'product') {
            data = {
                name: document.getElementById('edit-prod-name').value,
                price: document.getElementById('edit-prod-price').value,
                stock: document.getElementById('edit-prod-stock').value
            };
            // Create endpoint vs Edit endpoint
            endpoint = isCreate ? '/api/admin/products' : `/api/admin/products/${id}`;
        } else {
            data = {
                firstName: document.getElementById('edit-user-first').value,
                lastName: document.getElementById('edit-user-last').value,
                email: document.getElementById('edit-user-email').value,
                role: document.getElementById('edit-user-role').value,
                street: document.getElementById('edit-user-street').value,
                number: document.getElementById('edit-user-number').value,
                zipcode: document.getElementById('edit-user-zipcode').value
            };
            if (isCreate) {
                // Wachtwoord is alleen nodig/beschikbaar bij create in dit formulier
                data.password = document.getElementById('edit-user-password').value;
                endpoint = '/api/admin/users';
            } else {
                endpoint = `/api/admin/users/${id}`;
            }
        }

        try {
            const res = await fetch(endpoint, {
                method: method,
                headers,
                body: JSON.stringify(data)
            });

            if (res.ok) {
                alert(`Success: ${type === 'product' ? 'Product' : 'Gebruiker'} ${isCreate ? 'aangemaakt' : 'bijgewerkt'}.`);
                closePopup();
                if (type === 'product') loadProducts();
                else loadUsers();
            } else {
                const err = await res.json();
                alert('Fout: ' + (err.error || err.message));
            }
        } catch (err) {
            console.error(err);
            alert('Er is een onverwachte fout opgetreden.');
        }
    });
}

// --- DELETE ---
window.deleteUser = async (id) => {
    if (!confirm('Weet je zeker dat je deze gebruiker wilt verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;

    try {
        const res = await fetch(`/api/admin/users/${id}`, {
            method: 'DELETE',
            headers
        });

        if (res.ok) {
            alert('Gebruiker succesvol verwijderd.');
            loadUsers();
        } else {
            alert('Fout: ' + (await res.json()).error);
        }
    } catch (err) {
        console.error(err);
    }
};

window.deleteProduct = async (id) => {
    if (!confirm('Weet je zeker dat je dit product wilt verwijderen?')) return;

    try {
        const res = await fetch(`/api/admin/products/${id}`, {
            method: 'DELETE',
            headers
        });

        if (res.ok) {
            alert('Product verwijderd.');
            loadProducts(); // Herlaad tabel
        } else {
            alert('Fout: ' + (await res.json()).error);
        }
    } catch (err) {
        console.error(err);
        alert('Er ging iets mis.');
    }
};

// --- SORTING & FILTERING ---
window.sortTable = (type, key) => {
    const list = type === 'products' ? products : users;

    // Toggle sort state
    if (sortState.key === key) {
        sortState.asc = !sortState.asc;
    } else {
        sortState.key = key;
        sortState.asc = true;
    }

    list.sort((a, b) => {
        let valA, valB;

        if (type === 'users' && key === 'last_name') {
            valA = (a.first_name + ' ' + a.last_name).toLowerCase();
            valB = (b.first_name + ' ' + b.last_name).toLowerCase();
        } else {
            valA = a[key];
            valB = b[key];
        }

        if (valA == null) valA = "";
        if (valB == null) valB = "";

        if (typeof valA === 'string' && typeof valB === 'string') {
            valA = valA.toLowerCase();
            valB = valB.toLowerCase();
        }

        if (valA < valB) return sortState.asc ? -1 : 1;
        if (valA > valB) return sortState.asc ? 1 : -1;
        return 0;
    });

    if (type === 'products') renderProducts(list);
    else renderUsers(list);
};

// Live Search & Filter
function setupSearch() {
    // Product Search
    document.getElementById('product-search').addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const filtered = products.filter(p =>
            p.name.toLowerCase().includes(term) ||
            p.id.toString().includes(term)
        );
        renderProducts(filtered);
    });

    // User Search & Filter
    const filterUsers = () => {
        const term = document.getElementById('user-search').value.toLowerCase();
        const roleFilter = document.getElementById('user-role-filter').value;

        const filtered = users.filter(u => {
            const fullName = `${u.first_name} ${u.last_name}`.toLowerCase();
            const matchesSearch =
                fullName.includes(term) ||
                u.email.toLowerCase().includes(term);
            const matchesRole = roleFilter === 'all' || u.role === roleFilter;

            return matchesSearch && matchesRole;
        });
        renderUsers(filtered);
    };

    document.getElementById('user-search').addEventListener('input', filterUsers);
    document.getElementById('user-role-filter').addEventListener('change', filterUsers);
}
