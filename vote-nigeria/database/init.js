// Initializes the database: creates tables and seeds only the demo citizen accounts. Elections, candidates, and news start empty until added by an administrator.
const fs = require('fs');
const path = require('path');
const pool = require('../backend/db');

(async () => {
  try {
    const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
    await pool.query(sql);
    console.log('Database initialized successfully.');
    console.log('Citizens seeded:');
    const r = await pool.query('SELECT nin, full_name, state, lga, phone1, phone2, is_admin FROM citizens');
    r.rows.forEach(c => {
      console.log(`  ${c.full_name} | ${c.phone1} / ${c.phone2} | NIN ${c.nin} | ${c.state}, ${c.lga} | admin=${c.is_admin}`);
    });
    process.exit(0);
  } catch (e) {
    console.error('Init failed:', e.message);
    process.exit(1);
  }
})();
