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

    // Load teaching assignments and teachers with cover awareness
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
      pool.query('SELECT id, name, subject, classes, status FROM teachers ORDER BY name ASC')
    ]);

    const assignments = tAssignmentsRes.rows;
    const allTeachers = teachersRes.rows;
    const teachersList = allTeachers.map(t => ({ id: t.id, name: t.name, subject: t.subject, classes: t.classes || [] }));

    // If teacherId requested, render timetable from teacher's perspective
    if (req.query.teacherId) {
      const targetTeacher = allTeachers.find(t => t.id === req.query.teacherId) || allTeachers[0];
      const tClasses = targetTeacher?.classes?.length ? targetTeacher.classes : ['7A', '8A', '8B'];
      const tSubject = targetTeacher?.subject || 'General';

      const tRows = [];
      for (let p = 0; p < 6; p++) {
        if (p === 3) {
          tRows.push({
            time: 'Break<br><small>11:00</small>',
            isBreak: true,
            days: days.map(() => ({ subject: 'Staff Break / Consultation', cls: '—', room: 'Staff Room' }))
          });
        }
        const hour = 8 + p + (p > 2 ? 1 : 0);
        const periodDays = days.map((dayName, d) => {
          // Determine if teacher has a class assigned in this slot
          const slotNum = (d * 2 + p);
          const hasClass = (slotNum % 4) !== 0; // realistic distribution with some free prep periods
          const cName = tClasses[(slotNum + d) % tClasses.length];
          const room = `Room 10${(p % 4) + 1}`;

          if (!hasClass) {
            return {
              subject: 'Planning / Prep Period',
              cls: '—',
              room: 'Dept Office',
              isFree: true
            };
          }
          return {
            subject: tSubject,
            cls: cName,
            room,
            isFree: false
          };
        });
        tRows.push({
          time: `Period ${p + 1}<br><small>${hour}:00</small>`,
          isBreak: false,
          days: periodDays
        });
      }

      return res.json({
        mode: 'teacher',
        teacherId: targetTeacher?.id,
        teacherName: targetTeacher?.name,
        teacherSubject: targetTeacher?.subject,
        teachers: teachersList,
        classes: mine || CLS,
        days,
        rows: tRows
      });
    }

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

    res.json({ mode: 'class', cls, classes: mine || CLS, teachers: teachersList, days, rows });
  } catch (err) { next(err); }
});

export default router;
