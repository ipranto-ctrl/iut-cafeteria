const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const amqp = require('amqplib');
const cors = require('cors');

const app = express();
app.use(cors());

// Health Endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK" });
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

io.on('connection', (socket) => {
    console.log(`🔌 Client connected: ${socket.id}`);
    
    // Student joins a private room using their Student ID
    socket.on('join_room', (studentId) => {
        socket.join(studentId);
    });
});

async function connectRabbitMQ() {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
        const channel = await connection.createChannel();
        
        await channel.assertQueue('completed_orders', { durable: true });
        console.log("🐇 Notification Hub listening to completed_orders");

        channel.consume('completed_orders', (msg) => {
            if (msg !== null) {
                const orderData = JSON.parse(msg.content.toString());
                
                // Alert the specific student's browser
                io.to(orderData.studentId).emit('order_update', orderData);
                
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error("RabbitMQ Error:", error);
    }
}
connectRabbitMQ();

server.listen(3004, () => {
    console.log("🔔 Notification Hub on Port 3004");
});