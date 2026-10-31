import express from 'express';
import { pool, CLS, SUB } from '../db/index.js';
import { allow, myClasses, mySubject, auditLog } from '../API/auth.js';

const router = express.Router();

// Grade letter calculator
const getGradeLetter = (score) => {
  if (score >= 90) return 'A+';
  if (score >= 80) return 'A';
  if (score >= 75) return 'B+';
  if (score >= 70) return 'B';
  if (score >= 60) return 'C';
  if (score >= 50) return 'D';
  return 'F';
};

// ── GET /api/teacher-app/portal ───────────────────────────────────────────────
router.get('/portal', async (req, res, next) => {
  try {
    const role = req.user.role;
    let teacherId = req.user.teacherId;

    // Admin preview defaults to demo teacher T01 (Ms. Alemu)
    if (!teacherId) {
      if (role === 'admin') teacherId = 'T01';
      else return res.status(403).json({ error: 'Teacher ID required.' });
    }

    // 1. Teacher profile
    const { rows: tRows } = await pool.query('SELECT * FROM teachers WHERE id = $1', [teacherId]);
    if (!tRows.length) return res.status(404).json({ error: 'Teacher not found.' });

    const teacher = tRows[0];
    const teacherClasses = teacher.classes && teacher.classes.length ? teacher.classes : ['7A', '8A', '8B'];
    const teacherSubject = teacher.subject || 'Science';
    const todayDateStr = new Date().toISOString().slice(0, 10);

    // 2. Classes & Student Rosters
    const { rows: students } = await pool.query(
      `SELECT s.*, p.name AS "guardianName", p.phone AS "guardianPhone", p.email AS "guardianEmail"
       FROM students s
       LEFT JOIN parents p ON p.id = s.guardian
       WHERE s.cls = ANY($1) AND s.status = 'Active'
       ORDER BY s.cls ASC, s.name ASC`,
      [teacherClasses]
    );

    // 3. Today's Attendance records for teacher's students
    const studentIds = students.map(s => s.id);
    let todayAttendance = {};
    let reportedAbsences = {};

    if (studentIds.length) {
      const { rows: attRows } = await pool.query(
        `SELECT student_id, status FROM attendance WHERE date = $1 AND student_id = ANY($2)`,
        [todayDateStr, studentIds]
      );
      attRows.forEach(r => { todayAttendance[r.student_id] = r.status; });

      const { rows: absRows } = await pool.query(
        `SELECT ar.*, s.name AS "studentName", s.cls, p.name AS "parentName", p.phone AS "parentPhone"
         FROM absence_reports ar
         JOIN students s ON s.id = ar.student_id
         JOIN parents p ON p.id = ar.parent_id
         WHERE ar.date = $1 AND ar.student_id = ANY($2)`,
        [todayDateStr, studentIds]
      );
      absRows.forEach(r => { reportedAbsences[r.student_id] = r; });
    }

    // Class summaries
    const classSummaries = teacherClasses.map(cName => {
      const classStudents = students.filter(s => s.cls === cName);
      const presentCount = classStudents.filter(s => todayAttendance[s.id] === 'P').length;
      return {
        cls: cName,
        totalStudents: classStudents.length,
        presentToday: presentCount,
        rate: classStudents.length ? Math.round((presentCount / classStudents.length) * 100) : 100
      };
    });

    // 4. Exams for teacher's classes
    const { rows: exams } = await pool.query(
      `SELECT * FROM exams
       WHERE cls = ANY($1) OR cls = 'All'
       ORDER BY date ASC`,
      [teacherClasses]
    );

    // 5. Marks for teacher's subject & classes
    let marksList = [];
    if (studentIds.length) {
      const { rows: mRows } = await pool.query(
        `SELECT m.student_id, m.subject, m.mark, m.comments, s.name AS "studentName", s.cls
         FROM marks m
         JOIN students s ON s.id = m.student_id
         WHERE m.subject = $1 AND m.student_id = ANY($2)
         ORDER BY s.cls ASC, s.name ASC`,
        [teacherSubject, studentIds]
      );
      marksList = mRows.map(m => ({
        ...m,
        grade: getGradeLetter(m.mark)
      }));
    }

    // 6. Assignments set for teacher's classes
    const { rows: assignments } = await pool.query(
      `SELECT a.*,
              (SELECT COUNT(*)::int FROM submissions sub WHERE sub.assignment_id = a.id) AS submission_count,
              (SELECT COUNT(*)::int FROM submissions sub WHERE sub.assignment_id = a.id AND sub.status = 'Graded') AS graded_count
       FROM assignments a
       WHERE (a.cls = ANY($1) OR a.cls = 'All') AND (a.subject = $2 OR a.subject = 'General')
       ORDER BY a.due ASC`,
      [teacherClasses, teacherSubject]
    );

    // 7. LMS Courses, Modules (Topics), & Lessons
    const { rows: courses } = await pool.query(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM lms_lessons l WHERE l.course_id = c.id) AS lesson_count,
              (SELECT COUNT(*)::int FROM lms_modules m WHERE m.course_id = c.id) AS module_count
       FROM lms_courses c
       WHERE c.teacher_id = $1 OR c.subject = $2 OR c.cls = ANY($3)
       ORDER BY c.created_at DESC`,
      [teacherId, teacherSubject, teacherClasses]
    );

    const coursesWithTopics = await Promise.all(courses.map(async (crs) => {
      const { rows: modules } = await pool.query(
        `SELECT m.*,
                (SELECT json_agg(l ORDER BY l.order_index ASC)
                 FROM lms_lessons l
                 WHERE l.module_id = m.id) AS lessons
         FROM lms_modules m
         WHERE m.course_id = $1
         ORDER BY m.order_index ASC`,
        [crs.id]
      );
      return {
        ...crs,
        modules: modules.map(m => ({ ...m, lessons: m.lessons || [] }))
      };
    }));

    // 8. Messages & Parent Consultations
    const { rows: messages } = await pool.query(
      `SELECT m.*
       FROM messages m
       WHERE m.recipient_id = $1 OR m.sender_id = $1
          OR m.recipient_role = 'teacher'
       ORDER BY m.created_at DESC LIMIT 50`,
      [teacherId]
    );

    // Extract parents linked to teacher's students for convenient messaging
    const parentMap = new Map();
    students.forEach(s => {
      if (s.guardian && s.guardianName) {
        if (!parentMap.has(s.guardian)) {
          parentMap.set(s.guardian, {
            id: s.guardian,
            name: s.guardianName,
            phone: s.guardianPhone,
            email: s.guardianEmail,
            studentName: s.name,
            studentClass: s.cls
          });
        }
      }
    });
    const classParents = Array.from(parentMap.values());

    // 9. Teacher Timetable (Where Ms. Alemu teaches throughout the week)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const periods = [
      { num: 1, time: '08:00 - 08:50' },
      { num: 2, time: '09:00 - 09:50' },
      { num: 3, time: '10:00 - 10:50' },
      { num: 'Break', time: '11:00 - 11:45', isBreak: true },
      { num: 4, time: '12:00 - 12:50' },
      { num: 5, time: '13:00 - 13:50' },
      { num: 6, time: '14:00 - 14:50' }
    ];

    // Build teacher's timetable schedule
    const teacherSchedule = periods.map(p => {
      if (p.isBreak) {
        return {
          period: p.num,
          time: p.time,
          isBreak: true,
          slots: days.map(d => ({ day: d, subject: 'Staff Break / Consultation', cls: '—', room: 'Staff Room' }))
        };
      }
      const slots = days.map((dayName, dIdx) => {
        const clsIndex = (dIdx + p.num) % teacherClasses.length;
        const assignedClass = teacherClasses[clsIndex];
        const room = `Room 10${(p.num % 4) + 1}`;
        return {
          day: dayName,
          subject: teacherSubject,
          cls: assignedClass,
          room,
          time: p.time
        };
      });
      return {
        period: `Period ${p.num}`,
        time: p.time,
        isBreak: false,
        slots
      };
    });

    // 10. Announcements
    const { rows: announcements } = await pool.query(
      `SELECT * FROM announcements
       WHERE author_name = $1 OR target_role = 'All' OR target_role = 'Teacher'
       ORDER BY created_at DESC LIMIT 15`,
      [teacher.name]
    );

    res.json({
      teacher: {
        id: teacher.id,
        name: teacher.name,
        subject: teacherSubject,
        classes: teacherClasses,
        phone: teacher.phone,
        email: teacher.email,
        status: teacher.status
      },
      classSummaries,
      students,
      attendance: {
        date: todayDateStr,
        records: todayAttendance,
        reportedAbsences
      },
      exams,
      marks: marksList,
      assignments,
      lms: coursesWithTopics,
      messages,
      classParents,
      timetable: {
        days,
        periods: teacherSchedule
      },
      announcements
    });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/teacher-app/attendance ──────────────────────────────────────────
router.put('/attendance', async (req, res, next) => {
  try {
    const { date, records } = req.body || {};
    if (!date || !records || typeof records !== 'object') {
      return res.status(400).json({ error: 'Date and records object required.' });
    }

    const client = await pool.connect();
    let saved = 0;
    try {
      await client.query('BEGIN');
      for (const [studentId, status] of Object.entries(records)) {
        if (!'PALE'.includes(status)) continue;
        await client.query(
          `INSERT INTO attendance (student_id, date, status)
           VALUES ($1, $2, $3)
           ON CONFLICT (student_id, date)
           DO UPDATE SET status = EXCLUDED.status`,
          [studentId, date, status]
        );
        if (status === 'E') {
          await client.query(
            `UPDATE absence_reports SET status = 'Excused' WHERE student_id = $1 AND date = $2`,
            [studentId, date]
          );
        }
        saved++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    await auditLog(req.user.username, req.user.role, 'TEACHER_RECORD_ATTENDANCE', 'attendance', date, { count: saved });
    res.json({ success: true, saved, message: `Successfully recorded attendance for ${saved} students.` });
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/teacher-app/grade ───────────────────────────────────────────────
router.put('/grade', async (req, res, next) => {
  try {
    const { studentId, subject, mark, comment } = req.body || {};
    if (!studentId || !subject) {
      return res.status(400).json({ error: 'studentId and subject are required.' });
    }

    const val = Math.max(0, Math.min(100, Number(mark) || 0));

    await pool.query(
      `INSERT INTO marks (student_id, subject, mark, comments)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (student_id, subject)
       DO UPDATE SET
         mark = EXCLUDED.mark,
         comments = COALESCE(EXCLUDED.comments, marks.comments)`,
      [studentId, subject, val, comment || null]
    );

    await auditLog(req.user.username, req.user.role, 'TEACHER_GRADE_STUDENT', 'marks', `${studentId}_${subject}`, {
      studentId, subject, mark: val, comment
    });

    res.json({
      success: true,
      studentId,
      subject,
      mark: val,
      grade: getGradeLetter(val),
      comment
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/teacher-app/lesson ─────────────────────────────────────────────
router.post('/lesson', async (req, res, next) => {
  try {
    const { moduleId, courseId, title, content, videoUrl, durationMinutes = 20, resources = [] } = req.body || {};
    if (!moduleId || !courseId || !title) {
      return res.status(400).json({ error: 'moduleId, courseId, and title are required.' });
    }

    const id = `LES_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    // Get current lesson count in module
    const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM lms_lessons WHERE module_id = $1', [moduleId]);
    const orderIndex = countRows[0].c;

    const { rows } = await pool.query(
      `INSERT INTO lms_lessons (id, module_id, course_id, title, content, video_url, duration_minutes, order_index, resources)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [id, moduleId, courseId, title, content || '', videoUrl || null, Number(durationMinutes), orderIndex, JSON.stringify(resources)]
    );

    await auditLog(req.user.username, req.user.role, 'TEACHER_UPLOAD_LESSON', 'lms_lessons', id, { title, courseId, moduleId });
    res.status(201).json({ success: true, lesson: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/teacher-app/topic ──────────────────────────────────────────────
router.post('/topic', async (req, res, next) => {
  try {
    const { courseId, title, description } = req.body || {};
    if (!courseId || !title) {
      return res.status(400).json({ error: 'courseId and title are required.' });
    }

    const id = `MOD_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM lms_modules WHERE course_id = $1', [courseId]);
    const orderIndex = countRows[0].c;

    const { rows } = await pool.query(
      `INSERT INTO lms_modules (id, course_id, title, description, order_index)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, courseId, title, description || '', orderIndex]
    );

    await auditLog(req.user.username, req.user.role, 'TEACHER_CREATE_TOPIC', 'lms_modules', id, { title, courseId });
    res.status(201).json({ success: true, topic: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/teacher-app/message-parent ─────────────────────────────────────
router.post('/message-parent', async (req, res, next) => {
  try {
    const { parentId, parentName, subject, body, meetingDate } = req.body || {};
    if (!parentId || !body) {
      return res.status(400).json({ error: 'parentId and body are required.' });
    }

    const id = `MSG_${Date.now().toString().slice(-6)}`;
    const teacherName = req.user.name || 'Class Teacher';
    const teacherId = req.user.teacherId || 'T01';

    const { rows } = await pool.query(
      `INSERT INTO messages (id, sender_role, sender_id, sender_name, recipient_role, recipient_id, recipient_name, subject, body, meeting_date)
       VALUES ($1, 'teacher', $2, $3, 'parent', $4, $5, $6, $7, $8)
       RETURNING *`,
      [id, teacherId, teacherName, parentId, parentName || 'Parent', subject || 'Update regarding your child', body, meetingDate || null]
    );

    await auditLog(req.user.username, req.user.role, 'TEACHER_MESSAGE_PARENT', 'messages', id, { parentId, subject });
    res.status(201).json({ success: true, message: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/teacher-app/assignment ─────────────────────────────────────────
router.post('/assignment', async (req, res, next) => {
  try {
    const { title, subject, cls, due } = req.body || {};
    if (!title || !subject || !cls || !due) {
      return res.status(400).json({ error: 'title, subject, cls, and due date are required.' });
    }

    const id = `A${Date.now().toString().slice(-4)}`;
    const { rows } = await pool.query(
      `INSERT INTO assignments (id, title, subject, cls, due, status)
       VALUES ($1, $2, $3, $4, $5, 'Open')
       RETURNING *`,
      [id, title, subject, cls, due]
    );

    await auditLog(req.user.username, req.user.role, 'TEACHER_CREATE_ASSIGNMENT', 'assignments', id, { title, cls, subject });
    res.status(201).json({ success: true, assignment: rows[0] });
  } catch (err) {
    next(err);
  }
});

export default router;
