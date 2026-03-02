const express = require('express');
const { Pool } = require('pg');
const { createClient } = require('redis');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());

// 1. Connect to our PostgreSQL Database (running in Docker)
const pool = new Pool({
    user: 'admin',
    host: 'localhost',
    database: 'cafeteria',
    password: 'secretpassword',
    port: 5432,
});

// 2. Connect to our high-speed Redis Cache (running in Docker)
const redisClient = createClient({
    url: 'redis://localhost:6379'
});

redisClient.on('error', (err) => console.log('Redis Client Error', err));

// 3. Automatically create the database tables when the server starts
async function setupDatabase() {
    await redisClient.connect();
    
    // Create the inventory table
    await pool.query(`
        CREATE TABLE IF NOT EXISTS inventory (
            id SERIAL PRIMARY KEY,
            item_name VARCHAR(50) UNIQUE NOT NULL,
            stock_count INTEGER NOT NULL,
            version INTEGER NOT NULL DEFAULT 1
        );
    `);

    // Add "Spaghetti" to the database with 100 portions
   // Seed the database with the expanded menu
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

    // Cache all items in Redis
    const items = ['Spaghetti', 'Biriyani', 'Rice', 'Juice', 'Burger', 'Halim'];
    for (const item of items) {
        const res = await pool.query("SELECT stock_count FROM inventory WHERE item_name = $1", [item]);
        if (res.rows.length > 0) {
            await redisClient.set(`stock:${item}`, res.rows[0].stock_count);
        }
    }
    console.log(`📦 Database seeded. Full menu added to Redis cache.`);

    // Put the current stock into the Redis cache so the Gateway can check it instantly
    const res = await pool.query("SELECT stock_count FROM inventory WHERE item_name = 'Spaghetti'");
    if (res.rows.length > 0) {
        await redisClient.set('stock:Spaghetti', res.rows[0].stock_count);
        console.log(`📦 Database seeded. Spaghetti stock updated in Redis cache: ${res.rows[0].stock_count}`);
    }
}

setupDatabase();

// 4. The Route to Deduct Stock
app.post('/api/stock/deduct', async (req, res) => {
    const { itemName } = req.body;

    try {
        // Step A: Get current stock and version from the database
        const itemRes = await pool.query('SELECT stock_count, version FROM inventory WHERE item_name = $1', [itemName]);
        if (itemRes.rows.length === 0) return res.status(404).json({ error: "Item not found" });
        
        const { stock_count, version } = itemRes.rows[0];

        if (stock_count <= 0) {
            return res.status(400).json({ error: "Out of stock!" });
        }

        // Step B: OPTIMISTIC LOCKING - Update only if the version matches!
        const updateRes = await pool.query(
            `UPDATE inventory 
             SET stock_count = stock_count - 1, version = version + 1 
             WHERE item_name = $1 AND version = $2 
             RETURNING stock_count`,
            [itemName, version]
        );

        // If rowCount is 0, another student bought it while we were processing!
        if (updateRes.rowCount === 0) {
            return res.status(409).json({ error: "Concurrency conflict. Someone else is ordering!" });
        }

        const newStock = updateRes.rows[0].stock_count;

        // Step C: Update the Redis Cache with the new stock number
        await redisClient.set(`stock:${itemName}`, newStock);

        return res.json({ message: "Stock deducted successfully", remainingStock: newStock });

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

const PORT = 3002;
// HEALTH ENDPOINT: Returns 200 OK if reachable
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK", service: "Stock" });
});

// CHAOS TOGGLE: The manual trigger to kill the service
app.post('/chaos', (req, res) => {
    console.log("💀 CHAOS INITIATED: Shutting down Stock Service!");
    res.json({ message: "Stock Service shutting down..." });
    
    // Force the Node.js process to crash after 500 milliseconds
    setTimeout(() => {
        process.exit(1); 
    }, 500);
});
app.listen(PORT, () => {
    console.log(`📦 Stock Service is running on http://localhost:${PORT}`);
});
// ADMIN ROUTE: View current exact stock
app.get('/api/stock/:itemName', async (req, res) => {
    try {
        const result = await pool.query('SELECT stock_count FROM inventory WHERE item_name = $1', [req.params.itemName]);
        if (result.rows.length === 0) return res.status(404).json({ error: "Item not found" });
        res.json({ stock: result.rows[0].stock_count });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});

// ADMIN ROUTE: Forcefully overwrite the stock count
app.post('/api/stock/set', async (req, res) => {
    const { itemName, newStock } = req.body;
    try {
        // 1. Force update the Database
        await pool.query(
            'UPDATE inventory SET stock_count = $1, version = version + 1 WHERE item_name = $2', 
            [newStock, itemName]
        );
        // 2. Force update the Redis Cache
        await redisClient.set(`stock:${itemName}`, newStock);
        
        console.log(`🔧 Admin forcefully updated ${itemName} stock to ${newStock}`);
        res.json({ message: "Stock updated successfully", newStock });
    } catch (err) {
        res.status(500).json({ error: "Database error" });
    }
});