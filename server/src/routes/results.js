import express from 'express';
import { pool, CLS, SUB } from '../db/index.js';
import { allow, ownStudentIds, myClasses, mySubject, auditLog } from '../API/auth.js';
import { gr } from '../utils/helpers.js';

const router = express.Router();

// GET /api/results
router.get('/', allow('exams'), async (req, res, next) => {
  try {
    const mine = await myClasses(req.user);
    const own  = await ownStudentIds(req.user);
    const { rows: settRows } = await pool.query('SELECT results_locked, results_published FROM settings WHERE id=1');
    const isLocked = settRows[0]?.results_locked || false;
    const isPublished = settRows[0]?.results_published || false;

    let studentRows;
    let allowedClasses = CLS;

    if (own) {
      // Student or Parent: strictly limited to their own student(s)
      const { rows } = await pool.query('SELECT * FROM students WHERE id=ANY($1) ORDER BY name', [own]);
      studentRows = rows;
      allowedClasses = [...new Set(rows.map(s => s.cls))];
    } else if (mine) {
      // Teacher: only students in their classes
      allowedClasses = mine;
      const cls = req.query.cls && mine.includes(req.query.cls) ? req.query.cls : mine[0];
      const { rows } = await pool.query('SELECT * FROM students WHERE cls=$1 ORDER BY name', [cls]);
      studentRows = rows;
    } else {
      // Admin: all classes
      const cls = req.query.cls || CLS[0];
      const { rows } = await pool.query('SELECT * FROM students WHERE cls=$1 ORDER BY name', [cls]);
      studentRows = rows;
    }

    const tSub = req.user.role === 'teacher' ? await mySubject(req.user) : null;

    const rows = await Promise.all(studentRows.map(async s => {
      const { rows: mRows } = await pool.query(
        'SELECT subject, mark, comments FROM marks WHERE student_id=$1', [s.id]
      );
      const marks = Object.fromEntries(mRows.map(m => [m.subject, m.mark]));
      const comments = Object.fromEntries(mRows.filter(m => m.comments).map(m => [m.subject, m.comments]));
      const total = Object.values(marks).reduce((a, b) => a + b, 0);
      const a     = mRows.length ? total / mRows.length : 0;
      return {
        id: s.id,
        name: s.name,
        cls: s.cls,
        marks,
        comments,
        total,
        average: a.toFixed(1),
        grade: gr(a)
      };
    }));

    const currentCls = req.query.cls || (allowedClasses.length ? allowedClasses[0] : CLS[0]);

    res.json({
      cls: currentCls,
      classes: allowedClasses,
      subjects: SUB,
      teacherSubject: tSub,
      isLocked,
      isPublished,
      students: rows
    });
  } catch (err) { next(err); }
});

// PUT /api/results - update mark
router.put('/', allow('exams', 'w'), async (req, res, next) => {
  try {
    const { studentId, subject, mark, comment } = req.body || {};
    if (!studentId || !subject) return res.status(400).json({ error: 'studentId and subject required.' });

    // Check if results are locked by admin
    const { rows: settRows } = await pool.query('SELECT results_locked FROM settings WHERE id=1');
    if (settRows[0]?.results_locked && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Results are currently locked by administration.' });
    }

    // Teacher write access constraints
    if (req.user.role === 'teacher') {
      const tSub = await mySubject(req.user);
      if (tSub && tSub !== subject) {
        return res.status(403).json({ error: `Teachers can only edit marks for their own subject (${tSub}).` });
      }

      // Check student is in teacher's class
      const mine = await myClasses(req.user);
      const { rows: sRows } = await pool.query('SELECT cls FROM students WHERE id=$1', [studentId]);
      if (!sRows.length || (mine && !mine.includes(sRows[0].cls))) {
        return res.status(403).json({ error: "You cannot edit marks for students outside your classes." });
      }
    }

    const val = Math.max(0, Math.min(100, Number(mark) || 0));

    await pool.query(
      `INSERT INTO marks (student_id, subject, mark, comments) VALUES ($1,$2,$3,$4)
       ON CONFLICT (student_id, subject) DO UPDATE SET
         mark = EXCLUDED.mark,
         comments = COALESCE(EXCLUDED.comments, marks.comments)`,
      [studentId, subject, val, comment || null]
    );

    // Audit log
    await auditLog(req.user.username, req.user.role, 'UPDATE_MARK', 'marks', `${studentId}_${subject}`, {
      studentId, subject, mark: val, comment
    });

    const { rows } = await pool.query('SELECT subject, mark, comments FROM marks WHERE student_id=$1', [studentId]);
    const total = rows.reduce((a, b) => a + b.mark, 0);
    const a     = rows.length ? total / rows.length : 0;
    res.json({ studentId, subject, mark: val, comment, total, average: a.toFixed(1), grade: gr(a) });
  } catch (err) { next(err); }
});

// POST /api/results/lock - admin locks or publishes results
router.post('/lock', allow('settings', 'w'), async (req, res, next) => {
  try {
    const { locked, published } = req.body || {};
    await pool.query(
      `UPDATE settings SET
         results_locked = COALESCE($1, results_locked),
         results_published = COALESCE($2, results_published)
       WHERE id = 1`,
      [locked !== undefined ? Boolean(locked) : null, published !== undefined ? Boolean(published) : null]
    );

    await auditLog(req.user.username, req.user.role, 'UPDATE_RESULTS_STATUS', 'settings', '1', { locked, published });

    const { rows } = await pool.query('SELECT results_locked, results_published FROM settings WHERE id=1');
    res.json(rows[0]);
  } catch (err) { next(err); }
});

export default router;
