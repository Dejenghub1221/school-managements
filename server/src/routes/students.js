import express from 'express';
import { pool } from '../db/index.js';
import { allow, ownStudentIds, myClasses } from '../API/auth.js';
import { avg, gr, attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// GET /api/students/:id/profile
router.get('/:id/profile', allow('students'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (own && !own.includes(req.params.id))
      return res.status(404).json({ error: 'Student not found.' });

    const mine = await myClasses(req.user);

    const { rows: sRows } = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    const s = sRows[0];
    if (!s) return res.status(404).json({ error: 'Student not found.' });

    // If teacher, check that student belongs to their classes
    if (mine && !mine.includes(s.cls)) {
      return res.status(403).json({ error: "You cannot view students outside your classes." });
    }

    // Guardian information (support both student_parents and direct guardian)
    const { rows: guardRows } = await pool.query(
      `SELECT p.id, p.name, p.phone, p.email, sp.relationship
       FROM parents p
       LEFT JOIN student_parents sp ON sp.parent_id=p.id AND sp.student_id=$1
       WHERE p.id=$2 OR sp.student_id=$1
       LIMIT 1`,
      [s.id, s.guardian]
    );
    const guardian = guardRows[0] || null;

    // Fees: ONLY for Admin, Student, and Parent. NEVER for Teacher (Problem 3)
    let fees = null;
    if (req.user.role !== 'teacher') {
      const { rows: fRows } = await pool.query('SELECT * FROM fees WHERE student=$1 ORDER BY id', [s.id]);
      fees = fRows.map(f => ({ ...f, amount: Number(f.amount), paid: Number(f.paid) }));
    }

    const [marks, a, c] = await Promise.all([
      pool.query('SELECT subject, mark, comments FROM marks WHERE student_id=$1', [s.id]).then(r =>
        Object.fromEntries(r.rows.map(m => [m.subject, { mark: m.mark, comment: m.comments }]))
      ),
      avg(s.id),
      attOf([s.id])
    ]);

    const marksMap = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.mark]));
    const commentsMap = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.comment]));

    res.json({
      student:    s,
      guardian,
      attendance: { ...c, rate: rate(c) },
      academic:   { average: a, grade: gr(a), marks: marksMap, comments: commentsMap },
      fees        // Will be null for teachers
    });
  } catch (err) { next(err); }
});

// GET /api/students/:id/report-card
router.get('/:id/report-card', allow('exams'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (own && !own.includes(req.params.id))
      return res.status(403).json({ error: 'Access denied.' });

    const mine = await myClasses(req.user);

    const { rows: sRows } = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    const student = sRows[0];
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    if (mine && !mine.includes(student.cls)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const [settingsRes, marksRes, attRes] = await Promise.all([
      pool.query('SELECT * FROM settings WHERE id=1'),
      pool.query('SELECT subject, mark, comments FROM marks WHERE student_id=$1', [student.id]),
      attOf([student.id])
    ]);

    const settings = settingsRes.rows[0] || {};
    const marks = marksRes.rows;
    const total = marks.reduce((acc, m) => acc + (m.mark || 0), 0);
    const avgScore = marks.length ? (total / marks.length).toFixed(1) : '0';

    res.json({
      school: settings.school || 'ABC Academy',
      academicYear: settings.year || '2026/27',
      isPublished: settings.results_published || false,
      student,
      marks: marks.map(m => ({
        subject: m.subject,
        mark: m.mark,
        grade: gr(m.mark),
        comment: m.comments || ''
      })),
      total,
      average: avgScore,
      finalGrade: gr(Number(avgScore)),
      attendance: { ...attRes, rate: rate(attRes) }
    });
  } catch (err) { next(err); }
});

export default router;
