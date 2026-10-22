// Supabase-hosted PostgreSQL connection. Supabase is the database provider;
// no separately hosted PostgreSQL server is required.
const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is not set. Add the Supabase PostgreSQL connection string in Render Environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // Supabase hosted PostgreSQL requires TLS for most connection options.
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

pool.on('error', (err) => console.error('Unexpected database pool error:', err.message));

module.exports = pool;
