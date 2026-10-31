import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { Icon } from '../icons.jsx';
import { Badge, Empty, Modal, Skeleton, StudentProfile, Toast } from '../components/index.js';
import ParentApp from './ParentApp.jsx';
import StudentApp from './StudentApp.jsx';
import TeacherApp from './TeacherApp.jsx';

export default function Dashboard() {
  const { user } = useAuth();
  if (user?.role === 'parent') {
    return <ParentApp />;
  }
  if (user?.role === 'student') {
    return <StudentApp />;
  }
  if (user?.role === 'teacher') {
    return <TeacherApp />;
  }

  const { money } = useSettings();
  const family = user?.role === 'student' || user?.role === 'parent';
  const isParent = user?.role === 'parent';
  const [d, setD] = useState(null);
  const [activeChildId, setActiveChildId] = useState('all');
  const [showTrends, setShowTrends] = useState(false);
  const [reportCard, setReportCard] = useState(null);
  const [meetingModal, setMeetingModal] = useState(false);
  const [trips, setTrips] = useState([]);
  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const loadData = () => {
    setErr('');
    api(family ? '/overview' : '/stats')
      .then(res => {
        setD(res);
        if (family) {
          api('/trip-consents').then(setTrips).catch(() => {});
        }
      })
      .catch(x => setErr(x.message));
  };

  useEffect(() => {
    loadData();
  }, [family]);

  if (err) return <Empty title="Couldn’t load the dashboard" text={err} />;
  if (!d) return <Skeleton />;

  const todayStr = new Date().toLocaleDateString('en', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });

  const openReportCard = async studentId => {
    try {
      const card = await api(`/students/${studentId}/report-card`);
      setReportCard(card);
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleTripConsent = async (tripId, consent) => {
    try {
      await api(`/trip-consents/${tripId}`, {
        method: 'PUT',
        body: { consent }
      });
      setToast(consent ? 'Consent given.' : 'Consent revoked.');
      api('/trip-consents').then(setTrips).catch(() => {});
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleBookMeeting = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      recipientId: fd.get('teacher')?.toString() || 'T01',
      recipientRole: 'teacher',
      recipientName: 'Class Teacher',
      subject: fd.get('subject')?.toString() || 'Parent-Teacher Meeting',
      meetingDate: fd.get('meetingDate')?.toString(),
      body: fd.get('notes')?.toString()
    };
    try {
      await api('/messages', { method: 'POST', body });
      setToast('Meeting request sent to teacher.');
      setMeetingModal(false);
    } catch (x) {
      setToast(x.message);
    }
  };

  if (family) {
    const displayedChildren = activeChildId === 'all'
      ? (d.children || [])
      : (d.children || []).filter(c => c.id === activeChildId);

    return (
      <>
        <div className="head">
          <div>
            <h1>{user.role === 'parent' ? 'Family portal' : 'Student overview'}</h1>
            <span className="muted">{todayStr}</span>
          </div>
          {isParent && (
            <button className="btn pr" onClick={() => setMeetingModal(true)}>
              📅 Book teacher meeting
            </button>
          )}
        </div>

        {/* Parent Multi-child switcher (Page 4) */}
        {isParent && d.children && d.children.length > 1 && (
          <div className="tabs" style={{ marginBottom: 16 }}>
            <button
              className="btn"
              aria-pressed={activeChildId === 'all'}
              onClick={() => setActiveChildId('all')}
            >
              All children ({d.children.length})
            </button>
            {d.children.map(c => (
              <button
                key={c.id}
                className="btn"
                aria-pressed={activeChildId === c.id}
                onClick={() => setActiveChildId(c.id)}
              >
                {c.name} ({c.cls})
              </button>
            ))}
          </div>
        )}

        {/* Announcements section */}
        {d.announcements && d.announcements.length > 0 && (
          <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid var(--ac)' }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>📢 School & Class Announcements</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {d.announcements.map(ann => (
                <div key={ann.id} style={{ borderBottom: '1px solid var(--bd)', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{ann.title}</strong>
                    <small className="muted">{new Date(ann.created_at).toLocaleDateString()}</small>
                  </div>
                  <p style={{ margin: '4px 0 0', fontSize: 14 }}>{ann.content}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Children profiles */}
        {displayedChildren.map(c => (
          <div key={c.id} style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span className="bd g">Class {c.cls} · {c.name}</span>
              <span style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => setShowTrends(prev => (prev === c.id ? null : c.id))}
                >
                  📈 {showTrends === c.id ? 'Hide grade trends' : 'Grade trends'}
                </button>
                <button
                  type="button"
                  className="btn sm pr"
                  onClick={() => openReportCard(c.id)}
                >
                  📄 Download report card
                </button>
              </span>
            </div>

            {/* Grade trends per subject (Page 4) */}
            {showTrends === c.id && (
              <div className="card" style={{ marginBottom: 14 }}>
                <h3 style={{ margin: '0 0 10px', fontSize: 15 }}>Grade trends per subject — {c.name}</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Object.entries(c.academic?.marks || {}).map(([subj, val]) => (
                    <div key={subj} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ width: 110, fontSize: 13, fontWeight: 500 }}>{subj}</span>
                      <div style={{ flex: 1, background: 'var(--bd)', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${val}%`,
                            height: '100%',
                            background: val >= 80 ? 'var(--ac)' : val >= 60 ? '#f39c12' : '#e74c3c'
                          }}
                        />
                      </div>
                      <span style={{ width: 45, textAlign: 'right', fontSize: 13, fontWeight: 'bold' }}>{val}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <StudentProfile
              profile={{
                student: c,
                guardian: { name: c.guardianName, phone: c.guardianPhone },
                attendance: c.attendance,
                academic: c.academic,
                fees: c.fees
              }}
              canWrite={false}
              onReportCard={() => openReportCard(c.id)}
            />
          </div>
        ))}

        {/* Trips & Excursions Consent (Page 4) */}
        {isParent && trips.length > 0 && (
          <div className="card" style={{ marginTop: 20 }}>
            <h2>Trip consent & excursions</h2>
            <div className="tw" style={{ marginTop: 10 }}>
              <table className="rt">
                <thead>
                  <tr>
                    <th scope="col">Trip</th>
                    <th scope="col">Date</th>
                    <th scope="col">Student</th>
                    <th scope="col">Consent Status</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {trips.map(tr => (
                    <tr key={tr.id}>
                      <td data-l="Trip">
                        <strong>{tr.trip_name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--mu)' }}>{tr.details}</div>
                      </td>
                      <td data-l="Date">{tr.trip_date}</td>
                      <td data-l="Student">{tr.studentName}</td>
                      <td data-l="Consent Status">
                        <Badge v={tr.consent ? 'Active' : 'Unpaid'} />
                        <span style={{ marginLeft: 6 }}>{tr.consent ? 'Consented' : 'Pending'}</span>
                      </td>
                      <td data-l="Action">
                        <button
                          type="button"
                          className={`btn sm ${tr.consent ? 'dg' : 'pr'}`}
                          onClick={() => handleTripConsent(tr.id, !tr.consent)}
                        >
                          {tr.consent ? 'Revoke consent' : 'Give consent'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
              <li>No exams scheduled for your class.</li>
            )}
          </ul>
        </div>

        {/* Report Card Modal */}
        {reportCard && (
          <Modal title="Student Report Card" onClose={() => setReportCard(null)}>
            <div className="print-area" style={{ padding: 12 }}>
              <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid var(--bd)', paddingBottom: 12 }}>
                <h2 style={{ margin: 0 }}>{reportCard.school}</h2>
                <div className="muted">Official Academic Report Card · {reportCard.academicYear}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 14 }}>
                <div><strong>Student:</strong> {reportCard.student.name}</div>
                <div><strong>ID:</strong> {reportCard.student.id}</div>
                <div><strong>Class:</strong> {reportCard.student.cls}</div>
                <div><strong>Attendance:</strong> {reportCard.attendance.rate}%</div>
              </div>

              <table className="rt" style={{ width: '100%', marginBottom: 16 }}>
                <thead>
                  <tr>
                    <th scope="col">Subject</th>
                    <th scope="col">Mark</th>
                    <th scope="col">Grade</th>
                    <th scope="col">Teacher Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {reportCard.marks.map(m => (
                    <tr key={m.subject}>
                      <td>{m.subject}</td>
                      <td><b>{m.mark}</b> / 100</td>
                      <td><Badge v={m.grade} /></td>
                      <td>{m.comment || 'Good progress.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'space-between', padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--rd)' }}>
                <div><b>Total:</b> {reportCard.total}</div>
                <div><b>Average:</b> {reportCard.average}%</div>
                <div><b>Final Grade:</b> <Badge v={reportCard.finalGrade} /></div>
              </div>

              <div className="acts" style={{ marginTop: 18 }}>
                <button type="button" className="btn pr" onClick={() => window.print()}>🖨 Print / Download</button>
                <button type="button" className="btn" onClick={() => setReportCard(null)}>Close</button>
              </div>
            </div>
          </Modal>
        )}

        {/* Book Meeting Modal */}
        {meetingModal && (
          <Modal title="Book Parent-Teacher Consultation" onClose={() => setMeetingModal(false)}>
            <form onSubmit={handleBookMeeting} noValidate>
              <div className="fld">
                <label htmlFor="pm_sub">Topic / Purpose *</label>
                <input id="pm_sub" name="subject" defaultValue="Academic Progress Discussion" required />
              </div>
              <div className="fld">
                <label htmlFor="pm_dt">Preferred Date *</label>
                <input id="pm_dt" name="meetingDate" type="date" min={today} defaultValue={today} required />
              </div>
              <div className="fld">
                <label htmlFor="pm_notes">Notes / Specific questions for teacher *</label>
                <textarea
                  id="pm_notes"
                  name="notes"
                  rows={3}
                  placeholder="Share any questions regarding homework, attendance, or progress..."
                  required
                />
              </div>
              <div className="acts">
                <button type="button" className="btn" onClick={() => setMeetingModal(false)}>Cancel</button>
                <button className="btn pr">Send request</button>
              </div>
            </form>
          </Modal>
        )}

        <Toast msg={toast} onDone={() => setToast('')} />
      </>
    );
  }

  // Admin / Teacher View
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

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
