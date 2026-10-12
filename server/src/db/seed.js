/**
 * seed.js — inserts demo data into PostgreSQL.
 * Run once after applying schema.sql:
 *   node src/db/seed.js
 *
 * It is safe to re-run: all inserts use ON CONFLICT DO NOTHING.
 */

import { pool, CLS, SUB, feeStatus } from './index.js';

// ─── deterministic pseudo-random (same output every run) ──────────────────
let sd = 11;
const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
const pk  = a  => a[Math.floor(rnd() * a.length)];
const pad = (n, w) => String(n).padStart(w, '0');
const ph  = () => '+' + (100 + Math.floor(rnd() * 800)) + ' ' + (100000 + Math.floor(rnd() * 899999));

const FM = ['Daniel','Samuel','Ben','Omar','Liam','Noah','Eli','Marcus','Yusuf','Isaac','Kofi','Adam'];
const FF = ['Sara','Hana','Mia','Amira','Grace','Lina','Zoe','Nadia','Ruth','Chloe','Tamar','Aisha'];
const LN = ['Bekele','Hassan','Carter','Okafor','Lindqvist','Mensah','Rossi','Tanaka','Haile','Novak','Silva','Ibrahim'];

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // ── parents ──────────────────────────────────────────────
    for (let i = 0; i < 24; i++) {
      await client.query(
        `INSERT INTO parents (id, name, phone, email)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        [
          'P' + pad(i + 1, 2),
          pk(FM.concat(FF)) + ' ' + LN[i % 12],
          ph(),
          'parent' + (i + 1) + '@example.com'
        ]
      );
    }

    // ── teachers ─────────────────────────────────────────────
    const tn = ['Ms. Alder','Mr. Banda','Ms. Costa','Mr. Dube','Ms. Eze','Mr. Farah','Ms. Greco','Mr. Hale'];
    for (let i = 0; i < tn.length; i++) {
      await client.query(
        `INSERT INTO teachers (id, name, subject, classes, phone, email, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [
          'T' + pad(i + 1, 2),
          tn[i],
          SUB[i % 6],
          [CLS[i % 6], CLS[(i + 2) % 6]],
          ph(),
          tn[i].split(' ')[1].toLowerCase() + '@ABC.example',
          i === 7 ? 'On leave' : 'Active'
        ]
      );
    }

    // ── students + marks + fees + payments ───────────────────
    for (let i = 0; i < 36; i++) {
      const g = i % 2 ? 'Male' : 'Female';
      const l = LN[(i * 5) % 12];
      const sid = 'S' + (1001 + i);
      await client.query(
        `INSERT INTO students (id, name, cls, gender, dob, phone, guardian, status, address)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
        [
          sid,
          pk(g === 'Male' ? FM : FF) + ' ' + l,
          CLS[i % 6], g,
          (2010 + (i % 4)) + '-0' + (1 + (i % 9)) + '-1' + (i % 9),
          ph(),
          'P' + pad((i % 24) + 1, 2),
          i % 17 === 5 ? 'Inactive' : i % 23 === 7 ? 'Suspended' : 'Active',
          'Block ' + (1 + (i % 9)) + ', Riverside'
        ]
      );

      // marks
      const base = 45 + rnd() * 45;
      for (const sub of SUB) {
        const mark = Math.max(20, Math.min(99, Math.round(base + (rnd() - 0.5) * 24)));
        await client.query(
          `INSERT INTO marks (student_id, subject, mark)
           VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [sid, sub, mark]
        );
      }

      // fees
      const am = [500, 550, 600, 650, 700, 750][i % 6];
      const p  = Math.round(pk([am, am, am / 2, 0, am * 0.75]));
      const fid = 'F' + pad(i + 1, 3);
      const fdate = '2026-09-0' + (1 + (i % 9));
      await client.query(
        `INSERT INTO fees (id, student, term, amount, paid, date, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING`,
        [fid, sid, 'Term 1', am, p, fdate, feeStatus(am, p)]
      );

      // payment record
      if (p > 0) {
        await client.query(
          `INSERT INTO payments (id, receipt_id, student_id, date, amount)
           VALUES ($1,$2,$3,$4,$5)`,
          [fid, fid, sid, fdate, p]
        );
      }
    }

    // ── classes ──────────────────────────────────────────────
    for (let i = 0; i < CLS.length; i++) {
      await client.query(
        `INSERT INTO classes (id, name, teacher, room)
         VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`,
        ['C' + (i + 1), CLS[i], 'T' + pad(i + 1, 2), 'Room ' + (101 + i)]
      );
    }

    // ── subjects ─────────────────────────────────────────────
    for (let i = 0; i < SUB.length; i++) {
      await client.query(
        `INSERT INTO subjects (id, name, code)
         VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        ['U' + (i + 1), SUB[i], SUB[i].slice(0, 3).toUpperCase() + '10' + i]
      );
    }

    // ── exams ────────────────────────────────────────────────
    const exams = [
      ['E1', 'Term 1 mid-term',      'All', '2026-10-14', 'Scheduled'],
      ['E2', 'Mathematics test',     '8A',  '2026-10-21', 'Scheduled'],
      ['E3', 'Science practical',    '9B',  '2026-10-28', 'Scheduled'],
      ['E4', 'Term 1 opening quiz',  'All', '2026-09-12', 'Completed']
    ];
    for (const [id, name, cls, date, status] of exams) {
      await client.query(
        `INSERT INTO exams (id, name, cls, date, status)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [id, name, cls, date, status]
      );
    }

    // ── assignments ──────────────────────────────────────────
    const asTitles = [
      'Fractions worksheet','Essay: my town','Plant cell diagram','Trade routes',
      'Map of Africa','Spreadsheet basics','Algebra set 2','Poetry review'
    ];
    for (let i = 0; i < 8; i++) {
      await client.query(
        `INSERT INTO assignments (id, title, subject, cls, due, status)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [
          'A' + (i + 1), asTitles[i], SUB[i % 6],
          CLS[i % 6], '2026-10-' + (10 + i),
          i < 6 ? 'Open' : 'Closed'
        ]
      );
    }

    // ── library ──────────────────────────────────────────────
    const books = [
      ['B1','Things Fall Apart',       'Chinua Achebe',        4, 3],
      ['B2','A Brief History of Time', 'Stephen Hawking',      2, 2],
      ['B3',"Charlotte's Web",         'E. B. White',          5, 1],
      ['B4','The Number Devil',        'H. M. Enzensberger',   3, 0],
      ['B5','Atlas of the World',      'Various',              2, 2],
      ['B6','Matilda',                 'Roald Dahl',           6, 4]
    ];
    for (const [id, title, author, copies, issued] of books) {
      await client.query(
        `INSERT INTO library (id, title, author, copies, issued)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING`,
        [id, title, author, copies, issued]
      );
    }

    // ── attendance (5 past school days) ──────────────────────
    const { rows: stuRows } = await client.query('SELECT id FROM students');
    let d = new Date(), n = 0;
    while (n < 5) {
      d.setDate(d.getDate() - 1);
      if (d.getDay() % 6) {
        n++;
        const dateStr = d.toISOString().slice(0, 10);
        for (const { id: sid } of stuRows) {
          const r = rnd();
          const st = r < 0.86 ? 'P' : r < 0.93 ? 'A' : r < 0.97 ? 'L' : 'E';
          await client.query(
            `INSERT INTO attendance (student_id, date, status)
             VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
            [sid, dateStr, st]
          );
        }
      }
    }

    await client.query('COMMIT');
    console.log('✅  Seed complete.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌  Seed failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
