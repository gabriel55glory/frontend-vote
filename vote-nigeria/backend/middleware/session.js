// Simple session helper. Sessions are stored in the database
// (active_sessions table). A session token is just the phone number.
function getSessionPhone(req) {
  const auth = req.headers['x-session'] || req.headers['x-session-phone'];
  return auth || null;
}

async function getVoter(pool, phone) {
  const r = await pool.query(
    `SELECT rv.id, rv.phone, rv.nin, c.full_name, c.state, c.lga, c.is_admin
     FROM registered_voters rv
     JOIN citizens c ON c.nin = rv.nin
     WHERE rv.phone = $1 AND rv.is_active = TRUE`,
    [phone]
  );
  return r.rows[0] || null;
}

module.exports = { getSessionPhone, getVoter };
