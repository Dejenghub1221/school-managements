import { useCallback, useEffect, useState } from 'react';
import { api } from '../api/index.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { ENT } from '../config/entities.js';
import { Badge, Empty, Modal, ConfirmModal, Skeleton, Toast, StudentProfile, Icon } from '../components/index.js';

const PER = 8;

function RecordForm({ cfg, rels, init = {}, onSave, onCancel, submitLabel }) {
  const opts = f => (f.rel ? (rels[f.rel] || []).map(x => [x.id, x.name]) : (f.o || []).map(x => [x, x]));

  const [v, setV] = useState(() => {
    const initial = { ...init };
    for (const f of cfg.fields) {
      if (initial[f.k] === undefined) {
        if (f.def !== undefined) {
          initial[f.k] = f.def;
        } else if (f.t === 'select' && f.req) {
          const available = opts(f);
          if (available.length > 0) {
            initial[f.k] = available[0][0];
          }
        }
      }
    }
    return initial;
  });
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const set = (k, val) => setV(s => ({ ...s, [k]: val }));

  const submit = async e => {
    e.preventDefault();
    const data = { ...v };
    for (const f of cfg.fields) {
      if (data[f.k] === undefined || data[f.k] === '') {
        if (f.def !== undefined) {
          data[f.k] = f.def;
        } else if (f.t === 'select' && f.req) {
          const available = opts(f);
          if (available.length > 0) {
            data[f.k] = available[0][0];
          }
        }
      }
    }
    const miss = cfg.fields.filter(f => f.req && (data[f.k] === undefined || data[f.k] === ''));
    if (miss.length) return setErr('Fill in: ' + miss.map(f => f.l).join(', ') + '.');
    if (cfg.validate) {
      const vErr = cfg.validate(data);
      if (vErr) return setErr(vErr);
    }
    setBusy(true);
    try {
      await onSave(data);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      {cfg.fields.map(f => (
        <div className="fld" key={f.k}>
          <label htmlFor={'f_' + f.k}>{f.l}{f.req ? ' *' : ''}</label>
          {f.t === 'select' ? (
            <select id={'f_' + f.k} value={v[f.k] ?? ''} onChange={e => set(f.k, e.target.value)}>
              {!f.req && <option value="" />}
              {opts(f).map(([a, b]) => <option key={a} value={a}>{b}</option>)}
            </select>
          ) : f.t === 'checks' ? (
            <div className="chk" role="group" aria-label={f.l}>
              {opts(f).map(([a]) => (
                <label key={a}>
                  <input
                    type="checkbox"
                    checked={(v[f.k] || []).includes(a)}
                    onChange={e =>
                      set(
                        f.k,
                        e.target.checked
                          ? [...(v[f.k] || []), a]
                          : (v[f.k] || []).filter(x => x !== a)
                      )
                    }
                  />{' '}
                  {a}
                </label>
              ))}
            </div>
          ) : (
            <input
              id={'f_' + f.k}
              type={f.t || 'text'}
              min={f.t === 'number' ? 0 : undefined}
              value={v[f.k] ?? ''}
              onChange={e => set(f.k, f.t === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
            />
          )}
        </div>
      ))}
      {err && <p className="err" role="alert">{err}</p>}
      <div className="acts">
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
        <button className="btn pr" disabled={busy}>{submitLabel}</button>
      </div>
    </form>
  );
}

export default function EntityPage({ k }) {
  const cfg = ENT[k];
  const { user, can } = useAuth();
  const { money } = useSettings();
  const write = can(k);
  const isStudent = user?.role === 'student';
  const isTeacher = user?.role === 'teacher';
  const isAdmin = user?.role === 'admin';
  const isParent = user?.role === 'parent';

  const [rows, setRows] = useState(null);
  const [rels, setRels] = useState({});
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [f, setF] = useState('');
  const [pg, setPg] = useState(1);
  const [modal, setModal] = useState(null);
  const [toast, setToast] = useState('');
  const [selectedProfile, setSelectedProfile] = useState(null);

  // Submissions state for assignments
  const [submissionsModal, setSubmissionsModal] = useState(null);
  const [submitModal, setSubmitModal] = useState(null);
  const [subFile, setSubFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [gradeModal, setGradeModal] = useState(null);
  const [reportCard, setReportCard] = useState(null);

  const load = useCallback(async () => {
    setErr('');
    setRows(null);
    try {
      const data = await api('/' + k);
      setRows(data);
      const r = {};
      for (const x of cfg.rels || []) {
        try {
          r[x] = await api('/' + x);
        } catch {
          r[x] = [];
        }
      }
      setRels(r);
    } catch (x) {
      setErr(x.message);
    }
  }, [k, cfg.rels]);

  useEffect(() => {
    setQ('');
    setF('');
    setPg(1);
    setSelectedProfile(null);
    load();
  }, [load]);

  const viewProfile = async studentId => {
    try {
      const p = await api(`/students/${studentId}/profile`);
      setSelectedProfile(p);
    } catch (x) {
      setToast(x.message);
    }
  };

  const openReportCard = async studentId => {
    try {
      const card = await api(`/students/${studentId}/report-card`);
      setReportCard(card);
    } catch (x) {
      setToast(x.message);
    }
  };

  const openSubmissions = async assignment => {
    try {
      const data = await api(`/submissions?assignmentId=${assignment.id}`);
      setSubmissionsModal({ assignment, list: data });
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleStudentSubmit = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const content = fd.get('content')?.toString()?.trim();
    const customFileName = fd.get('fileName')?.toString()?.trim();

    if (!content && !subFile) {
      setToast('Please provide your response text or attach a file.');
      return;
    }

    setSubmitting(true);
    try {
      let fileData = null;
      let fileName = customFileName || (subFile ? subFile.name : '');

      if (subFile) {
        if (subFile.size > 12 * 1024 * 1024) {
          throw new Error('File exceeds the 12MB size limit.');
        }
        fileData = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(new Error('Failed to read file.'));
          reader.readAsDataURL(subFile);
        });
      }

      const body = {
        assignmentId: submitModal.id,
        content: content || (fileName ? `Submitted file: ${fileName}` : ''),
        fileName,
        fileData
      };

      await api('/submissions', { method: 'POST', body });
      setToast('Assignment submitted successfully.');
      setSubmitModal(null);
      setSubFile(null);
    } catch (x) {
      setToast(x.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleGradeSubmission = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      grade: Number(fd.get('grade')),
      feedback: fd.get('feedback')?.toString()
    };
    try {
      await api(`/submissions/${gradeModal.id}/grade`, { method: 'PUT', body });
      setToast('Grade and feedback saved.');
      setGradeModal(null);
      // Reload submissions list
      if (submissionsModal) {
        openSubmissions(submissionsModal.assignment);
      }
    } catch (x) {
      setToast(x.message);
    }
  };

  const cell = (c, r) => (c[2] ? c[2](r, rels) : r[c[0]]);
  const needle = q.toLowerCase();
  const list = (rows || []).filter(r =>
    (!f || r[cfg.flt] === f) &&
    (cfg.cols.some(c => String(cell(c, r)).toLowerCase().includes(needle)) || (r.id && r.id.toLowerCase().includes(needle)))
  );

  const pages = Math.max(1, Math.ceil(list.length / PER));
  const page = Math.min(pg, pages);
  const slice = list.slice((page - 1) * PER, page * PER);
  const filterValues = cfg.flt ? [...new Set((rows || []).map(r => r[cfg.flt]))].filter(Boolean).sort() : [];

  const done = msg => {
    setModal(null);
    setToast(msg);
    load();
  };

  const save = async v => {
    if (modal.row) {
      await api(`/${k}/${modal.row.id}`, { method: 'PUT', body: v });
      if (selectedProfile && selectedProfile.student.id === modal.row.id) {
        viewProfile(modal.row.id);
      }
    } else {
      await api('/' + k, { method: 'POST', body: v });
    }
    done(cfg.title + (modal.row ? ' updated.' : ' added.'));
  };

  const remove = async () => {
    try {
      await api(`/${k}/${modal.row.id}`, { method: 'DELETE' });
      if (selectedProfile && selectedProfile.student.id === modal.row.id) {
        setSelectedProfile(null);
      }
      done(cfg.title + ' deleted.');
    } catch (x) {
      setModal(null);
      setToast(x.message);
    }
  };

  if (selectedProfile) {
    return (
      <>
        <StudentProfile
          profile={selectedProfile}
          onBack={() => setSelectedProfile(null)}
          onEdit={student => setModal({ type: 'form', row: student })}
          onDelete={student => setModal({ type: 'del', row: student })}
          onReportCard={student => openReportCard(student.id)}
          canWrite={write}
        />
        {modal?.type === 'form' && (
          <Modal title="Edit student" onClose={() => setModal(null)}>
            <RecordForm
              cfg={cfg}
              rels={rels}
              init={modal.row || {}}
              onSave={save}
              onCancel={() => setModal(null)}
              submitLabel="Save changes"
            />
          </Modal>
        )}
        {modal?.type === 'del' && (
          <ConfirmModal
            msg={`This will permanently delete <b>${modal.row.name || modal.row.id}</b>. You can’t undo this.`}
            onCancel={() => setModal(null)}
            onConfirm={remove}
          />
        )}
        {reportCard && (
          <Modal title="Student Report Card" onClose={() => setReportCard(null)}>
            <div className="print-area" style={{ padding: 12 }}>
              <div style={{ textAlign: 'center', marginBottom: 16, borderBottom: '2px solid var(--bd)', paddingBottom: 10 }}>
                <h2 style={{ margin: 0 }}>{reportCard.school}</h2>
                <div className="muted">Official Report Card · {reportCard.academicYear}</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 10, marginBottom: 12 }}>
                <div><strong>Student:</strong> {reportCard.student.name}</div>
                <div><strong>ID:</strong> {reportCard.student.id}</div>
                <div><strong>Class:</strong> {reportCard.student.cls}</div>
                <div><strong>Attendance:</strong> {reportCard.attendance.rate}%</div>
              </div>
              <table className="rt" style={{ width: '100%', marginBottom: 14 }}>
                <thead>
                  <tr>
                    <th>Subject</th><th>Mark</th><th>Grade</th><th>Teacher Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {reportCard.marks.map(m => (
                    <tr key={m.subject}>
                      <td>{m.subject}</td><td><b>{m.mark}</b>/100</td><td><Badge v={m.grade} /></td><td>{m.comment || 'Good progress.'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="acts">
                <button type="button" className="btn pr" onClick={() => window.print()}>🖨 Print / Download</button>
                <button type="button" className="btn" onClick={() => setReportCard(null)}>Close</button>
              </div>
            </div>
          </Modal>
        )}
        <Toast msg={toast} onDone={() => setToast('')} />
      </>
    );
  }

  return (
    <>
      <div className="head">
        <h1>{cfg.label}</h1>
        {write ? (
          <button className="btn pr" onClick={() => setModal({ type: 'form' })}>
            Add {cfg.title.toLowerCase()}
          </button>
        ) : (
          <span className="bd y">View only</span>
        )}
      </div>

      <div className="tb">
        <input
          type="search"
          placeholder={`Search ${cfg.label.toLowerCase()}`}
          aria-label={`Search ${cfg.label.toLowerCase()}`}
          value={q}
          onChange={e => { setQ(e.target.value); setPg(1); }}
        />
        {cfg.flt && (
          <select aria-label={`Filter by ${cfg.flt}`} value={f} onChange={e => { setF(e.target.value); setPg(1); }}>
            <option value="">All {cfg.flt === 'cls' ? 'classes' : cfg.flt + 's'}</option>
            {filterValues.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        )}
      </div>

      {err ? (
        <Empty title="Couldn’t load data" text={err}>
          <button className="btn pr" onClick={load}>Try again</button>
        </Empty>
      ) : !rows ? (
        <Skeleton />
      ) : !list.length ? (
        <Empty
          title={`No ${cfg.label.toLowerCase()} found`}
          text={q || f ? 'Try a different search or clear the filter.' : 'Add your first ' + cfg.title.toLowerCase() + ' to get started.'}
        >
          {(q || f) && <button className="btn" onClick={() => { setQ(''); setF(''); setPg(1); }}>Clear filters</button>}
        </Empty>
      ) : (
        <>
          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  {cfg.cols.map(c => <th key={c[0]} scope="col">{c[1]}</th>)}
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {slice.map(r => (
                  <tr key={r.id || r.name}>
                    {cfg.cols.map(c => (
                      <td key={c[0]} data-l={c[1]}>
                        {c[0] === 'status' ? (
                          <Badge v={r.status} />
                        ) : (
                          String(cell(c, r) ?? '')
                        )}
                      </td>
                    ))}
                    <td className="act" data-l="Actions">
                      <div className="act-group">
                        {/* Assignment submissions & submission handlers (Page 3/4) */}
                        {k === 'assignments' && isStudent && (
                          <button
                            type="button"
                            className="btn sm pr"
                            title="Submit assignment"
                            onClick={() => { setSubmitModal(r); setSubFile(null); }}
                          >
                            📤 Submit
                          </button>
                        )}
                        {k === 'assignments' && (
                          <button
                            type="button"
                            className="btn sm"
                            title={isStudent ? 'View my submission' : 'View submissions'}
                            onClick={() => openSubmissions(r)}
                          >
                            {isStudent ? '📋 My Submission' : '📥 Submissions'}
                          </button>
                        )}

                        {cfg.hasProfile && (
                          <button
                            type="button"
                            className="btn sm icon-btn view-btn"
                            title="View"
                            aria-label={`View ${r.name || cfg.title}`}
                            onClick={() => viewProfile(r.id)}
                          >
                            <Icon name="view" />
                          </button>
                        )}
                        {!cfg.hasProfile && (
                          <button
                            type="button"
                            className="btn sm icon-btn view-btn"
                            title="View"
                            aria-label={`View ${r.name || cfg.title}`}
                            onClick={() => setModal({ type: 'view', row: r })}
                          >
                            <Icon name="view" />
                          </button>
                        )}
                        {write && (
                          <>
                            <button
                              type="button"
                              className="btn sm icon-btn edit-btn"
                              title="Edit"
                              aria-label={`Edit ${r.name || cfg.title}`}
                              onClick={() => setModal({ type: 'form', row: r })}
                            >
                              <Icon name="edit" />
                            </button>
                            <button
                              type="button"
                              className="btn sm icon-btn del-btn"
                              title="Delete"
                              aria-label={`Delete ${r.name || cfg.title}`}
                              onClick={() => setModal({ type: 'del', row: r })}
                            >
                              <Icon name="delete" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pgn">
            <span>
              Showing {(page - 1) * PER + 1}–{(page - 1) * PER + slice.length} of {list.length}
            </span>
            <span>
              <button className="btn sm" disabled={page < 2} onClick={() => setPg(page - 1)}>
                Previous
              </button>{' '}
              Page {page} of {pages}{' '}
              <button className="btn sm" disabled={page >= pages} onClick={() => setPg(page + 1)}>
                Next
              </button>
            </span>
          </div>
        </>
      )}

      {/* Student submit assignment modal */}
      {submitModal && (
        <Modal title={`Submit Assignment: ${submitModal.title}`} onClose={() => { setSubmitModal(null); setSubFile(null); }}>
          <form onSubmit={handleStudentSubmit} noValidate>
            <div className="fld">
              <label htmlFor="sub_txt">Your response / solution</label>
              <textarea
                id="sub_txt"
                name="content"
                rows={5}
                placeholder="Type your submission content here..."
              />
            </div>
            <div className="fld">
              <label htmlFor="sub_file_input">Attach file / document (optional, max 12MB)</label>
              <input
                id="sub_file_input"
                type="file"
                style={{ display: 'none' }}
                accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.png,.jpg,.jpeg,.zip"
                onChange={e => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (file.size > 12 * 1024 * 1024) {
                      setToast('File exceeds 12MB limit.');
                      e.target.value = '';
                      return;
                    }
                    setSubFile(file);
                  }
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 4 }}>
                <button
                  type="button"
                  className="btn sm"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  onClick={() => document.getElementById('sub_file_input')?.click()}
                >
                  <Icon name="upload" /> Choose File
                </button>
                {subFile ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '4px 10px',
                      borderRadius: 16,
                      background: 'var(--bg-card)',
                      border: '1px solid var(--border)',
                      fontSize: 13,
                      maxWidth: '100%',
                      wordBreak: 'break-all'
                    }}
                  >
                    📎 <b>{subFile.name}</b> ({(subFile.size / 1024).toFixed(1)} KB)
                    <button
                      type="button"
                      style={{ background: 'none', border: 'none', color: 'var(--danger, #ef4444)', cursor: 'pointer', fontSize: 14, padding: '0 2px' }}
                      title="Remove file"
                      onClick={() => {
                        setSubFile(null);
                        const inp = document.getElementById('sub_file_input');
                        if (inp) inp.value = '';
                      }}
                    >
                      ✕
                    </button>
                  </span>
                ) : (
                  <span className="muted" style={{ fontSize: 13 }}>No file selected</span>
                )}
              </div>
            </div>
            <div className="fld">
              <label htmlFor="sub_file">Attachment / Document name (optional)</label>
              <input
                id="sub_file"
                name="fileName"
                placeholder="e.g. homework_chapter4.pdf"
                defaultValue={subFile ? subFile.name : ''}
                key={subFile ? subFile.name : 'empty'}
              />
            </div>
            <div className="acts">
              <button type="button" className="btn" disabled={submitting} onClick={() => { setSubmitModal(null); setSubFile(null); }}>
                Cancel
              </button>
              <button className="btn pr" disabled={submitting}>
                {submitting ? 'Submitting...' : 'Turn in assignment'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Teacher / Admin view submissions modal */}
      {submissionsModal && (
        <Modal title={`Submissions for ${submissionsModal.assignment.title} (${submissionsModal.assignment.cls})`} onClose={() => setSubmissionsModal(null)}>
          {!submissionsModal.list?.length ? (
            <p className="muted" style={{ padding: '16px 0', textAlign: 'center' }}>No submissions yet for this assignment.</p>
          ) : (
            <div className="tw" style={{ maxHeight: 350, overflowY: 'auto' }}>
              <table className="rt">
                <thead>
                  <tr>
                    <th>Student</th><th>Submitted At</th><th>Attachment</th><th>Grade</th><th>Feedback</th><th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {submissionsModal.list.map(sub => (
                    <tr key={sub.id}>
                      <td data-l="Student"><strong>{sub.studentName}</strong></td>
                      <td data-l="Submitted At">{new Date(sub.submitted_at).toLocaleDateString()}</td>
                      <td data-l="Attachment">
                        {sub.file_data ? (
                          <a
                            href={sub.file_data}
                            download={sub.file_name || 'submission_file'}
                            className="btn sm"
                            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                            title={`Download ${sub.file_name || 'attachment'}`}
                          >
                            <Icon name="download" /> {sub.file_name ? (sub.file_name.length > 18 ? sub.file_name.slice(0, 15) + '…' : sub.file_name) : 'Download'}
                          </a>
                        ) : sub.file_name ? (
                          <span className="muted" style={{ fontSize: 13 }}>📎 {sub.file_name}</span>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td data-l="Grade">{sub.grade !== null ? <b>{sub.grade}%</b> : <span className="muted">Ungraded</span>}</td>
                      <td data-l="Feedback">{sub.feedback || '—'}</td>
                      <td data-l="Action">
                        {(isTeacher || isAdmin) && (
                          <button
                            type="button"
                            className="btn sm pr"
                            onClick={() => setGradeModal(sub)}
                          >
                            {sub.grade !== null ? 'Regrade' : 'Grade'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="acts" style={{ marginTop: 14 }}>
            <button type="button" className="btn" onClick={() => setSubmissionsModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* Grade submission modal */}
      {gradeModal && (
        <Modal title={`Grade submission for ${gradeModal.studentName}`} onClose={() => setGradeModal(null)}>
          <form onSubmit={handleGradeSubmission} noValidate>
            <div className="card" style={{ marginBottom: 12, background: 'var(--bg-card)' }}>
              <strong>Submission Content:</strong>
              <p style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{gradeModal.content || 'No text submitted.'}</p>
              {gradeModal.file_data ? (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="muted" style={{ fontSize: 13 }}>Attached file:</span>
                  <a
                    href={gradeModal.file_data}
                    download={gradeModal.file_name || 'submission_file'}
                    className="btn sm pr"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none' }}
                  >
                    <Icon name="download" /> Download {gradeModal.file_name || 'attachment'}
                  </a>
                </div>
              ) : gradeModal.file_name ? (
                <div style={{ marginTop: 8 }}>
                  <small className="muted">Attached: {gradeModal.file_name}</small>
                </div>
              ) : null}
            </div>
            <div className="fld">
              <label htmlFor="g_val">Grade (0–100) *</label>
              <input id="g_val" name="grade" type="number" min="0" max="100" defaultValue={gradeModal.grade ?? ''} required />
            </div>
            <div className="fld">
              <label htmlFor="g_fb">Feedback for student</label>
              <textarea id="g_fb" name="feedback" rows={3} defaultValue={gradeModal.feedback || ''} placeholder="Add helpful comments..." />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setGradeModal(null)}>Cancel</button>
              <button className="btn pr">Save grade</button>
            </div>
          </form>
        </Modal>
      )}

      {modal?.type === 'view' && (
        <Modal title={`${cfg.title} details`} onClose={() => setModal(null)}>
          <dl>
            {cfg.cols.map(c => (
              <div key={c[0]} style={{ display: 'contents' }}>
                <dt>{c[1]}</dt>
                <dd>{String(cell(c, modal.row) ?? '—')}</dd>
              </div>
            ))}
          </dl>
          <div className="acts">
            <button className="btn" onClick={() => setModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {modal?.type === 'form' && (
        <Modal title={(modal.row ? 'Edit ' : 'Add ') + cfg.title.toLowerCase()} onClose={() => setModal(null)}>
          <RecordForm
            cfg={cfg}
            rels={rels}
            init={modal.row || {}}
            onSave={save}
            onCancel={() => setModal(null)}
            submitLabel={modal.row ? 'Save changes' : 'Add ' + cfg.title.toLowerCase()}
          />
        </Modal>
      )}

      {modal?.type === 'del' && (
        <ConfirmModal
          msg={`This will permanently delete <b>${modal.row.name || modal.row.title || modal.row.id}</b>. You can’t undo this.`}
          onCancel={() => setModal(null)}
          onConfirm={remove}
        />
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
