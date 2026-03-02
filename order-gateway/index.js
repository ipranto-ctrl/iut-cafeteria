const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const amqp = require('amqplib');

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = 'super-secret-cafeteria-key';
let rabbitChannel;

async function connectRabbitMQ() {
    try {
        // Docker Environment Variable for RabbitMQ
        const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
        rabbitChannel = await connection.createChannel();
        await rabbitChannel.assertQueue('kitchen_orders', { durable: true });
        console.log("🐇 Gateway connected to RabbitMQ");
    } catch (error) {
        console.error("RabbitMQ Connection Error:", error);
    }
}
connectRabbitMQ();

// JWT Authentication Middleware
function verifyToken(req, res, next) {
    const bearerHeader = req.headers['authorization'];
    if (!bearerHeader) return res.status(401).json({ error: "Unauthorized" });

    const token = bearerHeader.split(' ')[1];
    jwt.verify(token, SECRET_KEY, (err, decoded) => {
        if (err) return res.status(401).json({ error: "Unauthorized" });
        req.user = decoded;
        next();
    });
}

// Student Order Route
app.post('/api/gateway/order', verifyToken, async (req, res) => {
    const { itemName } = req.body;
    
    if (!rabbitChannel) return res.status(500).json({ error: "Queue not ready" });

    const orderData = {
        studentId: req.user.studentId,
        itemName: itemName,
        timestamp: Date.now()
    };

    // Send order to the Kitchen Queue
    rabbitChannel.sendToQueue('kitchen_orders', Buffer.from(JSON.stringify(orderData)));
    res.status(202).json({ message: "Order sent to kitchen", order: orderData });
});

// Health Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK" });
});

// Start the server ONLY if not being tested by Jest
if (require.main === module) {
    app.listen(3003, () => console.log("🚪 Order Gateway on Port 3003"));
}
module.exports = app;