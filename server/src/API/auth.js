import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db } from '../data.js';

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
// 'r' = view, 'w' = view and change. Admin gets 'w' everywhere.
const PM = {
  teacher: { dashboard: 'r', students: 'r', classes: 'r', subjects: 'r', attendance: 'w', exams: 'w', assignments: 'w', timetable: 'r', library: 'r', reports: 'r' },
  student: { dashboard: 'r', exams: 'r', assignments: 'r', timetable: 'r', library: 'r', fees: 'r', attendance: 'r' },
  parent: { dashboard: 'r', exams: 'r', assignments: 'r', timetable: 'r', fees: 'r', attendance: 'r' },
};
const KEYS = ['dashboard', 'students', 'teachers', 'classes', 'subjects', 'attendance', 'exams', 'assignments', 'fees', 'parents', 'timetable', 'library', 'reports', 'settings'];
export const perm = (role, k) => (role === 'admin' ? 'w' : PM[role]?.[k] || '');
const permissions = role => Object.fromEntries(KEYS.map(k => [k, perm(role, k)]).filter(([, v]) => v));

const hash = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'school123', 8);
const USERS = [
  { username: 'admin', role: 'admin', name: 'Administrator' },
  { username: 'teacher', role: 'teacher', name: 'Ms. Alder', teacherId: 'T01' },
  { username: 'student', role: 'student', name: 'Sara Bekele', studentId: 'S1001' },
  { username: 'parent', role: 'parent', name: 'Daniel Hassan', parentId: 'P01' },
];

export function login(req, res) {
  const { username, password } = req.body || {};
  const user = USERS.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(String(password || ''), hash)) return res.status(401).json({ error: 'Wrong username or password.' });
  res.json({ token: jwt.sign(user, SECRET, { expiresIn: '8h' }), user, permissions: permissions(user.role) });
}
export function auth(req, res, next) {
  try { req.user = jwt.verify((req.headers.authorization || '').replace('Bearer ', ''), SECRET); next(); }
  catch { res.status(401).json({ error: 'Sign in required.' }); }
}
export const allow = (key, need = 'r') => (req, res, next) => {
  const p = perm(req.user.role, key);
  if (!p || (need === 'w' && p !== 'w')) return res.status(403).json({ error: 'Your role can’t do that.' });
  next();
};
// Students see themselves; parents see their children; everyone else sees all (null).
export const ownStudentIds = u =>
  u.role === 'student' ? [u.studentId] : u.role === 'parent' ? db.students.filter(s => s.guardian === u.parentId).map(s => s.id) : null;
// Teachers only work with their own classes (null = all).
export const myClasses = u => (u.role === 'teacher' ? db.teachers.find(t => t.id === u.teacherId)?.classes || [] : null);
