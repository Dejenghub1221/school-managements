import { useEffect, useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/index.js';
import { Badge, Modal, Skeleton, Toast, ConfirmModal } from '../components/index.js';

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const { user, can } = useAuth();
  const write = can('settings');
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';

  const [tab, setTab] = useState('general'); // 'general' | 'accounts' | 'teaching' | 'promotion' | 'announcements' | 'audit'

  // General settings state
  const [school, setSchool] = useState(settings.school || 'ABC Academy');
  const [year, setYear] = useState(settings.year || '2026/27');
  const [cur, setCur] = useState(settings.cur || '$');
  const [theme, setTheme] = useState(settings.theme || 'system');

  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [accountModal, setAccountModal] = useState(false);
  const [linkParentModal, setLinkParentModal] = useState(false);

  // Password reset state (Admin only)
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('school123');
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetSuccessModal, setResetSuccessModal] = useState(null);

  // Teaching assignments & leave state
  const [teachingAssignments, setTeachingAssignments] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveModal, setLeaveModal] = useState(false);
  const [assignModal, setAssignModal] = useState(false);
  const [reviewLeaveModal, setReviewLeaveModal] = useState(null);

  // Promotion state
  const [promoteConfirm, setPromoteConfirm] = useState(false);

  // Announcements state
  const [announcements, setAnnouncements] = useState([]);
  const [annModal, setAnnModal] = useState(false);

  // Audit log state
  const [auditLogs, setAuditLogs] = useState([]);

  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const loadAccounts = async () => {
    try {
      const [u, s, p, t, pr] = await Promise.all([
        api('/admin-actions/accounts'),
        api('/students'),
        api('/parents'),
        api('/teachers'),
        api('/admin-actions/password-requests').catch(() => [])
      ]);
      setAccounts(u);
      setStudents(s);
      setParents(p);
      setTeachers(t);
      setPasswordRequests(pr || []);
    } catch {}
  };

  const loadTeaching = async () => {
    try {
      const [ta, lr, c] = await Promise.all([
        api('/admin-actions/teaching-assignments'),
        api('/leave-requests'),
        api('/classes-list').catch(() => [])
      ]);
      setTeachingAssignments(ta);
      setLeaveRequests(lr);
      setClasses(c);
    } catch {}
  };

  const loadAnnouncements = async () => {
    try {
      const data = await api('/announcements');
      setAnnouncements(data);
    } catch {}
  };

  const loadAudit = async () => {
    try {
      const data = await api('/audit-log');
      setAuditLogs(data);
    } catch {}
  };

  useEffect(() => {
    if (tab === 'accounts' && isAdmin) loadAccounts();
    if (tab === 'teaching') loadTeaching();
    if (tab === 'announcements') loadAnnouncements();
    if (tab === 'audit' && isAdmin) loadAudit();
  }, [tab]);

  const handleGeneralSubmit = async e => {
    e.preventDefault();
    if (!school.trim()) return setErr('School name is required.');
    setErr('');
    setBusy(true);
    try {
      await updateSettings({ school: school.trim(), year: year.trim(), cur: cur.trim(), theme });
      setToast('Settings saved.');
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCreateAccount = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      username: fd.get('username')?.toString().trim(),
      password: fd.get('password')?.toString(),
      role: fd.get('role')?.toString(),
      name: fd.get('name')?.toString().trim(),
      linkedId: fd.get('linkedId')?.toString() || null
    };
    try {
      await api('/admin-actions/accounts', { method: 'POST', body });
      setToast('Account created successfully.');
      setAccountModal(false);
      loadAccounts();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleLinkParent = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      studentId: fd.get('studentId')?.toString(),
      parentId: fd.get('parentId')?.toString(),
      relationship: fd.get('relationship')?.toString() || 'Guardian',
      isPrimary: fd.get('isPrimary') === 'on'
    };
    try {
      await api('/admin-actions/link-parent', { method: 'POST', body });
      setToast('Parent linked to student.');
      setLinkParentModal(false);
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleResetPasswordSubmit = async e => {
    e.preventDefault();
    if (!resetModalUser) return;
    setBusy(true);
    try {
      const pwdToSet = resetPasswordInput.trim() || 'school123';
      const res = await api('/admin-actions/reset-password', {
        method: 'POST',
        body: {
          username: resetModalUser.username,
          userId: resetModalUser.id,
          newPassword: pwdToSet,
          requestId: resetModalUser.requestId || null,
          reason: resetModalUser.reason || 'Admin manual reset'
        }
      });
      setToast(res.message);
      setResetSuccessModal({
        username: resetModalUser.username,
        name: resetModalUser.name,
        role: resetModalUser.role,
        newPassword: pwdToSet,
        passwordStatus: res.user?.passwordStatus || 'Reset by Admin',
        passwordResetBy: res.user?.passwordResetBy || user?.username || 'admin',
        passwordResetAt: res.user?.passwordResetAt || new Date().toISOString()
      });
      setResetModalUser(null);
      loadAccounts();
    } catch (x) {
      setToast(x.message);
    } finally {
      setBusy(false);
    }
  };

  const generateRandomPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%';
    let pass = 'Sch!';
    for (let i = 0; i < 6; i++) {
      pass += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetPasswordInput(pass);
  };

  const handleLeaveRequest = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      startDate: fd.get('startDate')?.toString(),
      endDate: fd.get('endDate')?.toString(),
      reason: fd.get('reason')?.toString()
    };
    try {
      await api('/leave-requests', { method: 'POST', body });
      setToast('Leave request submitted.');
      setLeaveModal(false);
      loadTeaching();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleReviewLeave = async (status, coverTeacherId) => {
    try {
      await api(`/leave-requests/${reviewLeaveModal.id}/review`, {
        method: 'PUT',
        body: { status, coverTeacherId }
      });
      setToast(`Leave request ${status.toLowerCase()}.`);
      setReviewLeaveModal(null);
      loadTeaching();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handleAssignTeacher = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      teacherId: fd.get('teacherId')?.toString(),
      cls: fd.get('cls')?.toString(),
      subject: fd.get('subject')?.toString()
    };
    try {
      await api('/admin-actions/teaching-assignments', { method: 'POST', body });
      setToast('Teaching assignment updated.');
      setAssignModal(false);
      loadTeaching();
    } catch (x) {
      setToast(x.message);
    }
  };

  const handlePromoteClasses = async () => {
    try {
      const res = await api('/admin-actions/promote', { method: 'POST' });
      setToast(res.message);
      setPromoteConfirm(false);
    } catch (x) {
      setToast(x.message);
    }
  };

  const handlePostAnnouncement = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const body = {
      title: fd.get('title')?.toString().trim(),
      content: fd.get('content')?.toString().trim(),
      targetRole: fd.get('targetRole')?.toString() || 'All',
      cls: fd.get('cls')?.toString() || 'All'
    };
    try {
      await api('/announcements', { method: 'POST', body });
      setToast('Announcement published.');
      setAnnModal(false);
      loadAnnouncements();
    } catch (x) {
      setToast(x.message);
    }
  };

  return (
    <>
      <div className="head">
        <h1>Settings & Administration</h1>
      </div>

      <div className="tabs">
        <button className="btn" aria-pressed={tab === 'general'} onClick={() => setTab('general')}>
          General
        </button>
        {isAdmin && (
          <button className="btn" aria-pressed={tab === 'accounts'} onClick={() => setTab('accounts')}>
            Accounts & Linking
          </button>
        )}
        {(isAdmin || isTeacher) && (
          <button className="btn" aria-pressed={tab === 'teaching'} onClick={() => setTab('teaching')}>
            Teaching & Leave
          </button>
        )}
        <button className="btn" aria-pressed={tab === 'announcements'} onClick={() => setTab('announcements')}>
          Announcements
        </button>
        {isAdmin && (
          <>
            <button className="btn" aria-pressed={tab === 'promotion'} onClick={() => setTab('promotion')}>
              Class Promotion
            </button>
            <button className="btn" aria-pressed={tab === 'audit'} onClick={() => setTab('audit')}>
              Audit Log
            </button>
          </>
        )}
      </div>

      {tab === 'general' && (
        <form className="card" style={{ maxWidth: 520 }} onSubmit={handleGeneralSubmit} noValidate>
          <div className="fld">
            <label htmlFor="s1">School name</label>
            <input id="s1" value={school} disabled={!write} onChange={e => setSchool(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="s2">Academic year</label>
            <input id="s2" value={year} disabled={!write} onChange={e => setYear(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="s3">Currency symbol</label>
            <input id="s3" value={cur} maxLength={4} disabled={!write} onChange={e => setCur(e.target.value)} />
          </div>
          <div className="fld">
            <label htmlFor="s4">Theme</label>
            <select id="s4" value={theme} disabled={!write} onChange={e => setTheme(e.target.value)}>
              <option value="system">system</option>
              <option value="light">light</option>
              <option value="dark">dark</option>
            </select>
          </div>
          {err && <p className="err" role="alert">{err}</p>}
          {write && (
            <div className="acts">
              <button className="btn pr" disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
            </div>
          )}
        </form>
      )}

      {/* Accounts & Linking Tab (Admin - Page 3) */}
      {tab === 'accounts' && isAdmin && (
        <div>
          {/* Pending Password Reset Requests (from Forgot Password submissions) */}
          {passwordRequests.filter(r => r.status === 'Pending').length > 0 && (
            <div className="card" style={{ marginBottom: 20, borderLeft: '4px solid #ef4444', background: 'var(--hv)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <h3 style={{ margin: 0, fontSize: '1rem', color: '#b91c1c', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>⚠️</span> Pending Password Reset Requests ({passwordRequests.filter(r => r.status === 'Pending').length})
                </h3>
                <small className="muted">Users who reported forgotten passwords requiring Administrator action</small>
              </div>
              <div className="tw">
                <table className="rt">
                  <thead>
                    <tr>
                      <th>Username</th><th>Name</th><th>Role</th><th>Contact Info</th><th>Reason</th><th>Requested</th><th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {passwordRequests.filter(r => r.status === 'Pending').map(req => (
                      <tr key={req.id}>
                        <td data-l="Username"><strong>{req.username}</strong></td>
                        <td data-l="Name">{req.name}</td>
                        <td data-l="Role"><Badge v="Suspended" /> {req.role}</td>
                        <td data-l="Contact Info">{req.contact_info || '—'}</td>
                        <td data-l="Reason" style={{ maxWidth: 180, fontSize: '0.85rem' }}>{req.reason}</td>
                        <td data-l="Requested">{new Date(req.requested_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}</td>
                        <td data-l="Action">
                          <button
                            type="button"
                            className="btn sm pr"
                            onClick={() => {
                              setResetModalUser({
                                username: req.username,
                                name: req.name,
                                role: req.role,
                                requestId: req.id,
                                reason: `Resolving password reset request #${req.id}`
                              });
                              setResetPasswordInput('school123');
                              setShowResetPwd(false);
                            }}
                          >
                            ⚡ Reset Now
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="head" style={{ marginBottom: 16 }}>
            <div>
              <h2>User Accounts & Security Credentials</h2>
              <small className="muted">Manage logins, link parents to students, and manually reset user passwords with database audit logging</small>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn pr" onClick={() => setAccountModal(true)}>
                ➕ Create account
              </button>
              <button className="btn" onClick={() => setLinkParentModal(true)}>
                🔗 Link parent to child
              </button>
            </div>
          </div>

          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Linked ID</th>
                  <th>Password Status (DB Label)</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map(acc => (
                  <tr key={acc.id}>
                    <td data-l="Username"><strong>{acc.username}</strong></td>
                    <td data-l="Name">{acc.name}</td>
                    <td data-l="Role"><Badge v={acc.role === 'admin' ? 'Active' : 'Scheduled'} /> {acc.role}</td>
                    <td data-l="Linked ID">{acc.teacher_id || acc.student_id || acc.parent_id || '—'}</td>
                    <td data-l="Password Status">
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {acc.password_status === 'Reset by Admin' || acc.password_status === 'Reset by Admin (DB)' ? (
                            <Badge v="Active" />
                          ) : acc.password_status === 'Reset Requested' ? (
                            <Badge v="Suspended" />
                          ) : acc.password_status === 'Changed by User' ? (
                            <Badge v="Active" />
                          ) : (
                            <Badge v="Scheduled" />
                          )}
                          <strong style={{ fontSize: '0.85rem' }}>
                            {acc.password_status || 'Default'}
                          </strong>
                        </span>
                        {acc.password_reset_by ? (
                          <small className="muted" style={{ fontSize: '0.72rem' }}>
                            Reset by {acc.password_reset_by} {acc.password_reset_at ? `(${new Date(acc.password_reset_at).toLocaleDateString()})` : ''}
                          </small>
                        ) : acc.password_status === 'Changed by User' ? (
                          <small style={{ fontSize: '0.72rem', color: '#16a34a' }}>
                            ✓ Changed by user
                          </small>
                        ) : null}
                      </div>
                    </td>
                    <td data-l="Created">{new Date(acc.created_at).toLocaleDateString()}</td>
                    <td data-l="Actions">
                      <button
                        type="button"
                        className="btn sm"
                        title={`Manually reset password for ${acc.username}`}
                        onClick={() => {
                          setResetModalUser(acc);
                          setResetPasswordInput('school123');
                          setShowResetPwd(false);
                        }}
                      >
                        🔑 Reset Password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teaching Assignments & Leave (Page 3/4) */}
      {tab === 'teaching' && (
        <div>
          <div className="head" style={{ marginBottom: 16 }}>
            <h2>Teaching Assignments & Leave Cover</h2>
            <div style={{ display: 'flex', gap: 8 }}>
              {isTeacher && (
                <button className="btn pr" onClick={() => setLeaveModal(true)}>
                  🏖️ Request leave
                </button>
              )}
              {isAdmin && (
                <button className="btn pr" onClick={() => setAssignModal(true)}>
                  👨‍🏫 Assign teacher to class
                </button>
              )}
            </div>
          </div>

          <h3 style={{ fontSize: 16, margin: '14px 0 8px' }}>Active Teaching Assignments</h3>
          <div className="tw" style={{ marginBottom: 24 }}>
            <table className="rt">
              <thead>
                <tr>
                  <th>Class</th><th>Subject</th><th>Teacher</th><th>Cover Status</th>
                </tr>
              </thead>
              <tbody>
                {teachingAssignments.map(ta => (
                  <tr key={ta.id}>
                    <td data-l="Class"><strong>{ta.cls}</strong></td>
                    <td data-l="Subject">{ta.subject}</td>
                    <td data-l="Teacher">{ta.teacherName || ta.teacher_id}</td>
                    <td data-l="Cover Status">
                      {ta.is_cover ? <Badge v="On leave" /> : <Badge v="Active" />}
                      {ta.coverTeacherName && <span style={{ marginLeft: 6 }}>Cover by: {ta.coverTeacherName}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 style={{ fontSize: 16, margin: '14px 0 8px' }}>Leave Requests</h3>
          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th>Teacher</th><th>Start Date</th><th>End Date</th><th>Reason</th><th>Status</th><th>Cover</th>
                  {isAdmin && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {leaveRequests.map(lr => (
                  <tr key={lr.id}>
                    <td data-l="Teacher">{lr.teacherName || user.name}</td>
                    <td data-l="Start Date">{lr.start_date}</td>
                    <td data-l="End Date">{lr.end_date}</td>
                    <td data-l="Reason">{lr.reason}</td>
                    <td data-l="Status"><Badge v={lr.status === 'Approved' ? 'Active' : lr.status === 'Pending' ? 'Scheduled' : 'Suspended'} /> {lr.status}</td>
                    <td data-l="Cover">{lr.coverTeacherName || '—'}</td>
                    {isAdmin && (
                      <td data-l="Action">
                        {lr.status === 'Pending' && (
                          <button className="btn sm pr" onClick={() => setReviewLeaveModal(lr)}>
                            Review & Cover
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Announcements Tab */}
      {tab === 'announcements' && (
        <div>
          <div className="head" style={{ marginBottom: 16 }}>
            <h2>School & Class Announcements</h2>
            {(isAdmin || isTeacher) && (
              <button className="btn pr" onClick={() => setAnnModal(true)}>
                📢 Post announcement
              </button>
            )}
          </div>

          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th>Title</th><th>Target</th><th>Class</th><th>Author</th><th>Date</th>
                </tr>
              </thead>
              <tbody>
                {announcements.map(ann => (
                  <tr key={ann.id}>
                    <td data-l="Title">
                      <strong>{ann.title}</strong>
                      <div style={{ fontSize: 13, color: 'var(--mu)', marginTop: 4 }}>{ann.content}</div>
                    </td>
                    <td data-l="Target"><Badge v={ann.target_role} /></td>
                    <td data-l="Class">{ann.cls}</td>
                    <td data-l="Author">{ann.author_name} ({ann.author_role})</td>
                    <td data-l="Date">{new Date(ann.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Class Promotion Tab (Admin - Page 3) */}
      {tab === 'promotion' && isAdmin && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>Year-End Class Promotion</h2>
          <p className="muted" style={{ margin: '8px 0 16px' }}>
            Promote all active students to the next grade level (7A→8A, 7B→8B, 8A→9A, 8B→9B, 9A/9B→Graduated).
          </p>
          <div style={{ padding: 12, background: 'var(--bg-card)', borderRadius: 'var(--rd)', marginBottom: 16 }}>
            <strong>Promotion mapping:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              <li>Class 7A & 7B → Advance to Class 8A & 8B</li>
              <li>Class 8A & 8B → Advance to Class 9A & 9B</li>
              <li>Class 9A & 9B → Set to Alumni (Graduated)</li>
            </ul>
          </div>
          <button className="btn dg" onClick={() => setPromoteConfirm(true)}>
            🎓 Execute year-end class promotion
          </button>
        </div>
      )}

      {/* Audit Log Tab (Admin - Page 3) */}
      {tab === 'audit' && isAdmin && (
        <div>
          <div className="head" style={{ marginBottom: 16 }}>
            <h2>System Audit Log</h2>
            <span className="muted">Tracked security events, mark changes, and actions</span>
          </div>

          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th>Timestamp</th><th>User</th><th>Role</th><th>Action</th><th>Target</th><th>Details</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map(log => (
                  <tr key={log.id}>
                    <td data-l="Timestamp">{new Date(log.created_at).toLocaleString()}</td>
                    <td data-l="User"><strong>{log.actor_username}</strong></td>
                    <td data-l="Role"><Badge v={log.actor_role} /></td>
                    <td data-l="Action"><b>{log.action}</b></td>
                    <td data-l="Target">{log.target_entity} ({log.target_id})</td>
                    <td data-l="Details" style={{ fontSize: 12, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {JSON.stringify(log.details)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal: Create Account */}
      {accountModal && (
        <Modal title="Create User Account" onClose={() => setAccountModal(false)}>
          <form onSubmit={handleCreateAccount} noValidate>
            <div className="fld">
              <label htmlFor="acc_u">Username *</label>
              <input id="acc_u" name="username" required placeholder="e.g. jdoe" />
            </div>
            <div className="fld">
              <label htmlFor="acc_p">Password *</label>
              <input id="acc_p" name="password" type="password" required defaultValue="school123" />
            </div>
            <div className="fld">
              <label htmlFor="acc_name">Full Name *</label>
              <input id="acc_name" name="name" required placeholder="e.g. John Doe" />
            </div>
            <div className="fld">
              <label htmlFor="acc_role">Role *</label>
              <select id="acc_role" name="role" required>
                <option value="admin">Administrator</option>
                <option value="teacher">Teacher</option>
                <option value="student">Student</option>
                <option value="parent">Parent</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor="acc_link">Linked Entity ID (e.g. S1001, P01, T01)</label>
              <input id="acc_link" name="linkedId" placeholder="Optional ID to link" />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setAccountModal(false)}>Cancel</button>
              <button className="btn pr">Create account</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Link Parent to Child */}
      {linkParentModal && (
        <Modal title="Link Parent to Student (Many-to-Many)" onClose={() => setLinkParentModal(false)}>
          <form onSubmit={handleLinkParent} noValidate>
            <div className="fld">
              <label htmlFor="lp_stud">Student *</label>
              <select id="lp_stud" name="studentId" required>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.id} - {s.cls})</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="lp_parent">Parent / Guardian *</label>
              <select id="lp_parent" name="parentId" required>
                {parents.map(p => <option key={p.id} value={p.id}>{p.name} ({p.id})</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="lp_rel">Relationship</label>
              <input id="lp_rel" name="relationship" defaultValue="Mother" placeholder="e.g. Father, Mother, Guardian" />
            </div>
            <div className="fld">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input type="checkbox" name="isPrimary" defaultChecked />
                <span>Set as primary guardian</span>
              </label>
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setLinkParentModal(false)}>Cancel</button>
              <button className="btn pr">Save link</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Request Leave */}
      {leaveModal && (
        <Modal title="Submit Leave Request" onClose={() => setLeaveModal(false)}>
          <form onSubmit={handleLeaveRequest} noValidate>
            <div className="fld">
              <label htmlFor="lr_s">Start date *</label>
              <input id="lr_s" name="startDate" type="date" required />
            </div>
            <div className="fld">
              <label htmlFor="lr_e">End date *</label>
              <input id="lr_e" name="endDate" type="date" required />
            </div>
            <div className="fld">
              <label htmlFor="lr_r">Reason for leave *</label>
              <textarea id="lr_r" name="reason" rows={3} placeholder="Medical, personal, training..." required />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setLeaveModal(false)}>Cancel</button>
              <button className="btn pr">Submit request</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Review Leave & Cover */}
      {reviewLeaveModal && (
        <Modal title={`Review Leave Request for ${reviewLeaveModal.teacherName}`} onClose={() => setReviewLeaveModal(null)}>
          <p><strong>Dates:</strong> {reviewLeaveModal.start_date} to {reviewLeaveModal.end_date}</p>
          <p><strong>Reason:</strong> {reviewLeaveModal.reason}</p>
          <div className="fld" style={{ marginTop: 12 }}>
            <label htmlFor="rl_cover">Assign cover teacher</label>
            <select id="rl_cover">
              <option value="">No cover teacher</option>
              {teachers.filter(t => t.id !== reviewLeaveModal.teacher_id).map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>
              ))}
            </select>
          </div>
          <div className="acts" style={{ marginTop: 16 }}>
            <button type="button" className="btn dg" onClick={() => handleReviewLeave('Rejected', null)}>Reject</button>
            <button
              type="button"
              className="btn pr"
              onClick={() => handleReviewLeave('Approved', document.getElementById('rl_cover')?.value || null)}
            >
              Approve & assign cover
            </button>
          </div>
        </Modal>
      )}

      {/* Modal: Assign Teacher to Class */}
      {assignModal && (
        <Modal title="Assign Teacher to Class & Subject" onClose={() => setAssignModal(false)}>
          <form onSubmit={handleAssignTeacher} noValidate>
            <div className="fld">
              <label htmlFor="at_cls">Class *</label>
              <select id="at_cls" name="cls" required>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="at_sub">Subject *</label>
              <select id="at_sub" name="subject" required>
                {['Mathematics', 'English', 'Science', 'History', 'Geography', 'ICT'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="at_t">Teacher *</label>
              <select id="at_t" name="teacherId" required>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.subject})</option>)}
              </select>
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setAssignModal(false)}>Cancel</button>
              <button className="btn pr">Assign</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Post Announcement */}
      {annModal && (
        <Modal title="Post School / Class Announcement" onClose={() => setAnnModal(false)}>
          <form onSubmit={handlePostAnnouncement} noValidate>
            <div className="fld">
              <label htmlFor="ann_t">Title *</label>
              <input id="ann_t" name="title" required placeholder="Announcement headline..." />
            </div>
            <div className="fld">
              <label htmlFor="ann_c">Content *</label>
              <textarea id="ann_c" name="content" rows={4} required placeholder="Full announcement text..." />
            </div>
            <div className="fld">
              <label htmlFor="ann_r">Target audience</label>
              <select id="ann_r" name="targetRole" defaultValue="All">
                <option value="All">All School (Students, Parents, Teachers)</option>
                <option value="Student">Students Only</option>
                <option value="Parent">Parents Only</option>
                <option value="Teacher">Teachers Only</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor="ann_cls">Target class</label>
              <select id="ann_cls" name="cls" defaultValue="All">
                {isAdmin && <option value="All">All classes</option>}
                {(classes.length ? classes : ['7A', '7B', '8A', '8B', '9A', '9B']).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setAnnModal(false)}>Cancel</button>
              <button className="btn pr">Post announcement</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Admin Reset Password */}
      {resetModalUser && (
        <Modal
          title={`🔑 Admin Password Reset — ${resetModalUser.name} (@${resetModalUser.username})`}
          onClose={() => setResetModalUser(null)}
        >
          <form onSubmit={handleResetPasswordSubmit} noValidate>
            <div style={{ background: 'var(--hv, #f8fafc)', border: '1px solid var(--bd, #e2e8f0)', borderLeft: '4px solid #2563eb', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
              <strong style={{ display: 'block', color: '#1e40af', fontSize: '0.9rem', marginBottom: 4 }}>
                🔒 Administrative Security Authority
              </strong>
              <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.5, color: 'var(--tx)' }}>
                You are performing a manual password reset as <strong>Administrator</strong>. The database <code>users</code> record will be updated with your administrative signature (<code>password_reset_by: {user?.username || 'admin'}</code>) and labeled as <strong>Reset by Admin</strong>.
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div style={{ background: 'var(--hv)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--bd)' }}>
                <small className="muted" style={{ display: 'block' }}>Target Account</small>
                <strong>{resetModalUser.username}</strong>
              </div>
              <div style={{ background: 'var(--hv)', padding: '8px 12px', borderRadius: 6, border: '1px solid var(--bd)' }}>
                <small className="muted" style={{ display: 'block' }}>Role</small>
                <strong style={{ textTransform: 'capitalize' }}>{resetModalUser.role}</strong>
              </div>
            </div>

            <div className="fld">
              <label htmlFor="adm_pwd">New Password *</label>
              <div className="pwd-wrap">
                <input
                  id="adm_pwd"
                  type={showResetPwd ? 'text' : 'password'}
                  required
                  minLength={6}
                  value={resetPasswordInput}
                  onChange={e => setResetPasswordInput(e.target.value)}
                  placeholder="Enter new password (min 6 characters)"
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  title={showResetPwd ? 'Hide password' : 'Show password'}
                  onClick={() => setShowResetPwd(!showResetPwd)}
                >
                  {showResetPwd ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
              <button
                type="button"
                className="btn sm"
                onClick={generateRandomPassword}
                title="Generate a random secure temporary password"
              >
                🎲 Auto-Generate Strong Password
              </button>
              <button
                type="button"
                className="btn sm"
                onClick={() => setResetPasswordInput('school123')}
                title="Reset to default demo password"
              >
                ↺ Set Default (school123)
              </button>
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setResetModalUser(null)}>
                Cancel
              </button>
              <button className="btn pr" disabled={busy}>
                {busy ? 'Updating Database…' : 'Confirm & Update Password in DB'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Reset Password Success & Credentials Copy */}
      {resetSuccessModal && (
        <Modal
          title="✅ Password Reset Completed"
          onClose={() => setResetSuccessModal(null)}
        >
          <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '14px', borderRadius: 8, marginBottom: 16 }}>
            <p style={{ margin: 0, fontWeight: 600, fontSize: '0.95rem' }}>
              Database Record Updated Successfully!
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '0.85rem' }}>
              The password for <strong>{resetSuccessModal.name}</strong> has been updated and signed in the database.
            </p>
          </div>

          <div style={{ background: 'var(--hv)', border: '1px solid var(--bd)', borderRadius: 8, padding: 14, marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>New Credentials for User:</h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: '0.88rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 6 }}>
                <span className="muted">Username:</span>
                <code><strong>{resetSuccessModal.username}</strong></code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 6 }}>
                <span className="muted">Temporary Password:</span>
                <code style={{ fontSize: '1rem', background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, color: 'var(--ac)' }}>
                  <strong>{resetSuccessModal.newPassword}</strong>
                </code>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--bd)', paddingBottom: 6 }}>
                <span className="muted">Database Label:</span>
                <span className="badge-active" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                  {resetSuccessModal.passwordStatus}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Reset Signature:</span>
                <span style={{ fontSize: '0.8rem' }}>
                  {resetSuccessModal.passwordResetBy} ({new Date(resetSuccessModal.passwordResetAt).toLocaleString()})
                </span>
              </div>
            </div>
          </div>

          <p style={{ fontSize: '0.84rem', color: 'var(--tx)', marginBottom: 16 }}>
            Share these temporary credentials with the user in person or via their verified contact channel.
          </p>

          <div className="acts">
            <button
              type="button"
              className="btn"
              onClick={() => {
                const text = `School Management Credentials\nUsername: ${resetSuccessModal.username}\nPassword: ${resetSuccessModal.newPassword}\nLogin: http://localhost:5173`;
                navigator.clipboard?.writeText(text);
                setToast('Credentials copied to clipboard!');
              }}
            >
              📋 Copy Credentials
            </button>
            <button type="button" className="btn pr" onClick={() => setResetSuccessModal(null)}>
              Done
            </button>
          </div>
        </Modal>
      )}

      {/* Confirm: Promotion */}
      {promoteConfirm && (
        <ConfirmModal
          title="Confirm Class Promotion"
          msg="This will advance all active students to the next academic level (7A→8A, 8A→9A, 9A→Graduated). This action is permanent."
          onCancel={() => setPromoteConfirm(false)}
          onConfirm={handlePromoteClasses}
        />
      )}

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
