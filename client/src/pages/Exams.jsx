import { useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { SUB } from '../config/entities.js';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast, CsvModal, Icon } from '../components/index.js';

export default function Exams() {
  const { can } = useAuth();
  const write = can('exams');
  const [tab, setTab] = useState('exams'); // 'exams' | 'results'

  // Exams tab state
  const [exams, setExams] = useState(null);
  const [examQ, setExamQ] = useState('');
  const [examFlt, setExamFlt] = useState('');
  const [examModal, setExamModal] = useState(null);

  // Results tab state
  const [resData, setResData] = useState(null);
  const [resCls, setResCls] = useState('7A');
  const [csvText, setCsvText] = useState(null);

  const [toast, setToast] = useState('');
  const [err, setErr] = useState('');

  const loadExams = async () => {
    try {
      const data = await api('/exams');
      setExams(data);
    } catch (x) {
      setErr(x.message);
    }
  };

  const loadResults = async c => {
    try {
      const data = await api(`/results?cls=${encodeURIComponent(c || resCls)}`);
      setResData(data);
      if (data.cls && data.cls !== resCls) setResCls(data.cls);
    } catch (x) {
      setErr(x.message);
    }
  };

  useEffect(() => {
    if (tab === 'exams') loadExams();
    else loadResults(resCls);
  }, [tab]);

  const updateMark = async (studentId, subject, val) => {
    const num = Math.max(0, Math.min(100, Number(val) || 0));
    setResData(prev => {
      if (!prev) return prev;
      const nextStudents = prev.students.map(s => {
        if (s.id !== studentId) return s;
        const nextMarks = { ...s.marks, [subject]: num };
        const vals = Object.values(nextMarks);
        const total = vals.reduce((a, b) => a + b, 0);
        const avg = vals.length ? total / vals.length : 0;
        const grade = avg >= 80 ? 'A' : avg >= 70 ? 'B' : avg >= 60 ? 'C' : avg >= 50 ? 'D' : 'F';
        return {
          ...s,
          marks: nextMarks,
          total,
          average: avg.toFixed(1),
          grade
        };
      });
      return { ...prev, students: nextStudents };
    });

    try {
      await api('/results', { method: 'PUT', body: { studentId, subject, mark: num } });
    } catch (x) {
      setToast(x.message);
    }
  };

  const exportResultsCsv = () => {
    if (!resData || !resData.students) return;
    const headers = ['Student', ...SUB, 'Total', 'Average', 'Grade'];
    const rows = resData.students.map(s => [
      s.name,
      ...SUB.map(sb => s.marks[sb] ?? 0),
      s.total,
      s.average,
      s.grade
    ]);
    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    setCsvText(csv);
  };

  const handlePrint = () => {
    try {
      window.print();
    } catch {
      setToast('Printing is not available here.');
    }
  };

  // Exam CRUD handlers
  const saveExam = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      name: fd.get('name')?.toString().trim(),
      cls: fd.get('cls')?.toString(),
      date: fd.get('date')?.toString(),
      status: fd.get('status')?.toString()
    };
    if (!body.name || !body.date) {
      setToast('Name and date are required.');
      return;
    }
    try {
      if (examModal.row) {
        await api(`/exams/${examModal.row.id}`, { method: 'PUT', body });
        setToast('Exam updated.');
      } else {
        await api('/exams', { method: 'POST', body });
        setToast('Exam added.');
      }
      setExamModal(null);
      loadExams();
    } catch (x) {
      setToast(x.message);
    }
  };

  const deleteExam = async () => {
    try {
      await api(`/exams/${examModal.row.id}`, { method: 'DELETE' });
      setToast('Exam deleted.');
      setExamModal(null);
      loadExams();
    } catch (x) {
      setToast(x.message);
    }
  };

  const filteredExams = (exams || []).filter(e =>
    (!examFlt || e.status === examFlt) &&
    (e.name.toLowerCase().includes(examQ.toLowerCase()) || e.cls.toLowerCase().includes(examQ.toLowerCase()))
  );

  return (
    <>
      <div className="tabs">
        <button
          className="btn"
          aria-pressed={tab === 'exams'}
          onClick={() => setTab('exams')}
        >
          Exams
        </button>
        <button
          className="btn"
          aria-pressed={tab === 'results'}
          onClick={() => setTab('results')}
        >
          Results
        </button>
      </div>

      {tab === 'exams' && (
        <>
          <div className="head">
            <h1>Exams</h1>
            {write ? (
              <button className="btn pr" onClick={() => setExamModal({ type: 'form' })}>
                Add exam
              </button>
            ) : (
              <span className="bd y">View only</span>
            )}
          </div>
          <div className="tb">
            <input
              type="search"
              placeholder="Search exams"
              aria-label="Search exams"
              value={examQ}
              onChange={e => setExamQ(e.target.value)}
            />
            <select
              aria-label="Filter by status"
              value={examFlt}
              onChange={e => setExamFlt(e.target.value)}
            >
              <option value="">All statuses</option>
              <option value="Scheduled">Scheduled</option>
              <option value="Completed">Completed</option>
            </select>
          </div>

          {!exams ? (
            <Skeleton />
          ) : !filteredExams.length ? (
            <Empty
              title="No exams found"
              text={examQ || examFlt ? 'Try a different search or filter.' : 'Add your first exam to get started.'}
            >
              {(examQ || examFlt) && (
                <button className="btn" onClick={() => { setExamQ(''); setExamFlt(''); }}>
                  Clear filters
                </button>
              )}
            </Empty>
          ) : (
            <div className="tw">
              <table className="rt">
                <thead>
                  <tr>
                    <th scope="col">Exam</th>
                    <th scope="col">Class</th>
                    <th scope="col">Date</th>
                    <th scope="col">Status</th>
                    {write && <th scope="col">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {filteredExams.map(e => (
                    <tr key={e.id}>
                      <td data-l="Exam">{e.name}</td>
                      <td data-l="Class">{e.cls}</td>
                      <td data-l="Date">{e.date}</td>
                      <td data-l="Status"><Badge v={e.status} /></td>
                      {write && (
                        <td className="act" data-l="Actions">
                          <div className="act-group">
                            <button
                              type="button"
                              className="btn sm icon-btn edit-btn"
                              title="Edit"
                              aria-label={`Edit exam ${e.name}`}
                              onClick={() => setExamModal({ type: 'form', row: e })}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="btn sm icon-btn del-btn"
                              title="Delete"
                              aria-label={`Delete exam ${e.name}`}
                              onClick={() => setExamModal({ type: 'del', row: e })}
                            >
                              <Icon name="delete" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'results' && (
        <>
          <div className="head">
            <h1>Results</h1>
            <span>
              <button className="btn" onClick={exportResultsCsv}>Export CSV</button>{' '}
              <button className="btn" onClick={handlePrint}>Print</button>
            </span>
          </div>

          <div className="tb">
            {resData?.classes && (
              <label>
                Class{' '}
                <select
                  value={resCls}
                  onChange={e => {
                    setResCls(e.target.value);
                    loadResults(e.target.value);
                  }}
                >
                  {resData.classes.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
            )}
            <span className="muted" style={{ alignSelf: 'center' }}>
              Marks out of 100. Grades: A 80+, B 70+, C 60+, D 50+, F below 50.
            </span>
          </div>

          {!resData ? (
            <Skeleton />
          ) : !resData.students?.length ? (
            <Empty title="No students in this class" text="Add students to this class first." />
          ) : (
            <div className="tw">
              <table className="rt">
                <thead>
                  <tr>
                    <th scope="col">Student</th>
                    {SUB.map(sb => <th key={sb} scope="col">{sb}</th>)}
                    <th scope="col">Total</th>
                    <th scope="col">Average</th>
                    <th scope="col">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {resData.students.map(s => (
                    <tr key={s.id}>
                      <td data-l="Student">{s.name}</td>
                      {SUB.map(sb => (
                        <td key={sb} data-l={sb}>
                          <input
                            className="num"
                            type="number"
                            min="0"
                            max="100"
                            aria-label={`${s.name} ${sb}`}
                            value={s.marks[sb] ?? 0}
                            readOnly={!write}
                            onChange={e => updateMark(s.id, sb, e.target.value)}
                          />
                        </td>
                      ))}
                      <td data-l="Total"><b>{s.total}</b></td>
                      <td data-l="Average">{s.average}</td>
                      <td data-l="Grade"><Badge v={s.grade} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Modal for adding/editing exams */}
      {examModal?.type === 'form' && (
        <Modal title={examModal.row ? 'Edit exam' : 'Add exam'} onClose={() => setExamModal(null)}>
          <form onSubmit={saveExam} noValidate>
            <div className="fld">
              <label htmlFor="ex_name">Exam name *</label>
              <input id="ex_name" name="name" defaultValue={examModal.row?.name || ''} required />
            </div>
            <div className="fld">
              <label htmlFor="ex_cls">Class *</label>
              <select id="ex_cls" name="cls" defaultValue={examModal.row?.cls || 'All'}>
                <option value="All">All</option>
                {['7A', '7B', '8A', '8B', '9A', '9B'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="ex_date">Date *</label>
              <input id="ex_date" name="date" type="date" defaultValue={examModal.row?.date || ''} required />
            </div>
            <div className="fld">
              <label htmlFor="ex_status">Status *</label>
              <select id="ex_status" name="status" defaultValue={examModal.row?.status || 'Scheduled'}>
                <option value="Scheduled">Scheduled</option>
                <option value="Completed">Completed</option>
              </select>
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setExamModal(null)}>Cancel</button>
              <button className="btn pr">{examModal.row ? 'Save changes' : 'Add exam'}</button>
            </div>
          </form>
        </Modal>
      )}

      {examModal?.type === 'del' && (
        <ConfirmModal
          msg={`This will permanently delete <b>${examModal.row.name}</b>. You can’t undo this.`}
          onCancel={() => setExamModal(null)}
          onConfirm={deleteExam}
        />
      )}

      {csvText && (
        <CsvModal
          csvText={csvText}
          onClose={() => setCsvText(null)}
          onToast={m => setToast(m)}
        />
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
