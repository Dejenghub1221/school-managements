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
const permissions = role => Object.fromEntries(KEYS.map(k => [k, perm(role, k)]).filter(([, v]) => v));

const hash = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'school123', 8);
const USERS = [
  { username: 'admin',   role: 'admin',   name: 'Administrator' },
  { username: 'teacher', role: 'teacher', name: 'Ms. Alemu',     teacherId: 'T01' },
  { username: 'student', role: 'student', name: 'Dejenie Abebe', studentId: 'S1034' },
  { username: 'parent',  role: 'parent',  name: 'Abebe',         parentId: 'P23' },
];

// Bump TOKEN_VERSION to invalidate all existing sessions (forces fresh login)
const TOKEN_VERSION = 2;

export function login(req, res) {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(String(password || ''), hash))
    return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({
    token: jwt.sign({ ...user, v: TOKEN_VERSION }, SECRET, { expiresIn: '8h' }),
    user,
    permissions: permissions(user.role)
  });
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
  if (user.role === 'student') return [user.studentId];
  if (user.role === 'parent') {
    const { rows } = await pool.query(
      'SELECT id FROM students WHERE guardian = $1', [user.parentId]
    );
    return rows.map(r => r.id);
  }
  return null;
}

// Returns array of class names the teacher owns, or null (= all).
export async function myClasses(user) {
  if (user.role === 'teacher') {
    const { rows } = await pool.query(
      'SELECT classes FROM teachers WHERE id = $1', [user.teacherId]
    );
    return rows[0]?.classes || [];
  }
  return null;
}
