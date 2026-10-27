import express from 'express';
import bcrypt from 'bcryptjs';
import { pool, feeStatus } from '../db/index.js';
import { auditLog } from '../API/auth.js';

const router = express.Router();

// Helper to sanitize and get user DB record
async function getDbUser(reqUser) {
  const { rows } = await pool.query(
    'SELECT * FROM users WHERE id = $1 OR username = $2 LIMIT 1',
    [reqUser.id || '', reqUser.username || '']
  );
  return rows[0] || null;
}

// ── GET /api/profile ────────────────────────────────────────────────────────
// Fetches detailed profile of the authenticated user
router.get('/', async (req, res, next) => {
  try {
    const dbUser = await getDbUser(req.user);
    const role = (dbUser?.role || req.user.role || 'admin').toLowerCase();
    const username = dbUser?.username || req.user.username;
    const userId = dbUser?.id || req.user.id || `U_${username}`;

    let profile = {
      id: userId,
      username,
      role,
      name: dbUser?.name || req.user.name || (role === 'admin' ? 'Administrator' : username),
      email: dbUser?.email || req.user.email || (role === 'admin' ? 'admin@school.com' : `${username}@school.com`),
      phone: dbUser?.phone || req.user.phone || '',
      avatar: dbUser?.avatar || null,
      bio: dbUser?.bio || '',
      address: dbUser?.address || '',
      gender: dbUser?.gender || '',
      dob: dbUser?.dob || '',
      emergencyContact: dbUser?.emergency_contact || '',
      emergencyPhone: dbUser?.emergency_phone || '',
      createdAt: dbUser?.created_at || null,
      updatedAt: dbUser?.updated_at || null,
      teacherId: dbUser?.teacher_id || req.user.teacherId || null,
      studentId: dbUser?.student_id || req.user.studentId || null,
      parentId: dbUser?.parent_id || req.user.parentId || null,
      roleDetails: null
    };

    // Enrich with detailed role-specific information
    if (role === 'teacher') {
      const teacherId = profile.teacherId || 'T01';
      const { rows: tRows } = await pool.query('SELECT * FROM teachers WHERE id = $1', [teacherId]);
      const teacher = tRows[0] || {};

      // If email/phone missing in user row, backfill from teachers table
      if (!profile.email && teacher.email) profile.email = teacher.email;
      if (!profile.phone && teacher.phone) profile.phone = teacher.phone;

      // Teaching assignments
      const { rows: assignRows } = await pool.query(
        'SELECT * FROM teaching_assignments WHERE teacher_id = $1',
        [teacherId]
      );

      // Student count across assigned classes
      let totalStudents = 0;
      const assignedClasses = (teacher.classes && teacher.classes.length > 0)
        ? teacher.classes
        : (assignRows.map(a => a.cls).filter(Boolean));

      if (assignedClasses.length > 0) {
        const { rows: sCount } = await pool.query(
          'SELECT COUNT(*)::int AS count FROM students WHERE cls = ANY($1)',
          [assignedClasses]
        );
        totalStudents = sCount[0]?.count || 0;
      }

      // Generate timetable schedule periods from teaching assignments and classes
      const daysList = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
      const scheduleSummary = assignedClasses.map((cls, idx) => ({
        id: `SCH_${cls}_${idx}`,
        day: daysList[idx % daysList.length],
        cls,
        subject: teacher.subject || 'Core Subject',
        period: `Period ${idx + 1} (09:00 - 10:15)`
      }));

      profile.roleDetails = {
        type: 'teacher',
        teacherId,
        subject: teacher.subject || 'General',
        classes: assignedClasses,
        status: teacher.status || 'Active',
        totalStudents,
        assignments: assignRows,
        scheduleCount: scheduleSummary.length,
        schedule: scheduleSummary
      };

    } else if (role === 'student') {
      const studentId = profile.studentId || 'S1034';
      const { rows: sRows } = await pool.query('SELECT * FROM students WHERE id = $1', [studentId]);
      const student = sRows[0] || {};

      if (!profile.phone && student.phone) profile.phone = student.phone;
      if (!profile.address && student.address) profile.address = student.address;
      if (!profile.gender && student.gender) profile.gender = student.gender;
      if (!profile.dob && student.dob) profile.dob = student.dob;

      // Guardian details
      const { rows: gRows } = await pool.query(
        `SELECT p.id, p.name, p.phone, p.email, sp.relationship, sp.is_primary
         FROM parents p
         JOIN student_parents sp ON sp.parent_id = p.id
         WHERE sp.student_id = $1
         UNION
         SELECT p.id, p.name, p.phone, p.email, 'Guardian' AS relationship, true AS is_primary
         FROM parents p
         WHERE p.id = $2`,
        [studentId, student.guardian || '']
      );

      // Attendance statistics
      const { rows: attRows } = await pool.query(
        'SELECT status, COUNT(*)::int AS count FROM attendance WHERE student_id = $1 GROUP BY status',
        [studentId]
      );
      let present = 0, absent = 0, late = 0, excused = 0, totalAtt = 0;
      attRows.forEach(r => {
        const c = Number(r.count) || 0;
        totalAtt += c;
        if (r.status === 'P') present = c;
        else if (r.status === 'A') absent = c;
        else if (r.status === 'L') late = c;
        else if (r.status === 'E') excused = c;
      });
      const attendanceRate = totalAtt > 0 ? Math.round(((present + late * 0.5) / totalAtt) * 100) : 100;

      // Academic marks summary
      const { rows: mRows } = await pool.query(
        `SELECT m.subject, m.mark, s.name AS subject_name
         FROM marks m
         LEFT JOIN subjects s ON s.code = m.subject OR s.name = m.subject
         WHERE m.student_id = $1
         ORDER BY m.subject ASC`,
        [studentId]
      );
      const avgMark = mRows.length > 0
        ? Math.round((mRows.reduce((acc, curr) => acc + (Number(curr.mark) || 0), 0) / mRows.length) * 10) / 10
        : 0;

      // Fees snapshot
      const { rows: fRows } = await pool.query(
        'SELECT * FROM fees WHERE student = $1 ORDER BY id DESC',
        [studentId]
      );
      let totalFee = 0, totalPaid = 0;
      fRows.forEach(f => {
        totalFee += Number(f.amount) || 0;
        totalPaid += Number(f.paid) || 0;
      });
      const balance = Math.max(0, totalFee - totalPaid);

      // Class Info
      const { rows: cRows } = await pool.query(
        `SELECT c.*, t.name AS class_teacher_name
         FROM classes c
         LEFT JOIN teachers t ON t.id = c.teacher
         WHERE c.name = $1 LIMIT 1`,
        [student.cls || '']
      );

      profile.roleDetails = {
        type: 'student',
        studentId,
        cls: student.cls || 'N/A',
        status: student.status || 'Active',
        guardians: gRows,
        attendanceStats: {
          total: totalAtt,
          present,
          absent,
          late,
          excused,
          rate: attendanceRate
        },
        academicStats: {
          subjectsCount: mRows.length,
          averageScore: avgMark,
          marks: mRows
        },
        feeStats: {
          totalFee,
          totalPaid,
          balance,
          status: feeStatus(totalFee, totalPaid)
        },
        classInfo: cRows[0] || null
      };

    } else if (role === 'parent') {
      const parentId = profile.parentId || 'P23';
      const { rows: pRows } = await pool.query('SELECT * FROM parents WHERE id = $1', [parentId]);
      const parent = pRows[0] || {};

      if (!profile.phone && parent.phone) profile.phone = parent.phone;
      if (!profile.email && parent.email) profile.email = parent.email;

      // Linked children
      const { rows: childRows } = await pool.query(
        `SELECT DISTINCT s.id, s.name, s.cls, s.status, s.phone, sp.relationship, sp.is_primary
         FROM students s
         JOIN student_parents sp ON sp.student_id = s.id
         WHERE sp.parent_id = $1
         UNION
         SELECT s.id, s.name, s.cls, s.status, s.phone, 'Guardian' AS relationship, true AS is_primary
         FROM students s
         WHERE s.guardian = $1`,
        [parentId]
      );

      // Fetch fees summary for children
      const childrenWithStats = await Promise.all(
        childRows.map(async ch => {
          const { rows: fees } = await pool.query(
            'SELECT amount, paid FROM fees WHERE student = $1',
            [ch.id]
          );
          let tot = 0, pd = 0;
          fees.forEach(f => {
            tot += Number(f.amount) || 0;
            pd += Number(f.paid) || 0;
          });
          return {
            ...ch,
            feeDue: Math.max(0, tot - pd),
            feeStatus: feeStatus(tot, pd)
          };
        })
      );

      profile.roleDetails = {
        type: 'parent',
        parentId,
        childrenCount: childrenWithStats.length,
        children: childrenWithStats
      };

    } else {
      // Administrator
      const [sCount, tCount, cCount, uCount, setRes] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM students').catch(() => ({ rows: [{ count: 0 }] })),
        pool.query('SELECT COUNT(*)::int AS count FROM teachers').catch(() => ({ rows: [{ count: 0 }] })),
        pool.query('SELECT COUNT(*)::int AS count FROM classes').catch(() => ({ rows: [{ count: 0 }] })),
        pool.query('SELECT COUNT(*)::int AS count FROM users').catch(() => ({ rows: [{ count: 0 }] })),
        pool.query('SELECT school, year, cur FROM settings LIMIT 1').catch(() => ({ rows: [{}] }))
      ]);

      const st = setRes.rows[0] || {};
      profile.roleDetails = {
        type: 'admin',
        designation: 'School Chief Administrator',
        schoolName: st.school || 'ABC Academy',
        academicYear: st.year || '2026/27',
        currency: st.cur || '$',
        stats: {
          totalStudents: sCount.rows[0]?.count || 0,
          totalTeachers: tCount.rows[0]?.count || 0,
          totalClasses: cCount.rows[0]?.count || 0,
          totalUsers: uCount.rows[0]?.count || 0
        },
        privileges: 'Full Administrator Privileges (Complete Read/Write on All Modules)',
        securityStatus: 'Active Security Session'
      };
    }

    res.json(profile);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/profile ────────────────────────────────────────────────────────
// Updates profile information (name, email, phone, bio, avatar, address, etc.)
router.put('/', async (req, res, next) => {
  try {
    const {
      name,
      email,
      phone,
      bio,
      avatar,
      address,
      gender,
      dob,
      emergencyContact,
      emergencyPhone
    } = req.body || {};

    let dbUser = await getDbUser(req.user);
    const username = dbUser?.username || req.user.username;
    const userId = dbUser?.id || req.user.id || `U_${username}`;
    const role = (dbUser?.role || req.user.role || 'admin').toLowerCase();

    // If user does not exist in users table (e.g. initial demo login), insert row
    if (!dbUser) {
      const defaultHash = bcrypt.hashSync('school123', 8);
      await pool.query(
        `INSERT INTO users (id, username, password_hash, role, name, email, phone, avatar, bio, address, gender, dob, emergency_contact, emergency_phone)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         ON CONFLICT (username) DO NOTHING`,
        [
          userId,
          username,
          defaultHash,
          role,
          name || req.user.name || username,
          email || null,
          phone || null,
          avatar || null,
          bio || null,
          address || null,
          gender || null,
          dob || null,
          emergencyContact || null,
          emergencyPhone || null
        ]
      );
    }

    // Update users table
    const { rows: updatedRows } = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         email = COALESCE($2, email),
         phone = COALESCE($3, phone),
         bio = COALESCE($4, bio),
         avatar = CASE WHEN $5::text IS NOT NULL THEN $5 ELSE avatar END,
         address = COALESCE($6, address),
         gender = COALESCE($7, gender),
         dob = COALESCE($8, dob),
         emergency_contact = COALESCE($9, emergency_contact),
         emergency_phone = COALESCE($10, emergency_phone),
         updated_at = NOW()
       WHERE username = $11 OR id = $12
       RETURNING *`,
      [
        name ?? null,
        email ?? null,
        phone ?? null,
        bio ?? null,
        avatar !== undefined ? avatar : null,
        address ?? null,
        gender ?? null,
        dob ?? null,
        emergencyContact ?? null,
        emergencyPhone ?? null,
        username,
        userId
      ]
    );

    const updatedUser = updatedRows[0] || {};

    // Synchronize updates to linked tables
    if (dbUser?.teacher_id || req.user.teacherId) {
      const tId = dbUser?.teacher_id || req.user.teacherId;
      await pool.query(
        `UPDATE teachers SET
           name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email)
         WHERE id = $4`,
        [name ?? null, phone ?? null, email ?? null, tId]
      );
    }

    if (dbUser?.student_id || req.user.studentId) {
      const sId = dbUser?.student_id || req.user.studentId;
      await pool.query(
        `UPDATE students SET
           name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           address = COALESCE($3, address),
           gender = COALESCE($4, gender),
           dob = COALESCE($5, dob)
         WHERE id = $6`,
        [name ?? null, phone ?? null, address ?? null, gender ?? null, dob ?? null, sId]
      );
    }

    if (dbUser?.parent_id || req.user.parentId) {
      const pId = dbUser?.parent_id || req.user.parentId;
      await pool.query(
        `UPDATE parents SET
           name = COALESCE($1, name),
           phone = COALESCE($2, phone),
           email = COALESCE($3, email)
         WHERE id = $4`,
        [name ?? null, phone ?? null, email ?? null, pId]
      );
    }

    await auditLog(username, role, 'UPDATE_PROFILE', 'users', userId, {
      updatedFields: Object.keys(req.body || {})
    });

    res.json({
      success: true,
      user: {
        id: updatedUser.id || userId,
        username,
        role,
        name: updatedUser.name || name || req.user.name,
        email: updatedUser.email || email,
        phone: updatedUser.phone || phone,
        avatar: updatedUser.avatar,
        bio: updatedUser.bio || bio,
        address: updatedUser.address || address,
        gender: updatedUser.gender || gender,
        dob: updatedUser.dob || dob,
        emergencyContact: updatedUser.emergency_contact || emergencyContact,
        emergencyPhone: updatedUser.emergency_phone || emergencyPhone,
        teacherId: updatedUser.teacher_id || req.user.teacherId,
        studentId: updatedUser.student_id || req.user.studentId,
        parentId: updatedUser.parent_id || req.user.parentId
      }
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/profile/avatar ────────────────────────────────────────────────
// Upload or remove profile picture (supports base64 image data URL)
router.post('/avatar', async (req, res, next) => {
  try {
    const { avatar } = req.body || {};
    // avatar can be base64 data URL string or null (to remove)
    if (avatar && typeof avatar !== 'string') {
      return res.status(400).json({ error: 'Invalid avatar data format.' });
    }

    if (avatar && avatar.length > 12 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image exceeds maximum allowed size (8MB).' });
    }

    let dbUser = await getDbUser(req.user);
    const username = dbUser?.username || req.user.username;
    const userId = dbUser?.id || req.user.id || `U_${username}`;
    const role = (dbUser?.role || req.user.role || 'admin').toLowerCase();

    if (!dbUser) {
      const defaultHash = bcrypt.hashSync('school123', 8);
      await pool.query(
        `INSERT INTO users (id, username, password_hash, role, name, avatar)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (username) DO NOTHING`,
        [userId, username, defaultHash, role, req.user.name || username, avatar || null]
      );
    }

    const { rows } = await pool.query(
      `UPDATE users SET avatar = $1, updated_at = NOW()
       WHERE username = $2 OR id = $3
       RETURNING avatar`,
      [avatar || null, username, userId]
    );

    await auditLog(username, role, avatar ? 'UPLOAD_AVATAR' : 'REMOVE_AVATAR', 'users', userId);

    res.json({
      success: true,
      avatar: rows[0]?.avatar || null,
      message: avatar ? 'Profile photo updated successfully!' : 'Profile photo removed.'
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/profile/password ───────────────────────────────────────────────
// Update user password with current password verification
router.put('/password', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }
    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
    }

    const dbUser = await getDbUser(req.user);
    const username = dbUser?.username || req.user.username;
    const userId = dbUser?.id || req.user.id || `U_${username}`;
    const role = (dbUser?.role || req.user.role || 'admin').toLowerCase();

    // Verify current password
    let valid = false;
    if (dbUser?.password_hash) {
      valid = bcrypt.compareSync(currentPassword, dbUser.password_hash);
    } else {
      // fallback demo password
      const demoHash = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'school123', 8);
      valid = bcrypt.compareSync(currentPassword, demoHash);
    }

    if (!valid) {
      return res.status(400).json({ error: 'Incorrect current password. Please try again.' });
    }

    const newHash = bcrypt.hashSync(newPassword, 8);

    if (dbUser) {
      await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2',
        [newHash, dbUser.id]
      );
    } else {
      await pool.query(
        `INSERT INTO users (id, username, password_hash, role, name)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (username) DO UPDATE SET password_hash = $3, updated_at = NOW()`,
        [userId, username, newHash, role, req.user.name || username]
      );
    }

    await auditLog(username, role, 'CHANGE_PASSWORD', 'users', userId);

    res.json({ success: true, message: 'Password updated successfully!' });
  } catch (err) {
    next(err);
  }
});

export default router;
