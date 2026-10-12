import pg from 'pg';

const { Pool } = pg;

// Single connection pool — reused across all requests
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// ─── Helpers shared across routes (mirror the old in-memory API) ────────────

export const CLS = ['7A', '7B', '8A', '8B', '9A', '9B'];
export const SUB = ['Mathematics', 'English', 'Science', 'History', 'Geography', 'ICT'];

export const feeStatus = (amount, paid) =>
  paid >= amount ? 'Paid' : paid > 0 ? 'Partial' : 'Unpaid';

// Generate next prefixed ID for an entity table
// e.g. nid(pool, 'students', 'S', 4) → 'S1001'
export async function nid(table, prefix, width) {
  const { rows } = await pool.query(
    `SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`
  );
  if (!rows.length) return prefix + String(1).padStart(width, '0');
  const last = parseInt(rows[0].id.slice(prefix.length)) || 0;
  return prefix + String(last + 1).padStart(width, '0');
}

export const PREFIX = {
  students:    ['S', 4],
  teachers:    ['T', 2],
  classes:     ['C', 1],
  subjects:    ['U', 1],
  exams:       ['E', 1],
  assignments: ['A', 1],
  parents:     ['P', 2],
  library:     ['B', 1],
  fees:        ['F', 3]
};

// ─── Thin query wrappers used by routes ─────────────────────────────────────

export const q  = (sql, params) => pool.query(sql, params);
export const q1 = async (sql, params) => {
  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
};
export const qa = async (sql, params) => {
  const { rows } = await pool.query(sql, params);
  return rows;
};
