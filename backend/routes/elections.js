const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getVoter } = require('../middleware/session');

// LIST elections available to this voter.
// - presidential: everyone
// - governor: only voters whose state matches
// - lga: only voters whose lga matches
router.get('/', async (req, res) => {
  const phone = req.headers['x-session'];
  const voter = phone ? await getVoter(pool, phone) : null;

  try {
    let q, params;
    if (voter) {
      q = `SELECT * FROM elections
           WHERE status = 'ongoing'
             AND (type = 'president'
                  OR (type = 'governor' AND state = $1)
                  OR (type = 'lga' AND lga = $2))
           ORDER BY id`;
      params = [voter.state, voter.lga];
    } else {
      q = `SELECT * FROM elections WHERE status = 'ongoing' ORDER BY id`;
      params = [];
    }
    const r = await pool.query(q, params);
    res.json({ elections: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET a single election with its candidates
router.get('/:id', async (req, res) => {
  const phone = req.headers['x-session'];
  const voter = phone ? await getVoter(pool, phone) : null;
  try {
    const e = await pool.query(`SELECT * FROM elections WHERE id = $1`, [req.params.id]);
    if (e.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const election = e.rows[0];

    // Enforce state/lga scoping
    if (voter) {
      if (election.type === 'governor' && election.state !== voter.state)
        return res.status(403).json({ error: 'You can only vote in your state.' });
      if (election.type === 'lga' && election.lga !== voter.lga)
        return res.status(403).json({ error: 'You can only vote in your LGA.' });
    }

    const c = await pool.query(
      `SELECT id, name, party, logo_url, votes FROM candidates WHERE election_id = $1 ORDER BY id`,
      [election.id]
    );

    // Has the voter already voted?
    let voted = false;
    if (voter) {
      const v = await pool.query(
        `SELECT 1 FROM votes WHERE voter_nin = $1 AND election_id = $2`,
        [voter.nin, election.id]
      );
      voted = v.rowCount > 0;
    }

    res.json({ election, candidates: c.rows, voted });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// CAST a vote
router.post('/:id/vote', async (req, res) => {
  const phone = req.headers['x-session'];
  if (!phone) return res.status(401).json({ error: 'Not logged in' });
  const voter = await getVoter(pool, phone);
  if (!voter) return res.status(401).json({ error: 'Not logged in' });

  const { candidateId } = req.body;
  if (!candidateId) return res.status(400).json({ error: 'Candidate required' });

  try {
    const e = await pool.query(`SELECT * FROM elections WHERE id = $1`, [req.params.id]);
    if (e.rowCount === 0) return res.status(404).json({ error: 'Election not found' });
    const election = e.rows[0];
    if (election.status !== 'ongoing')
      return res.json({ ok: false, message: 'This election has ended.' });
    if (new Date() > new Date(election.end_time))
      return res.json({ ok: false, message: 'This election has ended.' });

    if (election.type === 'governor' && election.state !== voter.state)
      return res.status(403).json({ error: 'Not your state' });
    if (election.type === 'lga' && election.lga !== voter.lga)
      return res.status(403).json({ error: 'Not your LGA' });

    // Already voted?
    const existing = await pool.query(
      `SELECT 1 FROM votes WHERE voter_nin = $1 AND election_id = $2`,
      [voter.nin, election.id]
    );
    if (existing.rowCount > 0)
      return res.json({ ok: false, message: 'You have already voted in this election.' });

    // Insert vote and bump candidate count atomically.
    await pool.query('BEGIN');
    await pool.query(
      `INSERT INTO votes (voter_nin, election_id, candidate_id) VALUES ($1, $2, $3)`,
      [voter.nin, election.id, candidateId]
    );
    await pool.query(`UPDATE candidates SET votes = votes + 1 WHERE id = $1`, [candidateId]);
    await pool.query('COMMIT');

    res.json({ ok: true, message: 'Vote cast successfully.' });
  } catch (e) {
    await pool.query('ROLLBACK').catch(() => {});
    res.status(500).json({ error: 'Server error' });
  }
});

// RESULTS for an election (or all ended elections)
router.get('/results/:id', async (req, res) => {
  try {
    const e = await pool.query(`SELECT * FROM elections WHERE id = $1`, [req.params.id]);
    if (e.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    const election = e.rows[0];
    const c = await pool.query(
      `SELECT id, name, party, logo_url, votes FROM candidates
       WHERE election_id = $1 ORDER BY votes DESC`,
      [election.id]
    );
    const total = c.rows.reduce((s, x) => s + Number(x.votes), 0);
    const winner = c.rows[0] || null;
    res.json({ election, candidates: c.rows, total, winner });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ALL results grouped (for results page)
router.get('/results/all', async (req, res) => {
  try {
    const e = await pool.query(`SELECT * FROM elections ORDER BY id`);
    const out = [];
    for (const el of e.rows) {
      const c = await pool.query(
        `SELECT id, name, party, logo_url, votes FROM candidates
         WHERE election_id = $1 ORDER BY votes DESC`, [el.id]
      );
      const total = c.rows.reduce((s, x) => s + Number(x.votes), 0);
      out.push({
        election: el,
        candidates: c.rows,
        total,
        winner: c.rows[0] || null,
      });
    }
    res.json({ results: out });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
