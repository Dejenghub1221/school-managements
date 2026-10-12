import express from 'express';
import { pool, CLS } from '../db/index.js';
import { allow, ownStudentIds, myClasses } from '../API/auth.js';
import { attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// GET /api/attendance
router.get('/', allow('attendance'), async (req, res, next) => {
  try {
    const { date, cls } = req.query;
    const mine = await myClasses(req.user);
    const own  = await ownStudentIds(req.user);

    // Student / parent: return their own attendance history
    if (own) {
      const { rows: history } = await pool.query(
        `SELECT a.date, a.student_id AS "studentId", s.name AS "studentName", a.status
         FROM attendance a JOIN students s ON s.id=a.student_id
         WHERE a.student_id=ANY($1)
         ORDER BY a.date DESC LIMIT 100`,
        [own]
      );
      const c = await attOf(own);
      return res.json({ isFamily: true, stats: { ...c, rate: rate(c) }, history });
    }

    // Teacher: only their classes
    if (cls && (!CLS.includes(cls) || (mine && !mine.includes(cls))))
      return res.status(403).json({ error: "You can't view that class." });

    const targetCls = cls || (mine ? mine[0] : CLS[0]);
    const classList = mine || CLS;

    // Per-class summary
    const classSummary = await Promise.all(classList.map(async cName => {
      const { rows: ids } = await pool.query('SELECT id FROM students WHERE cls=$1', [cName]);
      const a = await attOf(ids.map(r => r.id));
      return { cls: cName, present: a.P, absent: a.A, late: a.L, excused: a.E, rate: rate(a) };
    }));

    // Students list for the target class
    const { rows: students } = await pool.query(
      "SELECT id, name FROM students WHERE cls=$1 AND status='Active' ORDER BY name",
      [targetCls]
    );

    // Attendance records for a specific date
    let records = {};
    if (date) {
      const { rows } = await pool.query(
        'SELECT student_id, status FROM attendance WHERE date=$1', [date]
      );
      rows.forEach(r => { records[r.student_id] = r.status; });
    }

    res.json({ classes: classList, students, records, classSummary });
  } catch (err) { next(err); }
});

// PUT /api/attendance
router.put('/', allow('attendance', 'w'), async (req, res, next) => {
  try {
    const { date, records } = req.body || {};
    const mine = await myClasses(req.user);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || typeof records !== 'object')
      return res.status(400).json({ error: 'Send a date and records.' });

    const client = await pool.connect();
    let saved = 0;
    try {
      await client.query('BEGIN');
      for (const [id, st] of Object.entries(records)) {
        if (!'PALE'.includes(st) || st.length !== 1) continue;
        const { rows } = await client.query('SELECT cls FROM students WHERE id=$1', [id]);
        const s = rows[0];
        if (!s || (mine && !mine.includes(s.cls))) continue;
        await client.query(
          `INSERT INTO attendance (student_id, date, status) VALUES ($1,$2,$3)
           ON CONFLICT (student_id, date) DO UPDATE SET status=EXCLUDED.status`,
          [id, date, st]
        );
        saved++;
      }
      await client.query('COMMIT');
    } catch (err) { await client.query('ROLLBACK'); throw err; }
    finally { client.release(); }

    res.json({ saved });
  } catch (err) { next(err); }
});

export default router;
