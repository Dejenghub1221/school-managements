import express from 'express';
import { db } from '../data.js';
import { allow, ownStudentIds } from '../API/auth.js';
import { studentName } from '../utils/helpers.js';

const router = express.Router();

// GET /api/payments
router.get('/', allow('fees'), (req, res) => {
  const own = ownStudentIds(req.user);
  let list = [...db.payments];
  if (own) list = list.filter(p => own.includes(p.studentId));
  list.sort((a, b) => b.date.localeCompare(a.date));
  res.json(list.map(p => ({ ...p, studentName: studentName(p.studentId) })));
});

export default router;
