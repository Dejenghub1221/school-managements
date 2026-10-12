import express from 'express';
import { db, nid, feeStatus, SUB } from '../data.js';
import { auth, allow, ownStudentIds } from '../API/auth.js';

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

function clean(k, body = {}) {
  const data = { ...body };
  delete data.id;
  for (const f of NUMBERS) if (f in data) data[f] = Number(data[f]) || 0;
  const missing = REQUIRED[k].filter(f => data[f] === undefined || data[f] === '');
  if (missing.length) return { error: `Missing: ${missing.join(', ')}` };
  if (k === 'students' && !data.status) data.status = 'Active';
  if (k === 'teachers' && !data.status) data.status = 'Active';
  if (k === 'assignments' && !data.status) data.status = 'Open';
  if (k === 'exams' && !data.status) data.status = 'Scheduled';
  if (k === 'fees') {
    data.paid ??= 0;
    if (data.paid > data.amount) return { error: 'Paid cannot exceed the amount billed.' };
    data.status = feeStatus(data.amount, data.paid);
  }
  if (k === 'library' && data.issued > data.copies) return { error: 'Issued cannot exceed total copies.' };
  return { data };
}

const visible = (k, row, u) => {
  const own = ownStudentIds(u);
  return !own || (k === 'fees' ? own.includes(row.student) : k === 'students' ? own.includes(row.id) : true);
};

export function setupCrud(app) {
  for (const k of Object.keys(REQUIRED)) {
    const r = express.Router();
    const find = (req, res) => {
      const row = db[k].find(x => x.id === req.params.id);
      if (!row || !visible(k, row, req.user)) res.status(404).json({ error: 'Not found.' });
      return row;
    };

    r.get('/',    allow(k),      (req, res) => res.json(db[k].filter(x => visible(k, x, req.user))));
    r.get('/:id', allow(k),      (req, res) => { const row = find(req, res); if (row) res.json(row); });
    r.post('/',   allow(k, 'w'), (req, res) => {
      const { data, error } = clean(k, req.body);
      if (error) return res.status(400).json({ error });
      const row = { id: nid(k), ...data };
      db[k].push(row);
      if (k === 'students') {
        db.marks[row.id] = {};
        SUB.forEach(s => { db.marks[row.id][s] = 0; });
      }
      res.status(201).json(row);
    });
    r.put('/:id', allow(k, 'w'), (req, res) => {
      const row = find(req, res);
      if (!row) return;
      const { data, error } = clean(k, { ...row, ...req.body });
      if (error) return res.status(400).json({ error });
      res.json(Object.assign(row, data));
    });
    r.delete('/:id', allow(k, 'w'), (req, res) => {
      const row = find(req, res);
      if (!row) return;
      db[k] = db[k].filter(x => x !== row);
      if (k === 'students') {
        db.fees = db.fees.filter(f => f.student !== row.id);
        delete db.marks[row.id];
      }
      res.status(204).end();
    });

    if (k === 'fees') {
      r.post('/:id/pay', allow('fees', 'w'), (req, res) => {
        const row = find(req, res);
        if (!row) return;
        const amt = Number(req.body.amount || req.body.amt);
        if (!(amt > 0)) return res.status(400).json({ error: 'Enter an amount above zero.' });
        if (amt > row.amount - row.paid) {
          return res.status(400).json({ error: `Amount is more than the balance of ${row.amount - row.paid}.` });
        }
        row.paid += amt;
        row.status = feeStatus(row.amount, row.paid);
        const today = new Date().toISOString().slice(0, 10);
        db.payments.push({
          id: row.id, receiptId: row.id, studentId: row.student,
          date: req.body.date || today, amount: amt
        });
        res.json(row);
      });
    }

    app.use('/api/' + k, auth, r);
  }
}
