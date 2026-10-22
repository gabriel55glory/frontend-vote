import postgres from 'postgres';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Add the Supabase PostgreSQL connection string in Render Environment.'
  );
}

const sql = postgres(connectionString, {
  ssl:
    process.env.NODE_ENV === 'production'
      ? { rejectUnauthorized: false }
      : undefined,
  max: 5,
  idle_timeout: 30,   // seconds
  connect_timeout: 10 // seconds
});

export default sql;
