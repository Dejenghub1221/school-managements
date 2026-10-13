import express from 'express';
import { pool } from '../db/index.js';
import { allow, ownStudentIds } from '../API/auth.js';
import { avg, gr, attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// GET /api/stats — admin / teacher dashboard
router.get('/stats', allow('dashboard'), async (req, res, next) => {
  try {
    if (await ownStudentIds(req.user)) return res.status(403).json({ error: 'Use /api/overview.' });

    const [students, teachers, classes, assignments, exams, fees, payments, marks, attendance] = await Promise.all([
      pool.query('SELECT COUNT(*)::int AS c FROM students'),
      pool.query('SELECT COUNT(*)::int AS c FROM teachers'),
      pool.query('SELECT COUNT(*)::int AS c FROM classes'),
      pool.query("SELECT COUNT(*)::int AS c FROM assignments WHERE status='Open'"),
      pool.query("SELECT * FROM exams WHERE status='Scheduled'"),
      pool.query('SELECT SUM(amount)::float AS billed, SUM(paid)::float AS collected FROM fees'),
      pool.query(`SELECT p.*, s.name AS student_name FROM payments p
                  JOIN students s ON s.id=p.student_id
                  ORDER BY p.date DESC LIMIT 5`),
      pool.query('SELECT student_id, AVG(mark)::float AS avg FROM marks GROUP BY student_id'),
      pool.query(`SELECT date, status, COUNT(*)::int AS cnt FROM attendance
                  WHERE date::date >= CURRENT_DATE - INTERVAL '30 days'
                  GROUP BY date, status ORDER BY date`)
    ]);

    // Grade distribution
    const gd = { A: 0, B: 0, C: 0, D: 0, F: 0 };
    marks.rows.forEach(r => { gd[gr(r.avg)]++; });

    // Attendance % per day (last 5 school days)
    const byDay = {};
    attendance.rows.forEach(r => {
      if (!byDay[r.date]) byDay[r.date] = { P: 0, A: 0, L: 0, E: 0 };
      byDay[r.date][r.status] = r.cnt;
    });
    const attDays = Object.entries(byDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-5)
      .map(([date, c]) => {
        const total = c.P + c.A + c.L + c.E;
        return { date, pct: total ? Math.round(((c.P + c.L) / total) * 100) : 0 };
      });

    res.json({
      students:         students.rows[0].c,
      teachers:         teachers.rows[0].c,
      classes:          classes.rows[0].c,
      openAssignments:  assignments.rows[0].c,
      upcomingExams:    exams.rows.length,
      upcomingExamsList: exams.rows,
      billed:           fees.rows[0].billed   || 0,
      collected:        fees.rows[0].collected || 0,
      attendance:       attDays,
      gradeDistribution: gd,
      recentPayments:   payments.rows.map(p => ({
        receipt: p.receipt_id || p.id,
        student: p.student_name,
        date:    p.date,
        amount:  Number(p.amount)
      }))
    });
  } catch (err) { next(err); }
});

// GET /api/overview — student / parent dashboard
router.get('/overview', allow('dashboard'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (!own) return res.status(403).json({ error: 'Use /api/stats.' });

    const { rows: students } = await pool.query(
      `SELECT s.*, p.name AS "guardianName"
       FROM students s LEFT JOIN parents p ON p.id=s.guardian
       WHERE s.id=ANY($1)`,
      [own]
    );

    const children = await Promise.all(students.map(async s => {
      const [fees, marks, a, c] = await Promise.all([
        pool.query('SELECT *, amount::float AS amount, paid::float AS paid FROM fees WHERE student=$1', [s.id]).then(r => r.rows),
        pool.query('SELECT subject, mark FROM marks WHERE student_id=$1', [s.id]).then(r => Object.fromEntries(r.rows.map(m => [m.subject, m.mark]))),
        avg(s.id),
        attOf([s.id])
      ]);
      return {
        ...s,
        fees,
        attendance: { ...c, rate: rate(c) },
        academic:   { average: a, grade: gr(a), marks }
      };
    }));

    const { rows: upcomingExams } = await pool.query("SELECT * FROM exams WHERE status='Scheduled'");
    res.json({ children, upcomingExams });
  } catch (err) { next(err); }
});

export default router;
