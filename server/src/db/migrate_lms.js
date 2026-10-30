import 'dotenv/config';
import { pool } from './index.js';

export async function migrateLmsSchema() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. LMS Courses table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_courses (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        subject TEXT NOT NULL,
        cls TEXT NOT NULL,
        teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
        description TEXT,
        thumbnail TEXT,
        status TEXT DEFAULT 'Published' CHECK (status IN ('Draft', 'Published', 'Archived')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. LMS Modules (Units/Sections) table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_modules (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 3. LMS Lessons table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_lessons (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL REFERENCES lms_modules(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        content TEXT,
        video_url TEXT,
        resources JSONB DEFAULT '[]'::jsonb,
        duration_minutes INTEGER DEFAULT 20,
        order_index INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 4. LMS Student Lesson Progress table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_lesson_progress (
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        lesson_id TEXT NOT NULL REFERENCES lms_lessons(id) ON DELETE CASCADE,
        course_id TEXT NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
        completed BOOLEAN DEFAULT true,
        completed_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (student_id, lesson_id)
      );
    `);

    // 5. LMS Quizzes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_quizzes (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
        module_id TEXT REFERENCES lms_modules(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        description TEXT,
        passing_score INTEGER DEFAULT 70,
        time_limit_minutes INTEGER DEFAULT 15,
        questions JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 6. LMS Quiz Attempts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_quiz_attempts (
        id TEXT PRIMARY KEY,
        quiz_id TEXT NOT NULL REFERENCES lms_quizzes(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        score NUMERIC(5,2) NOT NULL,
        passed BOOLEAN DEFAULT false,
        answers JSONB,
        attempted_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 7. LMS Discussions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_discussions (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
        lesson_id TEXT REFERENCES lms_lessons(id) ON DELETE SET NULL,
        author_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        author_role TEXT NOT NULL,
        message TEXT NOT NULL,
        parent_id TEXT REFERENCES lms_discussions(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 8. LMS Course Materials / Library table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lms_materials (
        id TEXT PRIMARY KEY,
        course_id TEXT NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        file_type TEXT DEFAULT 'Document',
        file_url TEXT,
        file_size TEXT,
        uploaded_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Create performance indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lms_modules_course ON lms_modules(course_id);
      CREATE INDEX IF NOT EXISTS idx_lms_lessons_course ON lms_lessons(course_id);
      CREATE INDEX IF NOT EXISTS idx_lms_lessons_module ON lms_lessons(module_id);
      CREATE INDEX IF NOT EXISTS idx_lms_progress_student ON lms_lesson_progress(student_id);
      CREATE INDEX IF NOT EXISTS idx_lms_progress_course ON lms_lesson_progress(course_id);
      CREATE INDEX IF NOT EXISTS idx_lms_quizzes_course ON lms_quizzes(course_id);
      CREATE INDEX IF NOT EXISTS idx_lms_attempts_student ON lms_quiz_attempts(student_id);
      CREATE INDEX IF NOT EXISTS idx_lms_discussions_course ON lms_discussions(course_id);
      CREATE INDEX IF NOT EXISTS idx_lms_materials_course ON lms_materials(course_id);
    `);

    await client.query('COMMIT');
    console.log('✅ LMS tables verified & updated.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.warn('⚠️ LMS migration note:', err.message);
  } finally {
    client.release();
  }
}

// Allow direct CLI execution
if (process.argv[1]?.endsWith('migrate_lms.js')) {
  migrateLmsSchema().then(() => process.exit(0)).catch(e => {
    console.error(e);
    process.exit(1);
  });
}
