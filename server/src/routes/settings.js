import express from 'express';
import { pool } from '../db/index.js';
import { auth, allow } from '../API/auth.js';

const router = express.Router();

// GET /api/settings — public
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT school, year, cur, theme FROM settings WHERE id = 1');
    res.json(rows[0] || {});
  } catch (err) { next(err); }
});

// PUT /api/settings
router.put('/', auth, allow('settings', 'w'), async (req, res, next) => {
  try {
    const { school, year, cur, theme } = req.body || {};
    if (!school || !school.trim()) return res.status(400).json({ error: 'School name is required.' });
    const { rows } = await pool.query(
      `UPDATE settings SET school=$1, year=$2, cur=$3, theme=$4
       WHERE id = 1 RETURNING school, year, cur, theme`,
      [school.trim(), (year || '').trim(), (cur || '').trim(), (theme || '').trim()]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
