const express = require('express');
const jwt = require('jsonwebtoken');
const { createClient } = require('redis');
const axios = require('axios');
const cors = require('cors');
const amqp = require('amqplib'); // NEW: Import RabbitMQ

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = 'super-secret-cafeteria-key'; 

const redisClient = createClient({ url: 'redis://localhost:6379' });
redisClient.connect().catch(console.error);

// NEW: Connect to RabbitMQ
let rabbitChannel;
async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue('kitchen_orders', { durable: true });
        console.log("🐇 Gateway connected to RabbitMQ!");
    } catch (error) {
        console.error("RabbitMQ Error:", error);
    }
}
connectRabbitMQ();

const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });
    const token = authHeader.split(' ')[1]; 
    jwt.verify(token, SECRET_KEY, (err, decodedUser) => {
        if (err) return res.status(401).json({ error: 'Invalid token' });
        req.user = decodedUser;
        next(); 
    });
};

app.post('/api/gateway/order', verifyToken, async (req, res) => {
    const { itemName } = req.body;

    try {
        const cachedStock = await redisClient.get(`stock:${itemName}`);
        if (cachedStock !== null && parseInt(cachedStock) <= 0) {
            return res.status(400).json({ error: 'Out of stock!' });
        }

        const stockResponse = await axios.post('http://localhost:3002/api/stock/deduct', { itemName });

        // NEW: Drop the order ticket into the RabbitMQ queue
        const orderTicket = {
            studentId: req.user.studentId,
            itemName: itemName
        };
        rabbitChannel.sendToQueue('kitchen_orders', Buffer.from(JSON.stringify(orderTicket)));

        // Instantly reply to the student in <2 seconds!
        return res.json({
            message: "Order passed gateway, stock deducted, and sent to kitchen!",
            studentId: req.user.studentId,
            stockRemaining: stockResponse.data.remainingStock,
            status: "In Kitchen" // The student sees this immediately
        });

    } catch (error) {
        if (error.response) return res.status(error.response.status).json(error.response.data);
        return res.status(500).json({ error: 'Gateway Error' });
    }
});

const PORT = 3003;
// HEALTH ENDPOINT
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK" });
});
app.listen(PORT, () => console.log(`🛡️  Order Gateway is running on http://localhost:${PORT}`));
// Start the server ONLY if we are running this file directly (not during testing)
if (require.main === module) {
    const PORT = 3003;
    app.listen(PORT, () => {
        console.log(`🚀 Order Gateway running on http://localhost:${PORT}`);
    });
}

// Export the app so Jest can use it
module.exports = app;