import express from 'express';
import { db, CLS, SUB } from '../data.js';
import { allow, myClasses } from '../API/auth.js';

const router = express.Router();

// GET /api/timetable
router.get('/', allow('timetable'), (req, res) => {
  const mine = myClasses(req.user);
  const cls  = req.query.cls || (mine ? mine[0] : CLS[0]);
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const ci   = CLS.indexOf(cls) >= 0 ? CLS.indexOf(cls) : 0;
  const rows = [];

  for (let p = 0; p < 6; p++) {
    if (p === 3) {
      rows.push({
        time:    'Break<br><small>11:00</small>',
        isBreak: true,
        days:    days.map(() => ({ subject: '—', teacher: '' }))
      });
    }
    const hour       = 8 + p + (p > 2 ? 1 : 0);
    const periodDays = days.map((_, d) => {
      const s = SUB[(d * 2 + p + ci) % 6];
      const t = db.teachers.find(x => x.subject === s);
      return { subject: s, teacher: t ? t.name : 'Unassigned' };
    });
    rows.push({ time: `Period ${p + 1}<br><small>${hour}:00</small>`, isBreak: false, days: periodDays });
  }

  res.json({ cls, classes: mine || CLS, days, rows });
});

export default router;
