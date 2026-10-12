import express from 'express';
import { db } from '../data.js';
import { allow, ownStudentIds } from '../API/auth.js';
import { avg, gr, attOf, rate, studentName, parentName } from '../utils/helpers.js';

const router = express.Router();

// GET /api/stats  — admin / teacher dashboard
router.get('/stats', allow('dashboard'), (req, res) => {
  if (ownStudentIds(req.user)) return res.status(403).json({ error: 'Use /api/overview.' });
  const days = Object.keys(db.attendance).sort().slice(-5);
  const pct  = d => {
    const v = Object.values(db.attendance[d]);
    return v.length ? Math.round((v.filter(x => x === 'P' || x === 'L').length / v.length) * 100) : 0;
  };
  const sum = f => db.fees.reduce((a, b) => a + b[f], 0);
  const gd  = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  db.students.forEach(s => { gd[gr(avg(s.id))]++; });
  const up = db.exams.filter(e => e.status === 'Scheduled');
  const recentPayments = [...db.payments]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map(p => ({ receipt: p.receiptId || p.id, student: studentName(p.studentId), date: p.date, amount: p.amount }));

  res.json({
    students: db.students.length, teachers: db.teachers.length, classes: db.classes.length,
    openAssignments:  db.assignments.filter(a => a.status === 'Open').length,
    upcomingExams:    up.length,
    upcomingExamsList: up,
    billed:    sum('amount'),
    collected: sum('paid'),
    attendance:        days.map(date => ({ date, pct: pct(date) })),
    gradeDistribution: gd,
    recentPayments
  });
});

// GET /api/overview  — student / parent dashboard
router.get('/overview', allow('dashboard'), (req, res) => {
  const own = ownStudentIds(req.user);
  if (!own) return res.status(403).json({ error: 'Use /api/stats.' });
  const children = db.students.filter(s => own.includes(s.id)).map(s => {
    const c = attOf([s.id]);
    const a = avg(s.id);
    return {
      ...s,
      guardianName: parentName(s.guardian),
      fees:         db.fees.filter(f => f.student === s.id),
      attendance:   { ...c, rate: rate(c) },
      academic:     { average: a, grade: gr(a), marks: db.marks[s.id] || {} }
    };
  });
  const up = db.exams.filter(e => e.status === 'Scheduled');
  res.json({ children, upcomingExams: up });
});

export default router;
