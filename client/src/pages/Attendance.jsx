import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { Badge, Empty, Modal, Skeleton, Toast } from '../components/index.js';

const STATUS = [
  ['P', 'Present'],
  ['A', 'Absent'],
  ['L', 'Late'],
  ['E', 'Excused']
];
const today = new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const { can, user } = useAuth();
  const write = can('attendance');
  const isFamily = user?.role === 'student' || user?.role === 'parent';
  const isParent = user?.role === 'parent';

  const [date, setDate] = useState(today);
  const [cls, setCls] = useState('');
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState(null);
  const [marks, setMarks] = useState({});
  const [reportedAbsences, setReportedAbsences] = useState({});
  const [summary, setSummary] = useState([]);
  const [familyData, setFamilyData] = useState(null);
  const [absenceModal, setAbsenceModal] = useState(false);
  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');

  const loadFamily = () => {
    api('/attendance')
      .then(d => setFamilyData(d))
      .catch(x => setErr(x.message));
  };

  useEffect(() => {
    if (isFamily) {
      loadFamily();
    } else {
      api('/classes-list')
        .then(c => {
          setClasses(c);
          if (c.length) setCls(c[0]);
        })
        .catch(x => setErr(x.message));
    }
  }, [isFamily]);

  useEffect(() => {
    if (isFamily || !cls) return;
    setStudents(null);
    setErr('');
    api(`/attendance?date=${date}&cls=${cls}`)
      .then(d => {
        setStudents(d.students);
        setMarks(Object.fromEntries(d.students.map(s => [s.id, d.records[s.id] || 'P'])));
        setReportedAbsences(d.reportedAbsences || {});
        if (d.classSummary) setSummary(d.classSummary);
      })
      .catch(x => setErr(x.message));
  }, [date, cls, isFamily]);

  const save = async () => {
    try {
      const r = await api('/attendance', { method: 'PUT', body: { date, records: marks } });
      setToast(`Attendance saved for ${date}.`);
      const d = await api(`/attendance?date=${date}&cls=${cls}`);
      if (d.classSummary) setSummary(d.classSummary);
      if (d.reportedAbsences) setReportedAbsences(d.reportedAbsences);
    } catch (x) {
      setToast(x.message);
    }
  };

  const markAllPresent = () => {
    if (!students) return;
    const all = {};
    students.forEach(s => {
      // Keep reported absence as E, otherwise P
      all[s.id] = reportedAbsences[s.id] ? 'E' : 'P';
    });
    setMarks(all);
  };

  const submitAbsenceReport = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      studentId: fd.get('studentId')?.toString(),
      date: fd.get('date')?.toString(),
      reason: fd.get('reason')?.toString()
    };
    if (!body.studentId || !body.date || !body.reason) {
      setToast('Please provide all details.');
      return;
    }
    try {
      await api('/absences', { method: 'POST', body });
      setToast('Absence reported in advance. Teacher will be notified.');
      setAbsenceModal(false);
      loadFamily();
    } catch (x) {
      setToast(x.message);
    }
  };

  if (isFamily) {
    if (err) return <Empty title="Couldn’t load attendance" text={err} />;
    if (!familyData) return <Skeleton />;
    const { stats, history, absences = [] } = familyData;
    return (
      <>
        <div className="head">
          <h1>Attendance</h1>
          {isParent && (
            <button className="btn pr" onClick={() => setAbsenceModal(true)}>
              📝 Report absence in advance
            </button>
          )}
        </div>
        <div className="chips">
          <span className="bd g">Rate: {stats.rate}%</span>
          <span className="bd">Present {stats.P}</span>
          <span className="bd r">Absent {stats.A}</span>
          <span className="bd y">Late {stats.L}</span>
          <span className="bd y">Excused {stats.E}</span>
        </div>

        {absences.length > 0 && (
          <div style={{ margin: '18px 0' }}>
            <h2 style={{ fontSize: 16, marginBottom: 8 }}>Reported Absences</h2>
            <div className="tw">
              <table className="rt">
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Student</th>
                    <th scope="col">Reason</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {absences.map(a => (
                    <tr key={a.id}>
                      <td data-l="Date">{a.date}</td>
                      <td data-l="Student">{a.studentName}</td>
                      <td data-l="Reason">{a.reason}</td>
                      <td data-l="Status"><Badge v={a.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {history.length ? (
          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Student</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h, i) => (
                  <tr key={i}>
                    <td data-l="Date">{h.date}</td>
                    <td data-l="Student">{h.studentName}</td>
                    <td data-l="Status">
                      <Badge v={{ P: 'Present', A: 'Absent', L: 'Late', E: 'Excused' }[h.status] || h.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="card" style={{ padding: 24, textAlign: 'center' }}>
            <h3>No attendance recorded yet</h3>
            <p className="muted" style={{ marginTop: 8 }}>Attendance records will appear here once a teacher marks them.</p>
          </div>
        )}

        {/* Modal for reporting absence */}
        {absenceModal && (
          <Modal title="Report Advance Absence" onClose={() => setAbsenceModal(false)}>
            <form onSubmit={submitAbsenceReport} noValidate>
              <div className="fld">
                <label htmlFor="abs_sid">Student *</label>
                <select id="abs_sid" name="studentId" required>
                  {/* Pull student ID from history or user */}
                  {[...new Set(history.map(h => ({ id: h.studentId, name: h.studentName })))].map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.id})</option>
                  ))}
                </select>
              </div>
              <div className="fld">
                <label htmlFor="abs_dt">Date of absence *</label>
                <input id="abs_dt" name="date" type="date" min={today} defaultValue={today} required />
              </div>
              <div className="fld">
                <label htmlFor="abs_rsn">Reason for absence *</label>
                <textarea
                  id="abs_rsn"
                  name="reason"
                  rows={3}
                  placeholder="e.g. Doctor appointment, family emergency, travel"
                  required
                />
              </div>
              <div className="acts">
                <button type="button" className="btn" onClick={() => setAbsenceModal(false)}>Cancel</button>
                <button className="btn pr">Submit report</button>
              </div>
            </form>
          </Modal>
        )}

        <Toast msg={toast} onDone={() => setToast('')} />
      </>
    );
  }

  const counts = {
    P: Object.values(marks).filter(m => m === 'P').length,
    A: Object.values(marks).filter(m => m === 'A').length,
    L: Object.values(marks).filter(m => m === 'L').length,
    E: Object.values(marks).filter(m => m === 'E').length
  };

  return (
    <>
      <div className="head">
        <h1>Attendance</h1>
      </div>

      <div className="tb">
        <label>
          Date <input type="date" value={date} max={today} onChange={e => setDate(e.target.value || today)} />
        </label>
        <label>
          Class{' '}
          <select value={cls} onChange={e => setCls(e.target.value)}>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        {write && <button className="btn" onClick={markAllPresent}>Mark all present</button>}
        {write && (
          <button className="btn pr" onClick={save} disabled={!students?.length}>
            Save attendance
          </button>
        )}
      </div>

      <div className="chips" aria-live="polite">
        <span className="bd g">Present: {counts.P}</span>
        <span className="bd r">Absent: {counts.A}</span>
        <span className="bd y">Late: {counts.L}</span>
        <span className="bd y">Excused: {counts.E}</span>
      </div>

      {err ? (
        <Empty title="Couldn’t load attendance" text={err} />
      ) : !students ? (
        <Skeleton />
      ) : !students.length ? (
        <Empty title={`No active students in ${cls}`} text="Add students to this class first." />
      ) : (
        <div className="tw">
          <table className="rt">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Notes / Notice</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {students.map(s => {
                const abs = reportedAbsences[s.id];
                return (
                  <tr key={s.id}>
                    <td data-l="Student"><strong>{s.name}</strong></td>
                    <td data-l="Notes / Notice">
                      {abs ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="bd y" title={`Reported by ${abs.parentName} (${abs.parentPhone})`}>
                            Parent Reported: {abs.reason}
                          </span>
                        </div>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td data-l="Status">
                      <div className="seg" role="radiogroup" aria-label={'Status for ' + s.name}>
                        {STATUS.map(([c, l]) => (
                          <label key={c}>
                            <input
                              type="radio"
                              name={'s_' + s.id}
                              value={c}
                              checked={marks[s.id] === c}
                              disabled={!write}
                              onChange={() => setMarks(m => ({ ...m, [s.id]: c }))}
                            />
                            <span>{l}</span>
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {summary.length > 0 && (
        <>
          <h2 style={{ margin: '24px 0 10px' }}>Summary by class (recorded days)</h2>
          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th scope="col">Class</th>
                  <th scope="col">Present</th>
                  <th scope="col">Absent</th>
                  <th scope="col">Late</th>
                  <th scope="col">Excused</th>
                  <th scope="col">Rate</th>
                </tr>
              </thead>
              <tbody>
                {summary.map(sm => (
                  <tr key={sm.cls}>
                    <td data-l="Class">{sm.cls}</td>
                    <td data-l="Present">{sm.present}</td>
                    <td data-l="Absent">{sm.absent}</td>
                    <td data-l="Late">{sm.late}</td>
                    <td data-l="Excused">{sm.excused}</td>
                    <td data-l="Rate">{sm.rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
