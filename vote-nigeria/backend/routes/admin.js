const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getVoter } = require('../middleware/session');

// Admin guard — only the phone number flagged is_admin in citizens may use these routes.
async function adminOnly(req, res, next) {
  const phone = req.headers['x-session'];
  if (!phone) return res.status(401).json({ error: 'Login required' });
  const voter = await getVoter(pool, phone);
  if (!voter || !voter.is_admin)
    return res.status(403).json({ error: 'Admin access required' });
  next();
}

// ---- ELECTIONS ----
router.post('/elections', adminOnly, async (req, res) => {
  const { title, type, state, lga, durationHours } = req.body;
  if (!title || !type) return res.status(400).json({ error: 'title & type required' });
  const hours = durationHours || 24;
  try {
    const r = await pool.query(
      `INSERT INTO elections (title, type, state, lga, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, NOW(), NOW() + INTERVAL '${parseInt(hours)} hours', 'ongoing')
       RETURNING *`,
      [title, type, state || null, lga || null]
    );
    res.json({ election: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/elections/:id', adminOnly, async (req, res) => {
  try {
    await pool.query(`DELETE FROM elections WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// End an election (declare it ended) -> winner computed on results endpoint.
router.post('/elections/:id/end', adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `UPDATE elections SET status = 'ended' WHERE id = $1 RETURNING *`, [req.params.id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    // Compute winner
    const c = await pool.query(
      `SELECT * FROM candidates WHERE election_id = $1 ORDER BY votes DESC LIMIT 1`,
      [req.params.id]
    );
    res.json({ election: r.rows[0], winner: c.rows[0] || null });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- CANDIDATES ----
router.post('/candidates', adminOnly, async (req, res) => {
  const { electionId, name, party, logoUrl } = req.body;
  if (!electionId || !name || !party)
    return res.status(400).json({ error: 'electionId, name, party required' });
  try {
    const r = await pool.query(
      `INSERT INTO candidates (election_id, name, party, logo_url)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [electionId, name, party, logoUrl || null]
    );
    res.json({ candidate: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/candidates/:id', adminOnly, async (req, res) => {
  try {
    await pool.query(`DELETE FROM candidates WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Upload logo (just a URL for this demo)
router.post('/candidates/:id/logo', adminOnly, async (req, res) => {
  const { logoUrl } = req.body;
  if (!logoUrl) return res.status(400).json({ error: 'logoUrl required' });
  try {
    const r = await pool.query(
      `UPDATE candidates SET logo_url = $1 WHERE id = $2 RETURNING *`,
      [logoUrl, req.params.id]
    );
    res.json({ candidate: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- NEWS ----
router.post('/news', adminOnly, async (req, res) => {
  const { title, subtitle, body, imageUrl, category } = req.body;
  if (!title || !body) return res.status(400).json({ error: 'title & body required' });
  try {
    const r = await pool.query(
      `INSERT INTO news (title, subtitle, body, image_url, category)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [title, subtitle || null, body, imageUrl || null, category || 'General']
    );
    res.json({ news: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/news/:id', adminOnly, async (req, res) => {
  try {
    await pool.query(`DELETE FROM news WHERE id = $1`, [req.params.id]);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ---- SUPPORT CHAT (admin side) ----
// List all voters who have sent messages
router.get('/support/chats', adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT DISTINCT voter_phone FROM support_messages ORDER BY voter_phone`
    );
    res.json({ chats: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// List messages for a voter
router.get('/support/:phone', adminOnly, async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT id, sender, body, created_at FROM support_messages
       WHERE voter_phone = $1 ORDER BY id ASC`, [req.params.phone]
    );
    res.json({ messages: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin replies to a voter
router.post('/support/:phone', adminOnly, async (req, res) => {
  const { body } = req.body;
  if (!body) return res.status(400).json({ error: 'body required' });
  try {
    const r = await pool.query(
      `INSERT INTO support_messages (voter_phone, sender, body) VALUES ($1, 'admin', $2)
       RETURNING id, sender, body, created_at`,
      [req.params.phone, body]
    );
    res.json({ message: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Check admin status of the current session
router.get('/check', async (req, res) => {
  const phone = req.headers['x-session'];
  if (!phone) return res.json({ isAdmin: false });
  const voter = await getVoter(pool, phone);
  res.json({ isAdmin: !!(voter && voter.is_admin), voter });
});

module.exports = router;
