const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const amqp = require('amqplib');
const cors = require('cors');

const app = express();
app.use(cors());

// WebSockets require us to wrap the Express app in a raw Node HTTP server
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Allow our future frontend to connect
});

// 1. Handle WebSocket Connections from the Student UI
io.on('connection', (socket) => {
    console.log(`🟢 New frontend client connected: ${socket.id}`);
    
    // When a student logs into the UI, they tell us their Student ID
    socket.on('join_room', (studentId) => {
        socket.join(studentId);
        console.log(`Student ${studentId} joined their personal notification room.`);
    });

    socket.on('disconnect', () => {
        console.log(`🔴 Client disconnected: ${socket.id}`);
    });
});

// 2. Listen to the Kitchen via RabbitMQ
async function listenToKitchen() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        const queue = 'completed_orders';

        await channel.assertQueue(queue, { durable: true });
        console.log(`📡 Notification Hub listening to Kitchen on '${queue}'...`);

        channel.consume(queue, (msg) => {
            if (msg !== null) {
                const finishedOrder = JSON.parse(msg.content.toString());
                
                // 3. Push the update directly to the specific student's UI!
                // Using .to(studentId) ensures we don't send the alert to the wrong student.
                io.to(finishedOrder.studentId).emit('order_update', finishedOrder);
                console.log(`🚀 Pushed 'Ready' status to Student ${finishedOrder.studentId}`);
                
                channel.ack(msg);
            }
        });
    } catch (error) {
        console.error("RabbitMQ Error:", error);
    }
}

listenToKitchen();

const PORT = 3004;
// HEALTH ENDPOINT
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK" });
});
server.listen(PORT, () => {
    console.log(`📢 Notification Hub running on http://localhost:${PORT}`);
});