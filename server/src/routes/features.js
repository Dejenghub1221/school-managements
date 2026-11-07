import express from 'express';
import bcrypt from 'bcryptjs';
import { pool, CLS, feeStatus } from '../db/index.js';
import { allow, ownStudentIds, myClasses, auditLog } from '../API/auth.js';

const router = express.Router();

// ── Submissions ─────────────────────────────────────────────────────────────
// GET /api/submissions
router.get('/submissions', async (req, res, next) => {
  try {
    const { assignmentId } = req.query;
    const own = await ownStudentIds(req.user);

    if (own) {
      const { rows } = await pool.query(
        `SELECT sub.*, a.title AS "assignmentTitle", a.due, a.subject, a.cls, s.name AS "studentName"
         FROM submissions sub
         JOIN assignments a ON a.id = sub.assignment_id
         JOIN students s ON s.id = sub.student_id
         WHERE sub.student_id = ANY($1) ${assignmentId ? 'AND sub.assignment_id = $2' : ''}
         ORDER BY sub.submitted_at DESC`,
        assignmentId ? [own, assignmentId] : [own]
      );
      return res.json(rows);
    }

    // Teacher or Admin
    if (!assignmentId) {
      const { rows } = await pool.query(
        `SELECT sub.*, a.title AS "assignmentTitle", s.name AS "studentName", a.cls
         FROM submissions sub
         JOIN assignments a ON a.id = sub.assignment_id
         JOIN students s ON s.id = sub.student_id
         ORDER BY sub.submitted_at DESC LIMIT 100`
      );
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT sub.*, s.name AS "studentName", a.title AS "assignmentTitle"
       FROM submissions sub
       JOIN students s ON s.id = sub.student_id
       JOIN assignments a ON a.id = sub.assignment_id
       WHERE sub.assignment_id = $1
       ORDER BY sub.submitted_at DESC`,
      [assignmentId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/submissions — student submits
router.post('/submissions', async (req, res, next) => {
  try {
    if (req.user.role !== 'student' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only students can submit assignments.' });
    }
    const { assignmentId, content, fileName, fileData } = req.body || {};
    const studentId = req.user.studentId || req.body.studentId;
    if (!assignmentId || !studentId) {
      return res.status(400).json({ error: 'assignmentId and studentId are required.' });
    }

    const subId = `SUB_${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(
      `INSERT INTO submissions (id, assignment_id, student_id, content, file_name, file_data, submitted_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'Submitted')
       ON CONFLICT (assignment_id, student_id) DO UPDATE SET
         content = EXCLUDED.content,
         file_name = EXCLUDED.file_name,
         file_data = EXCLUDED.file_data,
         submitted_at = NOW(),
         status = 'Submitted'
       RETURNING *`,
      [subId, assignmentId, studentId, content || '', fileName || '', fileData || null]
    );

    await auditLog(req.user.username, req.user.role, 'SUBMIT_ASSIGNMENT', 'submissions', subId, { assignmentId, studentId, fileName });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/submissions/:id/grade — teacher grades
router.put('/submissions/:id/grade', allow('assignments', 'w'), async (req, res, next) => {
  try {
    const { grade, feedback } = req.body || {};
    const numGrade = Number(grade);
    if (isNaN(numGrade) || numGrade < 0 || numGrade > 100) {
      return res.status(400).json({ error: 'Grade must be between 0 and 100.' });
    }

    const { rows } = await pool.query(
      `UPDATE submissions
       SET grade = $1, feedback = $2, status = 'Graded'
       WHERE id = $3
       RETURNING *`,
      [numGrade, feedback || '', req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Submission not found.' });

    await auditLog(req.user.username, req.user.role, 'GRADE_SUBMISSION', 'submissions', req.params.id, { grade: numGrade, feedback });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Absence Reports ─────────────────────────────────────────────────────────
// POST /api/absences — parent reports absence in advance
router.post('/absences', async (req, res, next) => {
  try {
    if (req.user.role !== 'parent' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only parents can report absences in advance.' });
    }
    const { studentId, date, reason } = req.body || {};
    if (!studentId || !date || !reason) {
      return res.status(400).json({ error: 'studentId, date, and reason are required.' });
    }

    const parentId = req.user.parentId || req.body.parentId || 'P01';
    const id = `ABS_${Date.now().toString().slice(-6)}`;

    const { rows } = await pool.query(
      `INSERT INTO absence_reports (id, student_id, parent_id, date, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'Reported')
       RETURNING *`,
      [id, studentId, parentId, date, reason]
    );

    await auditLog(req.user.username, req.user.role, 'REPORT_ABSENCE', 'absence_reports', id, { studentId, date, reason });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// GET /api/absences
router.get('/absences', async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    const mine = await myClasses(req.user);

    if (own) {
      const { rows } = await pool.query(
        `SELECT ar.*, s.name AS "studentName", s.cls
         FROM absence_reports ar
         JOIN students s ON s.id = ar.student_id
         WHERE ar.student_id = ANY($1)
         ORDER BY ar.date DESC`,
        [own]
      );
      return res.json(rows);
    }

    if (mine) {
      const { rows } = await pool.query(
        `SELECT ar.*, s.name AS "studentName", s.cls, p.name AS "parentName", p.phone AS "parentPhone"
         FROM absence_reports ar
         JOIN students s ON s.id = ar.student_id
         JOIN parents p ON p.id = ar.parent_id
         WHERE s.cls = ANY($1)
         ORDER BY ar.date DESC LIMIT 50`,
        [mine]
      );
      return res.json(rows);
    }

    // Admin
    const { rows } = await pool.query(
      `SELECT ar.*, s.name AS "studentName", s.cls, p.name AS "parentName", p.phone AS "parentPhone"
       FROM absence_reports ar
       JOIN students s ON s.id = ar.student_id
       JOIN parents p ON p.id = ar.parent_id
       ORDER BY ar.date DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Announcements ───────────────────────────────────────────────────────────
// GET /api/announcements
router.get('/announcements', async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    const mine = await myClasses(req.user);

    if (own) {
      const { rows: stus } = await pool.query('SELECT cls FROM students WHERE id=ANY($1)', [own]);
      const classes = stus.map(s => s.cls);
      const role = req.user.role === 'parent' ? 'Parent' : 'Student';
      const { rows } = await pool.query(
        `SELECT * FROM announcements
         WHERE (target_role='All' OR target_role=$1)
           AND (cls='All' OR cls=ANY($2))
         ORDER BY created_at DESC LIMIT 20`,
        [role, classes.length ? classes : ['All']]
      );
      return res.json(rows);
    }

    if (mine) {
      const { rows } = await pool.query(
        `SELECT * FROM announcements
         WHERE target_role='All' OR target_role='Teacher' OR cls='All' OR cls=ANY($1)
         ORDER BY created_at DESC LIMIT 30`,
        [mine]
      );
      return res.json(rows);
    }

    // Admin sees all
    const { rows } = await pool.query('SELECT * FROM announcements ORDER BY created_at DESC LIMIT 50');
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/announcements
router.post('/announcements', async (req, res, next) => {
  try {
    const { title, content, targetRole = 'All', cls = 'All' } = req.body || {};
    if (!title || !content) return res.status(400).json({ error: 'Title and content are required.' });

    // Teachers can only post class announcements
    if (req.user.role === 'teacher') {
      const mine = await myClasses(req.user);
      if (cls === 'All' || !mine.includes(cls)) {
        return res.status(403).json({ error: 'Teachers can only post announcements for their own classes.' });
      }
    } else if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators and teachers can post announcements.' });
    }

    const id = `ANN_${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(
      `INSERT INTO announcements (id, title, content, target_role, cls, author_role, author_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, title, content, targetRole, cls, req.user.role, req.user.name || req.user.username]
    );

    await auditLog(req.user.username, req.user.role, 'POST_ANNOUNCEMENT', 'announcements', id, { title, cls });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/announcements/:id
router.delete('/announcements/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can delete announcements.' });
    }
    await pool.query('DELETE FROM announcements WHERE id=$1', [req.params.id]);
    res.status(204).end();
  } catch (err) { next(err); }
});

// ── Teacher Leave Requests & Cover ──────────────────────────────────────────
// GET /api/leave-requests
router.get('/leave-requests', async (req, res, next) => {
  try {
    if (req.user.role === 'teacher') {
      let tid = req.user.teacherId;
      if (!tid) {
        const u = await pool.query('SELECT teacher_id FROM users WHERE username = $1', [req.user.username]);
        tid = u.rows[0]?.teacher_id;
      }
      if (!tid) {
        const tMatch = await pool.query('SELECT id FROM teachers WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2)', [req.user.name || '', req.user.email || '']);
        tid = tMatch.rows[0]?.id;
      }

      const { rows } = await pool.query(
        `SELECT lr.*, t.name AS "teacherName", t.subject AS "teacherSubject", ct.name AS "coverTeacherName"
         FROM leave_requests lr
         LEFT JOIN teachers t ON t.id = lr.teacher_id
         LEFT JOIN teachers ct ON ct.id = lr.cover_teacher_id
         WHERE lr.teacher_id = $1
         ORDER BY lr.created_at DESC`,
        [tid || '__none__']
      );
      return res.json(rows);
    }

    if (req.user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT lr.*, t.name AS "teacherName", t.subject AS "teacherSubject", ct.name AS "coverTeacherName"
         FROM leave_requests lr
         LEFT JOIN teachers t ON t.id = lr.teacher_id
         LEFT JOIN teachers ct ON ct.id = lr.cover_teacher_id
         ORDER BY lr.created_at DESC`
      );
      return res.json(rows);
    }

    res.status(403).json({ error: 'Not allowed.' });
  } catch (err) { next(err); }
});

// POST /api/leave-requests — teacher or admin requests leave
router.post('/leave-requests', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers and administrators can submit leave requests.' });
    }
    const {
      startDate,
      endDate,
      reason,
      leaveType = 'Sick / Medical',
      emergencyContact = '',
      handoverNotes = '',
      teacherId: bodyTeacherId
    } = req.body || {};

    let targetTeacherId = null;
    if (req.user.role === 'admin') {
      targetTeacherId = bodyTeacherId || req.user.teacherId;
      if (!targetTeacherId) {
        return res.status(400).json({ error: 'Please select a teacher for this leave request.' });
      }
    } else {
      targetTeacherId = req.user.teacherId;
      if (!targetTeacherId) {
        const u = await pool.query('SELECT teacher_id FROM users WHERE username = $1', [req.user.username]);
        targetTeacherId = u.rows[0]?.teacher_id;
      }
      if (!targetTeacherId) {
        const tMatch = await pool.query('SELECT id FROM teachers WHERE LOWER(name) = LOWER($1) OR LOWER(email) = LOWER($2)', [req.user.name || '', req.user.email || '']);
        targetTeacherId = tMatch.rows[0]?.id;
      }
      if (!targetTeacherId) {
        return res.status(400).json({ error: 'Your teacher account is not linked to a teacher directory profile. Please contact an admin.' });
      }
    }

    // Verify teacher exists in teachers table
    const { rows: tRows } = await pool.query('SELECT id, name, subject FROM teachers WHERE id = $1', [targetTeacherId]);
    if (!tRows.length) {
      return res.status(400).json({ error: `Selected teacher (${targetTeacherId}) was not found in the teachers directory.` });
    }

    if (!startDate || !endDate || !reason?.trim()) {
      return res.status(400).json({ error: 'Start date, end date, and reason for leave are required.' });
    }

    if (new Date(startDate) > new Date(endDate)) {
      return res.status(400).json({ error: 'Start date cannot be after end date.' });
    }

    const id = `LR_${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(
      `INSERT INTO leave_requests (id, teacher_id, start_date, end_date, reason, status, leave_type, emergency_contact, handover_notes)
       VALUES ($1, $2, $3, $4, $5, 'Pending', $6, $7, $8)
       RETURNING *`,
      [id, targetTeacherId, startDate, endDate, reason.trim(), leaveType, emergencyContact?.trim() || null, handoverNotes?.trim() || null]
    );

    const created = rows[0];
    created.teacherName = tRows[0].name;
    created.teacherSubject = tRows[0].subject;

    await auditLog(req.user.username, req.user.role, 'REQUEST_LEAVE', 'leave_requests', id, {
      teacherId: targetTeacherId,
      teacherName: tRows[0].name,
      startDate,
      endDate,
      leaveType,
      reason: reason.trim()
    });
    res.status(201).json(created);
  } catch (err) { next(err); }
});

// PUT /api/leave-requests/:id/review — admin approves leave & arranges cover or rejects
router.put('/leave-requests/:id/review', allow('teachers', 'w'), async (req, res, next) => {
  try {
    const { status, coverTeacherId, reviewNotes } = req.body || {};
    if (!['Approved', 'Rejected', 'Pending'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Approved, Rejected, or Pending.' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: lrRows } = await client.query('SELECT * FROM leave_requests WHERE id=$1', [req.params.id]);
      if (!lrRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Leave request not found.' });
      }
      const lr = lrRows[0];

      const { rows } = await client.query(
        `UPDATE leave_requests
         SET status = $1,
             cover_teacher_id = $2,
             review_notes = $3,
             reviewed_by = $4,
             reviewed_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [status, status === 'Approved' ? (coverTeacherId || null) : null, reviewNotes?.trim() || null, req.user.username, req.params.id]
      );

      if (status === 'Approved') {
        // Update teacher status
        await client.query("UPDATE teachers SET status='On leave' WHERE id=$1", [lr.teacher_id]);

        // If cover teacher assigned, update teaching assignments cover
        if (coverTeacherId) {
          await client.query(
            `UPDATE teaching_assignments
             SET is_cover = true, cover_for = $1
             WHERE teacher_id = $2`,
            [coverTeacherId, lr.teacher_id]
          );
        }
      } else {
        // If Rejected or reset to Pending, revert 'On leave' status if no other active approved leaves exist
        const { rows: otherLeaves } = await client.query(
          "SELECT id FROM leave_requests WHERE teacher_id = $1 AND status = 'Approved' AND id != $2",
          [lr.teacher_id, req.params.id]
        );
        if (!otherLeaves.length) {
          await client.query("UPDATE teachers SET status='Active' WHERE id=$1", [lr.teacher_id]);
        }
        // Revert teaching assignments
        await client.query(
          `UPDATE teaching_assignments
           SET is_cover = false, cover_for = NULL
           WHERE teacher_id = $1`,
          [lr.teacher_id]
        );
      }

      await auditLog(req.user.username, req.user.role, 'REVIEW_LEAVE', 'leave_requests', req.params.id, {
        status,
        coverTeacherId: status === 'Approved' ? coverTeacherId : null,
        reviewNotes: reviewNotes?.trim() || null
      });
      await client.query('COMMIT');

      // Fetch updated row with teacher names
      const { rows: updatedRows } = await pool.query(
        `SELECT lr.*, t.name AS "teacherName", t.subject AS "teacherSubject", ct.name AS "coverTeacherName"
         FROM leave_requests lr
         LEFT JOIN teachers t ON t.id = lr.teacher_id
         LEFT JOIN teachers ct ON ct.id = lr.cover_teacher_id
         WHERE lr.id = $1`,
        [req.params.id]
      );

      res.json(updatedRows[0] || rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

// DELETE /api/leave-requests/:id — admin or owner deletes/withdraws leave request
router.delete('/leave-requests/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM leave_requests WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Leave request not found.' });
    const lr = rows[0];

    const isOwn = req.user.role === 'teacher' && (req.user.teacherId === lr.teacher_id);
    const isAdmin = req.user.role === 'admin';
    if (!isAdmin && !isOwn) {
      return res.status(403).json({ error: 'You do not have permission to delete this request.' });
    }

    await pool.query('DELETE FROM leave_requests WHERE id = $1', [req.params.id]);
    await auditLog(req.user.username, req.user.role, 'DELETE_LEAVE', 'leave_requests', req.params.id, { teacherId: lr.teacher_id });
    res.json({ success: true, message: 'Leave request deleted.' });
  } catch (err) { next(err); }
});

// ── Messages & Parent-Teacher Consultations ─────────────────────────────────
// GET /api/messages
router.get('/messages', async (req, res, next) => {
  try {
    const myId = req.user.parentId || req.user.teacherId || req.user.studentId || req.user.id || req.user.username;
    const { rows } = await pool.query(
      `SELECT * FROM messages
       WHERE sender_id = $1 OR recipient_id = $1 OR recipient_role = $2
       ORDER BY created_at DESC LIMIT 50`,
      [myId, req.user.role]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/messages
router.post('/messages', async (req, res, next) => {
  try {
    const { recipientId, recipientRole, recipientName, subject, body, meetingDate } = req.body || {};
    if (!body || !recipientId) return res.status(400).json({ error: 'Recipient and body required.' });

    const myId = req.user.parentId || req.user.teacherId || req.user.studentId || req.user.id || req.user.username;
    const myName = req.user.name || req.user.username;
    const id = `MSG_${Date.now().toString().slice(-6)}`;

    const { rows } = await pool.query(
      `INSERT INTO messages (id, sender_role, sender_id, sender_name, recipient_role, recipient_id, recipient_name, subject, body, meeting_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [id, req.user.role, myId, myName, recipientRole || 'teacher', recipientId, recipientName || 'Recipient', subject || '', body, meetingDate || null]
    );

    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// ── Trip Consents ───────────────────────────────────────────────────────────
// GET /api/trip-consents
router.get('/trip-consents', async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (own) {
      const { rows } = await pool.query(
        `SELECT tc.*, s.name AS "studentName"
         FROM trip_consents tc
         JOIN students s ON s.id = tc.student_id
         WHERE tc.student_id = ANY($1)
         ORDER BY tc.trip_date ASC`,
        [own]
      );
      return res.json(rows);
    }

    const { rows } = await pool.query(
      `SELECT tc.*, s.name AS "studentName", p.name AS "parentName"
       FROM trip_consents tc
       JOIN students s ON s.id = tc.student_id
       LEFT JOIN parents p ON p.id = tc.parent_id
       ORDER BY tc.trip_date ASC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// PUT /api/trip-consents/:id
router.put('/trip-consents/:id', async (req, res, next) => {
  try {
    const { consent, notes } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE trip_consents
       SET consent = $1, notes = COALESCE($2, notes), updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [Boolean(consent), notes || null, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Trip consent record not found.' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Audit Log ───────────────────────────────────────────────────────────────
// GET /api/audit-log — admin only
router.get('/audit-log', allow('settings'), async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') return res.status(403).json({ error: 'Only administrators can view audit logs.' });
    const { rows } = await pool.query('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT 100');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── Admin Actions: Class Promotion & Class Fee Structure ─────────────────────
// POST /api/admin-actions/promote — promote classes at year-end
router.post('/admin-actions/promote', allow('settings', 'w'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Class progression: 7A -> 8A, 7B -> 8B, 8A -> 9A, 8B -> 9B, 9A -> Graduated, 9B -> Graduated
    const PROMOTION_MAP = {
      '7A': '8A', '7B': '8B',
      '8A': '9A', '8B': '9B',
      '9A': 'Graduated', '9B': 'Graduated'
    };

    let totalPromoted = 0;
    for (const [fromCls, toCls] of Object.entries(PROMOTION_MAP)) {
      if (toCls === 'Graduated') {
        const { rowCount } = await client.query(
          "UPDATE students SET status='Inactive', cls='Alumni' WHERE cls=$1 AND status='Active'",
          [fromCls]
        );
        totalPromoted += rowCount;
      } else {
        const { rowCount } = await client.query(
          "UPDATE students SET cls=$1 WHERE cls=$2 AND status='Active'",
          [toCls, fromCls]
        );
        totalPromoted += rowCount;
      }
    }

    await auditLog(req.user.username, req.user.role, 'PROMOTE_CLASSES', 'classes', 'all', { totalPromoted });
    await client.query('COMMIT');
    res.json({ success: true, totalPromoted, message: `Successfully promoted ${totalPromoted} active students.` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/admin-actions/fee-structure — set fee structure per class
router.post('/admin-actions/fee-structure', allow('fees', 'w'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { cls, term, amount } = req.body || {};
    const numAmt = Number(amount);
    if (!cls || !term || !(numAmt > 0)) {
      return res.status(400).json({ error: 'Class, term, and a valid amount are required.' });
    }

    await client.query('BEGIN');
    const { rows: stus } = await client.query("SELECT id FROM students WHERE cls=$1 AND status='Active'", [cls]);
    if (!stus.length) {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `No active students found in class ${cls}.` });
    }

    let createdCount = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (const s of stus) {
      const fid = `F_${cls}_${s.id}_${term.replace(/\s+/g, '')}`;
      await client.query(
        `INSERT INTO fees (id, student, term, amount, paid, date, status)
         VALUES ($1, $2, $3, $4, 0, $5, 'Unpaid')
         ON CONFLICT (id) DO UPDATE SET amount=EXCLUDED.amount`,
        [fid, s.id, term, numAmt, today]
      );
      createdCount++;
    }

    await auditLog(req.user.username, req.user.role, 'SET_FEE_STRUCTURE', 'fees', cls, { term, amount: numAmt, studentCount: createdCount });
    await client.query('COMMIT');
    res.json({ success: true, count: createdCount, message: `Fee structure applied for ${createdCount} students in ${cls}.` });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// GET /api/admin-actions/accounts — list accounts with resource details & status
router.get('/admin-actions/accounts', allow('settings'), async (req, res, next) => {
  try {
    const { rows: users } = await pool.query(
      `SELECT u.id, u.username, u.role, u.name, u.email, u.phone, u.teacher_id, u.student_id, u.parent_id,
              COALESCE(u.is_active, true) AS is_active,
              u.disabled_at, u.disabled_by, u.disabled_reason,
              COALESCE(u.del_flg, 'N') AS del_flg,
              u.deleted_at, u.deleted_by, u.deletion_reason,
              COALESCE(u.password_status, 'Default') AS password_status,
              u.password_reset_by, u.password_reset_at, u.must_change_password, u.created_at, u.updated_at
       FROM users u ORDER BY u.created_at DESC`
    );

    // Fetch related resource details in parallel for rich display
    const [tRes, sRes, spRes] = await Promise.all([
      pool.query(`SELECT id, name, subject FROM teachers`).catch(() => ({ rows: [] })),
      pool.query(`SELECT id, name, cls, status FROM students`).catch(() => ({ rows: [] })),
      pool.query(`
        SELECT sp.id, sp.parent_id, sp.student_id, sp.relationship, sp.is_primary,
               s.name AS student_name, s.cls
        FROM student_parents sp
        JOIN students s ON s.id = sp.student_id
      `).catch(() => ({ rows: [] }))
    ]);

    const teacherMap = new Map(tRes.rows.map(t => [t.id, t]));
    const studentMap = new Map(sRes.rows.map(s => [s.id, s]));
    const parentChildrenMap = new Map();
    for (const link of spRes.rows) {
      if (!parentChildrenMap.has(link.parent_id)) parentChildrenMap.set(link.parent_id, []);
      parentChildrenMap.get(link.parent_id).push(link);
    }

    const enriched = users.map(u => {
      let linkedDetails = null;
      if (u.teacher_id) {
        const t = teacherMap.get(u.teacher_id);
        linkedDetails = t ? { type: 'teacher', id: t.id, name: t.name, subject: t.subject } : { type: 'teacher', id: u.teacher_id };
      } else if (u.student_id) {
        const s = studentMap.get(u.student_id);
        linkedDetails = s ? { type: 'student', id: s.id, name: s.name, cls: s.cls, status: s.status } : { type: 'student', id: u.student_id };
      } else if (u.parent_id) {
        const children = parentChildrenMap.get(u.parent_id) || [];
        linkedDetails = { type: 'parent', id: u.parent_id, childrenCount: children.length, children };
      }

      return {
        ...u,
        linkedDetails,
        children: u.parent_id ? (parentChildrenMap.get(u.parent_id) || []) : []
      };
    });

    res.json(enriched);
  } catch (err) { next(err); }
});

// POST /api/admin-actions/toggle-user-status — enable/disable user account
router.post('/admin-actions/toggle-user-status', allow('settings', 'w'), async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can enable or disable user accounts.' });
    }

    const { userId, username, isActive, reason } = req.body || {};
    const target = (userId || username || '').toString().trim();
    if (!target) {
      return res.status(400).json({ error: 'User ID or username is required.' });
    }

    const newActiveState = Boolean(isActive);

    // Prevent administrator from disabling their own account
    const { rows: targetUser } = await pool.query(
      `SELECT id, username, role, is_active FROM users WHERE LOWER(username) = LOWER($1) OR id = $1`,
      [target]
    );

    if (!targetUser.length) {
      return res.status(404).json({ error: `User '${target}' was not found.` });
    }

    const targetRecord = targetUser[0];
    const isSelf = (targetRecord.id === req.user.id) ||
      (req.user.username && targetRecord.username.toLowerCase() === req.user.username.toLowerCase());

    if (isSelf && !newActiveState) {
      return res.status(400).json({ error: 'Security restriction: You cannot disable your own active administrator account.' });
    }

    const adminUsername = req.user.username || 'admin';
    const disabledReason = !newActiveState ? (reason?.toString().trim() || 'Disabled by administrator') : null;

    const { rows: updated } = await pool.query(
      `UPDATE users SET
         is_active = $1,
         disabled_at = (CASE WHEN $1 = false THEN NOW() ELSE NULL END),
         disabled_by = (CASE WHEN $1 = false THEN $2 ELSE NULL END),
         disabled_reason = $3,
         updated_at = NOW()
       WHERE id = $4
       RETURNING id, username, role, name, is_active, disabled_at, disabled_by, disabled_reason`,
      [newActiveState, adminUsername, disabledReason, targetRecord.id]
    );

    const action = newActiveState ? 'ENABLE_USER' : 'DISABLE_USER';
    await auditLog(adminUsername, 'admin', action, 'users', targetRecord.id, {
      username: targetRecord.username,
      reason: disabledReason,
      previousState: targetRecord.is_active
    });

    res.json({
      success: true,
      message: `User @${targetRecord.username} has been ${newActiveState ? 'enabled' : 'disabled'} successfully.`,
      user: updated[0]
    });
  } catch (err) { next(err); }
});

// PUT /api/admin-actions/users/:id/resources — modify or detach resources assigned to a user
router.put('/admin-actions/users/:id/resources', allow('settings', 'w'), async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can modify or detach user resources.' });
    }

    const { id } = req.params;
    const { action, role, linkedId, name } = req.body || {};

    const { rows: existing } = await pool.query(
      `SELECT id, username, role, name, teacher_id, student_id, parent_id FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({ error: `User '${id}' was not found.` });
    }

    const user = existing[0];
    const adminUsername = req.user.username || 'admin';

    // ── Action: Detach Resource ──
    if (action === 'detach' || linkedId === null || linkedId === '') {
      const detachedFrom = {
        teacher_id: user.teacher_id,
        student_id: user.student_id,
        parent_id: user.parent_id
      };

      const { rows: updated } = await pool.query(
        `UPDATE users SET
           teacher_id = NULL,
           student_id = NULL,
           parent_id = NULL,
           updated_at = NOW()
         WHERE id = $1
         RETURNING id, username, role, name, teacher_id, student_id, parent_id, is_active`,
        [user.id]
      );

      await auditLog(adminUsername, 'admin', 'DETACH_USER_RESOURCE', 'users', user.id, {
        username: user.username,
        detachedResources: detachedFrom
      });

      return res.json({
        success: true,
        message: `Resource successfully detached from user @${user.username}. Account is now unlinked.`,
        user: updated[0]
      });
    }

    // ── Action: Modify / Reassign Resource ──
    const targetRole = (role || user.role).toString().trim().toLowerCase();
    const cleanLinkedId = linkedId ? String(linkedId).trim() : null;
    const cleanName = name ? String(name).trim() : user.name;

    if (!['admin', 'teacher', 'student', 'parent'].includes(targetRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, teacher, student, or parent.' });
    }

    let teacherId = null;
    let studentId = null;
    let parentId = null;

    if (cleanLinkedId) {
      if (targetRole === 'teacher') {
        const { rows: tCheck } = await pool.query('SELECT id, name FROM teachers WHERE id = $1', [cleanLinkedId]);
        if (!tCheck.length) return res.status(400).json({ error: `Teacher ID "${cleanLinkedId}" not found in database.` });
        teacherId = cleanLinkedId;
      } else if (targetRole === 'student') {
        const { rows: sCheck } = await pool.query('SELECT id, name FROM students WHERE id = $1', [cleanLinkedId]);
        if (!sCheck.length) return res.status(400).json({ error: `Student ID "${cleanLinkedId}" not found in database.` });
        studentId = cleanLinkedId;
      } else if (targetRole === 'parent') {
        const { rows: pCheck } = await pool.query('SELECT id, name FROM parents WHERE id = $1', [cleanLinkedId]);
        if (!pCheck.length) return res.status(400).json({ error: `Parent ID "${cleanLinkedId}" not found in database.` });
        parentId = cleanLinkedId;
      }
    }

    const { rows: updated } = await pool.query(
      `UPDATE users SET
         role = $1,
         name = $2,
         teacher_id = $3,
         student_id = $4,
         parent_id = $5,
         updated_at = NOW()
       WHERE id = $6
       RETURNING id, username, role, name, teacher_id, student_id, parent_id, is_active`,
      [targetRole, cleanName, teacherId, studentId, parentId, user.id]
    );

    await auditLog(adminUsername, 'admin', 'MODIFY_USER_RESOURCE', 'users', user.id, {
      username: user.username,
      previous: { role: user.role, name: user.name, teacher_id: user.teacher_id, student_id: user.student_id, parent_id: user.parent_id },
      updated: { role: targetRole, name: cleanName, teacherId, studentId, parentId }
    });

    res.json({
      success: true,
      message: `Resources updated successfully for user @${user.username}.`,
      user: updated[0]
    });
  } catch (err) { next(err); }
});

// DELETE /api/admin-actions/users/:id/linked-resource — 1-click detach primary entity
router.delete('/admin-actions/users/:id/linked-resource', allow('settings', 'w'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query(
      `SELECT id, username, role, teacher_id, student_id, parent_id FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
      [id]
    );
    if (!existing.length) return res.status(404).json({ error: `User '${id}' not found.` });

    const user = existing[0];
    const prev = { teacher_id: user.teacher_id, student_id: user.student_id, parent_id: user.parent_id };

    const { rows: updated } = await pool.query(
      `UPDATE users SET teacher_id = NULL, student_id = NULL, parent_id = NULL, updated_at = NOW()
       WHERE id = $1 RETURNING id, username, role, name, teacher_id, student_id, parent_id, is_active`,
      [user.id]
    );

    await auditLog(req.user.username, 'admin', 'DETACH_USER_RESOURCE', 'users', user.id, {
      username: user.username,
      detached: prev
    });

    res.json({
      success: true,
      message: `Resource detached from user @${user.username}.`,
      user: updated[0]
    });
  } catch (err) { next(err); }
});

// DELETE /api/admin-actions/users/:id — delete user account with safeguards and preserve complete history
router.delete('/admin-actions/users/:id', allow('settings', 'w'), async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can delete user accounts.' });
    }

    const { id } = req.params;
    const { rows: existing } = await pool.query(
      `SELECT id, username, role, name, email, phone, teacher_id, student_id, parent_id,
              created_at, password_reset_by, password_reset_at, password_status, is_active,
              disabled_at, disabled_by, disabled_reason
       FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({ error: `User '${id}' was not found.` });
    }

    const targetUser = existing[0];

    // Safeguard 1: Prevent administrator from deleting own account
    const isSelf = (targetUser.id === req.user.id) ||
      (req.user.username && targetUser.username.toLowerCase() === req.user.username.toLowerCase());
    if (isSelf) {
      return res.status(400).json({ error: 'Security restriction: You cannot delete your own active administrator account.' });
    }

    // Safeguard 2: Prevent deleting the last administrator
    if (targetUser.role === 'admin') {
      const { rows: adminCountRows } = await pool.query(`SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'`);
      if ((adminCountRows[0]?.count || 0) <= 1) {
        return res.status(400).json({ error: 'Security restriction: Cannot delete the only remaining administrator account.' });
      }
    }

    // Gather user history & linked entity details before deletion
    let linkedDetails = null;
    let linkedChildren = [];

    if (targetUser.teacher_id) {
      const { rows: tRows } = await pool.query(`SELECT id, name, subject, classes FROM teachers WHERE id = $1`, [targetUser.teacher_id]).catch(() => ({ rows: [] }));
      if (tRows.length) linkedDetails = tRows[0];
    } else if (targetUser.student_id) {
      const { rows: sRows } = await pool.query(`SELECT id, name, cls, roll, status FROM students WHERE id = $1`, [targetUser.student_id]).catch(() => ({ rows: [] }));
      if (sRows.length) linkedDetails = sRows[0];
    } else if (targetUser.parent_id) {
      const { rows: pRows } = await pool.query(`SELECT id, name, phone, email FROM parents WHERE id = $1`, [targetUser.parent_id]).catch(() => ({ rows: [] }));
      if (pRows.length) linkedDetails = pRows[0];
      const { rows: cRows } = await pool.query(
        `SELECT sp.student_id, sp.relationship, sp.is_primary, s.name AS student_name, s.cls
         FROM student_parents sp
         JOIN students s ON s.id = sp.student_id
         WHERE sp.parent_id = $1`,
        [targetUser.parent_id]
      ).catch(() => ({ rows: [] }));
      linkedChildren = cRows;
    }

    // Fetch user audit history trail
    const { rows: userAuditLogs } = await pool.query(
      `SELECT id, actor_username, actor_role, action, target_entity, target_id, details, created_at
       FROM audit_logs
       WHERE actor_username = $1 OR (target_entity = 'users' AND target_id = $2) OR details->>'username' = $1
       ORDER BY created_at DESC LIMIT 50`,
      [targetUser.username, targetUser.id]
    ).catch(() => ({ rows: [] }));

    const deletionReason = req.body?.reason || 'Administrative account deletion';

    // Archive complete snapshot to deleted_users_history table
    let archivedId = null;
    try {
      const { rows: archiveRows } = await pool.query(
        `INSERT INTO deleted_users_history (
          user_id, username, role, name, email, phone,
          teacher_id, student_id, parent_id,
          account_created_at, last_password_change,
          deleted_at, deleted_by, deletion_reason, activity_snapshot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), $12, $13, $14)
        RETURNING id`,
        [
          targetUser.id,
          targetUser.username,
          targetUser.role,
          targetUser.name,
          targetUser.email || null,
          targetUser.phone || null,
          targetUser.teacher_id || null,
          targetUser.student_id || null,
          targetUser.parent_id || null,
          targetUser.created_at || null,
          targetUser.password_reset_at || null,
          req.user.username || 'admin',
          deletionReason,
          JSON.stringify({
            account_status: targetUser.is_active ? 'Active' : 'Disabled',
            disabled_reason: targetUser.disabled_reason || null,
            password_status: targetUser.password_status || 'Default',
            linked_details: linkedDetails,
            linked_children: linkedChildren,
            audit_events_count: userAuditLogs.length,
            audit_history: userAuditLogs,
            deleted_by_ip: req.ip
          })
        ]
      );
      archivedId = archiveRows[0]?.id;
    } catch (archiveErr) {
      console.warn('⚠️ Warning saving to deleted_users_history:', archiveErr.message);
    }

    // Clean up any pending password reset requests for this user
    await pool.query(`DELETE FROM password_reset_requests WHERE LOWER(username) = LOWER($1)`, [targetUser.username]).catch(() => {});

    // Soft delete: update users table setting del_flg = 'Y'
    await pool.query(
      `UPDATE users
       SET del_flg = 'Y',
           is_active = false,
           deleted_at = NOW(),
           deleted_by = $2,
           deletion_reason = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [targetUser.id, req.user.username || 'admin', deletionReason]
    );

    // Audit log the deletion
    await auditLog(req.user.username, 'admin', 'DELETE_USER_ACCOUNT', 'users', targetUser.id, {
      username: targetUser.username,
      role: targetUser.role,
      name: targetUser.name,
      del_flg: 'Y',
      linkedId: targetUser.teacher_id || targetUser.student_id || targetUser.parent_id,
      archivedHistoryId: archivedId,
      reason: deletionReason
    });

    res.json({
      success: true,
      message: `User account @${targetUser.username} marked as deleted (del_flg: Y) and archived.`,
      del_flg: 'Y',
      archivedId
    });
  } catch (err) { next(err); }
});

// POST /api/admin-actions/users/:id/restore — restore deleted user account (del_flg: Y -> N)
router.post('/admin-actions/users/:id/restore', allow('settings', 'w'), async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can restore user accounts.' });
    }

    const { id } = req.params;
    const { rows: existing } = await pool.query(
      `SELECT id, username, role, name, del_flg FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
      [id]
    );

    if (!existing.length) {
      return res.status(404).json({ error: `User '${id}' was not found.` });
    }

    const targetUser = existing[0];
    const { rows: updated } = await pool.query(
      `UPDATE users
       SET del_flg = 'N',
           is_active = true,
           deleted_at = NULL,
           deleted_by = NULL,
           deletion_reason = NULL,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, username, role, name, is_active, del_flg`,
      [targetUser.id]
    );

    await auditLog(req.user.username, 'admin', 'RESTORE_USER_ACCOUNT', 'users', targetUser.id, {
      username: targetUser.username,
      role: targetUser.role,
      del_flg: 'N'
    });

    res.json({
      success: true,
      message: `User account @${targetUser.username} restored successfully (del_flg: N).`,
      user: updated[0]
    });
  } catch (err) { next(err); }
});

// GET /api/admin-actions/deleted-users — list all deleted user accounts with preserved history
router.get('/admin-actions/deleted-users', allow('settings'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, user_id, username, role, name, email, phone, teacher_id, student_id, parent_id,
              account_created_at, last_password_change, deleted_at, deleted_by, deletion_reason, activity_snapshot
       FROM deleted_users_history
       ORDER BY deleted_at DESC`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/admin-actions/users/:id/history — get complete activity & audit history for a user
router.get('/admin-actions/users/:id/history', allow('settings'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: users } = await pool.query(
      `SELECT id, username, role, name, email, phone, teacher_id, student_id, parent_id,
              created_at, password_reset_at, password_reset_by, password_status, is_active,
              disabled_at, disabled_by, disabled_reason
       FROM users WHERE id = $1 OR LOWER(username) = LOWER($1)`,
      [id]
    );

    if (!users.length) {
      // Check deleted users history
      const { rows: deleted } = await pool.query(
        `SELECT * FROM deleted_users_history WHERE user_id = $1 OR LOWER(username) = LOWER($1) ORDER BY deleted_at DESC LIMIT 1`,
        [id]
      );
      if (deleted.length) {
        const d = deleted[0];
        return res.json({
          isDeleted: true,
          user: d,
          history: d.activity_snapshot?.audit_history || []
        });
      }
      return res.status(404).json({ error: `User '${id}' not found.` });
    }

    const u = users[0];
    const { rows: auditRows } = await pool.query(
      `SELECT id, actor_username, actor_role, action, target_entity, target_id, details, created_at
       FROM audit_logs
       WHERE actor_username = $1 OR (target_entity = 'users' AND target_id = $2) OR details->>'username' = $1
       ORDER BY created_at DESC LIMIT 100`,
      [u.username, u.id]
    );

    res.json({
      isDeleted: false,
      user: u,
      history: auditRows
    });
  } catch (err) { next(err); }
});

// GET /api/admin-actions/parents/:parentId/children — get linked children for parent
router.get('/admin-actions/parents/:parentId/children', allow('settings'), async (req, res, next) => {
  try {
    const { parentId } = req.params;
    const { rows } = await pool.query(
      `SELECT sp.id, sp.parent_id, sp.student_id, sp.relationship, sp.is_primary,
              s.name AS student_name, s.cls, s.status AS student_status
       FROM student_parents sp
       JOIN students s ON s.id = sp.student_id
       WHERE sp.parent_id = $1
       ORDER BY s.name`,
      [parentId]
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// DELETE /api/admin-actions/parents/:parentId/children/:studentId — detach child from parent
router.delete('/admin-actions/parents/:parentId/children/:studentId', allow('settings', 'w'), async (req, res, next) => {
  try {
    const { parentId, studentId } = req.params;
    const { rowCount } = await pool.query(
      `DELETE FROM student_parents WHERE parent_id = $1 AND student_id = $2`,
      [parentId, studentId]
    );

    if (!rowCount) {
      return res.status(404).json({ error: `Link between parent ${parentId} and student ${studentId} not found.` });
    }

    await auditLog(req.user.username, 'admin', 'DETACH_PARENT_CHILD', 'student_parents', `${studentId}_${parentId}`, {
      parentId,
      studentId
    });

    res.json({ success: true, message: `Child ${studentId} detached from parent ${parentId}.` });
  } catch (err) { next(err); }
});

// DELETE /api/admin-actions/teaching-assignments/:id — detach teaching assignment
router.delete('/admin-actions/teaching-assignments/:id', allow('teachers', 'w'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: existing } = await pool.query(`SELECT * FROM teaching_assignments WHERE id = $1`, [id]);
    if (!existing.length) return res.status(404).json({ error: 'Teaching assignment not found.' });

    await pool.query(`DELETE FROM teaching_assignments WHERE id = $1`, [id]);
    await auditLog(req.user.username, 'admin', 'DETACH_TEACHING_ASSIGNMENT', 'teaching_assignments', id, existing[0]);

    res.json({ success: true, message: 'Teaching assignment detached successfully.' });
  } catch (err) { next(err); }
});

// GET /api/admin-actions/password-requests — view pending password reset requests (Admin only)
router.get('/admin-actions/password-requests', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can view password reset requests.' });
    }
    const { rows } = await pool.query(
      `SELECT * FROM password_reset_requests ORDER BY requested_at DESC LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin-actions/reset-password — manually reset user password (Admin only)
router.post('/admin-actions/reset-password', async (req, res, next) => {
  try {
    if (req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied: Only administrators can reset user passwords.' });
    }

    const { username, userId, newPassword, requestId, reason } = req.body || {};
    const target = (username || userId || '').toString().trim().toLowerCase();
    if (!target) {
      return res.status(400).json({ error: 'Username or user ID is required.' });
    }

    const passwordToSet = newPassword && String(newPassword).trim().length >= 6
      ? String(newPassword).trim()
      : 'school123';

    const hash = bcrypt.hashSync(passwordToSet, 8);
    const adminUsername = req.user.username || 'admin';

    // Update user in database
    const { rows: updated } = await pool.query(
      `UPDATE users SET
         password_hash = $1,
         password_reset_by = $2,
         password_reset_at = NOW(),
         password_status = 'Reset by Admin',
         must_change_password = true,
         updated_at = NOW()
       WHERE LOWER(username) = $3 OR LOWER(id) = $3
       RETURNING id, username, role, name, password_status, password_reset_by, password_reset_at`,
      [hash, adminUsername, target]
    );

    if (!updated.length) {
      return res.status(404).json({ error: `User '${target}' was not found in the users database.` });
    }

    const u = updated[0];

    // Mark request as resolved if requestId or matching username
    if (requestId) {
      await pool.query(
        `UPDATE password_reset_requests SET
           status = 'Resolved',
           resolved_at = NOW(),
           resolved_by = $1,
           resolution_note = $2
         WHERE id = $3`,
        [adminUsername, reason || 'Password reset by admin', requestId]
      );
    } else {
      await pool.query(
        `UPDATE password_reset_requests SET
           status = 'Resolved',
           resolved_at = NOW(),
           resolved_by = $1,
           resolution_note = $2
         WHERE LOWER(username) = $3 AND status = 'Pending'`,
        [adminUsername, reason || 'Password reset by admin', u.username.toLowerCase()]
      );
    }

    // Audit log
    await auditLog(
      adminUsername,
      'admin',
      'ADMIN_RESET_PASSWORD',
      'users',
      u.id,
      {
        targetUsername: u.username,
        targetRole: u.role,
        resetBy: adminUsername,
        manual: true,
        reason: reason || 'Manual Admin Reset'
      }
    );

    res.json({
      success: true,
      message: `Password for ${u.name} (@${u.username}) successfully reset.`,
      user: {
        id: u.id,
        username: u.username,
        role: u.role,
        name: u.name,
        passwordStatus: u.password_status,
        passwordResetBy: u.password_reset_by,
        passwordResetAt: u.password_reset_at
      },
      temporaryPassword: passwordToSet
    });
  } catch (err) { next(err); }
});

// POST /api/admin-actions/accounts — create real user account
router.post('/admin-actions/accounts', allow('settings', 'w'), async (req, res, next) => {
  try {
    const { username, password, role, name, linkedId } = req.body || {};
    const cleanUsername = (username || '').toString().trim().toLowerCase();
    const cleanName = (name || '').toString().trim();
    const cleanPassword = (password || '').toString().trim();
    const cleanRole = (role || '').toString().trim().toLowerCase();
    const cleanLinkedId = linkedId && String(linkedId).trim() !== '' ? String(linkedId).trim() : null;

    if (!cleanUsername || !cleanPassword || !cleanRole || !cleanName) {
      return res.status(400).json({ error: 'Username, password, role, and name are required.' });
    }

    if (!['admin', 'teacher', 'student', 'parent'].includes(cleanRole)) {
      return res.status(400).json({ error: 'Invalid role. Must be admin, teacher, student, or parent.' });
    }

    // Check if username is already taken
    const { rows: existingUser } = await pool.query('SELECT id FROM users WHERE LOWER(username) = $1', [cleanUsername]);
    if (existingUser.length > 0) {
      return res.status(400).json({ error: `Username "${cleanUsername}" is already taken. Please choose a different username.` });
    }

    // Verify linked ID against target table
    let teacherId = null;
    let studentId = null;
    let parentId = null;

    if (cleanLinkedId) {
      if (cleanRole === 'teacher') {
        const { rows: tCheck } = await pool.query('SELECT id FROM teachers WHERE id = $1', [cleanLinkedId]);
        if (!tCheck.length) {
          return res.status(400).json({ error: `Teacher ID "${cleanLinkedId}" does not exist in the database.` });
        }
        teacherId = cleanLinkedId;
      } else if (cleanRole === 'student') {
        const { rows: sCheck } = await pool.query('SELECT id FROM students WHERE id = $1', [cleanLinkedId]);
        if (!sCheck.length) {
          return res.status(400).json({ error: `Student ID "${cleanLinkedId}" does not exist in the database.` });
        }
        studentId = cleanLinkedId;
      } else if (cleanRole === 'parent') {
        const { rows: pCheck } = await pool.query('SELECT id FROM parents WHERE id = $1', [cleanLinkedId]);
        if (!pCheck.length) {
          return res.status(400).json({ error: `Parent ID "${cleanLinkedId}" does not exist in the database.` });
        }
        parentId = cleanLinkedId;
      }
    }

    const hash = bcrypt.hashSync(cleanPassword, 8);
    const id = `USR_${Date.now().toString().slice(-6)}`;

    const { rows } = await pool.query(
      `INSERT INTO users (id, username, password_hash, role, name, teacher_id, student_id, parent_id, password_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'Default')
       RETURNING id, username, role, name, teacher_id, student_id, parent_id, password_status, created_at`,
      [id, cleanUsername, hash, cleanRole, cleanName, teacherId, studentId, parentId]
    );

    await auditLog(req.user.username, req.user.role, 'CREATE_ACCOUNT', 'users', id, { username: cleanUsername, role: cleanRole, linkedId: cleanLinkedId });
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(400).json({ error: `Username already exists (${err.detail || 'duplicate entry'}).` });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: `Linked ID does not exist in the database (${err.detail || 'foreign key mismatch'}).` });
    }
    next(err);
  }
});

// POST /api/admin-actions/link-parent — link parent to child (many-to-many)
router.post('/admin-actions/link-parent', allow('parents', 'w'), async (req, res, next) => {
  try {
    const { studentId, parentId, relationship = 'Guardian', isPrimary = false } = req.body || {};
    if (!studentId || !parentId) return res.status(400).json({ error: 'studentId and parentId required.' });

    await pool.query(
      `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, parent_id) DO UPDATE SET
         relationship = EXCLUDED.relationship,
         is_primary = EXCLUDED.is_primary`,
      [studentId, parentId, relationship, Boolean(isPrimary)]
    );

    if (isPrimary) {
      await pool.query('UPDATE students SET guardian=$1 WHERE id=$2', [parentId, studentId]);
    }

    await auditLog(req.user.username, req.user.role, 'LINK_PARENT_STUDENT', 'student_parents', `${studentId}_${parentId}`, { relationship, isPrimary });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/admin-actions/teaching-assignments
router.get('/admin-actions/teaching-assignments', allow('teachers'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT ta.*, t.name AS "teacherName", ct.name AS "coverTeacherName"
       FROM teaching_assignments ta
       LEFT JOIN teachers t ON t.id = ta.teacher_id
       LEFT JOIN teachers ct ON ct.id = ta.cover_for
       ORDER BY ta.cls, ta.subject`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// POST /api/admin-actions/teaching-assignments
router.post('/admin-actions/teaching-assignments', allow('teachers', 'w'), async (req, res, next) => {
  try {
    const { teacherId, cls, subject, isCover = false, coverFor = null } = req.body || {};
    if (!teacherId || !cls || !subject) {
      return res.status(400).json({ error: 'teacherId, cls, and subject required.' });
    }

    const id = `TA_${cls}_${subject.replace(/\s+/g, '')}`;
    const { rows } = await pool.query(
      `INSERT INTO teaching_assignments (id, teacher_id, cls, subject, is_cover, cover_for)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (cls, subject) DO UPDATE SET
         teacher_id = EXCLUDED.teacher_id,
         is_cover = EXCLUDED.is_cover,
         cover_for = EXCLUDED.cover_for
       RETURNING *`,
      [id, teacherId, cls, subject, Boolean(isCover), coverFor || null]
    );

    await auditLog(req.user.username, req.user.role, 'ASSIGN_TEACHER', 'teaching_assignments', id, { teacherId, cls, subject });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

// ── Fee Payment Submissions & Approval Workflow ─────────────────────────────
// GET /api/fee-approvals/submissions — list payment submissions for approver review
router.get('/fee-approvals/submissions', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only authorized approvers can review fee payment submissions.' });
    }

    const { status, feeId } = req.query;
    const params = [];
    const conditions = [];

    if (status) {
      params.push(status);
      conditions.push(`fps.status = $${params.length}`);
    }
    if (feeId) {
      params.push(feeId);
      conditions.push(`fps.fee_id = $${params.length}`);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const { rows } = await pool.query(
      `SELECT fps.id, fps.fee_id AS "feeId", fps.student_id AS "studentId",
              fps.parent_id AS "parentId", fps.parent_name AS "parentName",
              fps.amount::float AS amount, fps.payment_method AS "paymentMethod",
              fps.reference_code AS "referenceCode", fps.receipt_filename AS "receiptFileName",
              fps.receipt_file AS "receiptFile", fps.status, fps.submitted_at AS "submittedAt",
              fps.reviewed_by AS "reviewedBy", fps.reviewed_at AS "reviewedAt",
              fps.review_notes AS "reviewNotes",
              s.name AS "studentName", s.cls,
              f.term, f.amount::float AS "feeAmount", f.paid::float AS "feePaid", f.status AS "feeStatus"
       FROM fee_payment_submissions fps
       LEFT JOIN students s ON s.id = fps.student_id
       LEFT JOIN fees f ON f.id = fps.fee_id
       ${whereClause}
       ORDER BY
         CASE WHEN fps.status = 'Pending' THEN 0 ELSE 1 END,
         fps.submitted_at DESC`,
      params
    );

    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/fee-approvals/submissions/:id — get submission details including receipt
router.get('/fee-approvals/submissions/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT fps.id, fps.fee_id AS "feeId", fps.student_id AS "studentId",
              fps.parent_id AS "parentId", fps.parent_name AS "parentName",
              fps.amount::float AS amount, fps.payment_method AS "paymentMethod",
              fps.reference_code AS "referenceCode", fps.receipt_filename AS "receiptFileName",
              fps.receipt_file AS "receiptFile", fps.status, fps.submitted_at AS "submittedAt",
              fps.reviewed_by AS "reviewedBy", fps.reviewed_at AS "reviewedAt",
              fps.review_notes AS "reviewNotes",
              s.name AS "studentName", s.cls,
              f.term, f.amount::float AS "feeAmount", f.paid::float AS "feePaid", f.status AS "feeStatus"
       FROM fee_payment_submissions fps
       LEFT JOIN students s ON s.id = fps.student_id
       LEFT JOIN fees f ON f.id = fps.fee_id
       WHERE fps.id = $1`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Payment submission not found.' });

    // Ensure parents can only view their own submissions
    if (req.user.role === 'parent' && rows[0].parentId && rows[0].parentId !== req.user.parentId) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.json(rows[0]);
  } catch (err) { next(err); }
});

// POST /api/fee-approvals/submissions/:id/approve — approve submission and update fee to Paid/Partial
router.post('/fee-approvals/submissions/:id/approve', async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only authorized approvers can verify and approve fee payments.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock submission
    const { rows: subRows } = await client.query(
      'SELECT * FROM fee_payment_submissions WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!subRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment submission not found.' });
    }

    const submission = subRows[0];
    if (submission.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `This submission has already been ${submission.status.toLowerCase()}.` });
    }

    // 2. Lock associated fee
    const { rows: feeRows } = await client.query(
      'SELECT * FROM fees WHERE id = $1 FOR UPDATE',
      [submission.fee_id]
    );
    if (!feeRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Associated fee invoice record not found.' });
    }

    const fee = feeRows[0];
    const prevPaid = Number(fee.paid || 0);
    const subAmt = Number(submission.amount || 0);
    const newPaid = prevPaid + subAmt;
    const newStatus = feeStatus(Number(fee.amount), newPaid);

    // 3. Update fee invoice with new paid amount, status ('Paid' or 'Partial'), clear pending pointer
    const { rows: updatedFees } = await client.query(
      `UPDATE fees SET paid = $1, status = $2, pending_submission_id = NULL WHERE id = $3 RETURNING *`,
      [newPaid, newStatus, fee.id]
    );

    // 4. Update submission status to 'Approved'
    const reviewerName = req.user.name || req.user.username || 'Administrator';
    const reviewNotes = req.body.reviewNotes || 'Receipt verified and payment confirmed.';
    const { rows: updatedSubs } = await client.query(
      `UPDATE fee_payment_submissions
       SET status = 'Approved', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING *`,
      [reviewerName, reviewNotes, submission.id]
    );

    // 5. Generate and insert official payment record with receipt ID
    const receiptId = `RCP_${Date.now().toString().slice(-6)}`;
    const today = new Date().toISOString().slice(0, 10);
    await client.query(
      `INSERT INTO payments (id, receipt_id, student_id, date, amount) VALUES ($1, $2, $3, $4, $5)`,
      [fee.id, receiptId, fee.student, today, subAmt]
    );

    await client.query('COMMIT');

    await auditLog(req.user.username, req.user.role, 'APPROVE_FEE_PAYMENT', 'fee_payment_submissions', submission.id, {
      feeId: fee.id, studentId: fee.student, amount: subAmt, newPaid, newStatus, receiptId
    });

    res.json({
      success: true,
      message: `Payment of $${subAmt} approved successfully. Fee status is now "${newStatus}".`,
      submission: updatedSubs[0],
      fee: updatedFees[0],
      receiptId
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// POST /api/fee-approvals/submissions/:id/reject — reject submission and revert fee status
router.post('/fee-approvals/submissions/:id/reject', async (req, res, next) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Only authorized approvers can reject fee payment submissions.' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Lock submission
    const { rows: subRows } = await client.query(
      'SELECT * FROM fee_payment_submissions WHERE id = $1 FOR UPDATE',
      [req.params.id]
    );
    if (!subRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Payment submission not found.' });
    }

    const submission = subRows[0];
    if (submission.status !== 'Pending') {
      await client.query('ROLLBACK');
      return res.status(400).json({ error: `This submission has already been ${submission.status.toLowerCase()}.` });
    }

    // 2. Lock associated fee
    const { rows: feeRows } = await client.query(
      'SELECT * FROM fees WHERE id = $1 FOR UPDATE',
      [submission.fee_id]
    );
    if (!feeRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Associated fee invoice record not found.' });
    }

    const fee = feeRows[0];
    const currentPaid = Number(fee.paid || 0);
    // Revert status based on current verified paid amount
    const revertedStatus = feeStatus(Number(fee.amount), currentPaid);

    // 3. Revert fee status and clear pending pointer
    const { rows: updatedFees } = await client.query(
      `UPDATE fees SET status = $1, pending_submission_id = NULL WHERE id = $2 RETURNING *`,
      [revertedStatus, fee.id]
    );

    // 4. Update submission to 'Rejected'
    const reviewerName = req.user.name || req.user.username || 'Administrator';
    const reviewNotes = req.body.reviewNotes || 'Payment receipt could not be verified.';
    const { rows: updatedSubs } = await client.query(
      `UPDATE fee_payment_submissions
       SET status = 'Rejected', reviewed_by = $1, reviewed_at = NOW(), review_notes = $2
       WHERE id = $3 RETURNING *`,
      [reviewerName, reviewNotes, submission.id]
    );

    await client.query('COMMIT');

    await auditLog(req.user.username, req.user.role, 'REJECT_FEE_PAYMENT', 'fee_payment_submissions', submission.id, {
      feeId: fee.id, reason: reviewNotes, revertedStatus
    });

    res.json({
      success: true,
      message: `Payment submission rejected. Fee status reverted to "${revertedStatus}".`,
      submission: updatedSubs[0],
      fee: updatedFees[0]
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;
