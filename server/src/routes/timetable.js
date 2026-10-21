import express from 'express';
import { pool, CLS, SUB } from '../db/index.js';
import { allow, myClasses } from '../API/auth.js';

const router = express.Router();

// GET /api/timetable
router.get('/', allow('timetable'), async (req, res, next) => {
  try {
    const mine = await myClasses(req.user);
    const cls  = req.query.cls || (mine ? mine[0] : CLS[0]);
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const ci   = CLS.indexOf(cls) >= 0 ? CLS.indexOf(cls) : 0;

    // Load teaching assignments and teachers with cover awareness (Problem 6)
    const [tAssignmentsRes, teachersRes] = await Promise.all([
      pool.query(
        `SELECT ta.cls, ta.subject, ta.teacher_id, ta.is_cover, ta.cover_for,
                t.name AS teacher_name, t.status AS teacher_status,
                ct.name AS cover_teacher_name
         FROM teaching_assignments ta
         LEFT JOIN teachers t ON t.id = ta.teacher_id
         LEFT JOIN teachers ct ON ct.id = ta.cover_for
         WHERE ta.cls = $1`,
        [cls]
      ),
      pool.query('SELECT id, name, subject, classes, status FROM teachers')
    ]);

    const assignments = tAssignmentsRes.rows;
    const allTeachers = teachersRes.rows;

    const rows = [];
    for (let p = 0; p < 6; p++) {
      if (p === 3) {
        rows.push({
          time: 'Break<br><small>11:00</small>',
          isBreak: true,
          days: days.map(() => ({ subject: '—', teacher: '' }))
        });
      }
      const hour = 8 + p + (p > 2 ? 1 : 0);
      const periodDays = days.map((_, d) => {
        const s = SUB[(d * 2 + p + ci) % 6];

        // 1. Check exact class + subject teaching assignment
        const matchAssign = assignments.find(a => a.subject === s);
        let teacherName = 'Unassigned';

        if (matchAssign) {
          if (matchAssign.teacher_status === 'On leave' && matchAssign.cover_teacher_name) {
            teacherName = `${matchAssign.cover_teacher_name} (Cover)`;
          } else {
            teacherName = matchAssign.teacher_name || 'Unassigned';
          }
        } else {
          // 2. Check teacher assigned to this specific class and subject
          const matchedTeacher = allTeachers.find(t => t.subject === s && (t.classes || []).includes(cls));
          if (matchedTeacher) {
            teacherName = matchedTeacher.status === 'On leave' ? `${matchedTeacher.name} (On leave)` : matchedTeacher.name;
          } else {
            // 3. Fallback to any teacher of this subject
            const fallback = allTeachers.find(t => t.subject === s);
            teacherName = fallback ? fallback.name : 'Unassigned';
          }
        }

        return { subject: s, teacher: teacherName };
      });
      rows.push({ time: `Period ${p + 1}<br><small>${hour}:00</small>`, isBreak: false, days: periodDays });
    }

    res.json({ cls, classes: mine || CLS, days, rows });
  } catch (err) { next(err); }
});

export default router;
