const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = 'super-secret-cafeteria-key';
let rabbitChannel;

// --- 1. RABBITMQ CONNECTION WITH RETRY LOGIC ---
async function connectRabbitMQ(retries = 5) {
    while (retries > 0) {
        try {
            const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
            rabbitChannel = await connection.createChannel();
            
            // Ensure the kitchen queue exists before we try to send messages to it
            await rabbitChannel.assertQueue('kitchen_orders', { durable: true });
            
            console.log("🐇 Gateway successfully connected to RabbitMQ");
            return; // Success! Exit the loop.
        } catch (error) {
            console.error(`⚠️ RabbitMQ not ready. Retrying in 5s... (${retries - 1} retries left)`);
            retries -= 1;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
    console.error("❌ Fatal Error: Order Gateway could not connect to RabbitMQ.");
    process.exit(1); // Force Docker to restart this container
}
connectRabbitMQ();

// --- 2. AUTHENTICATION MIDDLEWARE ---
// This intercepts the request and checks the student's ID badge (JWT)
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (!bearerHeader) return res.status(401).json({ error: "Unauthorized. Please log in." });

    const token = bearerHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Invalid or expired token." });
        
        // Attach the decoded student info to the request so the order route can use it
        req.user = decoded;
        next();
    });
}

// --- 3. ROUTES ---

// The Main Order Endpoint (Synchronous Validation + Asynchronous Queueing)
app.post('/api/gateway/order', verifyToken, async (req, res) => {
    const { itemName } = req.body;
    
    // Safety check: Is the message broker alive?
    if (!rabbitChannel) {
        return res.status(503).json({ error: "Kitchen queue is currently unavailable. Please try again." });
    }

    try {
        // STEP A: Synchronously ask the Stock Service to deduct the item.
        // We use the internal Docker network name 'stock-service' and port '3002'.
        const stockResponse = await fetch('http://stock-service:3002/api/stock/decrement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ itemName })
        });

        // STEP B: If the Stock Service rejects it (e.g., out of stock), halt the order!
        if (!stockResponse.ok) {
            const errorData = await stockResponse.json();
            return res.status(400).json({ error: errorData.error || "Failed to reserve stock" });
        }

        // STEP C: Stock was successfully deducted! Now, asynchronously send to the kitchen.
        const orderData = {
            studentId: req.user.studentId, // Extracted from the JWT token
            itemName: itemName,
            timestamp: Date.now()
        };

        // Convert the order object to a Buffer and push it into the RabbitMQ queue
        rabbitChannel.sendToQueue('kitchen_orders', Buffer.from(JSON.stringify(orderData)));
        
        // Return 202 Accepted (Standard HTTP code for "Request accepted, processing asynchronously")
        res.status(202).json({ message: "Order sent to kitchen", order: orderData });
        
    } catch (err) {
        console.error("Gateway Error communicating with Stock:", err);
        res.status(500).json({ error: "Internal Gateway Error. Could not process order." });
    }
});

// Health Endpoint for monitoring
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK", service: "Order Gateway" });
});

// --- 4. SERVER INITIALIZATION ---
const PORT = 3003;
app.listen(PORT, () => {
    console.log(`🚪 Order Gateway running on Port ${PORT}`);
});