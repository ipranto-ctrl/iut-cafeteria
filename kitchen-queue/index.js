const amqp = require('amqplib');

async function startKitchen() {
    try {
        const connection = await amqp.connect('amqp://localhost');
        const channel = await connection.createChannel();
        
        // The queue where we receive orders
        const inputQueue = 'kitchen_orders';
        // The queue where we send finished orders
        const outputQueue = 'completed_orders'; 

        await channel.assertQueue(inputQueue, { durable: true });
        await channel.assertQueue(outputQueue, { durable: true });
        
        console.log(`👨‍🍳 Kitchen Queue waiting for orders...`);

        channel.consume(inputQueue, (msg) => {
            if (msg !== null) {
                const order = JSON.parse(msg.content.toString());
                console.log(`\n🔔 NEW ORDER: ${order.itemName} for Student ${order.studentId}`);
                
                setTimeout(() => {
                    console.log(`✅ ORDER READY: ${order.itemName}. Sending to Notification Hub!`);
                    
                    // NEW: Tell the Notification Hub the food is ready!
                    channel.sendToQueue(outputQueue, Buffer.from(JSON.stringify({
                        studentId: order.studentId,
                        itemName: order.itemName,
                        status: 'Ready'
                    })));

                    channel.ack(msg); // Remove original ticket
                }, 5000); 
            }
        });
    } catch (error) {
        console.error("RabbitMQ Error:", error);
    }
}
startKitchen();
// NEW: Minimal Express server just for Health Monitoring
const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());

app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK", service: "Kitchen Queue" });
});

app.listen(3005, () => console.log("🩺 Kitchen Queue Health Monitor on Port 3005"));