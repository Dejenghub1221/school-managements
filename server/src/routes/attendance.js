import express from 'express';
import { db, CLS } from '../data.js';
import { allow, ownStudentIds, myClasses } from '../API/auth.js';
import { attOf, rate, studentName } from '../utils/helpers.js';

const router = express.Router();

// GET /api/attendance
router.get('/', allow('attendance'), (req, res) => {
  const { date, cls } = req.query;
  const mine = myClasses(req.user);
  const own  = ownStudentIds(req.user);

  if (own) {
    const ds = Object.keys(db.attendance).sort().reverse().slice(0, 10);
    const history = [];
    own.forEach(id => {
      ds.forEach(d => {
        const x = db.attendance[d]?.[id];
        if (x) history.push({ date: d, studentId: id, studentName: studentName(id), status: x });
      });
    });
    const c = attOf(own);
    return res.json({ isFamily: true, stats: { ...c, rate: rate(c) }, history });
  }

  if (cls && (!CLS.includes(cls) || (mine && !mine.includes(cls)))) {
    return res.status(403).json({ error: "You can't view that class." });
  }

  const targetCls    = cls || (mine ? mine[0] : CLS[0]);
  const classSummary = (mine || CLS).map(cName => {
    const ids = db.students.filter(s => s.cls === cName).map(s => s.id);
    const a   = attOf(ids);
    return { cls: cName, present: a.P, absent: a.A, late: a.L, excused: a.E, rate: rate(a) };
  });

  res.json({
    classes:  mine || CLS,
    students: db.students.filter(s => s.cls === targetCls && s.status === 'Active').map(({ id, name }) => ({ id, name })),
    records:  date ? (db.attendance[date] || {}) : {},
    classSummary
  });
});

// PUT /api/attendance
router.put('/', allow('attendance', 'w'), (req, res) => {
  const { date, records } = req.body || {};
  const mine = myClasses(req.user);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || typeof records !== 'object') {
    return res.status(400).json({ error: 'Send a date and records.' });
  }
  const ok = {};
  for (const [id, st] of Object.entries(records)) {
    const s = db.students.find(x => x.id === id);
    if (s && 'PALE'.includes(st) && st.length === 1 && (!mine || mine.includes(s.cls))) {
      ok[id] = st;
    }
  }
  db.attendance[date] = { ...(db.attendance[date] || {}), ...ok };
  res.json({ saved: Object.keys(ok).length });
});

export default router;
