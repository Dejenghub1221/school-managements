import express from 'express';
import { db } from '../data.js';
import { allow, myClasses } from '../API/auth.js';
import { avg, gr, attOf, rate, studentName, parentName } from '../utils/helpers.js';

const router = express.Router();

// GET /api/reports
router.get('/', allow('reports'), (req, res) => {
  const { tab = 'Students', cls = '' } = req.query;
  const mine = myClasses(req.user);
  const l    = db.students.filter(s => (!cls || s.cls === cls) && (!mine || mine.includes(s.cls)));

  if (tab === 'Students') {
    return res.json({
      h: ['ID', 'Name', 'Class', 'Gender', 'Status', 'Guardian'],
      r: l.map(s => [s.id, s.name, s.cls, s.gender, s.status, parentName(s.guardian)])
    });
  }
  if (tab === 'Attendance') {
    return res.json({
      h: ['Student', 'Class', 'Present', 'Absent', 'Late', 'Excused', 'Rate'],
      r: l.map(s => { const c = attOf([s.id]); return [s.name, s.cls, c.P, c.A, c.L, c.E, rate(c) + '%']; })
    });
  }
  if (tab === 'Academic') {
    return res.json({
      h: ['Student', 'Class', 'Total', 'Average', 'Grade'],
      r: l.map(s => {
        const total = Object.values(db.marks[s.id] || {}).reduce((a, b) => a + b, 0);
        const a     = avg(s.id);
        return [s.name, s.cls, total, a.toFixed(1), gr(a)];
      })
    });
  }
  // Fees tab
  res.json({
    h: ['Student', 'Class', 'Billed', 'Paid', 'Balance', 'Status'],
    r: db.fees
      .filter(f => l.some(s => s.id === f.student))
      .map(f => {
        const s = db.students.find(x => x.id === f.student);
        return [studentName(f.student), s ? s.cls : '', f.amount, f.paid, f.amount - f.paid, f.status];
      })
  });
});

export default router;
