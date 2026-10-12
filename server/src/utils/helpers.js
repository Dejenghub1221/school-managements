import { db } from '../data.js';

export const gr  = a => (a >= 80 ? 'A' : a >= 70 ? 'B' : a >= 60 ? 'C' : a >= 50 ? 'D' : 'F');

export const avg = id => {
  const v = Object.values(db.marks[id] || {});
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

export const attOf = ids => {
  const c = { P: 0, A: 0, L: 0, E: 0 };
  for (const day in db.attendance) {
    for (const i of ids) {
      const s = db.attendance[day][i];
      if (s) c[s]++;
    }
  }
  return c;
};

export const rate = c => {
  const t = c.P + c.A + c.L + c.E;
  return t ? Math.round(((c.P + c.L) / t) * 100) : 0;
};

export const studentName = id => db.students.find(s => s.id === id)?.name || id;
export const parentName  = id => db.parents.find(p => p.id === id)?.name || id;
