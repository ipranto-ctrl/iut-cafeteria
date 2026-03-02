const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const redis = require('redis');

const app = express();
app.use(express.json());
app.use(cors());

// 1. PostgreSQL Connection
const pool = new Pool({
    user: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    database: 'postgres',
    password: 'password', 
    port: 5432,
});

// 2. Redis Connection
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// CRITICAL FIX: Prevent Redis network drops from crashing the entire Node server
redisClient.on('error', (err) => console.error('Redis Client Error:', err.message));

// 3. Robust Initialization with Retry Logic
async function initializeDatabases(retries = 5) {
    while (retries > 0) {
        try {
            // Safely check if Redis is already connected before trying to connect
            if (!redisClient.isReady && !redisClient.isOpen) {
                await redisClient.connect();
                console.log("⚡ Connected to Redis");
            }

            // Test Postgres connection to ensure it is awake
            await pool.query('SELECT 1');
            console.log("🐘 Connected to PostgreSQL");

            // Create the table
            await pool.query(`
                CREATE TABLE IF NOT EXISTS inventory (
                    item_name VARCHAR(50) PRIMARY KEY,
                    stock_count INT NOT NULL,
                    version INT DEFAULT 1
                );
            `);

            // Seed the initial menu safely
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

            // Sync PostgreSQL data into the Redis Cache
            const items = ['Spaghetti', 'Biriyani', 'Rice', 'Juice', 'Burger', 'Halim'];
            for (const item of items) {
                const res = await pool.query("SELECT stock_count FROM inventory WHERE item_name = $1", [item]);
                if (res.rows.length > 0) {
                    await redisClient.set(`stock:${item}`, res.rows[0].stock_count);
                }
            }
            
            console.log("📦 Stock Database seeded and Redis cached. Ready for traffic.");
            return; // Success! Exit the loop.

        } catch (err) {
            console.error(`⚠️ Database not ready. Retrying in 3s... (${retries - 1} retries left) | Error: ${err.message}`);
            retries -= 1;
            await new Promise(res => setTimeout(res, 3000));
        }
    }
    
    // CRITICAL FIX: If all retries fail, kill the process. 
    // This forces Docker to restart the container instead of leaving a broken zombie running.
    console.error("❌ Fatal Error: Stock Service could not connect to databases.");
    process.exit(1); 
}

initializeDatabases();

// --- ROUTES ---

// Chaos Engineering Toggle (For the DevSprint presentation)
let isChaosActive = false;
app.post('/chaos', (req, res) => {
    isChaosActive = !isChaosActive;
    res.json({ message: `Chaos mode ${isChaosActive ? 'ACTIVATED' : 'DEACTIVATED'}` });
});

// Admin/Student Route: Get Live Stock (Cache-Aside Pattern)
app.get('/api/stock/:itemName', async (req, res) => {
    if (isChaosActive) return res.status(500).json({ error: "SERVICE FAILURE" });
    
    const { itemName } = req.params;

    try {
        // 1. Check Redis Cache First (Lightning Fast)
        const cachedStock = await redisClient.get(`stock:${itemName}`);
        if (cachedStock !== null) {
            return res.json({ stock: parseInt(cachedStock) });
        }

        // 2. Fallback to PostgreSQL if Redis missed
        const result = await pool.query('SELECT stock_count FROM inventory WHERE item_name = $1', [itemName]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Item not found" });
        
        const stock = result.rows[0].stock_count;
        
        // 3. Backfill the cache for the next request
        await redisClient.set(`stock:${itemName}`, stock);
        
        res.json({ stock });
    } catch (err) {
        console.error("Stock fetch error:", err);
        res.status(500).json({ error: "Database error" });
    }
});

// Admin Route: Force Update Stock
app.post('/api/stock/set', async (req, res) => {
    if (isChaosActive) return res.status(500).json({ error: "SERVICE FAILURE" });
    
    const { itemName, newStock } = req.body;
    
    try {
        // Update both PostgreSQL and Redis to keep them in sync
        await pool.query('UPDATE inventory SET stock_count = $1 WHERE item_name = $2', [newStock, itemName]);
        await redisClient.set(`stock:${itemName}`, newStock);
        
        res.json({ message: "Stock updated", newStock });
    } catch (err) {
        console.error("Stock update error:", err);
        res.status(500).json({ error: "Database error" });
    }
});
// NEW: Gateway Route to safely decrement stock before ordering
app.post('/api/stock/decrement', async (req, res) => {
    if (isChaosActive) return res.status(500).json({ error: "SERVICE FAILURE" });
    
    const { itemName } = req.body;
    
    try {
        // 1. Check current stock
        const result = await pool.query('SELECT stock_count FROM inventory WHERE item_name = $1', [itemName]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Item not found" });
        
        let currentStock = result.rows[0].stock_count;
        
        // 2. Reject if empty
        if (currentStock <= 0) {
            return res.status(400).json({ error: "Out of stock" });
        }
        
        // 3. Deduct 1 and save to both Postgres and Redis
        currentStock -= 1;
        await pool.query('UPDATE inventory SET stock_count = $1 WHERE item_name = $2', [currentStock, itemName]);
        await redisClient.set(`stock:${itemName}`, currentStock);
        
        res.json({ message: "Stock decremented", newStock: currentStock });
    } catch (err) {
        console.error("Decrement error:", err);
        res.status(500).json({ error: "Database error" });
    }
});
// Health Endpoint
app.get('/health', (req, res) => {
    if (isChaosActive) return res.status(500).json({ status: "FAIL" });
    res.status(200).json({ status: "OK", service: "stock-service" });
});

app.listen(3002, () => console.log("📦 Stock Service running on Port 3002"));