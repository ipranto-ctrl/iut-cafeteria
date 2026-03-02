const express = require("express");
const jwt = require("jsonwebtoken");
const rateLimit = require("express-rate-limit");
const cors = require("cors");
const { Pool } = require("pg");
const bcrypt = require("bcrypt");

const app = express();
app.use(express.json());
app.use(cors());

const SECRET_KEY = "super-secret-cafeteria-key";

// 1. Connect to PostgreSQL
const pool = new Pool({
  user: "postgres",
  host: process.env.DB_HOST || "localhost",
  database: "postgres",
  password: "password",
  port: 5432,
});

// 2. Automatically create the users table (THIS IS THE FUNCTION THAT WAS MISSING!)
async function setupAuthDatabase() {
  try {
    await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                student_id VARCHAR(20) PRIMARY KEY,
                password_hash VARCHAR(255) NOT NULL
            );
        `);
    console.log("👤 Users database table ready.");
  } catch (err) {
    console.error("Database connection failed:", err);
  }
}
// Run the function
setupAuthDatabase();

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3,
  keyGenerator: (req) => req.body.studentId || "unknown-user",
  message: { error: "Too many login attempts. Please wait a minute." },
});

// The Registration Route
app.post("/api/auth/register", async (req, res) => {
  const { studentId, password } = req.body;

  if (!studentId || !password)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    await pool.query(
      "INSERT INTO users (student_id, password_hash) VALUES ($1, $2)",
      [studentId, hashedPassword],
    );

    return res.json({
      message: "Registration successful! You can now log in.",
    });
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ error: "Student ID already exists!" });
    }
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// The Login Route
app.post("/api/auth/login", loginLimiter, async (req, res) => {
  const { studentId, password } = req.body;

  try {
    const userRes = await pool.query(
      "SELECT * FROM users WHERE student_id = $1",
      [studentId],
    );

    if (userRes.rows.length > 0) {
      const user = userRes.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);

      if (match) {
        const token = jwt.sign(
          { studentId: studentId, role: "student" },
          SECRET_KEY,
          { expiresIn: "2h" },
        );
        return res.json({ message: "Login successful", token: token });
      }
    }

    return res.status(401).json({ error: "Invalid Student ID or Password" });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

// Dedicated Admin Login Route
app.post("/api/auth/admin-login", (req, res) => {
  const { password } = req.body;

  if (password === "AdminDevSprint2026") {
    const adminToken = jwt.sign({ role: "admin" }, SECRET_KEY, {
      expiresIn: "1h",
    });
    return res.json({ message: "Admin access granted", token: adminToken });
  }

  return res
    .status(401)
    .json({ error: "Access Denied. Incorrect Admin Password." });
});

// HEALTH ENDPOINT
app.get("/health", (req, res) => {
  res.status(200).json({ status: "OK" });
});

const PORT = 3001;
app.listen(PORT, () => {
  console.log(`🔐 Identity Provider is running on http://localhost:${PORT}`);
});
