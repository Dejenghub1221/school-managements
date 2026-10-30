import express from 'express';
import { pool } from '../db/index.js';
import { allow, ownStudentIds, myClasses, auditLog } from '../API/auth.js';

const router = express.Router();

// ── GET /api/lms/stats ────────────────────────────────────────────────────────
router.get('/stats', async (req, res, next) => {
  try {
    const role = req.user.role;
    const own = await ownStudentIds(req.user);

    if (role === 'student' && own?.length) {
      const studentId = own[0];
      const { rows: stRows } = await pool.query('SELECT cls FROM students WHERE id = $1', [studentId]);
      const cls = stRows[0]?.cls || '7A';

      // Total courses for student's class
      const { rows: crsCount } = await pool.query(
        "SELECT COUNT(*)::int AS count FROM lms_courses WHERE (cls = $1 OR cls = 'All') AND status = 'Published'",
        [cls]
      );

      // Total lessons in these courses
      const { rows: lesCount } = await pool.query(`
        SELECT COUNT(l.id)::int AS count
        FROM lms_lessons l
        JOIN lms_courses c ON c.id = l.course_id
        WHERE (c.cls = $1 OR c.cls = 'All') AND c.status = 'Published'
      `, [cls]);

      // Lessons completed by student
      const { rows: compCount } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM lms_lesson_progress WHERE student_id = $1 AND completed = true',
        [studentId]
      );

      // Quiz attempts
      const { rows: qzStats } = await pool.query(`
        SELECT COUNT(*)::int AS attempts,
               COALESCE(AVG(score), 0)::numeric(5,1) AS avg_score,
               COUNT(*) FILTER (WHERE passed = true)::int AS passed
        FROM lms_quiz_attempts
        WHERE student_id = $1
      `, [studentId]);

      const totalLessons = lesCount[0]?.count || 0;
      const completedLessons = compCount[0]?.count || 0;
      const overallProgress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return res.json({
        totalCourses: crsCount[0]?.count || 0,
        totalLessons,
        completedLessons,
        overallProgress,
        quizAttempts: qzStats[0]?.attempts || 0,
        quizAvgScore: Number(qzStats[0]?.avg_score || 0),
        quizzesPassed: qzStats[0]?.passed || 0
      });
    }

    if (role === 'parent' && own?.length) {
      // Aggregate stats for parent's linked children
      const { rows: compCount } = await pool.query(
        'SELECT COUNT(*)::int AS count FROM lms_lesson_progress WHERE student_id = ANY($1) AND completed = true',
        [own]
      );
      const { rows: qzStats } = await pool.query(`
        SELECT COUNT(*)::int AS attempts,
               COALESCE(AVG(score), 0)::numeric(5,1) AS avg_score,
               COUNT(*) FILTER (WHERE passed = true)::int AS passed
        FROM lms_quiz_attempts
        WHERE student_id = ANY($1)
      `, [own]);

      return res.json({
        linkedChildren: own.length,
        completedLessons: compCount[0]?.count || 0,
        quizAttempts: qzStats[0]?.attempts || 0,
        quizAvgScore: Number(qzStats[0]?.avg_score || 0),
        quizzesPassed: qzStats[0]?.passed || 0
      });
    }

    // Teacher or Admin stats
    const { rows: courseStats } = await pool.query("SELECT COUNT(*)::int AS count FROM lms_courses WHERE status != 'Archived'");
    const { rows: lessonStats } = await pool.query('SELECT COUNT(*)::int AS count FROM lms_lessons');
    const { rows: quizStats } = await pool.query('SELECT COUNT(*)::int AS count FROM lms_quizzes');
    const { rows: attemptStats } = await pool.query(`
      SELECT COUNT(*)::int AS attempts,
             COALESCE(AVG(score), 0)::numeric(5,1) AS avg_score,
             COUNT(*) FILTER (WHERE passed = true)::int AS passed
      FROM lms_quiz_attempts
    `);

    res.json({
      totalCourses: courseStats[0]?.count || 0,
      totalLessons: lessonStats[0]?.count || 0,
      totalQuizzes: quizStats[0]?.count || 0,
      totalQuizAttempts: attemptStats[0]?.attempts || 0,
      quizAvgScore: Number(attemptStats[0]?.avg_score || 0),
      quizzesPassed: attemptStats[0]?.passed || 0
    });
  } catch (err) {
    next(err);
  }
});

// ── GET /api/lms/courses ──────────────────────────────────────────────────────
router.get('/courses', async (req, res, next) => {
  try {
    const role = req.user.role;
    const own = await ownStudentIds(req.user);
    const classes = await myClasses(req.user);

    let query = `
      SELECT c.*,
             t.name AS teacher_name,
             t.email AS teacher_email,
             COUNT(DISTINCT m.id)::int AS module_count,
             COUNT(DISTINCT l.id)::int AS lesson_count
      FROM lms_courses c
      LEFT JOIN teachers t ON t.id = c.teacher_id
      LEFT JOIN lms_modules m ON m.course_id = c.id
      LEFT JOIN lms_lessons l ON l.course_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (role === 'student' && own?.length) {
      const studentId = own[0];
      const { rows: stRows } = await pool.query('SELECT cls FROM students WHERE id = $1', [studentId]);
      const studentCls = stRows[0]?.cls || '7A';
      params.push(studentCls);
      conditions.push(`(c.cls = $${params.length} OR c.cls = 'All')`);
      conditions.push("c.status = 'Published'");
    } else if (role === 'parent' && own?.length) {
      // Find classes of children
      const { rows: kids } = await pool.query('SELECT cls FROM students WHERE id = ANY($1)', [own]);
      const kidClasses = [...new Set(kids.map(k => k.cls).filter(Boolean))];
      params.push(kidClasses);
      conditions.push(`(c.cls = ANY($${params.length}) OR c.cls = 'All')`);
      conditions.push("c.status = 'Published'");
    } else if (role === 'teacher') {
      if (req.user.teacherId) {
        params.push(req.user.teacherId);
        params.push(classes || []);
        conditions.push(`(c.teacher_id = $1 OR c.cls = ANY($2) OR c.cls = 'All')`);
      }
    }

    if (conditions.length) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ` GROUP BY c.id, t.name, t.email ORDER BY c.created_at ASC`;

    const { rows: courses } = await pool.query(query, params);

    // If student or parent, attach completion progress per course
    if (role === 'student' && own?.length) {
      const studentId = own[0];
      const { rows: progressRows } = await pool.query(`
        SELECT course_id, COUNT(*)::int AS completed_count
        FROM lms_lesson_progress
        WHERE student_id = $1 AND completed = true
        GROUP BY course_id
      `, [studentId]);

      const progressMap = Object.fromEntries(progressRows.map(p => [p.course_id, p.completed_count]));

      courses.forEach(c => {
        c.completedLessons = progressMap[c.id] || 0;
        c.progressPercentage = c.lesson_count > 0
          ? Math.min(100, Math.round(((c.completedLessons) / c.lesson_count) * 100))
          : 0;
      });
    }

    res.json(courses);
  } catch (err) {
    next(err);
  }
});

// ── POST /api/lms/courses ─────────────────────────────────────────────────────
router.post('/courses', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Only teachers and administrators can create courses.' });
    }

    const { title, subject, cls, description, thumbnail, status = 'Published' } = req.body;
    if (!title || !subject || !cls) {
      return res.status(400).json({ error: 'Title, subject, and class are required.' });
    }

    const teacherId = req.user.role === 'teacher' ? (req.user.teacherId || null) : (req.body.teacherId || null);
    const id = `CRS_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;

    const { rows } = await pool.query(`
      INSERT INTO lms_courses (id, title, subject, cls, teacher_id, description, thumbnail, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `, [id, title, subject, cls, teacherId, description || '', thumbnail || 'gradient-teal', status]);

    await auditLog(req.user.username, req.user.role, 'CREATE_LMS_COURSE', 'lms_courses', id, { title, cls, subject });
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── GET /api/lms/courses/:id ──────────────────────────────────────────────────
router.get('/courses/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { rows: courseRows } = await pool.query(`
      SELECT c.*, t.name AS teacher_name, t.email AS teacher_email, t.phone AS teacher_phone
      FROM lms_courses c
      LEFT JOIN teachers t ON t.id = c.teacher_id
      WHERE c.id = $1
    `, [id]);

    if (!courseRows.length) {
      return res.status(404).json({ error: 'Course not found.' });
    }

    const course = courseRows[0];

    // Fetch modules
    const { rows: modules } = await pool.query(`
      SELECT * FROM lms_modules
      WHERE course_id = $1
      ORDER BY order_index ASC, created_at ASC
    `, [id]);

    // Fetch lessons
    const { rows: lessons } = await pool.query(`
      SELECT * FROM lms_lessons
      WHERE course_id = $1
      ORDER BY order_index ASC, created_at ASC
    `, [id]);

    // Fetch quizzes
    const { rows: quizzes } = await pool.query(`
      SELECT q.id, q.course_id, q.module_id, q.title, q.description, q.passing_score, q.time_limit_minutes,
             q.created_at, jsonb_array_length(q.questions) AS question_count,
             ${req.user.role === 'admin' || req.user.role === 'teacher' ? 'q.questions' : "jsonb_path_query_array(q.questions, '$[*] ? (!exists(@.correct_index))') AS safe_questions, q.questions"}
      FROM lms_quizzes q
      WHERE q.course_id = $1
      ORDER BY q.created_at ASC
    `, [id]);

    // Fetch materials
    const { rows: materials } = await pool.query(`
      SELECT * FROM lms_materials
      WHERE course_id = $1
      ORDER BY uploaded_at DESC
    `, [id]);

    // Fetch discussions
    const { rows: discussions } = await pool.query(`
      SELECT * FROM lms_discussions
      WHERE course_id = $1
      ORDER BY created_at ASC
    `, [id]);

    // Attach student progress if student or parent
    const own = await ownStudentIds(req.user);
    if (own?.length) {
      const studentId = own[0];
      const { rows: progress } = await pool.query(
        'SELECT lesson_id, completed, completed_at FROM lms_lesson_progress WHERE student_id = $1 AND course_id = $2',
        [studentId, id]
      );
      const progMap = Object.fromEntries(progress.map(p => [p.lesson_id, p]));

      lessons.forEach(l => {
        l.completed = !!progMap[l.id]?.completed;
        l.completed_at = progMap[l.id]?.completed_at || null;
      });

      // Best quiz attempts for this student
      const { rows: attempts } = await pool.query(`
        SELECT quiz_id, MAX(score) AS best_score, bool_or(passed) AS has_passed, COUNT(*)::int AS attempt_count
        FROM lms_quiz_attempts
        WHERE student_id = $1
        GROUP BY quiz_id
      `, [studentId]);
      const attMap = Object.fromEntries(attempts.map(a => [a.quiz_id, a]));

      quizzes.forEach(q => {
        q.bestScore = attMap[q.id]?.best_score !== undefined ? Number(attMap[q.id].best_score) : null;
        q.hasPassed = !!attMap[q.id]?.has_passed;
        q.attemptCount = attMap[q.id]?.attempt_count || 0;
      });
    }

    // Connect lessons into modules
    const moduleMap = {};
    modules.forEach(m => {
      m.lessons = [];
      moduleMap[m.id] = m;
    });

    const unassignedLessons = [];
    lessons.forEach(l => {
      if (moduleMap[l.module_id]) {
        moduleMap[l.module_id].lessons.push(l);
      } else {
        unassignedLessons.push(l);
      }
    });

    course.modules = modules;
    course.unassignedLessons = unassignedLessons;
    course.quizzes = quizzes;
    course.materials = materials;
    course.discussions = discussions;

    // Calculate overall course progress if student
    if (own?.length) {
      const completedCount = lessons.filter(l => l.completed).length;
      course.completedLessons = completedCount;
      course.totalLessons = lessons.length;
      course.progressPercentage = lessons.length > 0
        ? Math.round((completedCount / lessons.length) * 100)
        : 0;
    }

    // For teacher/admin, fetch enrolled student list and overall class progress
    if (req.user.role === 'admin' || req.user.role === 'teacher') {
      const { rows: enrolledStudents } = await pool.query(`
        SELECT s.id, s.name, s.cls, s.gender,
               COUNT(lp.lesson_id) FILTER (WHERE lp.completed = true)::int AS completed_lessons
        FROM students s
        LEFT JOIN lms_lesson_progress lp ON lp.student_id = s.id AND lp.course_id = $1
        WHERE s.cls = $2 OR $2 = 'All'
        GROUP BY s.id, s.name, s.cls, s.gender
        ORDER BY s.name ASC
      `, [id, course.cls]);

      course.enrolledStudents = enrolledStudents.map(s => ({
        ...s,
        totalLessons: lessons.length,
        progressPercent: lessons.length > 0 ? Math.round((s.completed_lessons / lessons.length) * 100) : 0
      }));
    }

    res.json(course);
  } catch (err) {
    next(err);
  }
});

// ── PUT /api/lms/courses/:id ──────────────────────────────────────────────────
router.put('/courses/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { title, subject, cls, description, thumbnail, status, teacherId } = req.body;

    const { rows } = await pool.query(`
      UPDATE lms_courses
      SET title = COALESCE($1, title),
          subject = COALESCE($2, subject),
          cls = COALESCE($3, cls),
          description = COALESCE($4, description),
          thumbnail = COALESCE($5, thumbnail),
          status = COALESCE($6, status),
          teacher_id = COALESCE($7, teacher_id),
          updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `, [title, subject, cls, description, thumbnail, status, teacherId, id]);

    if (!rows.length) return res.status(404).json({ error: 'Course not found.' });
    await auditLog(req.user.username, req.user.role, 'UPDATE_LMS_COURSE', 'lms_courses', id, { title });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── DELETE /api/lms/courses/:id ───────────────────────────────────────────────
router.delete('/courses/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM lms_courses WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Course not found.' });

    await auditLog(req.user.username, req.user.role, 'DELETE_LMS_COURSE', 'lms_courses', id);
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ── Modules Endpoints ─────────────────────────────────────────────────────────
router.post('/modules', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { courseId, title, description, orderIndex = 0 } = req.body;
    if (!courseId || !title) {
      return res.status(400).json({ error: 'Course ID and title are required.' });
    }

    const id = `MOD_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const { rows } = await pool.query(`
      INSERT INTO lms_modules (id, course_id, title, description, order_index)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `, [id, courseId, title, description || '', orderIndex]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/modules/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { title, description, orderIndex } = req.body;

    const { rows } = await pool.query(`
      UPDATE lms_modules
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          order_index = COALESCE($3, order_index)
      WHERE id = $4
      RETURNING *
    `, [title, description, orderIndex, id]);

    if (!rows.length) return res.status(404).json({ error: 'Module not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/modules/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM lms_modules WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Module not found.' });
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ── Lessons Endpoints ─────────────────────────────────────────────────────────
router.post('/lessons', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { courseId, moduleId, title, content, videoUrl, durationMinutes = 20, orderIndex = 0, resources = [] } = req.body;
    if (!courseId || !moduleId || !title) {
      return res.status(400).json({ error: 'Course ID, Module ID, and title are required.' });
    }

    const id = `LES_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const { rows } = await pool.query(`
      INSERT INTO lms_lessons (id, course_id, module_id, title, content, video_url, duration_minutes, order_index, resources)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
      RETURNING *
    `, [id, courseId, moduleId, title, content || '', videoUrl || '', durationMinutes, orderIndex, JSON.stringify(resources)]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/lessons/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { title, content, videoUrl, durationMinutes, orderIndex, resources, moduleId } = req.body;

    const { rows } = await pool.query(`
      UPDATE lms_lessons
      SET title = COALESCE($1, title),
          content = COALESCE($2, content),
          video_url = COALESCE($3, video_url),
          duration_minutes = COALESCE($4, duration_minutes),
          order_index = COALESCE($5, order_index),
          resources = CASE WHEN $6::jsonb IS NOT NULL THEN $6::jsonb ELSE resources END,
          module_id = COALESCE($7, module_id)
      WHERE id = $8
      RETURNING *
    `, [title, content, videoUrl, durationMinutes, orderIndex, resources ? JSON.stringify(resources) : null, moduleId, id]);

    if (!rows.length) return res.status(404).json({ error: 'Lesson not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/lessons/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM lms_lessons WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Lesson not found.' });
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ── Lesson Progress (Toggle completed) ────────────────────────────────────────
router.post('/lessons/:id/progress', async (req, res, next) => {
  try {
    const { id: lessonId } = req.params;
    const { completed = true } = req.body;

    const own = await ownStudentIds(req.user);
    const studentId = req.user.studentId || (own?.length ? own[0] : req.body.studentId);

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID required.' });
    }

    // Get course_id for this lesson
    const { rows: lRows } = await pool.query('SELECT course_id FROM lms_lessons WHERE id = $1', [lessonId]);
    if (!lRows.length) return res.status(404).json({ error: 'Lesson not found.' });
    const courseId = lRows[0].course_id;

    if (completed) {
      await pool.query(`
        INSERT INTO lms_lesson_progress (student_id, lesson_id, course_id, completed, completed_at)
        VALUES ($1, $2, $3, true, NOW())
        ON CONFLICT (student_id, lesson_id)
        DO UPDATE SET completed = true, completed_at = NOW()
      `, [studentId, lessonId, courseId]);
    } else {
      await pool.query(`
        UPDATE lms_lesson_progress
        SET completed = false, completed_at = NULL
        WHERE student_id = $1 AND lesson_id = $2
      `, [studentId, lessonId]);
    }

    // Return updated course progress stats
    const { rows: totalRows } = await pool.query('SELECT COUNT(*)::int AS count FROM lms_lessons WHERE course_id = $1', [courseId]);
    const { rows: compRows } = await pool.query(
      'SELECT COUNT(*)::int AS count FROM lms_lesson_progress WHERE student_id = $1 AND course_id = $2 AND completed = true',
      [studentId, courseId]
    );

    const total = totalRows[0]?.count || 0;
    const done = compRows[0]?.count || 0;
    const percentage = total > 0 ? Math.round((done / total) * 100) : 0;

    res.json({
      success: true,
      lessonId,
      completed,
      completedLessons: done,
      totalLessons: total,
      progressPercentage: percentage
    });
  } catch (err) {
    next(err);
  }
});

// ── Quizzes Endpoints ─────────────────────────────────────────────────────────
router.post('/quizzes', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { courseId, moduleId, title, description, passingScore = 70, timeLimitMinutes = 15, questions = [] } = req.body;
    if (!courseId || !title || !questions.length) {
      return res.status(400).json({ error: 'Course ID, title, and at least one question are required.' });
    }

    const id = `QZ_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const { rows } = await pool.query(`
      INSERT INTO lms_quizzes (id, course_id, module_id, title, description, passing_score, time_limit_minutes, questions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
    `, [id, courseId, moduleId || null, title, description || '', passingScore, timeLimitMinutes, JSON.stringify(questions)]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/quizzes/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { title, description, passingScore, timeLimitMinutes, questions, moduleId } = req.body;

    const { rows } = await pool.query(`
      UPDATE lms_quizzes
      SET title = COALESCE($1, title),
          description = COALESCE($2, description),
          passing_score = COALESCE($3, passing_score),
          time_limit_minutes = COALESCE($4, time_limit_minutes),
          questions = CASE WHEN $5::jsonb IS NOT NULL THEN $5::jsonb ELSE questions END,
          module_id = COALESCE($6, module_id)
      WHERE id = $7
      RETURNING *
    `, [title, description, passingScore, timeLimitMinutes, questions ? JSON.stringify(questions) : null, moduleId, id]);

    if (!rows.length) return res.status(404).json({ error: 'Quiz not found.' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/quizzes/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM lms_quizzes WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Quiz not found.' });
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

// ── POST /api/lms/quizzes/:id/attempt (Student takes/submits quiz) ────────────
router.post('/quizzes/:id/attempt', async (req, res, next) => {
  try {
    const { id: quizId } = req.params;
    const { answers = [] } = req.body; // array of selected option indices

    const own = await ownStudentIds(req.user);
    const studentId = req.user.studentId || (own?.length ? own[0] : req.body.studentId);

    if (!studentId) {
      return res.status(400).json({ error: 'Student ID required.' });
    }

    const { rows: qRows } = await pool.query('SELECT * FROM lms_quizzes WHERE id = $1', [quizId]);
    if (!qRows.length) return res.status(404).json({ error: 'Quiz not found.' });

    const quiz = qRows[0];
    const questions = quiz.questions || [];
    let correctCount = 0;

    const review = questions.map((q, idx) => {
      const selectedIndex = answers[idx] !== undefined ? answers[idx] : null;
      const isCorrect = selectedIndex !== null && Number(selectedIndex) === Number(q.correct_index);
      if (isCorrect) correctCount++;

      return {
        questionId: q.id || idx + 1,
        question: q.question,
        options: q.options,
        selectedIndex,
        correctIndex: q.correct_index,
        isCorrect,
        explanation: q.explanation || ''
      };
    });

    const score = questions.length > 0 ? Number(((correctCount / questions.length) * 100).toFixed(2)) : 0;
    const passed = score >= Number(quiz.passing_score || 70);

    const attemptId = `ATT_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    await pool.query(`
      INSERT INTO lms_quiz_attempts (id, quiz_id, student_id, score, passed, answers)
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
    `, [attemptId, quizId, studentId, score, passed, JSON.stringify(answers)]);

    await auditLog(req.user.username, req.user.role, 'SUBMIT_LMS_QUIZ', 'lms_quizzes', quizId, { score, passed });

    res.json({
      attemptId,
      quizId,
      score,
      passed,
      passingScore: quiz.passing_score,
      totalQuestions: questions.length,
      correctCount,
      review
    });
  } catch (err) {
    next(err);
  }
});

// ── Discussions Endpoints ─────────────────────────────────────────────────────
router.get('/discussions', async (req, res, next) => {
  try {
    const { courseId, lessonId } = req.query;
    if (!courseId) return res.status(400).json({ error: 'courseId query parameter required.' });

    let sql = 'SELECT * FROM lms_discussions WHERE course_id = $1';
    const params = [courseId];

    if (lessonId) {
      params.push(lessonId);
      sql += ` AND (lesson_id = $2 OR lesson_id IS NULL)`;
    }

    sql += ' ORDER BY created_at ASC LIMIT 150';
    const { rows } = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/discussions', async (req, res, next) => {
  try {
    const { courseId, lessonId, message } = req.body;
    if (!courseId || !message?.trim()) {
      return res.status(400).json({ error: 'courseId and message are required.' });
    }

    const id = `DISC_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const authorId = req.user.id || req.user.username;
    const authorName = req.user.name || req.user.username;
    const authorRole = req.user.role;

    const { rows } = await pool.query(`
      INSERT INTO lms_discussions (id, course_id, lesson_id, author_id, author_name, author_role, message)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `, [id, courseId, lessonId || null, authorId, authorName, authorRole, message.trim()]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// ── Course Materials Endpoints ────────────────────────────────────────────────
router.post('/materials', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { courseId, title, fileType = 'Document', fileUrl = '#', fileSize = '1.0 MB' } = req.body;
    if (!courseId || !title) {
      return res.status(400).json({ error: 'courseId and title are required.' });
    }

    const id = `MAT_${Date.now()}_${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const { rows } = await pool.query(`
      INSERT INTO lms_materials (id, course_id, title, file_type, file_url, file_size)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `, [id, courseId, title, fileType, fileUrl, fileSize]);

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/materials/:id', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin' && req.user.role !== 'teacher') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    const { id } = req.params;
    const { rows } = await pool.query('DELETE FROM lms_materials WHERE id = $1 RETURNING id', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Material not found.' });
    res.json({ success: true, id });
  } catch (err) {
    next(err);
  }
});

export default router;
