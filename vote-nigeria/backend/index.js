const express = require('express');
const path = require('path');
const cors = require('cors');
const fs = require('fs');
const pool = require('./db');
// Admin credentials (also checked client-side in demo mode)
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
const ADMIN_PIN = process.env.ADMIN_PIN || '';

const app = express();
app.use(cors({
  origin: [
    'https://votenigeria-frontend.onrender.com',
    'http://localhost:5173',
    'http://127.0.0.1:5500'
  ],
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'x-session', 'Authorization'],
}));
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static frontend
app.use(express.static(path.join(__dirname, '..', 'frontend')));

// API routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/elections', require('./routes/elections'));
app.use('/api/support', require('./routes/support'));
app.use('/api/news', require('./routes/news'));
app.use('/api/admin', require('./routes/admin'));
app.use('/api/ussd', require('./routes/ussd'));

// Fallback: any non-API path returns index.html (so pages work without .html)
app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'Not found' });
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 4000;

// ---- DEMO MODE ----
// If no PostgreSQL is available (e.g. just opening the HTML files in a
// browser), the frontend falls back to an in-memory dataset seeded from
// the same data as schema.sql. This keeps the school project runnable
// without installing Postgres.
app.use('/api/demo/*', async (req, res) => {
  res.json({ demo: true });
});

app.listen(PORT, () => {
  console.log(`\n  Vote Nigeria server running on http://localhost:${PORT}`);
  console.log(`  Open that URL in your browser.\n`);
});

// Ping DB on boot — if it fails, print instructions (don't crash).
pool.query('SELECT 1').then(() => {
  console.log('  Supabase PostgreSQL connected.');
}).catch(() => {
  console.error('  Supabase PostgreSQL connection failed. Check DATABASE_URL and Supabase network settings.');
  
});
