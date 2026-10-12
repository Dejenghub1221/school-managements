import express from 'express';
import { db } from '../data.js';
import { allow, ownStudentIds } from '../API/auth.js';
import { avg, gr, attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// GET /api/students/:id/profile
router.get('/:id/profile', allow('students'), (req, res) => {
  const s = db.students.find(x => x.id === req.params.id);
  const own = ownStudentIds(req.user);
  if (!s || (own && !own.includes(s.id))) {
    return res.status(404).json({ error: 'Student not found.' });
  }
  const c        = attOf([s.id]);
  const a        = avg(s.id);
  const fees     = db.fees.filter(f => f.student === s.id);
  const guardian = db.parents.find(p => p.id === s.guardian);
  res.json({
    student:    s,
    guardian,
    attendance: { ...c, rate: rate(c) },
    academic:   { average: a, grade: gr(a), marks: db.marks[s.id] || {} },
    fees
  });
});

export default router;
