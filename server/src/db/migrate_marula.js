import 'dotenv/config';
import { pool } from './index.js';
import bcrypt from 'bcryptjs';

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'parent')),
        name TEXT NOT NULL,
        teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
        student_id TEXT REFERENCES students(id) ON DELETE SET NULL,
        parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 2. student_parents table (many-to-many)
    await client.query(`
      CREATE TABLE IF NOT EXISTS student_parents (
        id SERIAL PRIMARY KEY,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
        relationship TEXT DEFAULT 'Guardian',
        is_primary BOOLEAN DEFAULT true,
        UNIQUE(student_id, parent_id)
      );
    `);

    // 3. teaching_assignments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS teaching_assignments (
        id TEXT PRIMARY KEY,
        teacher_id TEXT REFERENCES teachers(id) ON DELETE CASCADE,
        cls TEXT NOT NULL,
        subject TEXT NOT NULL,
        is_cover BOOLEAN DEFAULT false,
        cover_for TEXT REFERENCES teachers(id) ON DELETE SET NULL,
        UNIQUE(cls, subject)
      );
    `);

    // 4. submissions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS submissions (
        id TEXT PRIMARY KEY,
        assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        content TEXT,
        file_name TEXT,
        submitted_at TIMESTAMPTZ DEFAULT NOW(),
        grade NUMERIC(5,2),
        feedback TEXT,
        status TEXT DEFAULT 'Submitted' CHECK (status IN ('Submitted', 'Graded', 'Returned')),
        UNIQUE(assignment_id, student_id)
      );
    `);

    // 5. absence_reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS absence_reports (
        id TEXT PRIMARY KEY,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        parent_id TEXT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
        date TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'Reported' CHECK (status IN ('Reported', 'Excused', 'Reviewed')),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 6. announcements table
    await client.query(`
      CREATE TABLE IF NOT EXISTS announcements (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        content TEXT NOT NULL,
        target_role TEXT DEFAULT 'All',
        cls TEXT DEFAULT 'All',
        author_role TEXT NOT NULL,
        author_name TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 7. leave_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS leave_requests (
        id TEXT PRIMARY KEY,
        teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        reason TEXT NOT NULL,
        status TEXT DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
        cover_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 8. messages table
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        sender_role TEXT NOT NULL,
        sender_id TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        recipient_role TEXT NOT NULL,
        recipient_id TEXT NOT NULL,
        recipient_name TEXT NOT NULL,
        subject TEXT,
        body TEXT NOT NULL,
        meeting_date TEXT,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // 9. trip_consents table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trip_consents (
        id TEXT PRIMARY KEY,
        trip_name TEXT NOT NULL,
        trip_date TEXT NOT NULL,
        details TEXT,
        cls TEXT NOT NULL,
        student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES parents(id) ON DELETE CASCADE,
        consent BOOLEAN DEFAULT false,
        notes TEXT,
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(trip_name, student_id)
      );
    `);

    // 10. audit_log table
    await client.query(`
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        actor_username TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        action TEXT NOT NULL,
        target_entity TEXT,
        target_id TEXT,
        details JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alter existing tables for columns if not present
    await client.query(`
      ALTER TABLE marks ADD COLUMN IF NOT EXISTS comments TEXT;
      ALTER TABLE marks ADD COLUMN IF NOT EXISTS exam_id TEXT;
      ALTER TABLE assignments ADD COLUMN IF NOT EXISTS teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS results_published BOOLEAN DEFAULT false;
      ALTER TABLE settings ADD COLUMN IF NOT EXISTS results_locked BOOLEAN DEFAULT false;
    `);

    // Seed student_parents from students table
    await client.query(`
      INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
      SELECT id, guardian, 'Primary Guardian', true
      FROM students WHERE guardian IS NOT NULL
      ON CONFLICT DO NOTHING;
    `);

    // Also populate default teaching_assignments based on teachers and classes
    const { rows: teachers } = await client.query('SELECT id, name, subject, classes FROM teachers');
    for (const t of teachers) {
      if (t.classes && Array.isArray(t.classes)) {
        for (const c of t.classes) {
          const assignId = `TA_${t.id}_${c}`;
          await client.query(`
            INSERT INTO teaching_assignments (id, teacher_id, cls, subject)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (cls, subject) DO UPDATE SET teacher_id=EXCLUDED.teacher_id;
          `, [assignId, t.id, c, t.subject]);
        }
      }
    }

    // Seed default accounts in users table
    const hash = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'school123', 8);
    const initialUsers = [
      { id: 'U_admin', username: 'admin', role: 'admin', name: 'Administrator' },
      { id: 'U_teacher', username: 'teacher', role: 'teacher', name: 'Ms. Alemu', teacher_id: 'T01' },
      { id: 'U_student', username: 'student', role: 'student', name: 'Dejenie Abebe', student_id: 'S1034' },
      { id: 'U_parent', username: 'parent', role: 'parent', name: 'Abebe', parent_id: 'P23' },
    ];

    for (const u of initialUsers) {
      await client.query(`
        INSERT INTO users (id, username, password_hash, role, name, teacher_id, student_id, parent_id)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT (username) DO UPDATE SET
          role = EXCLUDED.role,
          name = EXCLUDED.name,
          teacher_id = EXCLUDED.teacher_id,
          student_id = EXCLUDED.student_id,
          parent_id = EXCLUDED.parent_id;
      `, [u.id, u.username, hash, u.role, u.name, u.teacher_id || null, u.student_id || null, u.parent_id || null]);
    }

    // Seed demo announcements if none exist
    const { rows: annCount } = await client.query('SELECT COUNT(*)::int AS c FROM announcements');
    if (annCount[0].c === 0) {
      await client.query(`
        INSERT INTO announcements (id, title, content, target_role, cls, author_role, author_name)
        VALUES
          ('ANN_1', 'Welcome to Term 1', 'Welcome back all students and parents! Please review class schedules and school rules.', 'All', 'All', 'admin', 'Administrator'),
          ('ANN_2', 'Science Practical Guidelines', 'Students in 9B: Please prepare your lab manuals for next week science practical.', 'Student', '9B', 'teacher', 'Mr. Banda'),
          ('ANN_3', 'Upcoming Parent-Teacher Consultations', 'Parent-teacher conferences are scheduled for the end of this month. Book your slot in the portal.', 'Parent', 'All', 'admin', 'Administrator');
      `);
    }

    // Seed demo trip consents
    const { rows: tripCount } = await client.query('SELECT COUNT(*)::int AS c FROM trip_consents');
    if (tripCount[0].c === 0) {
      const { rows: stus } = await client.query("SELECT id, guardian FROM students WHERE cls='7A' LIMIT 5");
      for (const s of stus) {
        await client.query(`
          INSERT INTO trip_consents (id, trip_name, trip_date, details, cls, student_id, parent_id, consent)
          VALUES ($1, 'National Museum Science Excursion', '2026-11-15', 'Full-day educational trip to National Museum. Bus departure 8:30 AM.', '7A', $2, $3, false)
          ON CONFLICT DO NOTHING;
        `, [`TRIP_1_${s.id}`, s.id, s.guardian]);
      }
    }

    await client.query('COMMIT');
    console.log('✅  Migration successful!');
    process.exit(0);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
