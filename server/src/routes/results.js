import express from 'express';
import { db, CLS, SUB } from '../data.js';
import { allow, ownStudentIds, myClasses } from '../API/auth.js';
import { avg, gr } from '../utils/helpers.js';

const router = express.Router();

// GET /api/results
router.get('/', allow('exams'), (req, res) => {
  const mine     = myClasses(req.user);
  const own      = ownStudentIds(req.user);
  const cls      = req.query.cls || (mine ? mine[0] : CLS[0]);
  const students = own
    ? db.students.filter(s => own.includes(s.id))
    : db.students.filter(s => s.cls === cls);

  const rows = students.map(s => {
    const marks = db.marks[s.id] || {};
    const total = Object.values(marks).reduce((a, b) => a + b, 0);
    const a     = avg(s.id);
    return { id: s.id, name: s.name, cls: s.cls, marks, total, average: a.toFixed(1), grade: gr(a) };
  });

  res.json({ cls, classes: mine || CLS, subjects: SUB, students: rows });
});

// PUT /api/results
router.put('/', allow('exams', 'w'), (req, res) => {
  const { studentId, subject, mark } = req.body || {};
  if (!studentId || !subject) return res.status(400).json({ error: 'studentId and subject required.' });
  const val = Math.max(0, Math.min(100, Number(mark) || 0));
  if (!db.marks[studentId]) db.marks[studentId] = {};
  db.marks[studentId][subject] = val;
  const a = avg(studentId);
  res.json({
    studentId, subject, mark: val,
    total:   Object.values(db.marks[studentId]).reduce((x, y) => x + y, 0),
    average: a.toFixed(1),
    grade:   gr(a)
  });
});

export default router;
