const express = require('express');
const router = express.Router();
const pool = require('../db');

// LIST news (optional category filter)
router.get('/', async (req, res) => {
  const { category } = req.query;
  try {
    let q, params;
    if (category && category !== 'All') {
      q = `SELECT * FROM news WHERE category = $1 ORDER BY id DESC`;
      params = [category];
    } else {
      q = `SELECT * FROM news ORDER BY id DESC`;
      params = [];
    }
    const r = await pool.query(q, params);
    res.json({ news: r.rows });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET one news item
router.get('/:id', async (req, res) => {
  try {
    const r = await pool.query(`SELECT * FROM news WHERE id = $1`, [req.params.id]);
    if (r.rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ news: r.rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
