const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getSessionPhone, getVoter } = require('../middleware/session');

// REGISTER  — user enters only a phone number. Backend looks up the NIN
// behind that number from the citizens (NIN server) table. If the NIN is
// already actively registered (a session exists), reject to stop multiple
// votes from one NIN.
router.post('/register', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  try {
    // 1. Look up the citizen whose phone1 or phone2 matches.
    const c = await pool.query(
      `SELECT * FROM citizens WHERE phone1 = $1 OR phone2 = $1`,
      [phone]
    );
    if (c.rowCount === 0) {
      return res.json({ found: false, message: 'Oops looks like this number hasn\u2019t been registered' });
    }
    const citizen = c.rows[0];

    // 2. Check whether this NIN already has an active session.
    const sess = await pool.query(
      `SELECT * FROM active_sessions WHERE nin = $1`,
      [citizen.nin]
    );
    if (sess.rowCount > 0) {
      return res.json({
        found: false,
        message: 'This NIN is already logged in on another phone number. You cannot register twice.',
      });
    }

    // 3. Register the voter (or reactivate an old row).
    await pool.query(
      `INSERT INTO registered_voters (phone, nin, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (phone)
       DO UPDATE SET is_active = TRUE, nin = $2`,
      [phone, citizen.nin]
    );

    // 4. Start an active session for this NIN.
    await pool.query(
      `INSERT INTO active_sessions (nin, phone) VALUES ($1, $2)
       ON CONFLICT (nin) DO UPDATE SET phone = $2, started_at = NOW()`,
      [citizen.nin, phone]
    );

    // 5. Return masked NIN + details for the confirmation dialog.
    const masked = citizen.nin.slice(0, 4) + '******' + citizen.nin.slice(-2);
    res.json({
      found: true,
      name: citizen.full_name,
      nin_masked: masked,
      state: citizen.state,
      lga: citizen.lga,
      phone,
      is_admin: citizen.is_admin,
    });
  } catch (e) {
    console.error('register error', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// LOGIN — same flow as register but for returning users.
router.post('/login', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone required' });
  try {
    const c = await pool.query(
      `SELECT * FROM citizens WHERE phone1 = $1 OR phone2 = $1`, [phone]
    );
    if (c.rowCount === 0)
      return res.json({ found: false, message: 'Number not found' });
    const citizen = c.rows[0];

    // reactivate
    await pool.query(
      `INSERT INTO registered_voters (phone, nin, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (phone) DO UPDATE SET is_active = TRUE`,
      [phone, citizen.nin]
    );
    await pool.query(
      `INSERT INTO active_sessions (nin, phone) VALUES ($1, $2)
       ON CONFLICT (nin) DO UPDATE SET phone = $2, started_at = NOW()`,
      [citizen.nin, phone]
    );
    res.json({
      found: true,
      name: citizen.full_name,
      state: citizen.state,
      lga: citizen.lga,
      phone,
      is_admin: citizen.is_admin,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CHANGE PHONE — warn that any votes in an ongoing election will be cancelled.
router.post('/change-phone', async (req, res) => {
  const { oldPhone, newPhone } = req.body;
  if (!oldPhone || !newPhone)
    return res.status(400).json({ error: 'Both numbers required' });

  try {
    const voter = await getVoter(pool, oldPhone);
    if (!voter) return res.status(404).json({ error: 'Not logged in' });

    // Does newPhone belong to the same NIN?
    const c = await pool.query(
      `SELECT * FROM citizens WHERE (phone1 = $1 OR phone2 = $1) AND nin = $2`,
      [newPhone, voter.nin]
    );
    if (c.rowCount === 0)
      return res.json({ ok: false, message: 'The new number is not linked to your NIN.' });

    // Find ongoing elections this voter voted in -> cancel those votes.
    const ongoingVotes = await pool.query(
      `SELECT v.id, v.election_id, e.title, e.type
       FROM votes v JOIN elections e ON e.id = v.election_id
       WHERE v.voter_nin = $1 AND e.status = 'ongoing'`,
      [voter.nin]
    );

    // Decrement candidate vote counts then delete the vote rows.
    for (const v of ongoingVotes.rows) {
      await pool.query(`UPDATE candidates SET votes = votes - 1
        WHERE id = (SELECT candidate_id FROM votes WHERE id = $1)`, [v.id]);
      await pool.query(`DELETE FROM votes WHERE id = $1`, [v.id]);
    }

    // Mark old phone inactive.
    await pool.query(`UPDATE registered_voters SET is_active = FALSE WHERE phone = $1`, [oldPhone]);
    // Activate new phone.
    await pool.query(
      `INSERT INTO registered_voters (phone, nin, is_active)
       VALUES ($1, $2, TRUE)
       ON CONFLICT (phone) DO UPDATE SET is_active = TRUE, nin = $2`,
      [newPhone, voter.nin]
    );
    // Update session.
    await pool.query(`UPDATE active_sessions SET phone = $1 WHERE nin = $2`,
      [newPhone, voter.nin]);

    res.json({
      ok: true,
      cancelledVotes: ongoingVotes.rows.length,
      newPhone,
      message: `Phone changed. ${ongoingVotes.rowCount} ongoing vote(s) cancelled. You have been logged out.`,
    });
  } catch (e) {
    console.error('change-phone', e);
    res.status(500).json({ error: 'Server error' });
  }
});

// LOGOUT
router.post('/logout', async (req, res) => {
  const phone = getSessionPhone(req);
  if (!phone) return res.json({ ok: true });
  try {
    const voter = await getVoter(pool, phone);
    if (voter) {
      await pool.query(`DELETE FROM active_sessions WHERE nin = $1`, [voter.nin]);
      await pool.query(`UPDATE registered_voters SET is_active = FALSE WHERE phone = $1`, [phone]);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CURRENT VOTER
router.get('/me', async (req, res) => {
  const phone = getSessionPhone(req);
  if (!phone) return res.json({ voter: null });
  const voter = await getVoter(pool, phone);
  res.json({ voter });
});

module.exports = router;
