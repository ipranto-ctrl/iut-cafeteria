const amqp = require('amqplib');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());

app.get('/health', (req, res) => res.status(200).json({ status: "OK", service: "Kitchen Queue" }));
app.listen(3005, () => console.log("🩺 Kitchen Health Monitor on Port 3005"));

async function startKitchenWorker(retries = 5) {
    while (retries > 0) {
        try {
            const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
            const channel = await connection.createChannel();
            
            await channel.assertQueue('kitchen_orders', { durable: true });
            await channel.assertQueue('completed_orders', { durable: true });
            
            channel.prefetch(1);
            console.log("👨‍🍳 Kitchen Worker connected and waiting for orders...");

            channel.consume('kitchen_orders', (msg) => {
                if (msg !== null) {
                    const orderData = JSON.parse(msg.content.toString());
                    console.log(`🍳 Cooking: ${orderData.itemName} for Student ${orderData.studentId}`);

                    setTimeout(() => {
                        console.log(`✅ Finished: ${orderData.itemName}`);
                        channel.sendToQueue('completed_orders', Buffer.from(JSON.stringify(orderData)));
                        channel.ack(msg);
                    }, 5000); 
                }
            });
            return;
        } catch (error) {
            console.error(`⚠️ RabbitMQ not ready. Retrying in 5s... (${retries - 1} retries left)`);
            retries -= 1;
            await new Promise(res => setTimeout(res, 5000));
        }
    }
    console.error("❌ Fatal Error: Kitchen Worker could not connect to RabbitMQ.");
    process.exit(1);
}
startKitchenWorker();