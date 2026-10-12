import { pool } from '../db/index.js';

export const gr = a => (a >= 80 ? 'A' : a >= 70 ? 'B' : a >= 60 ? 'C' : a >= 50 ? 'D' : 'F');

// Average mark for a student across all subjects
export async function avg(studentId) {
  const { rows } = await pool.query(
    'SELECT AVG(mark)::float AS avg FROM marks WHERE student_id = $1', [studentId]
  );
  return rows[0]?.avg || 0;
}

// Attendance counts {P,A,L,E} for an array of student IDs
export async function attOf(ids) {
  const c = { P: 0, A: 0, L: 0, E: 0 };
  if (!ids.length) return c;
  const { rows } = await pool.query(
    `SELECT status, COUNT(*)::int AS cnt
     FROM attendance WHERE student_id = ANY($1)
     GROUP BY status`,
    [ids]
  );
  rows.forEach(r => { c[r.status] = r.cnt; });
  return c;
}

// Attendance rate: (Present + Late) / total
export const rate = c => {
  const t = c.P + c.A + c.L + c.E;
  return t ? Math.round(((c.P + c.L) / t) * 100) : 0;
};

export async function studentName(id) {
  const { rows } = await pool.query('SELECT name FROM students WHERE id = $1', [id]);
  return rows[0]?.name || id;
}

export async function parentName(id) {
  const { rows } = await pool.query('SELECT name FROM parents WHERE id = $1', [id]);
  return rows[0]?.name || id;
}
