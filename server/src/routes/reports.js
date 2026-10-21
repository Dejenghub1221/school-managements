import express from 'express';
import { pool } from '../db/index.js';
import { allow, myClasses } from '../API/auth.js';
import { gr, attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// GET /api/reports
router.get('/', allow('reports'), async (req, res, next) => {
  try {
    const { tab = 'Students', cls = '' } = req.query;
    const mine = await myClasses(req.user);

    // Teachers are strictly forbidden from viewing fee data (Problem 3)
    if (tab === 'Fees' && req.user.role === 'teacher') {
      return res.status(403).json({ error: 'Teachers are not permitted to view fee reports.' });
    }

    // Build student filter
    const conditions = [];
    const params     = [];
    if (cls)  { params.push(cls);  conditions.push(`s.cls=$${params.length}`); }
    if (mine) { params.push(mine); conditions.push(`s.cls=ANY($${params.length})`); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    if (tab === 'Students') {
      const { rows } = await pool.query(
        `SELECT s.id, s.name, s.cls, s.gender, s.status, p.name AS guardian, p.phone AS guardian_phone
         FROM students s LEFT JOIN parents p ON p.id=s.guardian ${where} ORDER BY s.name`,
        params
      );
      return res.json({
        h: ['ID','Name','Class','Gender','Status','Guardian','Guardian Phone'],
        r: rows.map(s => [s.id, s.name, s.cls, s.gender, s.status, s.guardian || '', s.guardian_phone || ''])
      });
    }

    if (tab === 'Attendance') {
      const { rows: students } = await pool.query(
        `SELECT s.id, s.name, s.cls FROM students s ${where} ORDER BY s.name`, params
      );
      const r = await Promise.all(students.map(async s => {
        const c = await attOf([s.id]);
        return [s.name, s.cls, c.P, c.A, c.L, c.E, rate(c) + '%'];
      }));
      return res.json({ h: ['Student','Class','Present','Absent','Late','Excused','Rate'], r });
    }

    if (tab === 'Academic') {
      const { rows: students } = await pool.query(
        `SELECT s.id, s.name, s.cls FROM students s ${where} ORDER BY s.name`, params
      );
      const r = await Promise.all(students.map(async s => {
        const { rows: mRows } = await pool.query('SELECT mark FROM marks WHERE student_id=$1', [s.id]);
        const total = mRows.reduce((a, b) => a + b.mark, 0);
        const a     = mRows.length ? total / mRows.length : 0;
        return [s.name, s.cls, total, a.toFixed(1), gr(a)];
      }));
      return res.json({ h: ['Student','Class','Total','Average','Grade'], r });
    }

    // Fees tab (Admin only)
    const { rows } = await pool.query(
      `SELECT f.*, s.name AS sname, s.cls FROM fees f
       JOIN students s ON s.id=f.student ${where.replace(/s\./g, 's.')} ORDER BY s.name`,
      params
    );
    res.json({
      h: ['Student','Class','Billed','Paid','Balance','Status'],
      r: rows.map(f => [f.sname, f.cls, Number(f.amount), Number(f.paid), Number(f.amount)-Number(f.paid), f.status])
    });
  } catch (err) { next(err); }
});

export default router;
