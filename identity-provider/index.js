const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcrypt'); // NEW: For secure password hashing

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = 'super-secret-cafeteria-key'; 

// 1. Connect to PostgreSQL
host: process.env.DB_HOST || 'localhost',

// 2. Automatically create the users table
async function setupAuthDatabase() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            student_id VARCHAR(20) PRIMARY KEY,
            password_hash VARCHAR(255) NOT NULL
        );
    `);
    console.log("👤 Users database table ready.");
}
setupAuthDatabase();

const loginLimiter = rateLimit({
    windowMs: 60 * 1000, 
    max: 3, 
    keyGenerator: (req) => req.body.studentId || 'unknown-user',
    message: { error: "Too many login attempts. Please wait a minute." }
});

// NEW: The Registration Route
app.post('/api/auth/register', async (req, res) => {
    const { studentId, password } = req.body;

    if (!studentId || !password) return res.status(400).json({ error: "Missing fields" });

    try {
        // Hash the password (the '10' is the salt rounds, making it highly secure)
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save to the database
        await pool.query(
            'INSERT INTO users (student_id, password_hash) VALUES ($1, $2)',
            [studentId, hashedPassword]
        );
        
        return res.json({ message: "Registration successful! You can now log in." });
    } catch (err) {
        // '23505' is the Postgres error code for a duplicate primary key
        if (err.code === '23505') { 
            return res.status(409).json({ error: "Student ID already exists!" });
        }
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});

// UPDATED: The Login Route (Now checks the database)
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { studentId, password } = req.body;

    try {
        // Find the user
        const userRes = await pool.query('SELECT * FROM users WHERE student_id = $1', [studentId]);
        
        if (userRes.rows.length > 0) {
            const user = userRes.rows[0];
            
            // Compare the typed password with the hashed password in the database
            const match = await bcrypt.compare(password, user.password_hash);
            
            if (match) {
                const token = jwt.sign({ studentId: studentId, role: 'student' }, SECRET_KEY, { expiresIn: '2h' });
                return res.json({ message: "Login successful", token: token });
            }
        }
        
        return res.status(401).json({ error: 'Invalid Student ID or Password' });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Internal Server Error" });
    }
});
// NEW: Dedicated Admin Login Route
app.post('/api/auth/admin-login', (req, res) => {
    const { password } = req.body;

    // The master password for the DevSprint judges
    if (password === 'AdminDevSprint2026') {
        const adminToken = jwt.sign({ role: 'admin' }, SECRET_KEY, { expiresIn: '1h' });
        return res.json({ message: "Admin access granted", token: adminToken });
    }
    
    return res.status(401).json({ error: 'Access Denied. Incorrect Admin Password.' });
});
// HEALTH ENDPOINT
app.get('/health', (req, res) => {
    res.status(200).json({ status: "OK" });
});

const PORT = 3001;
app.listen(PORT, () => {
    console.log(`🔐 Identity Provider is running on http://localhost:${PORT}`);
});