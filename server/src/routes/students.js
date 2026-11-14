import express from 'express';
import { pool, SUB, feeStatus } from '../db/index.js';
import { allow, ownStudentIds, myClasses, auditLog } from '../API/auth.js';
import { avg, gr, attOf, rate } from '../utils/helpers.js';

const router = express.Router();

// Helper to generate prefixed ID within a transaction client
async function nextId(client, table, prefix, width) {
  const { rows } = await client.query(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`);
  if (!rows.length) return prefix + String(1).padStart(width, '0');
  const match = rows[0].id.match(/\d+$/);
  const last = match ? parseInt(match[0], 10) : 0;
  return prefix + String(last + 1).padStart(width, '0');
}

// Generate unique official payment receipt number
function generateReceiptNumber() {
  const year = new Date().getFullYear();
  const rand = Math.floor(10000 + Math.random() * 90000);
  return `REC-${year}-${rand}`;
}

// ── GET /api/students/fee-structures ───────────────────────────────────────
// Returns standard fee structures per class
router.get('/fee-structures', allow('students'), async (req, res, next) => {
  try {
    const { cls } = req.query;
    if (cls) {
      const { rows } = await pool.query(
        'SELECT * FROM fee_structures WHERE cls=$1 ORDER BY term LIMIT 1',
        [cls]
      );
      if (rows.length) {
        return res.json(rows[0]);
      }
      // Sensible fallback based on grade level
      const gradeNum = parseInt(cls, 10) || 7;
      const defaultAmount = gradeNum >= 9 ? 700.00 : gradeNum >= 8 ? 600.00 : 500.00;
      return res.json({
        id: `FS_${cls}_Term1`,
        cls,
        term: 'Term 1',
        amount: defaultAmount,
        min_initial_payment: Math.round(defaultAmount * 0.5),
        description: `Grade ${cls} Standard Term 1 Tuition & Registration`
      });
    }

    const { rows } = await pool.query('SELECT * FROM fee_structures ORDER BY cls, term');
    res.json(rows);
  } catch (err) { next(err); }
});

// ── POST /api/students/check-duplicate ──────────────────────────────────────
// Pre-submission duplicate check
router.post('/check-duplicate', allow('students'), async (req, res, next) => {
  try {
    const { name, cls, dob, phone } = req.body || {};
    if (!name || !cls) {
      return res.json({ exists: false });
    }

    const trimmedName = name.trim();
    const { rows } = await pool.query(
      `SELECT id, name, cls, status, phone, dob, created_at
       FROM students
       WHERE LOWER(TRIM(name)) = LOWER($1) AND cls = $2
       LIMIT 1`,
      [trimmedName, cls]
    );

    if (rows.length) {
      const st = rows[0];
      return res.json({
        exists: true,
        isPending: st.status === 'Pending Payment',
        student: st
      });
    }

    res.json({ exists: false });
  } catch (err) { next(err); }
});

// ── POST /api/students/register-with-fee ────────────────────────────────────
// Atomic Student Registration + Mandatory Fee Calculation + Discount + Payment + Receipt
router.post('/register-with-fee', allow('students', 'w'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { student, payment } = req.body || {};

    if (!student || !student.name?.trim() || !student.cls?.trim()) {
      return res.status(400).json({ error: 'Student full name and class are required.' });
    }

    const name = student.name.trim();
    const cls = student.cls.trim();
    const gender = student.gender || 'Female';
    const dob = student.dob || null;
    const phone = student.phone || '';
    const guardian = student.guardian || null;
    const address = student.address || '';
    const retryStudentId = student.retryStudentId || null;

    // 1. Prevent duplicate active registrations
    if (!retryStudentId) {
      const { rows: dupRows } = await client.query(
        `SELECT id, name, cls, status FROM students
         WHERE LOWER(TRIM(name)) = LOWER($1) AND cls = $2
         LIMIT 1`,
        [name, cls]
      );
      if (dupRows.length) {
        const existing = dupRows[0];
        if (existing.status === 'Pending Payment') {
          return res.status(409).json({
            error: `A registration for "${name}" in class ${cls} already exists with Pending Payment status.`,
            duplicatePendingId: existing.id,
            canRetry: true
          });
        }
        return res.status(409).json({
          error: `Student "${name}" is already registered in class ${cls}.`
        });
      }
    }

    // 2. Fetch fee structure for class
    let baseAmount = 500.00;
    let minInitialPayment = 250.00;
    const term = payment?.term || 'Term 1';

    const { rows: fsRows } = await client.query(
      'SELECT amount, min_initial_payment FROM fee_structures WHERE cls=$1 AND term=$2 LIMIT 1',
      [cls, term]
    );
    if (fsRows.length) {
      baseAmount = Number(fsRows[0].amount);
      minInitialPayment = Number(fsRows[0].min_initial_payment || Math.round(baseAmount * 0.5));
    } else {
      const gradeNum = parseInt(cls, 10) || 7;
      baseAmount = gradeNum >= 9 ? 700.00 : gradeNum >= 8 ? 600.00 : 500.00;
      minInitialPayment = Math.round(baseAmount * 0.5);
    }

    // 3. Calculate approved discount / exemption
    const discountType = payment?.discountType || 'none';
    const discountVal = Number(payment?.discountValue) || 0;
    const discountReason = payment?.discountReason?.trim() || null;
    let discountAmount = 0;

    if (discountType === 'full_exemption') {
      discountAmount = baseAmount;
    } else if (discountType === 'percentage' && discountVal > 0) {
      discountAmount = Math.min(baseAmount, Math.round((baseAmount * discountVal) / 100 * 100) / 100);
    } else if (discountType === 'amount' && discountVal > 0) {
      discountAmount = Math.min(baseAmount, discountVal);
    }

    const netDue = Math.max(0, Math.round((baseAmount - discountAmount) * 100) / 100);
    const paidAmount = Math.max(0, Number(payment?.amount) || 0);
    const applyInstallment = Boolean(payment?.applyInstallment);
    const requiredMin = applyInstallment ? Math.min(netDue, minInitialPayment) : netDue;

    // 4. Determine Enrollment & Registration Status
    let enrollmentStatus = 'Pending Payment';
    let feeRecordStatus = 'Unpaid';

    if (netDue === 0) {
      // 100% scholarship or approved exemption
      enrollmentStatus = 'Active';
      feeRecordStatus = 'Paid';
    } else if (paidAmount >= netDue) {
      // Fully paid
      enrollmentStatus = 'Active';
      feeRecordStatus = 'Paid';
    } else if (applyInstallment && paidAmount >= requiredMin) {
      // Met required initial installment
      enrollmentStatus = 'Active';
      feeRecordStatus = 'Partial';
    } else if (paidAmount > 0) {
      // Paid something, but below required threshold
      enrollmentStatus = 'Pending Payment';
      feeRecordStatus = 'Partial';
    } else {
      // Zero payment
      enrollmentStatus = 'Pending Payment';
      feeRecordStatus = 'Unpaid';
    }

    const paymentMethod = payment?.paymentMethod || 'Cash';
    const referenceCode = payment?.referenceCode?.trim() || null;
    const receivedBy = payment?.receivedBy?.trim() || req.user.name || req.user.username;
    const paymentDate = payment?.date || new Date().toISOString().slice(0, 10);
    const notes = payment?.notes?.trim() || '';

    // Check duplicate payment reference code
    if (referenceCode && paidAmount > 0) {
      const { rows: refRows } = await client.query(
        'SELECT id FROM payments WHERE LOWER(reference_code) = LOWER($1) LIMIT 1',
        [referenceCode]
      );
      if (refRows.length) {
        return res.status(400).json({
          error: `Payment reference code "${referenceCode}" has already been recorded for another transaction.`
        });
      }
    }

    await client.query('BEGIN');

    // 5. Insert or Update Student Record
    let studentId = retryStudentId;
    let studentRecord = null;

    if (studentId) {
      const { rows: updRows } = await client.query(
        `UPDATE students
         SET name=$1, cls=$2, gender=$3, dob=$4, phone=$5, guardian=$6, address=$7,
             status=$8, registration_status=$8, discount_applied=$9, discount_reason=$10, discount_by=$11,
             enrolled_at = (CASE WHEN $8 = 'Active' THEN NOW() ELSE enrolled_at END)
         WHERE id=$12
         RETURNING *`,
        [name, cls, gender, dob, phone, guardian, address, enrollmentStatus, discountAmount, discountReason, req.user.username, studentId]
      );
      if (!updRows.length) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Student record for retry was not found.' });
      }
      studentRecord = updRows[0];
    } else {
      studentId = await nextId(client, 'students', 'S', 4);
      const { rows: insRows } = await client.query(
        `INSERT INTO students (id, name, cls, gender, dob, phone, guardian, status, address, registration_status, discount_applied, discount_reason, discount_by, enrolled_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $8, $10, $11, $12, (CASE WHEN $8 = 'Active' THEN NOW() ELSE NULL END))
         RETURNING *`,
        [studentId, name, cls, gender, dob, phone, guardian, enrollmentStatus, address, discountAmount, discountReason, req.user.username]
      );
      studentRecord = insRows[0];

      // Initial marks for all subjects
      for (const sub of SUB) {
        await client.query(
          'INSERT INTO marks (student_id, subject, mark) VALUES ($1, $2, 0) ON CONFLICT DO NOTHING',
          [studentId, sub]
        );
      }
    }

    // Link parent/guardian in student_parents
    if (guardian) {
      await client.query(
        `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
         VALUES ($1, $2, 'Primary Guardian', true)
         ON CONFLICT (student_id, parent_id) DO NOTHING`,
        [studentId, guardian]
      );
    }

    // 6. Fee Record Creation / Update
    const feeId = `F_${studentId}_${term.replace(/\s+/g, '')}`;
    const { rows: feeRows } = await client.query(
      `INSERT INTO fees (id, student, term, amount, paid, date, status, original_amount, discount, discount_reason, discount_approved_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET
         amount = EXCLUDED.amount,
         paid = EXCLUDED.paid,
         date = EXCLUDED.date,
         status = EXCLUDED.status,
         original_amount = EXCLUDED.original_amount,
         discount = EXCLUDED.discount,
         discount_reason = EXCLUDED.discount_reason,
         discount_approved_by = EXCLUDED.discount_approved_by
       RETURNING *`,
      [feeId, studentId, term, netDue, paidAmount, paymentDate, feeRecordStatus, baseAmount, discountAmount, discountReason, req.user.username]
    );
    const feeRecord = feeRows[0];

    // 7. Payment Record & Unique Receipt Creation
    let receiptData = null;
    let paymentRecord = null;

    if (paidAmount > 0) {
      const receiptId = generateReceiptNumber();
      const { rows: payRows } = await client.query(
        `INSERT INTO payments (id, receipt_id, student_id, fee_id, date, amount, payment_method, reference_code, received_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [receiptId, receiptId, studentId, feeId, paymentDate, paidAmount, paymentMethod, referenceCode || receiptId, receivedBy, notes]
      );
      paymentRecord = payRows[0];

      receiptData = {
        receiptId,
        studentId,
        studentName: name,
        cls,
        term,
        baseAmount,
        discount: discountAmount,
        discountReason,
        netDue,
        amountPaid: paidAmount,
        outstandingBalance: Math.max(0, netDue - paidAmount),
        paymentMethod,
        referenceCode: referenceCode || receiptId,
        date: paymentDate,
        receivedBy,
        enrollmentStatus,
        statusText: enrollmentStatus === 'Active' ? 'ENROLLMENT ACTIVATED' : 'PENDING PAYMENT CONFIRMATION'
      };
    } else if (netDue === 0) {
      // 100% exemption receipt
      const receiptId = `EXM-${new Date().getFullYear()}-${Math.floor(10000 + Math.random() * 90000)}`;
      receiptData = {
        receiptId,
        studentId,
        studentName: name,
        cls,
        term,
        baseAmount,
        discount: baseAmount,
        discountReason: discountReason || 'Full Exemption / Scholarship',
        netDue: 0,
        amountPaid: 0,
        outstandingBalance: 0,
        paymentMethod: 'Exemption / Scholarship',
        referenceCode: '100% SCHOLARSHIP',
        date: paymentDate,
        receivedBy,
        enrollmentStatus: 'Active',
        statusText: 'ENROLLMENT ACTIVATED (FULL SCHOLARSHIP)'
      };
    }

    await auditLog(
      req.user.username,
      req.user.role,
      'REGISTER_STUDENT_FEE',
      'students',
      studentId,
      {
        name,
        cls,
        status: enrollmentStatus,
        baseAmount,
        discount: discountAmount,
        netDue,
        paid: paidAmount,
        receiptId: receiptData?.receiptId || null
      }
    );

    await client.query('COMMIT');

    res.status(201).json({
      success: true,
      studentId,
      student: studentRecord,
      enrollmentStatus,
      baseFee: baseAmount,
      discount: discountAmount,
      netDue,
      paidAmount,
      outstandingBalance: Math.max(0, netDue - paidAmount),
      fee: feeRecord,
      payment: paymentRecord,
      receipt: receiptData
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── POST /api/students/:id/confirm-payment ──────────────────────────────────
// Confirm payment for student in "Pending Payment" or subsequent installment
router.post('/:id/confirm-payment', allow('fees', 'w'), async (req, res, next) => {
  const client = await pool.connect();
  try {
    const studentId = req.params.id;
    const { amount, paymentMethod = 'Cash', referenceCode, notes, term = 'Term 1' } = req.body || {};
    const amt = Number(amount);

    if (!(amt > 0)) {
      return res.status(400).json({ error: 'A valid payment amount is required.' });
    }

    await client.query('BEGIN');

    const { rows: sRows } = await client.query('SELECT * FROM students WHERE id=$1', [studentId]);
    const student = sRows[0];
    if (!student) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Student not found.' });
    }

    // Find linked fee record for this term or first unpaid fee
    const { rows: fRows } = await client.query(
      'SELECT * FROM fees WHERE student=$1 ORDER BY id LIMIT 1',
      [studentId]
    );
    let fee = fRows[0];

    if (!fee) {
      // Create fee record based on class structure
      const feeId = `F_${studentId}_${term.replace(/\s+/g, '')}`;
      const { rows: fsRows } = await client.query(
        'SELECT amount FROM fee_structures WHERE cls=$1 AND term=$2 LIMIT 1',
        [student.cls, term]
      );
      const feeAmt = fsRows.length ? Number(fsRows[0].amount) : 500.00;
      const { rows: newFees } = await client.query(
        `INSERT INTO fees (id, student, term, amount, paid, date, status)
         VALUES ($1, $2, $3, $4, 0, CURRENT_DATE, 'Unpaid')
         RETURNING *`,
        [feeId, studentId, term, feeAmt]
      );
      fee = newFees[0];
    }

    const currentAmount = Number(fee.amount);
    const currentPaid = Number(fee.paid);
    const balance = currentAmount - currentPaid;

    if (amt > balance) {
      await client.query('ROLLBACK');
      return res.status(400).json({
        error: `Payment amount (${amt}) exceeds outstanding balance (${balance}).`
      });
    }

    // Check duplicate reference code
    if (referenceCode) {
      const { rows: refRows } = await client.query(
        'SELECT id FROM payments WHERE LOWER(reference_code) = LOWER($1) LIMIT 1',
        [referenceCode.trim()]
      );
      if (refRows.length) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Transaction reference code "${referenceCode}" has already been recorded.`
        });
      }
    }

    const newPaid = currentPaid + amt;
    const newStatus = feeStatus(currentAmount, newPaid);
    const today = new Date().toISOString().slice(0, 10);
    const receivedBy = req.user.name || req.user.username;

    // Update fee record
    const { rows: updFeeRows } = await client.query(
      'UPDATE fees SET paid=$1, status=$2, date=$3 WHERE id=$4 RETURNING *',
      [newPaid, newStatus, today, fee.id]
    );
    const updatedFee = updFeeRows[0];

    // Create unique payment record & receipt
    const receiptId = generateReceiptNumber();
    const { rows: payRows } = await client.query(
      `INSERT INTO payments (id, receipt_id, student_id, fee_id, date, amount, payment_method, reference_code, received_by, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [receiptId, receiptId, studentId, fee.id, today, amt, paymentMethod, referenceCode || receiptId, receivedBy, notes || '']
    );
    const paymentRecord = payRows[0];

    // If student was Pending Payment, activate enrollment!
    let studentStatus = student.status;
    if (student.status === 'Pending Payment') {
      studentStatus = 'Active';
      await client.query(
        `UPDATE students
         SET status='Active', registration_status='Active', enrolled_at=NOW()
         WHERE id=$1`,
        [studentId]
      );
    }

    const receipt = {
      receiptId,
      studentId,
      studentName: student.name,
      cls: student.cls,
      term: fee.term || term,
      netDue: currentAmount,
      amountPaid: amt,
      totalPaid: newPaid,
      outstandingBalance: currentAmount - newPaid,
      paymentMethod,
      referenceCode: referenceCode || receiptId,
      date: today,
      receivedBy,
      enrollmentStatus: studentStatus,
      statusText: studentStatus === 'Active' ? 'ENROLLMENT ACTIVATED' : 'PARTIAL PAYMENT RECORDED'
    };

    await auditLog(
      req.user.username,
      req.user.role,
      'CONFIRM_STUDENT_FEE_PAYMENT',
      'students',
      studentId,
      { amount: amt, receiptId, newStatus, studentStatus }
    );

    await client.query('COMMIT');

    res.json({
      success: true,
      message: `Payment of ${amt} confirmed. Enrollment is ${studentStatus}.`,
      studentStatus,
      fee: updatedFee,
      payment: paymentRecord,
      receipt
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

// ── GET /api/students/:id/payments ──────────────────────────────────────────
// List payment history for a student
router.get('/:id/payments', allow('students'), async (req, res, next) => {
  try {
    const studentId = req.params.id;
    const { rows: payments } = await pool.query(
      `SELECT p.*, f.term, f.amount AS fee_amount, f.status AS fee_status
       FROM payments p
       LEFT JOIN fees f ON f.id = p.fee_id
       WHERE p.student_id = $1
       ORDER BY p.date DESC, p.created_at DESC`,
      [studentId]
    );

    res.json(payments.map(p => ({
      id: p.id,
      receiptId: p.receipt_id,
      studentId: p.student_id,
      feeId: p.fee_id,
      term: p.term || 'Term 1',
      date: p.date,
      amount: Number(p.amount),
      paymentMethod: p.payment_method || 'Cash',
      referenceCode: p.reference_code || p.receipt_id,
      receivedBy: p.received_by || 'Staff Member',
      notes: p.notes || ''
    })));
  } catch (err) { next(err); }
});

// ── GET /api/students/:id/profile ───────────────────────────────────────────
router.get('/:id/profile', allow('students'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (own && !own.includes(req.params.id))
      return res.status(404).json({ error: 'Student not found.' });

    const mine = await myClasses(req.user);

    const { rows: sRows } = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    const s = sRows[0];
    if (!s) return res.status(404).json({ error: 'Student not found.' });

    // If teacher, check that student belongs to their classes
    if (mine && !mine.includes(s.cls)) {
      return res.status(403).json({ error: "You cannot view students outside your classes." });
    }

    // Guardian information (support both student_parents and direct guardian)
    const { rows: guardRows } = await pool.query(
      `SELECT p.id, p.name, p.phone, p.email, sp.relationship
       FROM parents p
       LEFT JOIN student_parents sp ON sp.parent_id=p.id AND sp.student_id=$1
       WHERE p.id=$2 OR sp.student_id=$1
       LIMIT 1`,
      [s.id, s.guardian]
    );
    const guardian = guardRows[0] || null;

    // Fees & Payments: ONLY for Admin, Student, and Parent. NEVER for Teacher (Problem 3)
    let fees = null;
    let payments = [];
    let feeSummary = null;

    if (req.user.role !== 'teacher') {
      const { rows: fRows } = await pool.query('SELECT * FROM fees WHERE student=$1 ORDER BY id', [s.id]);
      fees = fRows.map(f => ({
        ...f,
        amount: Number(f.amount),
        paid: Number(f.paid),
        originalAmount: Number(f.original_amount || f.amount),
        discount: Number(f.discount || 0),
        discountReason: f.discount_reason || null,
        balance: Math.max(0, Number(f.amount) - Number(f.paid))
      }));

      const { rows: pRows } = await pool.query(
        `SELECT p.*, f.term
         FROM payments p
         LEFT JOIN fees f ON f.id = p.fee_id
         WHERE p.student_id=$1
         ORDER BY p.date DESC, p.created_at DESC`,
        [s.id]
      );
      payments = pRows.map(p => ({
        id: p.id,
        receiptId: p.receipt_id,
        feeId: p.fee_id,
        term: p.term || 'Term 1',
        amount: Number(p.amount),
        date: p.date,
        paymentMethod: p.payment_method || 'Cash',
        referenceCode: p.reference_code || p.receipt_id,
        receivedBy: p.received_by || 'Staff Member',
        notes: p.notes || ''
      }));

      const totalBilled = fees.reduce((acc, f) => acc + f.amount, 0);
      const totalPaid = fees.reduce((acc, f) => acc + f.paid, 0);
      const totalDiscount = fees.reduce((acc, f) => acc + f.discount, 0);
      const outstandingBalance = Math.max(0, totalBilled - totalPaid);

      feeSummary = {
        totalBilled,
        totalDiscount,
        totalPaid,
        outstandingBalance,
        isFullyPaid: outstandingBalance === 0 && totalBilled > 0,
        hasPendingPayment: s.status === 'Pending Payment' || outstandingBalance > 0
      };
    }

    const [marks, a, c] = await Promise.all([
      pool.query('SELECT subject, mark, comments FROM marks WHERE student_id=$1', [s.id]).then(r =>
        Object.fromEntries(r.rows.map(m => [m.subject, { mark: m.mark, comment: m.comments }]))
      ),
      avg(s.id),
      attOf([s.id])
    ]);

    const marksMap = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.mark]));
    const commentsMap = Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.comment]));

    res.json({
      student:    s,
      guardian,
      attendance: { ...c, rate: rate(c) },
      academic:   { average: a, grade: gr(a), marks: marksMap, comments: commentsMap },
      fees,
      payments,
      feeSummary
    });
  } catch (err) { next(err); }
});

// ── GET /api/students/:id/report-card ───────────────────────────────────────
router.get('/:id/report-card', allow('exams'), async (req, res, next) => {
  try {
    const own = await ownStudentIds(req.user);
    if (own && !own.includes(req.params.id))
      return res.status(403).json({ error: 'Access denied.' });

    const mine = await myClasses(req.user);

    const { rows: sRows } = await pool.query('SELECT * FROM students WHERE id=$1', [req.params.id]);
    const student = sRows[0];
    if (!student) return res.status(404).json({ error: 'Student not found.' });

    if (mine && !mine.includes(student.cls)) {
      return res.status(403).json({ error: "Access denied." });
    }

    const [settingsRes, marksRes, attRes] = await Promise.all([
      pool.query('SELECT * FROM settings WHERE id=1'),
      pool.query('SELECT subject, mark, comments FROM marks WHERE student_id=$1', [student.id]),
      attOf([student.id])
    ]);

    const settings = settingsRes.rows[0] || {};
    const marks = marksRes.rows;
    const total = marks.reduce((acc, m) => acc + (m.mark || 0), 0);
    const avgScore = marks.length ? (total / marks.length).toFixed(1) : '0';

    res.json({
      school: settings.school || 'ABC Academy',
      academicYear: settings.year || '2026/27',
      isPublished: settings.results_published || false,
      student,
      marks: marks.map(m => ({
        subject: m.subject,
        mark: m.mark,
        grade: gr(m.mark),
        comment: m.comments || ''
      })),
      total,
      average: avgScore,
      finalGrade: gr(Number(avgScore)),
      attendance: { ...attRes, rate: rate(attRes) }
    });
  } catch (err) { next(err); }
});

export default router;
