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
      `SELECT s.*, p.name AS "guardianName", p.phone AS "guardianPhone"
       FROM students s LEFT JOIN parents p ON p.id=s.guardian
       WHERE s.id=ANY($1)`,
      [own]
    );

    const childrenClasses = [...new Set(students.map(s => s.cls))];

    const children = await Promise.all(students.map(async s => {
      const [fees, marks, a, c] = await Promise.all([
        pool.query('SELECT *, amount::float AS amount, paid::float AS paid FROM fees WHERE student=$1', [s.id]).then(r => r.rows),
        pool.query('SELECT subject, mark, comments FROM marks WHERE student_id=$1', [s.id]).then(r =>
          Object.fromEntries(r.rows.map(m => [m.subject, m.mark]))
        ),
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

    // Problem 5 fix: Students and parents ONLY see exams for their own classes or 'All'
    const { rows: upcomingExams } = await pool.query(
      `SELECT * FROM exams
       WHERE status='Scheduled' AND (cls='All' OR cls=ANY($1))
       ORDER BY date ASC`,
      [childrenClasses.length ? childrenClasses : ['All']]
    );

    // Also get active announcements for this role / class
    const role = req.user.role === 'parent' ? 'Parent' : 'Student';
    const { rows: announcements } = await pool.query(
      `SELECT * FROM announcements
       WHERE (target_role='All' OR target_role=$1)
         AND (cls='All' OR cls=ANY($2))
       ORDER BY created_at DESC LIMIT 5`,
      [role, childrenClasses.length ? childrenClasses : ['All']]
    );

    res.json({ children, upcomingExams, announcements });
  } catch (err) { next(err); }
});

export default router;
