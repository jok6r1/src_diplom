"use strict";
require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const apiUrl = process.env.EXPRESS_URL || 'http://localhost';
const PORT = process.env.EXPRESS_PORT || 3000;
const app = express();
// Database connection
const pool = new Pool({
    user: process.env.DB_USER || 'postgres',
    host: process.env.DB_HOST || 'postgres', // Container name in my-app-network
    database: process.env.DB_NAME || 'myapp',
    password: process.env.DB_PASSWORD || '74P0GaLz',
    port: process.env.DB_PORT || 5432,
});
pool.on('connect', () => console.log('✅ Успешное подключение к базе данных PostgreSQL'));
pool.on('error', (err) => console.error('❌ Ошибка подключения к базе данных:', err.message));
// Initialize database schema
async function initializeDatabase() {
    try {
        await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        email VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(100) NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        role VARCHAR(50) DEFAULT 'user',
        refresh_token TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS traffic_with_anomalies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        ip VARCHAR(45) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        fl_byt_s FLOAT,
        fl_pck_s FLOAT,
        packet_count INTEGER,
        fwd_max_pack_size FLOAT,
        fwd_avg_packet FLOAT,
        bck_max_pack_size FLOAT,
        bck_avg_packet FLOAT,
        fw_iat_std FLOAT,
        fw_iat_min FLOAT,
        bck_iat_std FLOAT,
        bck_iat_min FLOAT,
        anomaly_ae FLOAT,
        anomaly_lstm FLOAT,
        anomaly_consensus FLOAT
      );
    `);
        await pool.query(`
      CREATE TABLE IF NOT EXISTS h_ip (
        id SERIAL PRIMARY KEY,
        ip VARCHAR(45) NOT NULL
      );
    `);
        console.log('Database initialized');
    }
    catch (error) {
        console.error('Database initialization error:', error);
    }
}
initializeDatabase();
// Middleware
app.use(cors({
    origin: ['http://localhost:4200', 'http://localhost', 'https://www.khabarovsk.site'],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
// JWT configuration
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';
// Files directory
const FILES_DIR = path.join(__dirname, 'files');
if (!fs.existsSync(FILES_DIR))
    fs.mkdirSync(FILES_DIR, { recursive: true });
// Registration
app.post('/pgadmin/register', async (req, res) => {
    const { username, email, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const result = await pool.query('INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id', [username, email, hashedPassword]);
        res.status(201).json({ message: 'User registered successfully', userId: result.rows[0].id });
    }
    catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Failed to register user' });
    }
});
// Login
app.post('/pgadmin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const user = await pool.query('SELECT id, password_hash, is_active, role FROM users WHERE email = $1', [email]);
        if (user.rows.length === 0)
            return res.status(401).json({ error: 'Invalid credentials' });
        const isValidPassword = await bcrypt.compare(password, user.rows[0].password_hash);
        if (!isValidPassword)
            return res.status(401).json({ error: 'Invalid credentials' });
        const accessToken = jwt.sign({ userId: user.rows[0].id, role: user.rows[0].role }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
        const refreshToken = jwt.sign({ userId: user.rows[0].id }, JWT_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
        await pool.query('UPDATE users SET refresh_token = $1 WHERE id = $2', [refreshToken, user.rows[0].id]);
        res.cookie('accessToken', accessToken, { httpOnly: true });
        res.cookie('refreshToken', refreshToken, { httpOnly: true });
        res.json({ accessToken, refreshToken, user: { id: user.rows[0].id, email } });
    }
    catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
});
// Get users
app.get('/pgadmin/getUsers', async (req, res) => {
    const { active, role, limit = 100, offset = 0 } = req.query;
    try {
        if (active && !['true', 'false'].includes(active.toString()))
            return res.status(400).json({ error: 'Invalid active parameter' });
        let query = 'SELECT id, username, email, is_active, role FROM users';
        const params = [];
        let whereAdded = false;
        if (active) {
            query += ' WHERE is_active = $1';
            params.push(active === 'true');
            whereAdded = true;
        }
        if (role) {
            query += whereAdded ? ' AND' : ' WHERE';
            query += ` role = $${params.length + 1}`;
            params.push(role);
        }
        query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
        params.push(Number(limit), Number(offset));
        const result = await pool.query(query, params);
        res.json(result.rows);
    }
    catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});
// Check user existence
app.get('/pgadmin/check-user', async (req, res) => {
    const { username, email } = req.query;
    try {
        const result = await pool.query('SELECT 1 FROM users WHERE username = $1 OR email = $2 LIMIT 1', [username, email]);
        res.json({
            exists: result.rowCount > 0,
            message: result.rowCount > 0 ? 'Username or email taken' : 'Data available',
        });
    }
    catch (error) {
        console.error('Check user error:', error);
        res.status(500).json({ error: 'Validation failed' });
    }
});
// Get hidden IPs
app.get('/pgadmin/hide_ip', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM h_ip');
        res.json(result.rows);
    }
    catch (error) {
        console.error('Error fetching IPs:', error);
        res.status(500).json({ error: 'Server error' });
    }
});
// Store anomalies
app.post('/pgadmin/anomalies', async (req, res) => {
    const data = req.body;
    if (!Array.isArray(data) || data.length === 0) {
        console.error('Invalid data format:', data);
        return res.status(400).json({ success: false, error: 'Data must be a non-empty array' });
    }
    const queryText = `
    INSERT INTO traffic_with_anomalies (
      user_id, ip, timestamp, fl_byt_s, fl_pck_s, packet_count,
      fwd_max_pack_size, fwd_avg_packet, bck_max_pack_size, bck_avg_packet,
      fw_iat_std, fw_iat_min, bck_iat_std, bck_iat_min,
      anomaly_ae, anomaly_lstm, anomaly_consensus
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id;
  `;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const item of data) {
            try {
                if (!item.user_id || !item.ip || !item.timestamp || item.fl_byt_s == null || item.fl_pck_s == null) {
                    console.warn(`Skipping record for IP ${item.ip}: missing required fields`);
                    continue;
                }
                let packet_count = item.packet_count != null ? Number(item.packet_count) : 0;
                if (isNaN(packet_count)) {
                    console.warn(`Invalid packet_count for IP ${item.ip}: ${item.packet_count}`);
                    packet_count = 0;
                }
                await client.query(queryText, [
                    Number(item.user_id),
                    item.ip,
                    item.timestamp,
                    Number(item.fl_byt_s),
                    Number(item.fl_pck_s),
                    packet_count,
                    Number(item.fwd_max_pack_size) || 0,
                    Number(item.fwd_avg_packet) || 0,
                    Number(item.bck_max_pack_size) || 0,
                    Number(item.bck_avg_packet) || 0,
                    Number(item.fw_iat_std) || 0,
                    Number(item.fw_iat_min) || 0,
                    Number(item.bck_iat_std) || 0,
                    Number(item.bck_iat_min) || 0,
                    item.anomaly_ae != null ? Number(item.anomaly_ae) : null,
                    item.anomaly_lstm != null ? Number(item.anomaly_lstm) : 0,
                    item.anomaly_consensus != null ? Number(item.anomaly_consensus) : 0,
                ]);
            }
            catch (error) {
                console.error(`Insert error for IP ${item.ip}:`, error);
                continue;
            }
        }
        await client.query('COMMIT');
        res.status(200).json({ success: true, message: 'Data stored successfully' });
    }
    catch (error) {
        await client.query('ROLLBACK');
        console.error('Insert data error:', error);
        res.status(500).json({ success: false, error: 'Failed to store anomalies' });
    }
    finally {
        client.release();
    }
});
// Get traffic by user ID
app.get('/pgadmin/traffic/user/:userId', async (req, res) => {
    const userId = parseInt(req.params.userId);
    const since = req.query.since;
    const from = req.query.from;
    if (isNaN(userId)) {
        return res.status(400).json({ success: false, error: 'Invalid user ID' });
    }
    try {
        let queryText = `
      SELECT
        id, user_id, ip, timestamp, fl_byt_s, fl_pck_s, packet_count,
        fwd_max_pack_size, fwd_avg_packet, bck_max_pack_size, bck_avg_packet,
        fw_iat_std, fw_iat_min, bck_iat_std, bck_iat_min,
        anomaly_ae, anomaly_lstm, anomaly_consensus
      FROM traffic_with_anomalies
      WHERE user_id = $1
    `;
        const params = [userId];
        if (since) {
            queryText += ` AND timestamp > $2`;
            params.push(since);
        }
        else if (from) {
            queryText += ` AND timestamp >= $2`;
            params.push(from);
        }
        else {
            queryText += ` AND timestamp >= NOW() - INTERVAL '60 minutes'`;
        }
        queryText += ` ORDER BY timestamp DESC`;
        const result = await pool.query(queryText, params);
        const formattedData = result.rows.map((row) => ({
            id: row.id,
            user_id: Number(row.user_id),
            ip: row.ip,
            timestamp: row.timestamp.toISOString(),
            networkMetrics: {
                byteRate: row.fl_byt_s ?? 0,
                packetRate: row.fl_pck_s ?? 0,
                packetCount: row.packet_count ?? 0,
                forward: {
                    maxPacketSize: row.fwd_max_pack_size ?? 0,
                    avgPacketSize: row.fwd_avg_packet ?? 0,
                },
                backward: {
                    maxPacketSize: row.bck_max_pack_size ?? 0,
                    avgPacketSize: row.bck_avg_packet ?? 0,
                },
                interArrivalTime: {
                    forward: {
                        stdDev: row.fw_iat_std ?? 0,
                        min: row.fw_iat_min ?? 0,
                    },
                    backward: {
                        stdDev: row.bck_iat_std ?? 0,
                        min: row.bck_iat_min ?? 0,
                    },
                },
            },
            anomalies: {
                autoencoder: row.anomaly_ae ?? 0,
                lstm: row.anomaly_lstm ?? null,
                consensus: row.anomaly_consensus ?? 0,
            },
        }));
        res.json({ success: true, data: formattedData });
    }
    catch (error) {
        console.error('Fetch traffic by user ID error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch traffic data' });
    }
});
// Get traffic by IP
app.get('/pgadmin/traffic/ip/:ip', async (req, res) => {
    const ip = req.params.ip;
    try {
        const queryText = `
      SELECT
        id, user_id, ip, timestamp, fl_byt_s, fl_pck_s, fwd_max_pack_size, fwd_avg_packet,
        bck_max_pack_size, bck_avg_packet, fw_iat_std, fw_iat_min, bck_iat_std, bck_iat_min,
        anomaly_ae, anomaly_lstm, anomaly_consensus, packet_count
      FROM traffic_with_anomalies
      WHERE ip = $1
      ORDER BY timestamp DESC
    `;
        const result = await pool.query(queryText, [ip]);
        const formattedData = result.rows.map((row) => ({
            id: row.id,
            user_id: row.user_id,
            ip: row.ip,
            timestamp: row.timestamp.toISOString(),
            networkMetrics: {
                byteRate: row.fl_byt_s ?? 0,
                packetRate: row.fl_pck_s ?? 0,
                packetCount: row.packet_count ?? 0,
                forward: {
                    maxPacketSize: row.fwd_max_pack_size ?? 0,
                    avgPacketSize: row.fwd_avg_packet ?? 0,
                },
                backward: {
                    maxPacketSize: row.bck_max_pack_size ?? 0,
                    avgPacketSize: row.bck_avg_packet ?? 0,
                },
                interArrivalTime: {
                    forward: {
                        stdDev: row.fw_iat_std ?? 0,
                        min: row.fw_iat_min ?? 0,
                    },
                    backward: {
                        stdDev: row.bck_iat_std ?? 0,
                        min: row.bck_iat_min ?? 0,
                    },
                },
            },
            anomalies: {
                autoencoder: row.anomaly_ae ?? 0,
                lstm: row.anomaly_lstm ?? null,
                consensus: row.anomaly_consensus ?? 0,
            },
        }));
        res.json({ success: true, data: formattedData });
    }
    catch (error) {
        console.error('Fetch traffic by IP error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch traffic data for IP' });
    }
});
// Get anomalies for last X minutes
app.get('/pgadmin/anomalies/last15min', async (req, res) => {
    const { ip, minutes = 15 } = req.query;
    try {
        let queryText = `
      SELECT * FROM traffic_with_anomalies
      WHERE timestamp >= NOW() - INTERVAL '${minutes} minutes'
    `;
        const params = [];
        if (ip) {
            queryText += ` AND ip = $1`;
            params.push(ip);
        }
        queryText += ` ORDER BY timestamp DESC`;
        const result = await pool.query(queryText, params);
        res.json({ success: true, data: result.rows });
    }
    catch (error) {
        console.error('Fetch last data error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch last data' });
    }
});
// Get traffic by ID
app.get('/pgadmin/traffic/:id', async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const result = await pool.query('SELECT * FROM traffic_with_anomalies WHERE id = $1', [id]);
        if (result.rows.length > 0) {
            res.json({ success: true, data: result.rows[0], timestamp: new Date().toISOString() });
        }
        else {
            res.status(404).json({ success: false, error: 'Record not found' });
        }
    }
    catch (error) {
        console.error('Fetch traffic by ID error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch traffic data' });
    }
});
// Get users and traffic
app.get('/pgadmin/users-and-traffic', async (req, res) => {
    try {
        const usersQuery = 'SELECT * FROM users';
        const trafficQuery = `
      SELECT * FROM traffic_with_anomalies
      WHERE timestamp >= NOW() - INTERVAL '15 seconds'
      ORDER BY timestamp DESC
    `;
        const [usersResult, trafficResult] = await Promise.all([
            pool.query(usersQuery),
            pool.query(trafficQuery),
        ]);
        const formattedTraffic = trafficResult.rows.map((row) => ({
            id: row.id,
            user_id: Number(row.user_id),
            ip: row.ip,
            timestamp: row.timestamp.toISOString(),
            networkMetrics: {
                byteRate: row.fl_byt_s ?? 0,
                packetRate: row.fl_pck_s ?? 0,
                packetCount: row.packet_count ?? 0,
                forward: {
                    maxPacketSize: row.fwd_max_pack_size ?? 0,
                    avgPacketSize: row.fwd_avg_packet ?? 0,
                },
                backward: {
                    maxPacketSize: row.bck_max_pack_size ?? 0,
                    avgPacketSize: row.bck_avg_packet ?? 0,
                },
                interArrivalTime: {
                    forward: {
                        stdDev: row.fw_iat_std ?? 0,
                        min: row.fw_iat_min ?? 0,
                    },
                    backward: {
                        stdDev: row.bck_iat_std ?? 0,
                        min: row.bck_iat_min ?? 0,
                    },
                },
            },
            anomalies: {
                autoencoder: row.anomaly_ae ?? 0,
                lstm: row.anomaly_lstm ?? null,
                consensus: row.anomaly_consensus ?? 0,
            },
        }));
        res.json({
            success: true,
            data: {
                users: usersResult.rows,
                traffic: formattedTraffic,
            },
        });
    }
    catch (error) {
        console.error('Fetch users and traffic error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch data' });
    }
});
// Get latest traffic
app.get('/pgadmin/latest-traffic', async (req, res) => {
    try {
        const queryText = 'SELECT * FROM traffic_with_anomalies WHERE timestamp = (SELECT MAX(timestamp) FROM traffic_with_anomalies)';
        const result = await pool.query(queryText);
        if (result.rows.length === 0)
            return res.status(404).json({ success: false, error: 'No data found' });
        res.json({ success: true, count: result.rows.length, latestTimestamp: result.rows[0].timestamp, data: result.rows });
    }
    catch (error) {
        console.error('Fetch latest traffic error:', error);
        res.status(500).json({ success: false, error: 'Failed to fetch latest traffic' });
    }
});
// Execute SQL
app.post('/pgadmin/execute-sql', async (req, res) => {
    const { query } = req.body;
    try {
        const result = await pool.query(query);
        res.json(query.toLowerCase().startsWith('select') ? { success: true, data: result.rows } : { success: true, message: 'Query executed' });
    }
    catch (error) {
        console.error('SQL execution error:', error);
        res.status(500).json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' });
    }
});
// Check database connection
app.get('/pgadmin/execute-sql/check-connection', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json(true);
    }
    catch (error) {
        console.error('Connection check error:', error);
        res.status(500).json(false);
    }
});
// List files
app.get('/pgadmin/list-files', (req, res) => {
    fs.readdir(FILES_DIR, (err, files) => {
        if (err) {
            console.error('List files error:', err);
            return res.status(500).json({ error: 'Failed to list files' });
        }
        const filteredFiles = files.filter((f) => {
            const filePath = path.join(FILES_DIR, f);
            return !fs.statSync(filePath).isDirectory() && (process.platform === 'win32' ? f.endsWith('.exe') : f.endsWith('.deb'));
        });
        res.json({ files: filteredFiles, system: process.platform });
    });
});
// Download file
app.get('/pgadmin/download/:filename', (req, res) => {
    const filename = req.params.filename;
    const filePath = path.join(FILES_DIR, filename);
    if (!/^[\w-]+\.(exe|deb)$/.test(filename) || !fs.existsSync(filePath)) {
        return res.status(400).json({ error: 'Invalid or missing file' });
    }
    res.download(filePath, filename, (err) => err && console.error('Download error:', err));
});
// Start server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
