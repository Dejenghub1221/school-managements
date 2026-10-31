import express from 'express';
import { pool, CLS, SUB } from '../db/index.js';
import { allow, ownStudentIds, auditLog } from '../API/auth.js';

const router = express.Router();

// Helper to determine letter grade and performance description
const getGradeLetter = (score) => {
  if (score >= 90) return { letter: 'A+', gpa: 4.0, label: 'Outstanding' };
  if (score >= 80) return { letter: 'A', gpa: 3.75, label: 'Excellent' };
  if (score >= 75) return { letter: 'B+', gpa: 3.5, label: 'Very Good' };
  if (score >= 70) return { letter: 'B', gpa: 3.0, label: 'Good' };
  if (score >= 60) return { letter: 'C', gpa: 2.0, label: 'Satisfactory' };
  if (score >= 50) return { letter: 'D', gpa: 1.0, label: 'Pass' };
  return { letter: 'F', gpa: 0.0, label: 'Needs Improvement' };
};

// ── GET /api/student-app/portal ───────────────────────────────────────────────
router.get('/portal', async (req, res, next) => {
  try {
    const role = req.user.role;
    let studentId = req.user.studentId;

    // If admin or preview, fall back to demo student S1034 (Dejenie Abebe)
    if (!studentId) {
      if (role === 'admin' || role === 'teacher') {
        studentId = 'S1034';
      } else {
        const own = await ownStudentIds(req.user);
        if (own && own.length) studentId = own[0];
      }
    }

    if (!studentId) {
      return res.status(404).json({ error: 'No student record associated with this account.' });
    }

    // 1. Student basic profile
    const { rows: studentRows } = await pool.query(
      `SELECT s.*, p.name AS "guardianName", p.phone AS "guardianPhone", p.email AS "guardianEmail"
       FROM students s
       LEFT JOIN parents p ON p.id = s.guardian
       WHERE s.id = $1`,
      [studentId]
    );

    if (!studentRows.length) {
      return res.status(404).json({ error: 'Student not found.' });
    }

    const student = studentRows[0];
    const studentClass = student.cls || '7A';
    const todayDateStr = new Date().toISOString().slice(0, 10);

    // 2. Attendance history (last 30 days)
    const { rows: attRows } = await pool.query(
      `SELECT date, status FROM attendance
       WHERE student_id = $1
       ORDER BY date DESC LIMIT 30`,
      [studentId]
    );

    const attPresent = attRows.filter(a => a.status === 'P').length;
    const attLate    = attRows.filter(a => a.status === 'L').length;
    const attAbsent  = attRows.filter(a => a.status === 'A').length;
    const attExcused = attRows.filter(a => a.status === 'E').length;
    const attTotal   = attRows.length;
    const attRate    = attTotal > 0 ? Math.round(((attPresent + attLate) / attTotal) * 100) : 100;
    const todayAtt   = attRows.find(a => a.date === todayDateStr) || { status: 'P' };

    // 3. Academic Marks & Results
    const { rows: markRows } = await pool.query(
      `SELECT m.subject, m.mark, m.comments
       FROM marks m
       WHERE m.student_id = $1
       ORDER BY m.subject ASC`,
      [studentId]
    );

    const marksWithGrade = markRows.map(m => {
      const g = getGradeLetter(m.mark);
      return {
        subject: m.subject,
        mark: m.mark,
        grade: g.letter,
        gpa: g.gpa,
        label: g.label,
        comments: m.comments || 'Consistent class engagement and good participation.'
      };
    });

    const avgMark = marksWithGrade.length
      ? Math.round(marksWithGrade.reduce((acc, cur) => acc + cur.mark, 0) / marksWithGrade.length)
      : 85;
    const overallGrade = getGradeLetter(avgMark);

    // 4. Assignments & Homework for this class
    const { rows: assignmentRows } = await pool.query(
      `SELECT a.*,
              COALESCE(s.status, 'Pending') AS submission_status,
              s.grade AS submission_grade,
              s.feedback AS submission_feedback,
              s.submitted_at,
              s.content AS submission_content,
              s.file_name AS submission_file_name
       FROM assignments a
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = $1
       WHERE a.cls = $2 OR a.cls = 'All'
       ORDER BY a.due ASC`,
      [studentId, studentClass]
    );

    // 5. Scheduled Exams for this class
    const { rows: examRows } = await pool.query(
      `SELECT e.*
       FROM exams e
       WHERE e.cls = $1 OR e.cls = 'All'
       ORDER BY e.date ASC`,
      [studentClass]
    );

    // 6. Timetable (Weekly Mon-Fri periods with assigned teachers)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const ci = CLS.indexOf(studentClass) >= 0 ? CLS.indexOf(studentClass) : 0;

    const [tAssignmentsRes, teachersRes] = await Promise.all([
      pool.query(
        `SELECT ta.cls, ta.subject, ta.teacher_id, ta.is_cover, ta.cover_for,
                t.name AS teacher_name, t.status AS teacher_status,
                ct.name AS cover_teacher_name
         FROM teaching_assignments ta
         LEFT JOIN teachers t ON t.id = ta.teacher_id
         LEFT JOIN teachers ct ON ct.id = ta.cover_for
         WHERE ta.cls = $1`,
        [studentClass]
      ),
      pool.query('SELECT id, name, subject, classes, status FROM teachers')
    ]);

    const taList = tAssignmentsRes.rows;
    const teachersList = teachersRes.rows;

    const timetableRows = [];
    for (let p = 0; p < 6; p++) {
      if (p === 3) {
        timetableRows.push({
          periodNum: 'Break',
          time: '11:00 - 11:45',
          isBreak: true,
          days: days.map(() => ({ subject: 'Morning Break / Lunch', teacher: '', room: 'Cafeteria' }))
        });
      }
      const hour = 8 + p + (p > 2 ? 1 : 0);
      const timeSlot = `${String(hour).padStart(2, '0')}:00 - ${String(hour).padStart(2, '0')}:50`;

      const periodDays = days.map((dayName, d) => {
        const s = SUB[(d * 2 + p + ci) % 6];
        const matchAssign = taList.find(a => a.subject === s);
        let teacherName = 'Unassigned';

        if (matchAssign) {
          if (matchAssign.teacher_status === 'On leave' && matchAssign.cover_teacher_name) {
            teacherName = `${matchAssign.cover_teacher_name} (Cover)`;
          } else {
            teacherName = matchAssign.teacher_name || 'Unassigned';
          }
        } else {
          const matchedTeacher = teachersList.find(t => t.subject === s && (t.classes || []).includes(studentClass));
          if (matchedTeacher) {
            teacherName = matchedTeacher.status === 'On leave' ? `${matchedTeacher.name} (On leave)` : matchedTeacher.name;
          } else {
            const fallback = teachersList.find(t => t.subject === s);
            teacherName = fallback ? fallback.name : 'Unassigned';
          }
        }

        const room = `Room 10${(p % 4) + 1}`;
        return { day: dayName, subject: s, teacher: teacherName, room, time: timeSlot };
      });

      timetableRows.push({
        periodNum: `Period ${p + 1}`,
        time: timeSlot,
        isBreak: false,
        days: periodDays
      });
    }

    // Determine today's schedule index (0=Mon ... 4=Fri; default to Mon if weekend)
    const dayOfWeek = new Date().getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const todayIndex = (dayOfWeek >= 1 && dayOfWeek <= 5) ? (dayOfWeek - 1) : 0;
    const todaySchedule = timetableRows
      .filter(r => !r.isBreak)
      .map(r => ({
        period: r.periodNum,
        time: r.time,
        ...r.days[todayIndex]
      }));

    // 7. Enrolled LMS Courses & Lesson Materials
    let lmsCourses = [];
    try {
      const { rows: courses } = await pool.query(
        `SELECT c.*,
                (SELECT COUNT(*)::int FROM lms_lessons l
                 WHERE l.course_id = c.id) AS total_lessons,
                (SELECT COUNT(*)::int FROM lms_lesson_progress lp
                 WHERE lp.course_id = c.id AND lp.student_id = $1 AND lp.completed = true) AS completed_lessons
         FROM lms_courses c
         WHERE c.cls = $2 OR c.cls = 'All' OR c.cls ILIKE '%' || $2 || '%'
         ORDER BY c.created_at DESC`,
        [studentId, studentClass]
      );

      // Fetch recent lessons for fast continuation
      const coursesWithLessons = await Promise.all(courses.map(async (crs) => {
        const { rows: lessons } = await pool.query(
          `SELECT l.id, l.title, l.duration_minutes, l.video_url, l.order_index,
                  m.title AS module_title,
                  COALESCE(lp.completed, false) AS completed
           FROM lms_lessons l
           JOIN lms_modules m ON m.id = l.module_id
           LEFT JOIN lms_lesson_progress lp ON lp.lesson_id = l.id AND lp.student_id = $1
           WHERE l.course_id = $2
           ORDER BY m.order_index ASC, l.order_index ASC
           LIMIT 5`,
          [studentId, crs.id]
        );
        return {
          ...crs,
          recentLessons: lessons
        };
      }));

      lmsCourses = coursesWithLessons;
    } catch {
      lmsCourses = [];
    }

    // 8. Announcements
    const { rows: announcements } = await pool.query(
      `SELECT * FROM announcements
       WHERE (target_role = 'All' OR target_role = 'Student')
         AND (cls = 'All' OR cls = $1)
       ORDER BY created_at DESC LIMIT 10`,
      [studentClass]
    );

    // 9. Library catalogue & borrowed books
    const { rows: libraryBooks } = await pool.query(
      `SELECT * FROM library ORDER BY title ASC LIMIT 12`
    );

    // 10. School Settings
    const { rows: settingsRows } = await pool.query('SELECT school, year FROM settings LIMIT 1');
    const schoolSettings = settingsRows[0] || { school: 'ABC Academy', year: '2026/27' };

    res.json({
      student: {
        id: student.id,
        name: student.name,
        cls: student.cls,
        gender: student.gender,
        dob: student.dob,
        phone: student.phone,
        address: student.address,
        guardianName: student.guardianName,
        guardianPhone: student.guardianPhone,
        guardianEmail: student.guardianEmail
      },
      school: schoolSettings,
      attendance: {
        today: todayAtt.status === 'P' ? 'Present' : (todayAtt.status === 'L' ? 'Late' : (todayAtt.status === 'E' ? 'Excused' : 'Absent')),
        todayStatus: todayAtt.status,
        rate: attRate,
        history: attRows,
        stats: {
          present: attPresent,
          late: attLate,
          absent: attAbsent,
          excused: attExcused,
          total: attTotal
        }
      },
      academics: {
        average: avgMark,
        overallGrade: overallGrade.letter,
        gpa: overallGrade.gpa,
        label: overallGrade.label,
        marks: marksWithGrade
      },
      assignments: assignmentRows,
      exams: examRows,
      timetable: {
        cls: studentClass,
        days,
        rows: timetableRows,
        todaySchedule
      },
      lmsCourses,
      announcements,
      library: libraryBooks
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student-app/submit-assignment ──────────────────────────────────
router.post('/submit-assignment', async (req, res, next) => {
  try {
    const { assignmentId, content, fileName, fileData } = req.body || {};
    if (!assignmentId) {
      return res.status(400).json({ error: 'Assignment ID is required.' });
    }

    let studentId = req.user.studentId;
    if (!studentId) {
      if (req.user.role === 'admin') studentId = 'S1034';
      else {
        const own = await ownStudentIds(req.user);
        if (own && own.length) studentId = own[0];
      }
    }

    if (!studentId) {
      return res.status(403).json({ error: 'Student ID not found.' });
    }

    const subId = `SUB_${Date.now()}_${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

    const { rows } = await pool.query(
      `INSERT INTO submissions (id, assignment_id, student_id, content, file_name, file_data, submitted_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), 'Submitted')
       ON CONFLICT (assignment_id, student_id)
       DO UPDATE SET
         content = EXCLUDED.content,
         file_name = EXCLUDED.file_name,
         file_data = EXCLUDED.file_data,
         submitted_at = NOW(),
         status = 'Submitted'
       RETURNING *`,
      [subId, assignmentId, studentId, content || 'Assignment solution submitted.', fileName || null, fileData || null]
    );

    await auditLog(req.user, 'SUBMIT_ASSIGNMENT', 'submissions', rows[0]?.id, { assignmentId, studentId });

    res.json({
      success: true,
      message: 'Assignment submitted successfully!',
      submission: rows[0]
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/student-app/complete-lesson ────────────────────────────────────
router.post('/complete-lesson', async (req, res, next) => {
  try {
    const { lessonId } = req.body || {};
    if (!lessonId) return res.status(400).json({ error: 'Lesson ID required.' });

    let studentId = req.user.studentId || 'S1034';

    await pool.query(
      `INSERT INTO lms_lesson_progress (lesson_id, student_id, completed, completed_at)
       VALUES ($1, $2, true, NOW())
       ON CONFLICT (lesson_id, student_id)
       DO UPDATE SET completed = true, completed_at = NOW()`,
      [lessonId, studentId]
    );

    res.json({ success: true, message: 'Lesson marked as completed.' });
  } catch (err) {
    next(err);
  }
});

export default router;
