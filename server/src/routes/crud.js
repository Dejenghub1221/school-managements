import express from 'express';
import { pool, SUB, feeStatus } from '../db/index.js';
import { auth, allow, ownStudentIds } from '../API/auth.js';

// ── schema ────────────────────────────────────────────────────────────────────
const REQUIRED = {
  students:    ['name', 'cls'],
  teachers:    ['name', 'subject'],
  classes:     ['name'],
  subjects:    ['name'],
  exams:       ['name', 'date'],
  assignments: ['title', 'cls'],
  parents:     ['name'],
  library:     ['title'],
  fees:        ['student', 'amount']
};
const NUMBERS = ['amount', 'paid', 'copies', 'issued'];

// Prefix config: { table → [prefix, padWidth] }
const PREFIX = {
  students: ['S', 4], teachers: ['T', 2], classes: ['C', 1],
  subjects: ['U', 1], exams: ['E', 1], assignments: ['A', 1],
  parents: ['P', 2], library: ['B', 1], fees: ['F', 3]
};

async function nextId(client, table) {
  const [p, w] = PREFIX[table];
  const { rows } = await client.query(`SELECT id FROM ${table} ORDER BY id DESC LIMIT 1`);
  const last = rows.length ? parseInt(rows[0].id.slice(p.length)) || 0 : 0;
  return p + String(last + 1).padStart(w, '0');
}

function clean(k, body = {}) {
  const data = { ...body };
  delete data.id;
  for (const f of NUMBERS) if (f in data) data[f] = Number(data[f]) || 0;
  const missing = REQUIRED[k].filter(f => data[f] === undefined || data[f] === '');
  if (missing.length) return { error: `Missing: ${missing.join(', ')}` };
  if (k === 'students'    && !data.status) data.status = 'Active';
  if (k === 'teachers'    && !data.status) data.status = 'Active';
  if (k === 'assignments' && !data.status) data.status = 'Open';
  if (k === 'exams'       && !data.status) data.status = 'Scheduled';
  if (k === 'fees') {
    data.paid ??= 0;
    if (data.paid > data.amount) return { error: 'Paid cannot exceed the amount billed.' };
    data.status = feeStatus(data.amount, data.paid);
  }
  if (k === 'library' && data.issued > data.copies)
    return { error: 'Issued cannot exceed total copies.' };
  return { data };
}

// ── column lists per table ────────────────────────────────────────────────────
const COLS = {
  students:    ['name','cls','gender','dob','phone','guardian','status','address'],
  teachers:    ['name','subject','classes','phone','email','status'],
  classes:     ['name','teacher','room'],
  subjects:    ['name','code'],
  exams:       ['name','cls','date','status'],
  assignments: ['title','subject','cls','due','status'],
  parents:     ['name','phone','email'],
  library:     ['title','author','copies','issued'],
  fees:        ['student','amount','paid','term','date','status'],
};

// Build INSERT … RETURNING * from a data object
function buildInsert(table, id, data) {
  const cols = ['id', ...COLS[table].filter(c => data[c] !== undefined)];
  const vals = [id, ...cols.slice(1).map(c => data[c])];
  const ph   = vals.map((_, i) => `$${i + 1}`).join(', ');
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals };
}

// Build UPDATE … RETURNING * from a data object
function buildUpdate(table, id, data) {
  const cols = COLS[table].filter(c => data[c] !== undefined);
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(', ');
  const vals = [id, ...cols.map(c => data[c])];
  return { sql: `UPDATE ${table} SET ${sets} WHERE id=$1 RETURNING *`, vals };
}

// Row → plain JS object (convert numeric strings, rename snake_case)
function fmt(k, row) {
  if (!row) return row;
  const r = { ...row };
  for (const f of ['amount','paid','copies','issued']) if (f in r) r[f] = Number(r[f]);
  return r;
}

// Visibility: restrict students/fees rows to what the user is allowed to see
async function visible(k, row, user) {
  const own = await ownStudentIds(user);
  if (!own) return true;
  if (k === 'fees')     return own.includes(row.student);
  if (k === 'students') return own.includes(row.id);
  return true;
}

// ── router factory ────────────────────────────────────────────────────────────
export function setupCrud(app) {
  for (const k of Object.keys(REQUIRED)) {
    const r = express.Router();

    // GET /
    r.get('/', allow(k), async (req, res, next) => {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${k} ORDER BY id`);
        const filtered = [];
        for (const row of rows) {
          if (await visible(k, row, req.user)) filtered.push(fmt(k, row));
        }
        res.json(filtered);
      } catch (err) { next(err); }
    });

    // GET /:id
    r.get('/:id', allow(k), async (req, res, next) => {
      try {
        const { rows } = await pool.query(`SELECT * FROM ${k} WHERE id=$1`, [req.params.id]);
        const row = rows[0];
        if (!row || !(await visible(k, row, req.user))) return res.status(404).json({ error: 'Not found.' });
        res.json(fmt(k, row));
      } catch (err) { next(err); }
    });

    // POST /
    r.post('/', allow(k, 'w'), async (req, res, next) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { data, error } = clean(k, req.body);
        if (error) { await client.query('ROLLBACK'); return res.status(400).json({ error }); }
        const id = await nextId(client, k);
        const { sql, vals } = buildInsert(k, id, data);
        const { rows } = await client.query(sql, vals);
        if (k === 'students') {
          for (const sub of SUB) {
            await client.query(
              'INSERT INTO marks (student_id, subject, mark) VALUES ($1,$2,0) ON CONFLICT DO NOTHING',
              [id, sub]
            );
          }
        }
        await client.query('COMMIT');
        res.status(201).json(fmt(k, rows[0]));
      } catch (err) { await client.query('ROLLBACK'); next(err); }
      finally { client.release(); }
    });

    // PUT /:id
    r.put('/:id', allow(k, 'w'), async (req, res, next) => {
      try {
        const { rows: existing } = await pool.query(`SELECT * FROM ${k} WHERE id=$1`, [req.params.id]);
        const row = existing[0];
        if (!row || !(await visible(k, row, req.user))) return res.status(404).json({ error: 'Not found.' });
        const { data, error } = clean(k, { ...fmt(k, row), ...req.body });
        if (error) return res.status(400).json({ error });
        const { sql, vals } = buildUpdate(k, req.params.id, data);
        const { rows } = await pool.query(sql, vals);
        res.json(fmt(k, rows[0]));
      } catch (err) { next(err); }
    });

    // DELETE /:id
    r.delete('/:id', allow(k, 'w'), async (req, res, next) => {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const { rows } = await client.query(`SELECT * FROM ${k} WHERE id=$1`, [req.params.id]);
        const row = rows[0];
        if (!row || !(await visible(k, row, req.user))) {
          await client.query('ROLLBACK');
          return res.status(404).json({ error: 'Not found.' });
        }
        await client.query(`DELETE FROM ${k} WHERE id=$1`, [req.params.id]);
        // CASCADE handles fees + marks when student is deleted (defined in schema.sql)
        await client.query('COMMIT');
        res.status(204).end();
      } catch (err) { await client.query('ROLLBACK'); next(err); }
      finally { client.release(); }
    });

    // POST /fees/:id/pay
    if (k === 'fees') {
      r.post('/:id/pay', allow('fees', 'w'), async (req, res, next) => {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          const { rows } = await client.query('SELECT * FROM fees WHERE id=$1', [req.params.id]);
          const fee = rows[0];
          if (!fee) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Not found.' }); }
          const amt = Number(req.body.amount || req.body.amt);
          if (!(amt > 0)) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Enter an amount above zero.' }); }
          const balance = Number(fee.amount) - Number(fee.paid);
          if (amt > balance) { await client.query('ROLLBACK'); return res.status(400).json({ error: `Amount is more than the balance of ${balance}.` }); }
          const newPaid = Number(fee.paid) + amt;
          const status  = feeStatus(Number(fee.amount), newPaid);
          const { rows: updated } = await client.query(
            'UPDATE fees SET paid=$1, status=$2 WHERE id=$3 RETURNING *',
            [newPaid, status, fee.id]
          );
          const today = new Date().toISOString().slice(0, 10);
          await client.query(
            'INSERT INTO payments (id, receipt_id, student_id, date, amount) VALUES ($1,$2,$3,$4,$5)',
            [fee.id, fee.id, fee.student, req.body.date || today, amt]
          );
          await client.query('COMMIT');
          res.json(fmt('fees', updated[0]));
        } catch (err) { await client.query('ROLLBACK'); next(err); }
        finally { client.release(); }
      });
    }

    app.use('/api/' + k, auth, r);
  }
}
