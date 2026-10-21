import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { pool } from '../db/index.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

// 'r' = view, 'w' = view and change. Admin gets 'w' everywhere.
const PM = {
  teacher: { dashboard: 'r', students: 'r', classes: 'r', subjects: 'r', attendance: 'w', exams: 'w', assignments: 'w', timetable: 'r', library: 'r', reports: 'r' },
  student: { dashboard: 'r', exams: 'r', assignments: 'r', timetable: 'r', library: 'r', fees: 'r', attendance: 'r' },
  parent:  { dashboard: 'r', exams: 'r', assignments: 'r', timetable: 'r', fees: 'r', attendance: 'r' },
};
const KEYS = ['dashboard','students','teachers','classes','subjects','attendance','exams','assignments','fees','parents','timetable','library','reports','settings'];
export const perm = (role, k) => (role === 'admin' ? 'w' : PM[role]?.[k] || '');
export const permissions = role => Object.fromEntries(KEYS.map(k => [k, perm(role, k)]).filter(([, v]) => v));

const hash = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'school123', 8);
const USERS = [
  { username: 'admin',   role: 'admin',   name: 'Administrator' },
  { username: 'teacher', role: 'teacher', name: 'Ms. Alemu',     teacherId: 'T01' },
  { username: 'student', role: 'student', name: 'Dejenie Abebe', studentId: 'S1034' },
  { username: 'parent',  role: 'parent',  name: 'Abebe',         parentId: 'P23' },
];

const TOKEN_VERSION = 2;

export async function login(req, res) {
  try {
    const { username, password } = req.body || {};
    if (!username) return res.status(400).json({ error: 'Username required.' });

    let user = null;

    // First, look up user in the real database `users` table
    const { rows: dbUsers } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (dbUsers.length) {
      const u = dbUsers[0];
      if (bcrypt.compareSync(String(password || ''), u.password_hash)) {
        user = {
          id: u.id,
          username: u.username,
          role: u.role,
          name: u.name,
          teacherId: u.teacher_id,
          studentId: u.student_id,
          parentId: u.parent_id
        };
      }
    }

    // Fall back to built-in demo USERS if not found or matched in database
    if (!user) {
      const fallbackUser = USERS.find(u => u.username === username);
      if (fallbackUser && bcrypt.compareSync(String(password || ''), hash)) {
        user = { ...fallbackUser };
      }
    }

    if (!user) {
      return res.status(401).json({ error: 'Wrong username or password.' });
    }

    // If teacher, resolve subject
    if (user.role === 'teacher' && user.teacherId) {
      const { rows: tRows } = await pool.query('SELECT subject FROM teachers WHERE id = $1', [user.teacherId]);
      if (tRows.length) user.subject = tRows[0].subject;
    }

    // Audit log
    await auditLog(user.username, user.role, 'LOGIN', 'users', user.id || user.username, { ip: req.ip });

    res.json({
      token: jwt.sign({ ...user, v: TOKEN_VERSION }, SECRET, { expiresIn: '8h' }),
      user,
      permissions: permissions(user.role)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

export function auth(req, res, next) {
  try {
    const decoded = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET);
    if (decoded.v !== TOKEN_VERSION) {
      return res.status(401).json({ error: 'Session expired. Please sign in again.' });
    }
    req.user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Sign in required.' });
  }
}

export const allow = (key, need = 'r') => (req, res, next) => {
  const p = perm(req.user.role, key);
  if (!p || (need === 'w' && p !== 'w')) return res.status(403).json({ error: "Your role can't do that." });
  next();
};

// Returns array of student IDs the user may see, or null (= all).
export async function ownStudentIds(user) {
  if (user.role === 'student') return user.studentId ? [user.studentId] : [];
  if (user.role === 'parent') {
    const pid = user.parentId;
    if (!pid) return [];
    const { rows } = await pool.query(
      `SELECT DISTINCT student_id AS id FROM student_parents WHERE parent_id = $1
       UNION
       SELECT id FROM students WHERE guardian = $1`,
      [pid]
    );
    return rows.map(r => r.id);
  }
  return null;
}

// Returns array of class names the teacher owns, or null (= all).
export async function myClasses(user) {
  if (user.role === 'teacher') {
    const tid = user.teacherId;
    if (!tid) return [];
    const { rows } = await pool.query(
      `SELECT unnest(classes) AS cls FROM teachers WHERE id = $1
       UNION
       SELECT cls FROM teaching_assignments WHERE teacher_id = $1`,
      [tid]
    );
    const classes = rows.map(r => r.cls).filter(Boolean);
    return classes.length ? classes : ['7A'];
  }
  return null;
}

// Returns teacher's assigned subject
export async function mySubject(user) {
  if (user.role === 'teacher') {
    if (user.subject) return user.subject;
    const { rows } = await pool.query('SELECT subject FROM teachers WHERE id = $1', [user.teacherId]);
    return rows[0]?.subject || null;
  }
  return null;
}

// Audit logger helper
export async function auditLog(actorUsername, actorRole, action, targetEntity, targetId, details = {}) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_username, actor_role, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [actorUsername || 'anonymous', actorRole || 'unknown', action, targetEntity, String(targetId || ''), JSON.stringify(details)]
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}
