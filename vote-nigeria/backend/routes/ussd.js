// ============================================================
//  USSD ENDPOINT — simulates *347#
//  Works just like the site: register, list elections, vote.
//  The frontend has a phone-like dialer that POSTs here.
// ============================================================
const express = require('express');
const router = express.Router();
const pool = require('../db');
const { getVoter } = require('../middleware/session');

// Helper: format a USSD menu
function menu(text, terminate = false) {
  return { text, terminate };
}

router.post('/', async (req, res) => {
  let { sessionId, phoneNumber, text } = req.body;
  text = (text || '').split('*').filter(Boolean); // each "*" = a menu step
  const step = text.length;

  try {
    // ---- LEVEL 0: Welcome ----
    if (step === 0) {
      return res.json(menu(
        'Welcome to Vote Nigeria\n' +
        '1. Register / Login\n' +
        '2. Vote in an election\n' +
        '3. Check election results\n' +
        '4. Exit'
      ));
    }

    const choice = text[0];

    // ---- 1. REGISTER / LOGIN ----
    if (choice === '1') {
      if (step === 1) {
        return res.json(menu('Enter your phone number:'));
      }
      if (step === 2) {
        const phone = text[1].replace(/\s/g, '');
        const c = await pool.query(
          `SELECT * FROM citizens WHERE phone1 = $1 OR phone2 = $1`, [phone]
        );
        if (c.rowCount === 0)
          return res.json(menu('Oops looks like this number hasn\u2019t been registered.', true));

        const citizen = c.rows[0];
        const sess = await pool.query(`SELECT * FROM active_sessions WHERE nin = $1`, [citizen.nin]);
        if (sess.rowCount > 0 && sess.rows[0].phone !== phone) {
          return res.json(menu('This NIN is already active on another number.', true));
        }
        await pool.query(
          `INSERT INTO registered_voters (phone, nin, is_active)
           VALUES ($1, $2, TRUE)
           ON CONFLICT (phone) DO UPDATE SET is_active = TRUE, nin = $2`,
          [phone, citizen.nin]
        );
        await pool.query(
          `INSERT INTO active_sessions (nin, phone) VALUES ($1, $2)
           ON CONFLICT (nin) DO UPDATE SET phone = $2, started_at = NOW()`,
          [citizen.nin, phone]
        );
        return res.json(menu(
          `Registration successful!\nName: ${citizen.full_name}\nState: ${citizen.state}\nLGA: ${citizen.lga}\nYou can now vote.`,
          true
        ));
      }
    }

    // ---- 2. VOTE ----
    if (choice === '2') {
      // Need a session
      const phone = req.body.phoneNumber;
      // On real USSD the telco passes the caller's number; for our demo
      // the dialer sends it. We try to find an active session for it.
      const voter = await getVoter(pool, phone);
      if (!voter) {
        return res.json(menu('Please register first (option 1).', true));
      }
      const elections = await pool.query(
        `SELECT * FROM elections
         WHERE status = 'ongoing'
           AND (type = 'president'
                OR (type = 'governor' AND state = $1)
                OR (type = 'lga' AND lga = $2))
         ORDER BY id`,
        [voter.state, voter.lga]
      );
      if (elections.rowCount === 0)
        return res.json(menu('No elections available right now.', true));

      if (step === 1) {
        let menuText = 'Select election:\n';
        elections.rows.forEach((e, i) => {
          menuText += `${i + 1}. ${e.title}\n`;
        });
        return res.json(menu(menuText));
      }

      const eIdx = parseInt(text[1]) - 1;
      const election = elections.rows[eIdx];
      if (!election) return res.json(menu('Invalid selection.', true));

      // Already voted?
      const v = await pool.query(
        `SELECT 1 FROM votes WHERE voter_nin = $1 AND election_id = $2`,
        [voter.nin, election.id]
      );
      if (v.rowCount > 0) return res.json(menu('You have already voted in this election.', true));

      const cands = await pool.query(
        `SELECT * FROM candidates WHERE election_id = $1 ORDER BY id`, [election.id]
      );
      if (cands.rowCount === 0) return res.json(menu('No candidates yet.', true));

      if (step === 2) {
        let menuText = `${election.title}\nSelect candidate:\n`;
        cands.rows.forEach((c, i) => {
          menuText += `${i + 1}. ${c.name} (${c.party})\n`;
        });
        return res.json(menu(menuText));
      }

      const cIdx = parseInt(text[2]) - 1;
      const cand = cands.rows[cIdx];
      if (!cand) return res.json(menu('Invalid candidate.', true));

      await pool.query('BEGIN');
      await pool.query(
        `INSERT INTO votes (voter_nin, election_id, candidate_id) VALUES ($1, $2, $3)`,
        [voter.nin, election.id, cand.id]
      );
      await pool.query(`UPDATE candidates SET votes = votes + 1 WHERE id = $1`, [cand.id]);
      await pool.query('COMMIT');

      return res.json(menu(`Vote cast for ${cand.name} (${cand.party}). Thank you!`, true));
    }

    // ---- 3. RESULTS ----
    if (choice === '3') {
      const e = await pool.query(`SELECT * FROM elections ORDER BY id`);
      if (e.rowCount === 0) return res.json(menu('No elections.', true));

      if (step === 1) {
        let menuText = 'Select election to view results:\n';
        e.rows.forEach((x, i) => menuText += `${i + 1}. ${x.title}\n`);
        return res.json(menu(menuText));
      }
      const eIdx = parseInt(text[1]) - 1;
      const election = e.rows[eIdx];
      if (!election) return res.json(menu('Invalid.', true));
      const c = await pool.query(
        `SELECT * FROM candidates WHERE election_id = $1 ORDER BY votes DESC`, [election.id]
      );
      let txt = `${election.title} Results:\n`;
      c.rows.forEach(x => { txt += `${x.name} (${x.party}): ${x.votes}\n`; });
      return res.json(menu(txt, true));
    }

    // ---- 4. EXIT ----
    if (choice === '4') return res.json(menu('Goodbye.', true));

    return res.json(menu('Invalid option.', true));
  } catch (err) {
    console.error('ussd error', err);
    res.json(menu('Service error. Try again.', true));
  }
});

module.exports = router;
