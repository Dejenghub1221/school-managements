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
      const { rows } = await pool.query(
        `SELECT lr.*, ct.name AS "coverTeacherName"
         FROM leave_requests lr
         LEFT JOIN teachers ct ON ct.id = lr.cover_teacher_id
         WHERE lr.teacher_id = $1
         ORDER BY lr.created_at DESC`,
        [req.user.teacherId]
      );
      return res.json(rows);
    }

    if (req.user.role === 'admin') {
      const { rows } = await pool.query(
        `SELECT lr.*, t.name AS "teacherName", ct.name AS "coverTeacherName"
         FROM leave_requests lr
         JOIN teachers t ON t.id = lr.teacher_id
         LEFT JOIN teachers ct ON ct.id = lr.cover_teacher_id
         ORDER BY lr.created_at DESC`
      );
      return res.json(rows);
    }

    res.status(403).json({ error: 'Not allowed.' });
  } catch (err) { next(err); }
});

// POST /api/leave-requests — teacher requests leave
router.post('/leave-requests', async (req, res, next) => {
  try {
    if (req.user.role !== 'teacher' && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Only teachers can request leave.' });
    }
    const { startDate, endDate, reason } = req.body || {};
    const teacherId = req.user.teacherId || req.body.teacherId;
    if (!startDate || !endDate || !reason) {
      return res.status(400).json({ error: 'Start date, end date, and reason are required.' });
    }

    const id = `LR_${Date.now().toString().slice(-6)}`;
    const { rows } = await pool.query(
      `INSERT INTO leave_requests (id, teacher_id, start_date, end_date, reason, status)
       VALUES ($1, $2, $3, $4, $5, 'Pending')
       RETURNING *`,
      [id, teacherId, startDate, endDate, reason]
    );

    await auditLog(req.user.username, req.user.role, 'REQUEST_LEAVE', 'leave_requests', id, { startDate, endDate });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

// PUT /api/leave-requests/:id/review — admin approves leave & arranges cover
router.put('/leave-requests/:id/review', allow('teachers', 'w'), async (req, res, next) => {
  try {
    const { status, coverTeacherId } = req.body || {};
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be Approved or Rejected.' });
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
         SET status = $1, cover_teacher_id = $2
         WHERE id = $3
         RETURNING *`,
        [status, coverTeacherId || null, req.params.id]
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
            [lr.teacher_id, coverTeacherId]
          );
        }
      }

      await auditLog(req.user.username, req.user.role, 'REVIEW_LEAVE', 'leave_requests', req.params.id, { status, coverTeacherId });
      await client.query('COMMIT');
      res.json(rows[0]);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
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

// GET /api/admin-actions/accounts — list accounts
router.get('/admin-actions/accounts', allow('settings'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT u.id, u.username, u.role, u.name, u.email, u.phone, u.teacher_id, u.student_id, u.parent_id,
              COALESCE(u.password_status, 'Default') AS password_status,
              u.password_reset_by, u.password_reset_at, u.must_change_password, u.created_at, u.updated_at
       FROM users u ORDER BY u.created_at DESC`
    );
    res.json(rows);
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
    if (!username || !password || !role || !name) {
      return res.status(400).json({ error: 'Username, password, role, and name are required.' });
    }

    const hash = bcrypt.hashSync(String(password), 8);
    const id = `USR_${Date.now().toString().slice(-6)}`;
    const teacherId = role === 'teacher' ? linkedId : null;
    const studentId = role === 'student' ? linkedId : null;
    const parentId  = role === 'parent'  ? linkedId : null;

    const { rows } = await pool.query(
      `INSERT INTO users (id, username, password_hash, role, name, teacher_id, student_id, parent_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, username, role, name, teacher_id, student_id, parent_id, created_at`,
      [id, username, hash, role, name, teacherId, studentId, parentId]
    );

    await auditLog(req.user.username, req.user.role, 'CREATE_ACCOUNT', 'users', id, { username, role, linkedId });
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
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
