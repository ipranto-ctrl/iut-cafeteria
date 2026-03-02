const amqp = require('amqplib');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

// Health Monitor for Admin Dashboard
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK", service: "Kitchen Queue" });
});
app.listen(3005, () => console.log("🩺 Kitchen Health Monitor on Port 3005"));

async function startKitchenWorker() {
    try {
        const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
        const channel = await connection.createChannel();
        
        await channel.assertQueue('kitchen_orders', { durable: true });
        await channel.assertQueue('completed_orders', { durable: true });
        
        // Only process one order at a time to simulate physical cooking
        channel.prefetch(1);
        console.log("👨‍🍳 Kitchen Worker ready and waiting for orders...");

        channel.consume('kitchen_orders', (msg) => {
            if (msg !== null) {
                const orderData = JSON.parse(msg.content.toString());
                console.log(`🍳 Cooking: ${orderData.itemName} for Student ${orderData.studentId}`);

                // Simulate 5 seconds of cooking time
                setTimeout(() => {
                    console.log(`✅ Finished: ${orderData.itemName}`);
                    
                    // Send to Notification Hub
                    channel.sendToQueue('completed_orders', Buffer.from(JSON.stringify(orderData)));
                    
                    // Tell RabbitMQ we are ready for the next order
                    channel.ack(msg);
                }, 5000); 
            }
        });
    } catch (error) {
        console.error("RabbitMQ Error:", error);
    }
}
startKitchenWorker();