import express from 'express';
import { pool, SUB, feeStatus } from '../db/index.js';
import { auth, allow, ownStudentIds, myClasses, mySubject, auditLog } from '../API/auth.js';

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
  assignments: ['title','subject','cls','due','status','teacher_id'],
  parents:     ['name','phone','email'],
  library:     ['title','author','copies','issued'],
  fees:        ['student','amount','paid','term','date','status'],
};

function buildInsert(table, id, data) {
  const cols = ['id', ...COLS[table].filter(c => data[c] !== undefined)];
  const vals = [id, ...cols.slice(1).map(c => data[c])];
  const ph   = vals.map((_, i) => `$${i + 1}`).join(', ');
  return { sql: `INSERT INTO ${table} (${cols.join(',')}) VALUES (${ph}) RETURNING *`, vals };
}

function buildUpdate(table, id, data) {
  const cols = COLS[table].filter(c => data[c] !== undefined);
  const sets = cols.map((c, i) => `${c}=$${i + 2}`).join(', ');
  const vals = [id, ...cols.map(c => data[c])];
  return { sql: `UPDATE ${table} SET ${sets} WHERE id=$1 RETURNING *`, vals };
}

function fmt(k, row) {
  if (!row) return row;
  const r = { ...row };
  for (const f of ['amount','paid','copies','issued']) if (f in r) r[f] = Number(r[f]);
  return r;
}

// Visibility scoping rules per role (Problems 3, 5)
async function visible(k, row, user) {
  if (user.role === 'admin') return true;

  const own = await ownStudentIds(user);
  const mine = await myClasses(user);

  if (k === 'fees') {
    if (user.role === 'teacher') return false; // Teachers NEVER see fees
    if (own) return own.includes(row.student);
    return false;
  }

  if (k === 'students') {
    if (own) return own.includes(row.id);
    if (user.role === 'teacher') {
      return mine ? mine.includes(row.cls) : false;
    }
    return true;
  }

  if (k === 'exams') {
    if (own) {
      // Find classes of own students
      const { rows: stus } = await pool.query('SELECT cls FROM students WHERE id=ANY($1)', [own]);
      const myClsList = stus.map(s => s.cls);
      return row.cls === 'All' || myClsList.includes(row.cls);
    }
    if (user.role === 'teacher') {
      return row.cls === 'All' || (mine && mine.includes(row.cls));
    }
    return true;
  }

  if (k === 'assignments') {
    if (own) {
      const { rows: stus } = await pool.query('SELECT cls FROM students WHERE id=ANY($1)', [own]);
      const myClsList = stus.map(s => s.cls);
      return row.cls === 'All' || myClsList.includes(row.cls);
    }
    if (user.role === 'teacher') {
      return mine && mine.includes(row.cls);
    }
    return true;
  }

  if (k === 'parents') {
    if (user.role === 'student') return false;
    if (user.role === 'parent') return row.id === user.parentId;
    if (user.role === 'teacher') {
      // Can view parents whose children are in the teacher's classes
      const { rows } = await pool.query(
        'SELECT 1 FROM students WHERE guardian=$1 AND cls=ANY($2) LIMIT 1',
        [row.id, mine || []]
      );
      return rows.length > 0;
    }
    return true;
  }

  return true;
}

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

        // Teacher write validations (Problem 4)
        if (req.user.role === 'teacher') {
          const mine = await myClasses(req.user);
          const tSub = await mySubject(req.user);

          if (k === 'exams') {
            if (data.cls !== 'All' && (!mine || !mine.includes(data.cls))) {
              await client.query('ROLLBACK');
              return res.status(403).json({ error: 'You can only schedule exams for your assigned classes.' });
            }
          }
          if (k === 'assignments') {
            if (!mine || !mine.includes(data.cls)) {
              await client.query('ROLLBACK');
              return res.status(403).json({ error: 'You can only post assignments for your assigned classes.' });
            }
            if (tSub && data.subject !== tSub) {
              await client.query('ROLLBACK');
              return res.status(403).json({ error: `You can only post assignments for your assigned subject (${tSub}).` });
            }
            data.teacher_id = req.user.teacherId;
          }
          if (k === 'fees') {
            await client.query('ROLLBACK');
            return res.status(403).json({ error: 'Teachers cannot create fee records.' });
          }
        }

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
          if (data.guardian) {
            await client.query(
              `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
               VALUES ($1, $2, 'Primary Guardian', true)
               ON CONFLICT DO NOTHING`,
              [id, data.guardian]
            );
          }
        }

        await auditLog(req.user.username, req.user.role, 'CREATE', k, id, data);
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

        // Teacher write validations (Problem 4)
        if (req.user.role === 'teacher') {
          const mine = await myClasses(req.user);
          const tSub = await mySubject(req.user);

          if (k === 'exams') {
            const targetCls = req.body.cls || row.cls;
            if (targetCls !== 'All' && (!mine || !mine.includes(targetCls))) {
              return res.status(403).json({ error: 'You can only edit exams for your assigned classes.' });
            }
          }
          if (k === 'assignments') {
            const targetCls = req.body.cls || row.cls;
            const targetSub = req.body.subject || row.subject;
            if (!mine || !mine.includes(targetCls)) {
              return res.status(403).json({ error: 'You can only edit assignments for your assigned classes.' });
            }
            if (tSub && targetSub !== tSub) {
              return res.status(403).json({ error: `You can only edit assignments for your assigned subject (${tSub}).` });
            }
          }
          if (k === 'fees') {
            return res.status(403).json({ error: 'Teachers cannot edit fee records.' });
          }
        }

        const { data, error } = clean(k, { ...fmt(k, row), ...req.body });
        if (error) return res.status(400).json({ error });

        const { sql, vals } = buildUpdate(k, req.params.id, data);
        const { rows } = await pool.query(sql, vals);

        if (k === 'students' && data.guardian) {
          await pool.query(
            `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary)
             VALUES ($1, $2, 'Primary Guardian', true)
             ON CONFLICT (student_id, parent_id) DO UPDATE SET is_primary=true`,
            [req.params.id, data.guardian]
          );
        }

        await auditLog(req.user.username, req.user.role, 'UPDATE', k, req.params.id, data);
        res.json(fmt(k, rows[0]));
      } catch (err) { next(err); }
    });

    // DELETE /:id (Problem 7: clean up all orphaned records!)
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

        // Clean up orphaned records on delete (Problem 7)
        if (k === 'students') {
          await client.query('DELETE FROM payments WHERE student_id=$1', [req.params.id]);
          await client.query('DELETE FROM attendance WHERE student_id=$1', [req.params.id]);
          await client.query('DELETE FROM marks WHERE student_id=$1', [req.params.id]);
          await client.query('DELETE FROM fees WHERE student=$1', [req.params.id]);
          await client.query('DELETE FROM submissions WHERE student_id=$1', [req.params.id]);
          await client.query('DELETE FROM student_parents WHERE student_id=$1', [req.params.id]);
          await client.query('DELETE FROM absence_reports WHERE student_id=$1', [req.params.id]);
          await client.query('DELETE FROM trip_consents WHERE student_id=$1', [req.params.id]);
          await client.query('UPDATE users SET student_id=NULL WHERE student_id=$1', [req.params.id]);
        } else if (k === 'teachers') {
          await client.query('UPDATE classes SET teacher=NULL WHERE teacher=$1', [req.params.id]);
          await client.query('DELETE FROM teaching_assignments WHERE teacher_id=$1', [req.params.id]);
          await client.query('UPDATE leave_requests SET cover_teacher_id=NULL WHERE cover_teacher_id=$1', [req.params.id]);
          await client.query('UPDATE users SET teacher_id=NULL WHERE teacher_id=$1', [req.params.id]);
        } else if (k === 'parents') {
          await client.query('DELETE FROM student_parents WHERE parent_id=$1', [req.params.id]);
          await client.query('UPDATE students SET guardian=NULL WHERE guardian=$1', [req.params.id]);
          await client.query('DELETE FROM absence_reports WHERE parent_id=$1', [req.params.id]);
          await client.query('UPDATE users SET parent_id=NULL WHERE parent_id=$1', [req.params.id]);
        } else if (k === 'fees') {
          // Deleting a fee deletes its payment records so no dangling payment rows show "—"
          await client.query('DELETE FROM payments WHERE receipt_id=$1 OR id=$1', [req.params.id]);
        }

        await client.query(`DELETE FROM ${k} WHERE id=$1`, [req.params.id]);
        await auditLog(req.user.username, req.user.role, 'DELETE', k, req.params.id, row);
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
          const receiptId = `RCP_${Date.now().toString().slice(-6)}`;
          await client.query(
            'INSERT INTO payments (id, receipt_id, student_id, date, amount) VALUES ($1,$2,$3,$4,$5)',
            [fee.id, receiptId, fee.student, req.body.date || today, amt]
          );

          await auditLog(req.user.username, req.user.role, 'FEE_PAYMENT', 'fees', fee.id, {
            student: fee.student, amount: amt, receiptId
          });

          await client.query('COMMIT');
          res.json({ ...fmt('fees', updated[0]), receiptId });
        } catch (err) { await client.query('ROLLBACK'); next(err); }
        finally { client.release(); }
      });
    }

    app.use('/api/' + k, auth, r);
  }
}
