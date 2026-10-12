import express from 'express';
import { pool } from '../db/index.js';
import { allow, ownStudentIds } from '../API/auth.js';

const router = express.Router();

// GET /api/payments
router.get('/', allow('fees'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    let sql = `SELECT p.*, s.name AS "studentName"
               FROM payments p
               JOIN students s ON s.id = p.student_id
               ORDER BY p.date DESC`;
    let params = [];
    if (own) {
      sql = `SELECT p.*, s.name AS "studentName"
             FROM payments p
             JOIN students s ON s.id = p.student_id
             WHERE p.student_id = ANY($1)
             ORDER BY p.date DESC`;
      params = [own];
    }
    const { rows } = await pool.query(sql, params);
    // normalise snake_case → camelCase for frontend compatibility
    res.json(rows.map(r => ({
      id:          r.id,
      receiptId:   r.receipt_id,
      studentId:   r.student_id,
      studentName: r.studentName,
      date:        r.date,
      amount:      Number(r.amount)
    })));
  } catch (err) { next(err); }
});

export default router;
