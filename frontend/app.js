// --- GLOBAL VARIABLES ---
let token = "";
let currentStudentId = "";
let socket;
let cart = {}; 

// Order Tracking Variables
let expectedItems = 0;
let completedItems = 0;

// Inventory Polling Variables
const menuItems = ['Spaghetti', 'Biriyani', 'Rice', 'Juice', 'Burger', 'Halim'];
let stockInterval;


// --- 1. AUTHENTICATION & REGISTRATION ---

async function login() {
    const studentId = document.getElementById('studentId').value;
    const password = document.getElementById('password').value;
    const msg = document.getElementById('login-msg');

    try {
        const response = await fetch('http://localhost:3001/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, password })
        });

        const data = await response.json();

        if (response.ok) {
            token = data.token;
            currentStudentId = studentId;
            
            // Hide login screen, show dashboard
            document.getElementById('login-section').classList.add('hidden');
            document.getElementById('dashboard-section').classList.remove('hidden');
            
            // Connect to Real-time Notification Hub
            connectWebSocket();
            
            // Fetch live stock immediately, then poll every 3 seconds
            fetchLiveStock();
            stockInterval = setInterval(fetchLiveStock, 3000);
            
        } else {
            msg.innerText = data.error || "Login Failed";
            msg.style.color = "var(--iut-red)";
        }
    } catch (error) {
        msg.innerText = "Error connecting to server.";
        msg.style.color = "var(--iut-red)";
    }
}

async function register() {
    const studentId = document.getElementById('studentId').value;
    const password = document.getElementById('password').value;
    const msgElement = document.getElementById('login-msg');

    try {
        const response = await fetch('http://localhost:3001/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ studentId, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            msgElement.innerText = data.message;
            msgElement.style.color = "#22c55e"; // Success green
        } else {
            msgElement.innerText = data.error;
            msgElement.style.color = "var(--iut-red)";
        }
    } catch (error) {
        msgElement.innerText = "Error connecting to server.";
        msgElement.style.color = "var(--iut-red)";
    }
}


// --- 2. LIVE INVENTORY SYNC ---

async function fetchLiveStock() {
    for (const item of menuItems) {
        try {
            // Using { cache: 'no-store' } ensures we get the freshest data, bypassing browser cache
            const response = await fetch(`http://localhost:3002/api/stock/${item}`, { cache: 'no-store' });
            const data = await response.json();
            const stockElement = document.getElementById(`stock-${item}`);
            
            if (response.ok) {
                if (data.stock <= 0) {
                    stockElement.innerText = "Out of Stock";
                    stockElement.style.color = "var(--iut-red)";
                } else {
                    stockElement.innerText = `${data.stock} Available`;
                    stockElement.style.color = "#22c55e"; // Green text for available
                }
            }
        } catch (error) {
            console.error(`Failed to fetch stock for ${item}`);
        }
    }
}


// --- 3. CART MANAGEMENT ---

function addToCart(item) {
    if (cart[item]) {
        cart[item] += 1;
    } else {
        cart[item] = 1;
    }
    updateCartUI();
}

function removeFromCart(item) {
    delete cart[item];
    updateCartUI();
}

function updateCartUI() {
    const cartList = document.getElementById('cart-items');
    const checkoutBtn = document.getElementById('checkout-btn');
    cartList.innerHTML = '';

    let hasItems = false;
    for (const [item, quantity] of Object.entries(cart)) {
        hasItems = true;
        const li = document.createElement('li');
        li.innerHTML = `<span>${item} x${quantity}</span> <span style="cursor:pointer; color:var(--iut-red); font-weight:bold;" onclick="removeFromCart('${item}')">X</span>`;
        cartList.appendChild(li);
    }

    if (!hasItems) {
        cartList.innerHTML = '<li style="color: var(--text-muted); justify-content: center;">Cart is empty</li>';
        checkoutBtn.disabled = true;
        checkoutBtn.style.background = "#333";
        checkoutBtn.style.cursor = "not-allowed";
    } else {
        checkoutBtn.disabled = false;
        checkoutBtn.style.background = "var(--iut-red)";
        checkoutBtn.style.cursor = "pointer";
    }
}


// --- 4. VISUAL FLOW CONTROLLER ---

function updateVisualFlow(step) {
    document.getElementById('step-1').classList.remove('active');
    document.getElementById('step-2').classList.remove('active');
    document.getElementById('step-3').classList.remove('active');

    // Grab the "In Kitchen" text label dynamically
    const kitchenLabel = document.querySelector('.step-labels span:nth-child(2)');

    // Reset text if we aren't actively cooking
    if (step === 0 || step === 1) {
        kitchenLabel.innerText = "In Kitchen";
    }

    if (step >= 1) document.getElementById('step-1').classList.add('active'); // Pending
    
    if (step >= 2) {
        document.getElementById('step-2').classList.add('active'); // In Kitchen
        // Dynamically update the label with live cooking progress (e.g., 1/3)
        if (expectedItems > 0) {
            kitchenLabel.innerText = `In Kitchen (${completedItems}/${expectedItems})`;
        }
    }

    if (step >= 3) {
        document.getElementById('step-3').classList.add('active'); // Collect
        kitchenLabel.innerText = "In Kitchen"; // Reset text
    }
}


// --- 5. ORDER PROCESSING ---

async function placeOrder() {
    if (Object.keys(cart).length === 0) return;

    // Disable checkout button while processing
    const checkoutBtn = document.getElementById('checkout-btn');
    checkoutBtn.disabled = true;
    checkoutBtn.innerText = "Sending to Kitchen...";

    // Calculate total items expected to come back from the kitchen queue
    expectedItems = Object.values(cart).reduce((total, num) => total + num, 0);
    completedItems = 0;

    // Set tracker to Step 1: Pending Verification
    updateVisualFlow(1);
    
    // Send individual requests to the Gateway for each item
    for (const [itemName, quantity] of Object.entries(cart)) {
        for (let i = 0; i < quantity; i++) {
            try {
                const response = await fetch('http://localhost:3003/api/gateway/order', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}` 
                    },
                    body: JSON.stringify({ itemName })
                });

                if (response.ok) {
                    // Update tracker once the Gateway accepts it
                    updateVisualFlow(2); 
                } else {
                    alert(`Failed to order ${itemName}. It might be out of stock!`);
                    // Subtract from expected if an item fails so the UI doesn't hang waiting
                    expectedItems--; 
                }
            } catch (error) {
                console.error("Order error:", error);
                expectedItems--;
            }
        }
    }

    // Clear cart and restore button
    cart = {};
    updateCartUI();
    checkoutBtn.innerText = "Place Order";
}


// --- 6. REAL-TIME WEBSOCKETS (NOTIFICATION HUB) ---

function connectWebSocket() {
    if (socket) return; // Prevent double connections if they click login twice
    
    socket = io('http://localhost:3004');
    
    // Join a private room specific to this student ID
    socket.emit('join_room', currentStudentId);

    // Listen for completion messages from the Kitchen Hub
    socket.on('order_update', (data) => {
        completedItems++;
        
        // Visually update the (1/3) cooking tracker
        updateVisualFlow(2);

        // Check if all items in the batch are finally done
        if (completedItems >= expectedItems && expectedItems > 0) {
            // Set tracker to Step 3: Collect
            updateVisualFlow(3);
            
            // Small delay so the user sees the tracker hit Step 3 before the alert blocks the screen
            setTimeout(() => {
                alert(`🔔 Your order is ready to be collected at the counter!`);
                
                // Reset everything for the next order
                updateVisualFlow(0); 
                expectedItems = 0;
                completedItems = 0;
                
                // Fetch stock immediately just in case
                fetchLiveStock();
            }, 500);
        }
    });
}