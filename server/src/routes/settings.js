import express from 'express';
import { db } from '../data.js';
import { auth, allow } from '../API/auth.js';

const router = express.Router();

// GET /api/settings — public, no auth needed
router.get('/', (req, res) => res.json(db.settings));

// PUT /api/settings
router.put('/', auth, allow('settings', 'w'), (req, res) => {
  const { school, year, cur, theme } = req.body || {};
  if (!school || !school.trim()) return res.status(400).json({ error: 'School name is required.' });
  if (school) db.settings.school = school.trim();
  if (year)   db.settings.year   = year.trim();
  if (cur)    db.settings.cur    = cur.trim();
  if (theme)  db.settings.theme  = theme.trim();
  res.json(db.settings);
});

export default router;
