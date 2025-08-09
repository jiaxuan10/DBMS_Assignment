const express = require('express');
const mysql = require('mysql2');
const { Sequelize, DataTypes } = require('sequelize');
const pidusage = require('pidusage');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Setup Sequelize connection
const sequelize = new Sequelize('testdb', 'testuser', 'testpass', {
  host: 'localhost',
  dialect: 'mysql'
});

// Test database connection
sequelize.authenticate()
  .then(() => console.log('✅ Connected to MySQL.'))
  .catch(err => console.error('❌ Connection failed:', err));

// Define User model
const User = sequelize.define('user', {
  username: DataTypes.STRING,
  password: DataTypes.STRING
}, {
  timestamps: false,
  tableName: 'users'
});

// Helper: log CPU and execution time
async function logPerformance(startTime, endpoint, payload) {
  const durationMs = Date.now() - startTime;
  const stats = await pidusage(process.pid);
  const memoryMB = process.memoryUsage().rss / 1024 / 1024;
  console.log(`🕒 [${endpoint}] Payload: ${payload}`);
  console.log(`✅  Response time: ${durationMs} ms`);
  console.log(`🔥  CPU Usage: ${stats.cpu.toFixed(2)} %`);
  console.log(`🧠 Memory Usage: ${memoryMB.toFixed(2)} MB`);
  console.log('---------------------------');
}

// 1. Raw SQL (vulnerable)
app.post('/login-raw', async (req, res) => {
  const startTime = Date.now();
  const { username, password } = req.body;
  try {
    const query = `SELECT * FROM users WHERE username='${username}' AND password='${password}'`;
    const [results] = await sequelize.query(query);
    res.send(results.length > 0 ? 'Login success (raw)' : 'Login failed');
  } catch (err) {
    res.status(500).send('Server error');
  } finally {
    await logPerformance(startTime, '/login-raw', username);
  }
});

// 2. Escaped Input (manually escaped)
app.post('/login-escaped', async (req, res) => {
  const startTime = Date.now();
  let { username, password } = req.body;
  try {
    username = mysql.escape(username);
    password = mysql.escape(password);
    const query = `SELECT * FROM users WHERE username=${username} AND password=${password}`;
    const [results] = await sequelize.query(query);
    res.send(results.length > 0 ? 'Login success (escaped)' : 'Login failed');
  } catch (err) {
    res.status(500).send('Server error');
  } finally {
    await logPerformance(startTime, '/login-escaped', username);
  }
});

// 3. Prepared Statement (parameter binding)
app.post('/login-prepared', async (req, res) => {
  const startTime = Date.now();
  const { username, password } = req.body;
  try {
    const results = await sequelize.query(
      'SELECT * FROM users WHERE username = ? AND password = ?',
      {
        replacements: [username, password],
        type: Sequelize.QueryTypes.SELECT
      }
    );
    res.send(results.length > 0 ? 'Login success (prepared)' : 'Login failed');
  } catch (err) {
    console.error('Prepared statement error:', err);
    res.status(500).send('Server error');
  } finally {
    await logPerformance(startTime, '/login-prepared', username);
  }
});

// 4. ORM method
app.post('/login-orm', async (req, res) => {
  const startTime = Date.now();
  const { username, password } = req.body;
  try {
    const user = await User.findOne({ where: { username, password } });
    res.send(user ? 'Login success (ORM)' : 'Login failed');
  } catch (err) {
    res.status(500).send('Server error');
  } finally {
    await logPerformance(startTime, '/login-orm', username);
  }
});

const axios = require('axios');

app.post('/login-batch', async (req, res) => {
  const { payload, count = 10 } = req.body;
  const endpoints = ['/login-raw', '/login-escaped', '/login-prepared', '/login-orm'];
  const allRequests = [];

  endpoints.forEach(endpoint => {
    for (let i = 0; i < count; i++) {
      allRequests.push(
        axios.post(`http://localhost:3000${endpoint}`, {
          username: payload,
          password: '123'
        }).then(response => ({
          endpoint,
          status: response.status,
          data: response.data
        })).catch(error => ({
          endpoint,
          status: error?.response?.status || 500,
          data: error?.response?.data || 'Error'
        }))
      );
    }
  });

  const results = await Promise.all(allRequests);
  res.json({ status: 'Batch completed', results });
});


// Start the server
app.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
