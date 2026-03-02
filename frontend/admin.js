let adminToken = "";
let healthInterval;

async function adminLogin() {
    const password = document.getElementById('adminPassword').value;
    const msgElement = document.getElementById('admin-msg');

    try {
        const response = await fetch('http://localhost:3001/api/auth/admin-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        const data = await response.json();

        if (response.ok) {
            adminToken = data.token;
            document.getElementById('admin-login-section').classList.add('hidden');
            document.getElementById('dashboard-section').classList.remove('hidden');
            
            checkSystemHealth();
            healthInterval = setInterval(checkSystemHealth, 2000);
            fetchStock(); // Fetch initial stock right away
        } else {
            msgElement.innerText = data.error;
        }
    } catch (error) {
        msgElement.innerText = "Error connecting to server.";
    }
}

async function pingService(port, elementId) {
    const card = document.getElementById(elementId);
    try {
        // We added { cache: 'no-store' } to force a real network check!
        const response = await fetch(`http://localhost:${port}/health`, { cache: 'no-store' });
        
        if (response.ok) {
            card.classList.remove('offline');
            card.classList.add('online');
        } else {
            // If the server returns an error code (like 500)
            card.classList.remove('online');
            card.classList.add('offline');
        }
    } catch (error) {
        // If the server is completely dead (Connection Refused)
        card.classList.remove('online');
        card.classList.add('offline');
    }
}

function checkSystemHealth() {
    pingService(3001, 'node-3001');
    pingService(3002, 'node-3002');
    pingService(3003, 'node-3003');
    pingService(3004, 'node-3004');
    pingService(3005, 'node-3005'); // NEW: Kitchen Queue Pulse
    fetchStock(); 
}

// DYNAMIC INVENTORY FETCHING
async function fetchStock() {
    // Read which item is currently selected in the dropdown
    const itemName = document.getElementById('itemSelect').value;
    const stockDisplay = document.getElementById('current-stock');

    try {
        const response = await fetch(`http://localhost:3002/api/stock/${itemName}`);
        const data = await response.json();
        if (response.ok) {
            stockDisplay.innerText = data.stock;
            stockDisplay.style.color = "#22c55e"; // Green
        } else {
            stockDisplay.innerText = "ERR";
            stockDisplay.style.color = "#ef4444"; // Red
        }
    } catch (error) {
        stockDisplay.innerText = "Offline";
        stockDisplay.style.color = "#ef4444";
    }
}

// DYNAMIC INVENTORY UPDATING
async function updateStock() {
    const itemName = document.getElementById('itemSelect').value;
    const newStock = document.getElementById('newStockInput').value;
    
    if (newStock === "") return alert("Please enter a number!");

    try {
        const response = await fetch('http://localhost:3002/api/stock/set', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemName: itemName, newStock: parseInt(newStock) })
        });
        
        if (response.ok) {
            alert(`✅ ${itemName} stock successfully overridden!`);
            fetchStock(); 
            document.getElementById('newStockInput').value = ""; 
        } else {
            alert("Failed to update stock.");
        }
    } catch (error) {
        alert("Server error. Is the Stock Service online?");
    }
}

async function triggerChaos() {
    const confirmKill = confirm("Are you sure you want to kill the Stock Service? This will simulate a critical failure!");
    if (!confirmKill) return;

    try {
        await fetch('http://localhost:3002/chaos', { method: 'POST' });
        alert("💥 Chaos Toggle Activated! Stock Service has been destroyed.");
    } catch (error) {
        alert("The service is already dead!");
    }
}