import express from 'express';
import { pool } from '../db/index.js';
import { allow, ownStudentIds } from '../API/auth.js';
import { avg, gr, attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// GET /api/students/:id/profile
router.get('/:id/profile', allow('students'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (own && !own.includes(req.params.id))
      return res.status(404).json({ error: 'Student not found.' });

    const { rows: sRows } = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    const s = sRows[0];
    if (!s) return res.status(404).json({ error: 'Student not found.' });

    const [guardian, fees, marks, a, c] = await Promise.all([
      pool.query('SELECT * FROM parents WHERE id=$1', [s.guardian]).then(r => r.rows[0]),
      pool.query('SELECT * FROM fees WHERE student=$1', [s.id]).then(r => r.rows.map(f => ({ ...f, amount: Number(f.amount), paid: Number(f.paid) }))),
      pool.query('SELECT subject, mark FROM marks WHERE student_id=$1', [s.id]).then(r => Object.fromEntries(r.rows.map(m => [m.subject, m.mark]))),
      avg(s.id),
      attOf([s.id])
    ]);

    res.json({
      student:    s,
      guardian,
      attendance: { ...c, rate: rate(c) },
      academic:   { average: a, grade: gr(a), marks },
      fees
    });
  } catch (err) { next(err); }
});

export default router;
