import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Skeleton, StudentProfile } from '../components/index.js';

export default function Dashboard() {
  const { user } = useAuth();
  const { money } = useSettings();
  const family = user?.role === 'student' || user?.role === 'parent';
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    setErr('');
    setD(null);
    api(family ? '/overview' : '/stats')
      .then(setD)
      .catch(x => setErr(x.message));
  }, [family]);

  if (err) return <Empty title="Couldn’t load the dashboard" text={err} />;
  if (!d) return <Skeleton />;

  const todayStr = new Date().toLocaleDateString('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  if (family) {
    return (
      <>
        <div className="head">
          <h1>{user.role === 'parent' ? 'My children' : 'My overview'}</h1>
          <span className="muted">{todayStr}</span>
        </div>
        {d.children?.map(c => (
          <div key={c.id} style={{ marginBottom: 24 }}>
            <StudentProfile
              profile={{
                student: c,
                guardian: { name: c.guardianName },
                attendance: c.attendance,
                academic: c.academic,
                fees: c.fees
              }}
              canWrite={false}
            />
          </div>
        ))}
        <div className="card" style={{ marginTop: 16 }}>
          <h2>Upcoming exams</h2>
          <ul className="l" style={{ marginTop: 8 }}>
            {d.upcomingExams?.length ? (
              d.upcomingExams.map(e => (
                <li key={e.id}>
                  <span>{e.name} ({e.cls})</span>
                  <span>{e.date}</span>
                </li>
              ))
            ) : (
              <li>No exams scheduled.</li>
            )}
          </ul>
        </div>
      </>
    );
  }

  const rate = d.billed ? Math.round((d.collected / d.billed) * 100) : 0;
  const lastAtt = d.attendance?.at(-1)?.pct ?? 0;

  const cards = [
    ['students', 'Students', d.students, ''],
    ['teachers', 'Teachers', d.teachers, ''],
    ['classes', 'Classes', d.classes, ''],
    ['attendance', 'Attendance', lastAtt + '%', 'latest day'],
    ['fees', 'Fees collected', rate + '%', money(d.collected)],
    ['exams', 'Exams', d.upcomingExams, 'upcoming'],
    ['assignments', 'Assignments', d.openAssignments, 'open']
  ];

  const gd = d.gradeDistribution || { A: 0, B: 0, C: 0, D: 0, F: 0 };
  const mx = Math.max(1, ...Object.values(gd));

  return (
    <>
      <div className="head">
        <h1>Dashboard</h1>
        <span className="muted">{todayStr}</span>
      </div>

      <div className="cards">
        {cards.map(([i, l, v, sub]) => (
          <div className="card stat" key={l}>
            <span className="ico"><Icon name={i} /></span>
            <small>{l}</small>
            <b>{v}</b>
            <small>{sub || '\u00A0'}</small>
          </div>
        ))}
      </div>

      <div className="two">
        <div className="card">
          <h2>Attendance, last 5 school days</h2>
          <div
            className="bars"
            role="img"
            aria-label={`Attendance percentages: ${d.attendance?.map(a => a.pct + '%').join(', ')}`}
            style={{ marginTop: 14 }}
          >
            {d.attendance?.map(a => (
              <div className="bar" key={a.date}>
                {a.pct}%
                <i style={{ height: Math.max(6, a.pct * 1.1) }} />
                {new Date(a.date + 'T00:00').toLocaleDateString('en', { weekday: 'short' })}
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Fee collection</h2>
          <div className="row" style={{ marginTop: 14 }}>
            <div
              className="donut"
              style={{ background: `conic-gradient(var(--ac) ${rate * 3.6}deg, var(--bd) 0)` }}
              role="img"
              aria-label={`${rate}% collected`}
            >
              <span>{rate}%</span>
            </div>
            <ul className="l grow" style={{ flex: 1, minWidth: 150 }}>
              <li>Billed<b>{money(d.billed)}</b></li>
              <li>Collected<b>{money(d.collected)}</b></li>
              <li>Outstanding<b>{money(d.billed - d.collected)}</b></li>
            </ul>
          </div>
        </div>
      </div>

      <div className="two">
        <div className="card">
          <h2>Grade distribution</h2>
          <div style={{ marginTop: 12 }}>
            {Object.entries(gd).map(([g, n]) => (
              <div className="hb" key={g}>
                <b>{g}</b>
                <i style={{ width: `${(n / mx) * 100}%` }} />
                <span>{n}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h2>Upcoming exams</h2>
          <ul className="l" style={{ marginTop: 12 }}>
            {d.upcomingExamsList?.length ? (
              d.upcomingExamsList.map(e => (
                <li key={e.id}>
                  <span>{e.name} ({e.cls})</span>
                  <span>{e.date}</span>
                </li>
              ))
            ) : (
              <li>No exams scheduled.</li>
            )}
          </ul>
        </div>
      </div>

      <h2 style={{ margin: '24px 0 10px' }}>Recent payments</h2>
      <div className="tw">
        <table className="rt">
          <thead>
            <tr>
              <th scope="col">Receipt</th>
              <th scope="col">Student</th>
              <th scope="col">Date</th>
              <th scope="col">Amount</th>
            </tr>
          </thead>
          <tbody>
            {d.recentPayments?.length ? (
              d.recentPayments.map((p, idx) => (
                <tr key={idx}>
                  <td data-l="Receipt">{p.receipt}</td>
                  <td data-l="Student">{p.student}</td>
                  <td data-l="Date">{p.date}</td>
                  <td data-l="Amount">{money(p.amount)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 20 }}>
                  No payments recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
