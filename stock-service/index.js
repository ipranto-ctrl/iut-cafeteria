const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(express.json());
app.use(cors());

// Docker Environment Variables for Databases
const pool = new Pool({
    user: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: 'password', 
    port: 5432,
});

const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// 2. Automatically create and seed the inventory table (WITH RETRY LOGIC)
async function setupDatabase(retries = 5) {
    while (retries > 0) {
        try {
            // Only try to connect to Redis if it isn't already connected
            if (!redisClient.isOpen) {
                await redisClient.connect();
                console.log("⚡ Connected to Redis");
            }

            // Create the table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS inventory (
                    item_name VARCHAR(50) PRIMARY KEY,
                    stock_count INT NOT NULL,
                    version INT DEFAULT 1
                );
            `);

            // Seed the initial menu
            await pool.query(`
                INSERT INTO inventory (item_name, stock_count, version) 
                VALUES 
                    ('Spaghetti', 100, 1),
                    ('Biriyani', 50, 1),
                    ('Rice', 200, 1),
                    ('Juice', 150, 1),
                    ('Burger', 75, 1),
                    ('Halim', 40, 1)
                ON CONFLICT (item_name) DO NOTHING;
            `);

            // Sync PostgreSQL data into Redis Cache
            const items = ['Spaghetti', 'Biriyani', 'Rice', 'Juice', 'Burger', 'Halim'];
            for (const item of items) {
                const res = await pool.query("SELECT stock_count FROM inventory WHERE item_name = $1", [item]);
                if (res.rows.length > 0) {
                    await redisClient.set(`stock:${item}`, res.rows[0].stock_count);
                }
            }
            
            console.log("📦 Stock Database seeded and Redis cached.");
            return; // Success! Exit the loop.

        } catch (err) {
            console.error(`⚠️ Databases not ready yet. Retrying in 3 seconds... (Retries left: ${retries - 1})`);
            retries -= 1;
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    console.error("❌ Fatal Error: Stock Service could not connect to databases.");
}
setupDatabase();

// Chaos Engineering Toggle
let isChaosActive = false;
app.post('/chaos', (req, res) => {
    isChaosActive = !isChaosActive;
    res.json({ message: `Chaos mode ${isChaosActive ? 'ACTIVATED' : 'DEACTIVATED'}` });
});

// Admin Route: Get Stock
app.get('/api/stock/:itemName', async (req, res) => {
    if (isChaosActive) return res.status(500).json({ error: "SERVICE FAILURE" });
    try {
        const result = await pool.query('SELECT stock_count FROM inventory WHERE item_name = $1', [req.params.itemName]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Item not found" });
        res.json({ stock: result.rows[0].stock_count });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// Admin Route: Force Update Stock
app.post('/api/stock/set', async (req, res) => {
    if (isChaosActive) return res.status(500).json({ error: "SERVICE FAILURE" });
    const { itemName, newStock } = req.body;
    try {
        await pool.query('UPDATE inventory SET stock_count = $1 WHERE item_name = $2', [newStock, itemName]);
        await redisClient.set(`stock:${itemName}`, newStock);
        res.json({ message: "Stock updated", newStock });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// Health Endpoint
app.get('/health', (req, res) => {
    if (isChaosActive) return res.status(500).json({ status: "FAIL" });
    res.status(200).json({ status: "OK" });
});

app.listen(3002, () => console.log("📦 Stock Service on Port 3002"));