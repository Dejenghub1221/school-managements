import express from 'express';
import { pool, CLS, SUB } from '../db/index.js';
import { allow, ownStudentIds, myClasses } from '../API/auth.js';
import { gr } from '../utils/helpers.js';

const router = express.Router();

// GET /api/results
router.get('/', allow('exams'), async (req, res, next) => {
  try {
    const mine = await myClasses(req.user);
    const own  = await ownStudentIds(req.user);
    const cls  = req.query.cls || (mine ? mine[0] : CLS[0]);

    let studentRows;
    if (own) {
      const { rows } = await pool.query('SELECT * FROM students WHERE id=ANY($1)', [own]);
      studentRows = rows;
    } else {
      const { rows } = await pool.query('SELECT * FROM students WHERE cls=$1 ORDER BY name', [cls]);
      studentRows = rows;
    }

    const rows = await Promise.all(studentRows.map(async s => {
      const { rows: mRows } = await pool.query(
        'SELECT subject, mark FROM marks WHERE student_id=$1', [s.id]
      );
      const marks = Object.fromEntries(mRows.map(m => [m.subject, m.mark]));
      const total = Object.values(marks).reduce((a, b) => a + b, 0);
      const a     = mRows.length ? total / mRows.length : 0;
      return { id: s.id, name: s.name, cls: s.cls, marks, total, average: a.toFixed(1), grade: gr(a) };
    }));

    res.json({ cls, classes: mine || CLS, subjects: SUB, students: rows });
  } catch (err) { next(err); }
});

// PUT /api/results
router.put('/', allow('exams', 'w'), async (req, res, next) => {
  try {
    const { studentId, subject, mark } = req.body || {};
    if (!studentId || !subject) return res.status(400).json({ error: 'studentId and subject required.' });
    const val = Math.max(0, Math.min(100, Number(mark) || 0));
    await pool.query(
      `INSERT INTO marks (student_id, subject, mark) VALUES ($1,$2,$3)
       ON CONFLICT (student_id, subject) DO UPDATE SET mark=EXCLUDED.mark`,
      [studentId, subject, val]
    );
    const { rows } = await pool.query('SELECT subject, mark FROM marks WHERE student_id=$1', [studentId]);
    const total = rows.reduce((a, b) => a + b.mark, 0);
    const a     = rows.length ? total / rows.length : 0;
    res.json({ studentId, subject, mark: val, total, average: a.toFixed(1), grade: gr(a) });
  } catch (err) { next(err); }
});

export default router;
