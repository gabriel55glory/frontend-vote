const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getVoter } = require('../middleware/session');

// GET messages for the current voter
router.get('/', async (req, res) => {
  const phone = req.headers['x-session'];
  if (!phone) return res.json({ messages: [] });
  const voter = await getVoter(pool, phone);
  if (!voter) return res.json({ messages: [] });
  const r = await pool.query(
    `SELECT id, sender, body, created_at FROM support_messages
     WHERE voter_phone = $1 ORDER BY id ASC`, [voter.phone]
  );
  res.json({ messages: r.rows });
});

// POST a message from a voter
router.post('/', async (req, res) => {
  const phone = req.headers['x-session'];
  if (!phone) return res.status(401).json({ error: 'Not logged in' });
  const voter = await getVoter(pool, phone);
  if (!voter) return res.status(401).json({ error: 'Not logged in' });
  const { body } = req.body;
  if (!body || !body.trim()) return res.status(400).json({ error: 'Empty' });

  await pool.query(
    `INSERT INTO support_messages (voter_phone, sender, body) VALUES ($1, 'voter', $2)`,
    [voter.phone, body]
  );
  // Automated reply
  const auto = 'Thanks for using Vote Nigeria, your request has been sent we\u2019ll get in touch as soon as an admin views this message.';
  const rep = await pool.query(
    `INSERT INTO support_messages (voter_phone, sender, body) VALUES ($1, 'admin', $2) RETURNING id, sender, body, created_at`,
    [voter.phone, auto]
  );
  res.json({ ok: true, autoReply: rep.rows[0] });
});

module.exports = router;
