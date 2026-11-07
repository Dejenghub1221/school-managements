import { useEffect, useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { api } from '../api/index.js';
import { Badge, Modal, Skeleton, Toast, ConfirmModal, ExportImportControls } from '../components/index.js';

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const { user, can } = useAuth();
  const write = can('settings');
  const isAdmin = user?.role === 'admin';
  const isTeacher = user?.role === 'teacher';

  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'general'; // 'general' | 'accounts' | 'teaching' | 'promotion' | 'announcements' | 'audit'
  const setTab = newTab => {
    setSearchParams({ tab: newTab });
  };

  // General settings state
  const [school, setSchool] = useState(settings.school || 'ABC Academy');
  const [year, setYear] = useState(settings.year || '2026/27');
  const [cur, setCur] = useState(settings.cur || '$');
  const [theme, setTheme] = useState(settings.theme || 'light');

  useEffect(() => {
    if (settings) {
      if (settings.school) setSchool(settings.school);
      if (settings.year) setYear(settings.year);
      if (settings.cur) setCur(settings.cur);
      if (settings.theme) setTheme(settings.theme);
    }
  }, [settings]);

  // Accounts state
  const [accounts, setAccounts] = useState([]);
  const [students, setStudents] = useState([]);
  const [parents, setParents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState(['7A', '7B', '8A', '8B', '9A', '9B', '10A', '10B']);
  const [accountModal, setAccountModal] = useState(false);
  const [linkParentModal, setLinkParentModal] = useState(false);

  // Create account modal state
  const [newAccRole, setNewAccRole] = useState('student');
  const [newAccLinkedId, setNewAccLinkedId] = useState('');
  const [customLinkedId, setCustomLinkedId] = useState(false);
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccName, setNewAccName] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('school123');
  const [showNewAccPwd, setShowNewAccPwd] = useState(false);
  const [accModalErr, setAccModalErr] = useState('');
  const [accModalBusy, setAccModalBusy] = useState(false);

  const openCreateAccountModal = () => {
    setNewAccRole('student');
    setNewAccLinkedId('');
    setCustomLinkedId(false);
    setNewAccUsername('');
    setNewAccName('');
    setNewAccPassword('school123');
    setShowNewAccPwd(false);
    setAccModalErr('');
    setAccModalBusy(false);
    setAccountModal(true);
  };

  // Password reset state (Admin only)
  const [passwordRequests, setPasswordRequests] = useState([]);
  const [resetModalUser, setResetModalUser] = useState(null);
  const [resetPasswordInput, setResetPasswordInput] = useState('school123');
  const [showResetPwd, setShowResetPwd] = useState(false);
  const [resetSuccessModal, setResetSuccessModal] = useState(null);

  // User security & resource management state (Admin only)
  const [statusModalUser, setStatusModalUser] = useState(null);
  const [statusReasonInput, setStatusReasonInput] = useState('Administrative suspension');
  const [resourceModalUser, setResourceModalUser] = useState(null);
  const [resourceRole, setResourceRole] = useState('student');
  const [resourceName, setResourceName] = useState('');
  const [resourceLinkedId, setResourceLinkedId] = useState('');
  const [resourceChildren, setResourceChildren] = useState([]);
  const [resourceBusy, setResourceBusy] = useState(false);
  const [resourceErr, setResourceErr] = useState('');
  const [deleteModalUser, setDeleteModalUser] = useState(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteReasonInput, setDeleteReasonInput] = useState('Administrative account deletion');
  const [delFilter, setDelFilter] = useState('all'); // 'all' | 'N' | 'Y'

  // Deleted users history & user activity audit modals
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [deletedUsersModal, setDeletedUsersModal] = useState(false);
  const [userHistoryModalData, setUserHistoryModalData] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Teaching assignments & leave state
  const [teachingAssignments, setTeachingAssignments] = useState([]);
  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveModal, setLeaveModal] = useState(false);
  const [leaveModalBusy, setLeaveModalBusy] = useState(false);
  const [leaveModalErr, setLeaveModalErr] = useState('');
  const [leaveFormTeacherId, setLeaveFormTeacherId] = useState('');
  const [leaveFormType, setLeaveFormType] = useState('Sick / Medical');
  const [leaveFormStartDate, setLeaveFormStartDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [leaveFormEndDate, setLeaveFormEndDate] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10));
  const [leaveFilter, setLeaveFilter] = useState('all'); // 'all' | 'Pending' | 'Approved' | 'Rejected'
  const [assignModal, setAssignModal] = useState(false);
  const [reviewLeaveModal, setReviewLeaveModal] = useState(null);
  const [reviewCoverId, setReviewCoverId] = useState('');
  const [reviewNotes, setReviewNotes] = useState('');
  const [reviewBusy, setReviewBusy] = useState(false);
  const [rejectConfirmModal, setRejectConfirmModal] = useState(null);
  const [rejectReasonInput, setRejectReasonInput] = useState('');

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
      const [u, s, p, t, pr, du] = await Promise.all([
        api('/admin-actions/accounts').catch(() => []),
        api('/students').catch(() => []),
        api('/parents').catch(() => []),
        api('/teachers').catch(() => []),
        api('/admin-actions/password-requests').catch(() => []),
        api('/admin-actions/deleted-users').catch(() => [])
      ]);
      setAccounts(Array.isArray(u) ? u : []);
      setStudents(Array.isArray(s) ? s : []);
      setParents(Array.isArray(p) ? p : []);
      setTeachers(Array.isArray(t) ? t : []);
      setPasswordRequests(Array.isArray(pr) ? pr : []);
      setDeletedUsers(Array.isArray(du) ? du : []);
    } catch {}
  };

  const loadTeaching = async () => {
    try {
      const [ta, lr, c, t] = await Promise.all([
        api('/admin-actions/teaching-assignments').catch(() => []),
        api('/leave-requests').catch(() => []),
        api('/classes-list').catch(() => []),
        api('/teachers').catch(() => [])
      ]);
      setTeachingAssignments(Array.isArray(ta) ? ta : []);
      setLeaveRequests(Array.isArray(lr) ? lr : []);
      if (Array.isArray(c) && c.length) setClasses(c);
      if (Array.isArray(t)) setTeachers(t);
    } catch {}
  };

  const openAssignModal = async () => {
    setAssignModal(true);
    if (!teachers || teachers.length === 0) {
      try {
        const t = await api('/teachers');
        if (Array.isArray(t)) setTeachers(t);
      } catch {}
    }
    if (!classes || classes.length === 0) {
      try {
        const c = await api('/classes-list');
        if (Array.isArray(c) && c.length) setClasses(c);
      } catch {}
    }
  };

  const getDaysBetween = (startStr, endStr) => {
    if (!startStr || !endStr) return 0;
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return 0;
    return Math.round((e - s) / (1000 * 60 * 60 * 24)) + 1;
  };

  const openLeaveModal = async () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    setLeaveFormStartDate(tomorrow);
    setLeaveFormEndDate(tomorrow);
    setLeaveFormType('Sick / Medical');
    setLeaveModalErr('');
    setLeaveModalBusy(false);

    if (isAdmin && (!teachers || teachers.length === 0)) {
      try {
        const t = await api('/teachers');
        if (Array.isArray(t)) {
          setTeachers(t);
          if (t[0]) setLeaveFormTeacherId(t[0].id);
        }
      } catch {}
    } else if (teachers && teachers.length > 0 && !leaveFormTeacherId) {
      setLeaveFormTeacherId(teachers[0].id);
    }
    setLeaveModal(true);
  };

  const openReviewModal = req => {
    setReviewLeaveModal(req);
    setReviewCoverId(req.cover_teacher_id || '');
    setReviewNotes(req.review_notes || '');
  };

  const openRejectModal = req => {
    setRejectConfirmModal(req);
    setRejectReasonInput(req.review_notes || '');
  };

  const filteredLeaveRequests = useMemo(() => {
    if (leaveFilter === 'all') return leaveRequests;
    return leaveRequests.filter(lr => lr.status === leaveFilter);
  }, [leaveRequests, leaveFilter]);

  const leaveCounts = useMemo(() => {
    const counts = { all: leaveRequests.length, Pending: 0, Approved: 0, Rejected: 0 };
    leaveRequests.forEach(lr => {
      if (counts[lr.status] !== undefined) counts[lr.status]++;
    });
    return counts;
  }, [leaveRequests]);

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
    setAccModalErr('');
    const cleanUsername = newAccUsername.trim().toLowerCase();
    const cleanName = newAccName.trim();
    const cleanPassword = newAccPassword.trim();
    const cleanLinkedId = newAccLinkedId.trim() || null;

    if (!cleanUsername) {
      setAccModalErr('Username is required.');
      return;
    }
    if (!cleanPassword || cleanPassword.length < 4) {
      setAccModalErr('Password must be at least 4 characters.');
      return;
    }
    if (!cleanName) {
      setAccModalErr('Full name is required.');
      return;
    }

    setAccModalBusy(true);
    try {
      await api('/admin-actions/accounts', {
        method: 'POST',
        body: {
          username: cleanUsername,
          password: cleanPassword,
          role: newAccRole,
          name: cleanName,
          linkedId: cleanLinkedId
        }
      });
      setToast(`Account "@${cleanUsername}" created successfully.`);
      setAccountModal(false);
      loadAccounts();
    } catch (x) {
      setAccModalErr(x.message || 'Failed to create account.');
      setToast(x.message || 'Failed to create account.');
    } finally {
      setAccModalBusy(false);
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

  const handleToggleUserStatus = async (targetUser, newActiveState, reasonText = '') => {
    setBusy(true);
    try {
      const res = await api('/admin-actions/toggle-user-status', {
        method: 'POST',
        body: {
          userId: targetUser.id,
          username: targetUser.username,
          isActive: newActiveState,
          reason: reasonText || (newActiveState ? 'Re-enabled by administrator' : 'Suspended by administrator')
        }
      });
      setToast(res.message || `User @${targetUser.username} ${newActiveState ? 'enabled' : 'disabled'}.`);
      setStatusModalUser(null);
      setStatusReasonInput('Administrative suspension');
      loadAccounts();
    } catch (x) {
      setToast(x.message);
    } finally {
      setBusy(false);
    }
  };

  const openResourceModal = async (u) => {
    setResourceModalUser(u);
    setResourceRole(u.role);
    setResourceName(u.name || '');
    setResourceLinkedId(u.teacher_id || u.student_id || u.parent_id || '');
    setResourceErr('');
    setResourceBusy(false);
    if (u.parent_id) {
      try {
        const kids = await api(`/admin-actions/parents/${u.parent_id}/children`);
        setResourceChildren(kids || []);
      } catch {
        setResourceChildren(u.children || []);
      }
    } else {
      setResourceChildren([]);
    }
  };

  const handleDetachPrimaryResource = async () => {
    if (!resourceModalUser) return;
    if (!window.confirm(`Detach primary entity link from @${resourceModalUser.username}? Foreign key links will be set to NULL, keeping the user login active.`)) return;
    setResourceBusy(true);
    setResourceErr('');
    try {
      const res = await api(`/admin-actions/users/${resourceModalUser.id}/linked-resource`, {
        method: 'DELETE'
      });
      setToast(res.message || 'Primary resource detached.');
      setResourceLinkedId('');
      setResourceModalUser(prev => ({ ...prev, teacher_id: null, student_id: null, parent_id: null, linkedDetails: null }));
      loadAccounts();
    } catch (x) {
      setResourceErr(x.message || 'Failed to detach resource.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleSaveResourceChanges = async (e) => {
    e.preventDefault();
    if (!resourceModalUser) return;
    setResourceBusy(true);
    setResourceErr('');
    try {
      const res = await api(`/admin-actions/users/${resourceModalUser.id}/resources`, {
        method: 'PUT',
        body: {
          action: 'modify',
          role: resourceRole,
          name: resourceName.trim(),
          linkedId: resourceLinkedId.trim() || null
        }
      });
      setToast(res.message || 'User resources updated successfully.');
      setResourceModalUser(null);
      loadAccounts();
    } catch (x) {
      setResourceErr(x.message || 'Failed to update resources.');
    } finally {
      setResourceBusy(false);
    }
  };

  const handleDetachChild = async (parentId, studentId, childName) => {
    if (!window.confirm(`Detach child "${childName || studentId}" from this parent?`)) return;
    setResourceBusy(true);
    try {
      await api(`/admin-actions/parents/${parentId}/children/${studentId}`, { method: 'DELETE' });
      setToast('Detached child from parent.');
      setResourceChildren(prev => prev.filter(c => c.student_id !== studentId));
      loadAccounts();
    } catch (x) {
      setResourceErr(x.message);
    } finally {
      setResourceBusy(false);
    }
  };

  const openDeletedAccountsModal = async () => {
    setDeletedUsersModal(true);
    try {
      const du = await api('/admin-actions/deleted-users');
      setDeletedUsers(Array.isArray(du) ? du : []);
    } catch {}
  };

  const openUserHistoryModal = async (target) => {
    setHistoryLoading(true);
    setUserHistoryModalData({ user: target, history: [], isDeleted: Boolean(target?.deleted_at), loading: true });
    try {
      const targetId = target.id || target.user_id || target.username;
      const res = await api(`/admin-actions/users/${targetId}/history`);
      setUserHistoryModalData({
        user: res?.user || target,
        history: Array.isArray(res?.history) ? res.history : [],
        isDeleted: Boolean(res?.isDeleted),
        loading: false
      });
    } catch (x) {
      setUserHistoryModalData({
        user: target,
        history: Array.isArray(target?.activity_snapshot?.audit_history) ? target.activity_snapshot.audit_history : [],
        isDeleted: Boolean(target?.deleted_at),
        error: x.message,
        loading: false
      });
    } finally {
      setHistoryLoading(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!deleteModalUser) return;
    setDeleteBusy(true);
    try {
      const res = await api(`/admin-actions/users/${deleteModalUser.id}`, {
        method: 'DELETE',
        body: { reason: deleteReasonInput }
      });
      setToast(res.message || `User @${deleteModalUser.username} marked as deleted (del_flg: Y).`);
      setDeleteModalUser(null);
      await loadAccounts();
    } catch (x) {
      setToast(x.message || 'Failed to delete user.');
    } finally {
      setDeleteBusy(false);
    }
  };

  const handleRestoreUser = async (target) => {
    if (!target) return;
    if (!window.confirm(`Restore user account @${target.username} (del_flg: N)? The user will be re-enabled.`)) return;
    try {
      const res = await api(`/admin-actions/users/${target.id}/restore`, { method: 'POST' });
      setToast(res.message || `User @${target.username} restored successfully (del_flg: N).`);
      await loadAccounts();
    } catch (x) {
      setToast(x.message || 'Failed to restore user.');
    }
  };

  const handleLeaveRequest = async e => {
    e.preventDefault();
    setLeaveModalErr('');
    const fd = new FormData(e.target);
    const startDate = fd.get('startDate')?.toString();
    const endDate = fd.get('endDate')?.toString();
    const reason = fd.get('reason')?.toString()?.trim();
    const leaveType = fd.get('leaveType')?.toString() || 'Sick / Medical';
    const emergencyContact = fd.get('emergencyContact')?.toString()?.trim();
    const handoverNotes = fd.get('handoverNotes')?.toString()?.trim();
    const teacherId = isAdmin ? (fd.get('teacherId')?.toString() || leaveFormTeacherId) : undefined;

    if (isAdmin && !teacherId) {
      setLeaveModalErr('Please select a teacher.');
      return;
    }
    if (!startDate || !endDate) {
      setLeaveModalErr('Start date and end date are required.');
      return;
    }
    if (new Date(startDate) > new Date(endDate)) {
      setLeaveModalErr('Start date cannot be after end date.');
      return;
    }
    if (!reason) {
      setLeaveModalErr('Reason for leave is required.');
      return;
    }

    setLeaveModalBusy(true);
    try {
      const body = {
        startDate,
        endDate,
        reason,
        leaveType,
        emergencyContact,
        handoverNotes,
        ...(teacherId ? { teacherId } : {})
      };
      await api('/leave-requests', { method: 'POST', body });
      setToast('Leave request submitted successfully.');
      setLeaveModal(false);
      loadTeaching();
    } catch (x) {
      setLeaveModalErr(x.message || 'Failed to submit leave request.');
    } finally {
      setLeaveModalBusy(false);
    }
  };

  const handleReviewLeave = async (targetReq, status, coverTeacherId, notes) => {
    if (!targetReq?.id) return;
    setReviewBusy(true);
    try {
      await api(`/leave-requests/${targetReq.id}/review`, {
        method: 'PUT',
        body: {
          status,
          coverTeacherId: status === 'Approved' ? (coverTeacherId || null) : null,
          reviewNotes: notes || ''
        }
      });
      setToast(`Leave request ${status.toLowerCase()} successfully.`);
      setReviewLeaveModal(null);
      setRejectConfirmModal(null);
      loadTeaching();
    } catch (x) {
      setToast(x.message || `Failed to ${status.toLowerCase()} leave request.`);
    } finally {
      setReviewBusy(false);
    }
  };

  const handleDeleteLeave = async (id, teacherName) => {
    if (!window.confirm(`Are you sure you want to delete this leave request for ${teacherName || 'this teacher'}?`)) {
      return;
    }
    try {
      await api(`/leave-requests/${id}`, { method: 'DELETE' });
      setToast('Leave request deleted.');
      loadTeaching();
    } catch (x) {
      setToast(x.message || 'Failed to delete leave request.');
    }
  };

  const handleAssignTeacher = async e => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const teacherId = fd.get('teacherId')?.toString();
    const cls = fd.get('cls')?.toString();
    const subject = fd.get('subject')?.toString();

    if (!teacherId) {
      setToast('Please select a teacher.');
      return;
    }
    if (!cls || !subject) {
      setToast('Please select class and subject.');
      return;
    }

    const body = { teacherId, cls, subject };
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
      {tab === 'general' && (
        <div>
          <div className="head" style={{ marginBottom: 16 }}>
            <div>
              <h2>⚙️ General School Configuration</h2>
              <small className="muted">School identity, academic session year, currency, and appearance settings</small>
            </div>
          </div>
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
        </div>
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
              <small className="muted">Manage logins, link parents to students, track del_flg (Y/N), and reset user passwords with database audit logging</small>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn pr" onClick={openCreateAccountModal}>
                ➕ Create account
              </button>
              <button className="btn" onClick={() => setLinkParentModal(true)}>
                🔗 Link parent to child
              </button>
              <button
                type="button"
                className="btn"
                onClick={openDeletedAccountsModal}
                title="View archived records and history of deleted user accounts"
              >
                📜 Deleted Accounts History {Array.isArray(deletedUsers) && deletedUsers.length > 0 && <span className="bd" style={{ marginLeft: 6, fontSize: '0.72rem' }}>{deletedUsers.length}</span>}
              </button>
            </div>
          </div>

          {/* Deletion Status Filter Bar & Export Controls */}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span className="muted" style={{ fontSize: '0.84rem', fontWeight: 600 }}>Filter by Del Flag:</span>
              <button
                type="button"
                className={`btn sm ${delFilter === 'all' ? 'pr' : ''}`}
                onClick={() => setDelFilter('all')}
              >
                All ({accounts.length})
              </button>
              <button
                type="button"
                className={`btn sm ${delFilter === 'N' ? 'pr' : ''}`}
                onClick={() => setDelFilter('N')}
              >
                Active / Not Deleted - N ({accounts.filter(a => a.del_flg !== 'Y').length})
              </button>
              <button
                type="button"
                className={`btn sm ${delFilter === 'Y' ? 'pr' : ''}`}
                onClick={() => setDelFilter('Y')}
                style={delFilter === 'Y' ? { background: '#dc2626', borderColor: '#b91c1c', color: '#fff' } : {}}
              >
                Deleted - Y ({accounts.filter(a => a.del_flg === 'Y').length})
              </button>
            </div>
            <ExportImportControls
              entityKey="accounts"
              title="User Accounts"
              columns={[
                { key: 'username', label: 'Username' },
                { key: 'name', label: 'Full Name' },
                { key: 'role', label: 'Role' },
                { key: 'is_active', label: 'Active Status', format: a => a.del_flg === 'Y' ? 'Deleted' : a.is_active !== false ? 'Active' : 'Suspended' },
                { key: 'del_flg', label: 'Del Flag', format: a => a.del_flg || 'N' },
                { key: 'linked_id', label: 'Linked ID', format: a => a.student_id ? `Student: ${a.student_id}` : a.teacher_id ? `Teacher: ${a.teacher_id}` : a.parent_id ? `Parent: ${a.parent_id}` : 'None' },
                { key: 'password_reset_pending', label: 'Password Status', format: a => a.password_reset_pending ? 'Reset Pending' : 'Normal' },
                { key: 'created_at', label: 'Created At', format: a => a.created_at ? new Date(a.created_at).toLocaleDateString() : '-' }
              ]}
              data={accounts.filter(acc => {
                if (delFilter === 'N') return acc.del_flg !== 'Y';
                if (delFilter === 'Y') return acc.del_flg === 'Y';
                return true;
              })}
              canImport={false}
              notify={(msg, type) => setToast(msg)}
            />
          </div>

          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th>Username</th>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Status</th>
                  <th>Del Flag</th>
                  <th>Linked Resource</th>
                  <th>Password Status (DB Label)</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {accounts
                  .filter(acc => {
                    if (delFilter === 'N') return acc.del_flg !== 'Y';
                    if (delFilter === 'Y') return acc.del_flg === 'Y';
                    return true;
                  })
                  .map((acc, idx) => {
                    const isSelf = (user?.id === acc.id) || (user?.username && acc.username.toLowerCase() === user.username.toLowerCase());
                    const isDeleted = acc.del_flg === 'Y';
                    const isActive = acc.is_active !== false && !isDeleted;

                    return (
                      <tr key={acc.id} style={{ opacity: isDeleted ? 0.7 : isActive ? 1 : 0.8, background: isDeleted ? 'rgba(239, 68, 68, 0.04)' : undefined }}>
                        <td data-l="Username">
                          <strong style={{ color: isDeleted ? '#dc2626' : isActive ? 'inherit' : 'var(--mu)', textDecoration: isDeleted ? 'line-through' : 'none' }}>
                            {acc.username}
                          </strong>
                          {isSelf && <span className="bd y" style={{ marginLeft: 6, fontSize: '0.7rem' }}>You</span>}
                          {isDeleted && <span className="bd r" style={{ marginLeft: 6, fontSize: '0.68rem', fontWeight: 700 }}>DELETED</span>}
                        </td>
                        <td data-l="Name">{acc.name}</td>
                        <td data-l="Role">
                          <Badge v={acc.role === 'admin' ? 'Active' : 'Scheduled'} /> {acc.role}
                        </td>
                        <td data-l="Status">
                          {isDeleted ? (
                            <div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#dc2626', fontWeight: 600 }}>
                                <Badge v="Suspended" /> Deleted
                              </span>
                              {acc.deleted_at && (
                                <small style={{ display: 'block', fontSize: '0.72rem', color: '#dc2626', marginTop: 2 }}>
                                  {new Date(acc.deleted_at).toLocaleDateString()}
                                </small>
                              )}
                            </div>
                          ) : isActive ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#16a34a', fontWeight: 600 }}>
                              <Badge v="Active" /> Active
                            </span>
                          ) : (
                            <div>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: '#dc2626', fontWeight: 600 }}>
                                <Badge v="Suspended" /> Disabled
                              </span>
                              {acc.disabled_reason && (
                                <small style={{ display: 'block', fontSize: '0.72rem', color: '#dc2626', marginTop: 2, maxWidth: 160 }} title={acc.disabled_reason}>
                                  {acc.disabled_reason}
                                </small>
                              )}
                            </div>
                          )}
                        </td>
                        <td data-l="Del Flag" style={{ textAlign: 'center' }}>
                          {isDeleted ? (
                            <span
                              style={{
                                display: 'inline-flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minWidth: 28,
                                background: '#fef2f2',
                                color: '#dc2626',
                                border: '1px solid #fca5a5',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                lineHeight: 1.2
                              }}
                              title={acc.deleted_at ? `Deleted at ${new Date(acc.deleted_at).toLocaleString()} by @${acc.deleted_by || 'admin'}${acc.deletion_reason ? ` (${acc.deletion_reason})` : ''}` : 'Deleted (Y)'}
                            >
                              Y
                            </span>
                          ) : (
                            <span
                              style={{
                                display: 'inline-flex',
                                justifyContent: 'center',
                                alignItems: 'center',
                                minWidth: 28,
                                background: '#f0fdf4',
                                color: '#16a34a',
                                border: '1px solid #86efac',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                lineHeight: 1.2
                              }}
                              title="Active account: not deleted (N)"
                            >
                              N
                            </span>
                          )}
                        </td>
                        <td data-l="Linked Resource">
                          <div style={{ fontSize: '0.86rem' }}>
                            {acc.teacher_id ? (
                              <span>👨‍🏫 Teacher: <strong>{acc.linkedDetails?.name || acc.teacher_id}</strong> ({acc.teacher_id})</span>
                            ) : acc.student_id ? (
                              <span>🎓 Student: <strong>{acc.linkedDetails?.name || acc.student_id}</strong> ({acc.student_id}{acc.linkedDetails?.cls ? ` · ${acc.linkedDetails.cls}` : ''})</span>
                            ) : acc.parent_id ? (
                              <span>👪 Parent: <strong>{acc.parent_id}</strong></span>
                            ) : (
                              <span className="muted">— (Unlinked)</span>
                            )}
                          </div>
                          {acc.parent_id && acc.children && acc.children.length > 0 && (
                            <div style={{ fontSize: '0.74rem', color: 'var(--mu)', marginTop: 2 }}>
                              Children: {acc.children.map(c => c.student_name || c.student_id).join(', ')}
                            </div>
                          )}
                        </td>
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
                          <select
                            className="table-action-select"
                            aria-label={`Actions for @${acc.username}`}
                            value=""
                            onChange={e => {
                              const val = e.target.value;
                              if (!val) return;
                              if (val === 'reset_pwd') {
                                setResetModalUser(acc);
                                setResetPasswordInput('school123');
                                setShowResetPwd(false);
                              } else if (val === 'resources') {
                                openResourceModal(acc);
                              } else if (val === 'history') {
                                openUserHistoryModal(acc);
                              } else if (val === 'restore') {
                                handleRestoreUser(acc);
                              } else if (val === 'disable') {
                                setStatusModalUser(acc);
                                setStatusReasonInput('Administrative suspension');
                              } else if (val === 'enable') {
                                handleToggleUserStatus(acc, true);
                              } else if (val === 'delete') {
                                setDeleteModalUser(acc);
                                setDeleteReasonInput('Administrative account deletion');
                              }
                            }}
                          >
                            <option value="" disabled hidden style={{ display: 'none' }}>---select---</option>
                            {isDeleted ? (
                              <>
                                <option value="history">📜 History</option>
                                <option value="restore">♻️ Restore (N)</option>
                              </>
                            ) : (
                              <>
                                <option value="reset_pwd">🔑 Reset Password</option>
                                <option value="resources">⚙️ Resources</option>
                                <option value="history">📜 History</option>
                                {isActive ? (
                                  <option value="disable" disabled={isSelf}>
                                    {isSelf ? '🚫 Disable (Self)' : '🚫 Disable'}
                                  </option>
                                ) : (
                                  <option value="enable">
                                    ✅ Enable
                                  </option>
                                )}
                                <option value="delete" disabled={isSelf}>
                                  {isSelf ? '🗑️ Delete (Self)' : '🗑️ Delete (Y)'}
                                </option>
                              </>
                            )}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Teaching Assignments & Leave (Page 3/4) */}
      {tab === 'teaching' && (
        <div>
          <div className="head" style={{ marginBottom: 16 }}>
            <div>
              <h2>🏖️ Teaching Assignments & Leave Cover</h2>
              <small className="muted">Manage class teacher allocations and staff leave coverage</small>
            </div>
            <div>
              {isAdmin && (
                <button className="btn pr" onClick={openAssignModal}>
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
                  {isAdmin && <th>Action</th>}
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
                    {isAdmin && (
                      <td data-l="Action">
                        <button
                          type="button"
                          className="btn sm"
                          style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                          title="Unassign teacher from this class and subject (does not delete user account)"
                          onClick={async () => {
                            if (!window.confirm(`Unassign ${ta.teacherName || 'teacher'} from ${ta.subject} (${ta.cls})? This removes the schedule assignment without deleting any accounts.`)) return;
                            try {
                              await api(`/admin-actions/teaching-assignments/${ta.id}`, { method: 'DELETE' });
                              setToast('Teaching assignment unassigned.');
                              loadTeaching();
                            } catch (x) {
                              setToast(x.message);
                            }
                          }}
                        >
                          Unassign
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '20px 0 10px', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h3 style={{ fontSize: 16, margin: 0 }}>🏖️ Teacher Leave Requests & Cover Approval</h3>
              <small className="muted">Review submitted teacher leave applications, assign covering teachers, and approve or reject requests</small>
            </div>
            <div style={{ display: 'inline-flex', gap: 6, background: 'var(--hv)', padding: '3px 4px', borderRadius: 6, fontSize: '0.82rem' }}>
              {['all', 'Pending', 'Approved', 'Rejected'].map(filter => (
                <button
                  key={filter}
                  type="button"
                  className={`btn sm ${leaveFilter === filter ? 'pr' : ''}`}
                  style={{ padding: '3px 10px', fontSize: '0.78rem' }}
                  onClick={() => setLeaveFilter(filter)}
                >
                  {filter === 'all' ? `All (${leaveCounts.all})` : `${filter} (${leaveCounts[filter] || 0})`}
                </button>
              ))}
            </div>
          </div>

          <div className="tw">
            <table className="rt">
              <thead>
                <tr>
                  <th>Teacher</th>
                  <th>Leave Type</th>
                  <th>Dates & Duration</th>
                  <th>Reason & Handover</th>
                  <th>Status</th>
                  <th>Cover Teacher</th>
                  <th>Review Details</th>
                  {(isAdmin || isTeacher) && <th>Action</th>}
                </tr>
              </thead>
              <tbody>
                {filteredLeaveRequests.length === 0 ? (
                  <tr>
                    <td colSpan={isAdmin || isTeacher ? 8 : 7} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--mu)' }}>
                      No {leaveFilter === 'all' ? '' : leaveFilter.toLowerCase()} leave requests found.
                    </td>
                  </tr>
                ) : (
                  filteredLeaveRequests.map(lr => {
                    const days = getDaysBetween(lr.start_date, lr.end_date);
                    return (
                      <tr key={lr.id}>
                        <td data-l="Teacher">
                          <strong>{lr.teacherName || lr.teacher_id}</strong>
                          <small className="muted" style={{ display: 'block' }}>
                            {lr.teacherSubject ? `${lr.teacherSubject} · ` : ''}{lr.teacher_id}
                          </small>
                        </td>
                        <td data-l="Leave Type">
                          <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>{lr.leave_type || 'Personal'}</span>
                        </td>
                        <td data-l="Dates & Duration">
                          <div style={{ whiteSpace: 'nowrap', fontSize: '0.85rem' }}>{lr.start_date} <span className="muted">→</span> {lr.end_date}</div>
                          <small className="muted" style={{ display: 'block' }}>{days} calendar day{days === 1 ? '' : 's'}</small>
                        </td>
                        <td data-l="Reason & Handover" style={{ maxWidth: 240 }}>
                          <div style={{ fontSize: '0.85rem' }}>{lr.reason}</div>
                          {lr.handover_notes && (
                            <small className="muted" style={{ display: 'block', marginTop: 3 }}>
                              <strong>Handover:</strong> {lr.handover_notes}
                            </small>
                          )}
                          {lr.emergency_contact && (
                            <small className="muted" style={{ display: 'block', marginTop: 2 }}>
                              <strong>Contact:</strong> {lr.emergency_contact}
                            </small>
                          )}
                        </td>
                        <td data-l="Status">
                          <span className={`bd ${lr.status === 'Approved' ? 'g' : lr.status === 'Pending' ? 'y' : 'r'}`} style={{ fontWeight: 600 }}>
                            {lr.status}
                          </span>
                        </td>
                        <td data-l="Cover Teacher">
                          {lr.coverTeacherName ? (
                            <span style={{ fontSize: '0.85rem' }}>
                              Cover by: <strong>{lr.coverTeacherName}</strong>
                            </span>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                        <td data-l="Review Details" style={{ maxWidth: 180, fontSize: '0.82rem' }}>
                          {lr.reviewed_by ? (
                            <div>
                              <div><span className="muted">By:</span> @{lr.reviewed_by}</div>
                              {lr.review_notes && <div className="muted" style={{ fontStyle: 'italic', marginTop: 2 }}>"{lr.review_notes}"</div>}
                            </div>
                          ) : (
                            <span className="muted">Awaiting review</span>
                          )}
                        </td>
                        {(isAdmin || isTeacher) && (
                          <td data-l="Action">
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {isAdmin && lr.status === 'Pending' && (
                                <>
                                  <button
                                    type="button"
                                    className="btn sm pr"
                                    style={{ background: '#16a34a', borderColor: '#15803d' }}
                                    title="Approve leave request and assign cover teacher"
                                    onClick={() => openReviewModal(lr)}
                                  >
                                    Approve
                                  </button>
                                  <button
                                    type="button"
                                    className="btn sm dg"
                                    title="Reject leave request"
                                    onClick={() => openRejectModal(lr)}
                                  >
                                    Reject
                                  </button>
                                </>
                              )}
                              {isAdmin && lr.status === 'Approved' && (
                                <>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    title="Edit assigned cover teacher or remarks"
                                    onClick={() => openReviewModal(lr)}
                                  >
                                    Edit Cover
                                  </button>
                                  <button
                                    type="button"
                                    className="btn sm dg"
                                    title="Revoke / Reject this approved leave"
                                    onClick={() => openRejectModal(lr)}
                                  >
                                    Revoke
                                  </button>
                                </>
                              )}
                              {isAdmin && lr.status === 'Rejected' && (
                                <button
                                  type="button"
                                  className="btn sm"
                                  style={{ color: '#16a34a', borderColor: '#86efac' }}
                                  title="Reconsider and approve this leave request"
                                  onClick={() => openReviewModal(lr)}
                                >
                                  Reconsider
                                </button>
                              )}
                              {(isAdmin || (isTeacher && lr.status === 'Pending')) && (
                                <button
                                  type="button"
                                  className="btn sm"
                                  style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                                  title="Delete leave request"
                                  onClick={() => handleDeleteLeave(lr.id, lr.teacherName)}
                                >
                                  🗑️
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Announcements Tab */}
      {tab === 'announcements' && (
        <div>
          <div className="head" style={{ marginBottom: 16 }}>
            <div>
              <h2>📢 School & Class Announcements</h2>
              <small className="muted">Broadcast notices to students, parents, and teachers</small>
            </div>
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
          <h2>🎓 Year-End Class Promotion</h2>
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
            <div>
              <h2>📜 System Audit Log</h2>
              <small className="muted">Tracked security events, mark changes, and actions</small>
            </div>
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
            {accModalErr && (
              <div
                style={{
                  background: 'var(--dns, #fee2e2)',
                  border: '1px solid var(--dg, #ef4444)',
                  color: 'var(--dg, #b91c1c)',
                  padding: '10px 12px',
                  borderRadius: 6,
                  marginBottom: 14,
                  fontSize: '0.88rem'
                }}
                role="alert"
              >
                ⚠️ {accModalErr}
              </div>
            )}

            <div className="fld">
              <label htmlFor="acc_role">Role *</label>
              <select
                id="acc_role"
                value={newAccRole}
                onChange={e => {
                  const role = e.target.value;
                  setNewAccRole(role);
                  setNewAccLinkedId('');
                  setAccModalErr('');
                }}
              >
                <option value="student">Student</option>
                <option value="teacher">Teacher</option>
                <option value="parent">Parent</option>
                <option value="admin">Administrator</option>
              </select>
            </div>

            {/* Entity link selection */}
            {newAccRole !== 'admin' && (
              <div className="fld">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label htmlFor="acc_link_sel" style={{ margin: 0 }}>
                    Link to {newAccRole === 'student' ? 'Student' : newAccRole === 'teacher' ? 'Teacher' : 'Parent'}
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={customLinkedId}
                      onChange={e => {
                        setCustomLinkedId(e.target.checked);
                        setNewAccLinkedId('');
                      }}
                    />
                    <span>Custom / Manual ID</span>
                  </label>
                </div>

                {customLinkedId ? (
                  <input
                    id="acc_link_input"
                    value={newAccLinkedId}
                    onChange={e => setNewAccLinkedId(e.target.value)}
                    placeholder={`e.g. ${newAccRole === 'student' ? 'S1034' : newAccRole === 'teacher' ? 'T01' : 'P23'} (optional)`}
                  />
                ) : (
                  <select
                    id="acc_link_sel"
                    value={newAccLinkedId}
                    onChange={e => {
                      const id = e.target.value;
                      setNewAccLinkedId(id);
                      if (id) {
                        let match = null;
                        if (newAccRole === 'student') match = students.find(s => s.id === id);
                        else if (newAccRole === 'teacher') match = teachers.find(t => t.id === id);
                        else if (newAccRole === 'parent') match = parents.find(p => p.id === id);

                        if (match) {
                          if (!newAccName || newAccName.trim() === '') {
                            setNewAccName(match.name);
                          }
                          if (!newAccUsername || newAccUsername.trim() === '') {
                            const userPart = match.name.toLowerCase().replace(/^(mr\.|ms\.|mrs\.|dr\.)\s*/i, '').replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
                            setNewAccUsername(userPart);
                          }
                        }
                      }
                    }}
                  >
                    <option value="">— Unlinked / None —</option>
                    {newAccRole === 'student' && students.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id} - {s.cls})</option>
                    ))}
                    {newAccRole === 'teacher' && teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id} - {t.subject || 'Teacher'})</option>
                    ))}
                    {newAccRole === 'parent' && parents.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id})</option>
                    ))}
                  </select>
                )}
                <small className="muted" style={{ display: 'block', marginTop: 4, fontSize: '0.78rem' }}>
                  Select an existing member to link this login to their profile, or choose Unlinked.
                </small>
              </div>
            )}

            <div className="fld">
              <label htmlFor="acc_name">Full Name *</label>
              <input
                id="acc_name"
                value={newAccName}
                onChange={e => setNewAccName(e.target.value)}
                required
                placeholder="e.g. John Doe"
              />
            </div>

            <div className="fld">
              <label htmlFor="acc_u">Username *</label>
              <input
                id="acc_u"
                value={newAccUsername}
                onChange={e => setNewAccUsername(e.target.value)}
                required
                placeholder="e.g. jdoe"
                autoComplete="off"
              />
            </div>

            <div className="fld">
              <label htmlFor="acc_p">Password *</label>
              <div className="pwd-wrap">
                <input
                  id="acc_p"
                  type={showNewAccPwd ? 'text' : 'password'}
                  value={newAccPassword}
                  onChange={e => setNewAccPassword(e.target.value)}
                  required
                  placeholder="Password"
                />
                <button
                  type="button"
                  className="pwd-toggle"
                  title={showNewAccPwd ? 'Hide password' : 'Show password'}
                  onClick={() => setShowNewAccPwd(!showNewAccPwd)}
                >
                  {showNewAccPwd ? '👁️' : '🙈'}
                </button>
              </div>
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setAccountModal(false)}>
                Cancel
              </button>
              <button className="btn pr" disabled={accModalBusy}>
                {accModalBusy ? 'Creating account…' : 'Create account'}
              </button>
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

      {/* Modal: Review & Approve Leave */}
      {reviewLeaveModal && (
        <Modal
          title={`Review Leave Request: ${reviewLeaveModal.teacherName || reviewLeaveModal.teacher_id}`}
          onClose={() => setReviewLeaveModal(null)}
        >
          <div style={{ background: 'var(--hv)', padding: '12px 14px', borderRadius: 8, marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div>
                <strong>{reviewLeaveModal.teacherName || reviewLeaveModal.teacher_id}</strong>
                <span className="muted" style={{ marginLeft: 6, fontSize: '0.85rem' }}>
                  ({reviewLeaveModal.teacherSubject || 'Teacher'} · {reviewLeaveModal.teacher_id})
                </span>
              </div>
              <span className={`bd ${reviewLeaveModal.status === 'Approved' ? 'g' : reviewLeaveModal.status === 'Pending' ? 'y' : 'r'}`} style={{ fontWeight: 600 }}>
                {reviewLeaveModal.status}
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.85rem' }}>
              <div><span className="muted">Type:</span> <strong>{reviewLeaveModal.leave_type || 'Personal'}</strong></div>
              <div><span className="muted">Duration:</span> <strong>{getDaysBetween(reviewLeaveModal.start_date, reviewLeaveModal.end_date)} day(s)</strong></div>
              <div><span className="muted">Start Date:</span> {reviewLeaveModal.start_date}</div>
              <div><span className="muted">End Date:</span> {reviewLeaveModal.end_date}</div>
            </div>
            <div style={{ marginTop: 8, fontSize: '0.85rem' }}>
              <span className="muted">Reason:</span> <em>"{reviewLeaveModal.reason}"</em>
            </div>
            {reviewLeaveModal.handover_notes && (
              <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
                <span className="muted">Handover plan:</span> {reviewLeaveModal.handover_notes}
              </div>
            )}
            {reviewLeaveModal.emergency_contact && (
              <div style={{ marginTop: 6, fontSize: '0.85rem' }}>
                <span className="muted">Emergency contact:</span> {reviewLeaveModal.emergency_contact}
              </div>
            )}
          </div>

          <form onSubmit={e => {
            e.preventDefault();
            handleReviewLeave(reviewLeaveModal, 'Approved', reviewCoverId || null, reviewNotes);
          }}>
            <div className="fld">
              <label htmlFor="rl_cover">Assign Cover Teacher (Optional)</label>
              <select
                id="rl_cover"
                value={reviewCoverId}
                onChange={e => setReviewCoverId(e.target.value)}
              >
                <option value="">-- No cover teacher (leave unassigned) --</option>
                {teachers
                  .filter(t => t.id !== reviewLeaveModal.teacher_id)
                  .map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.subject || 'All Subjects'} · {t.id})
                    </option>
                  ))}
              </select>
              <small className="muted" style={{ display: 'block', marginTop: 4 }}>
                If selected, teaching assignments for this teacher will indicate coverage by this teacher.
              </small>
            </div>

            <div className="fld">
              <label htmlFor="rl_notes">Administrator Review Notes / Remarks</label>
              <textarea
                id="rl_notes"
                value={reviewNotes}
                onChange={e => setReviewNotes(e.target.value)}
                placeholder="e.g. Approved. Cover arrangements confirmed with department."
                rows={2}
              />
            </div>

            <div className="acts" style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <button
                type="button"
                className="btn dg"
                disabled={reviewBusy}
                onClick={() => {
                  openRejectModal(reviewLeaveModal);
                  setReviewLeaveModal(null);
                }}
              >
                ❌ Reject Request
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  type="button"
                  className="btn"
                  disabled={reviewBusy}
                  onClick={() => setReviewLeaveModal(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn pr"
                  style={{ background: '#16a34a', borderColor: '#15803d' }}
                  disabled={reviewBusy}
                >
                  {reviewBusy ? 'Processing...' : '✅ Approve Leave'}
                </button>
              </div>
            </div>
          </form>
        </Modal>
      )}

      {/* Modal: Reject Leave Request */}
      {rejectConfirmModal && (
        <Modal
          title={`Reject Leave Request: ${rejectConfirmModal.teacherName || rejectConfirmModal.teacher_id}`}
          onClose={() => setRejectConfirmModal(null)}
        >
          <p style={{ marginTop: 0 }}>
            Are you sure you want to reject the leave request for <strong>{rejectConfirmModal.teacherName || rejectConfirmModal.teacher_id}</strong> ({rejectConfirmModal.start_date} to {rejectConfirmModal.end_date})?
          </p>
          <div className="fld" style={{ marginTop: 12 }}>
            <label htmlFor="rej_notes">Reason for Rejection / Remarks for Teacher *</label>
            <textarea
              id="rej_notes"
              value={rejectReasonInput}
              onChange={e => setRejectReasonInput(e.target.value)}
              placeholder="e.g. Conflicts with critical examination schedule; please reschedule."
              rows={3}
              required
            />
          </div>
          <div className="acts" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              disabled={reviewBusy}
              onClick={() => setRejectConfirmModal(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn dg"
              disabled={reviewBusy || !rejectReasonInput.trim()}
              onClick={() => {
                handleReviewLeave(rejectConfirmModal, 'Rejected', null, rejectReasonInput.trim());
              }}
            >
              {reviewBusy ? 'Rejecting...' : 'Confirm Rejection'}
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
              <select id="at_cls" name="cls" required defaultValue={classes[0] || '7A'}>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="at_sub">Subject *</label>
              <select id="at_sub" name="subject" required defaultValue="Mathematics">
                {['Mathematics', 'English', 'Science', 'History', 'Geography', 'ICT'].map(s => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="at_t">Teacher *</label>
              <select id="at_t" name="teacherId" required defaultValue={teachers[0]?.id || ''}>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.subject || 'All Subjects'} · {t.id})
                  </option>
                ))}
              </select>
              {teachers.length === 0 && (
                <small style={{ color: '#dc2626', display: 'block', marginTop: 4 }}>
                  No active teachers found. Please verify teacher accounts in Accounts Management.
                </small>
              )}
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setAssignModal(false)}>Cancel</button>
              <button className="btn pr" disabled={teachers.length === 0}>Assign</button>
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

      {/* Modal: Confirm Disable Account */}
      {statusModalUser && (
        <Modal
          title={`🚫 Disable User Account — @${statusModalUser.username}`}
          onClose={() => setStatusModalUser(null)}
        >
          <div style={{ padding: '4px 0' }}>
            <p style={{ margin: '0 0 12px 0' }}>
              Are you sure you want to disable account for <strong>{statusModalUser.name}</strong> (<code>@{statusModalUser.username}</code>)?
            </p>
            <div style={{ background: 'var(--hv)', borderLeft: '4px solid #ef4444', padding: '10px 14px', borderRadius: 6, marginBottom: 16 }}>
              <p style={{ margin: 0, fontSize: '0.88rem' }}>
                <strong>Access Safeguard:</strong> This user will immediately be blocked from logging in (<code>403 Account Disabled</code>). Their historical records, grades, and profile data remain completely intact.
              </p>
            </div>
            <div className="ff" style={{ marginBottom: 16 }}>
              <label>Reason for disabling account (optional audit record):</label>
              <input
                type="text"
                value={statusReasonInput}
                onChange={e => setStatusReasonInput(e.target.value)}
                placeholder="e.g. Inactive staff member, temporary leave, suspended"
              />
            </div>
            <div className="acts">
              <button type="button" className="btn" onClick={() => setStatusModalUser(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#dc2626', color: '#fff', borderColor: '#b91c1c' }}
                disabled={busy}
                onClick={() => handleToggleUserStatus(statusModalUser, false, statusReasonInput)}
              >
                {busy ? 'Disabling…' : 'Confirm Disable Account'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Manage & Detach User Resources */}
      {resourceModalUser && (
        <Modal
          title={`⚙️ Manage Resources — ${resourceModalUser.name} (@${resourceModalUser.username})`}
          onClose={() => setResourceModalUser(null)}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {resourceErr && (
              <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, fontSize: '0.88rem' }}>
                ⚠️ {resourceErr}
              </div>
            )}

            {/* Current Primary Entity Link */}
            <div className="card" style={{ padding: 14, background: 'var(--hv)' }}>
              <h4 style={{ margin: '0 0 8px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.92rem' }}>
                <span>Primary Entity Link</span>
                <Badge v={resourceModalUser.teacher_id || resourceModalUser.student_id || resourceModalUser.parent_id ? 'Active' : 'Scheduled'} />
              </h4>
              {resourceModalUser.teacher_id || resourceModalUser.student_id || resourceModalUser.parent_id ? (
                <div>
                  <p style={{ margin: '0 0 10px 0', fontSize: '0.88rem' }}>
                    Linked to <strong>{resourceModalUser.role.toUpperCase()}</strong> record:
                    <code style={{ marginLeft: 6, padding: '2px 6px', background: 'var(--sf)', borderRadius: 4 }}>
                      {resourceModalUser.teacher_id || resourceModalUser.student_id || resourceModalUser.parent_id}
                    </code>
                  </p>
                  <button
                    type="button"
                    className="btn sm"
                    style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                    disabled={resourceBusy}
                    onClick={handleDetachPrimaryResource}
                  >
                    🗑️ Detach Primary Resource Link
                  </button>
                  <small className="muted" style={{ display: 'block', marginTop: 6, fontSize: '0.78rem' }}>
                    Detaching sets the entity ID to NULL. The user login remains intact as an unlinked user account, and the target profile remains in the database.
                  </small>
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--mu)' }}>
                  No primary resource is currently linked to this user account.
                </p>
              )}
            </div>

            {/* Modify or Reassign Resource Form */}
            <form onSubmit={handleSaveResourceChanges} className="card" style={{ padding: 14 }}>
              <h4 style={{ margin: '0 0 12px 0', fontSize: '0.92rem' }}>Modify Role & Link Profile</h4>
              <div className="fld">
                <label>Full Display Name</label>
                <input
                  type="text"
                  value={resourceName}
                  onChange={e => setResourceName(e.target.value)}
                  required
                />
              </div>
              <div className="fld">
                <label>User Role</label>
                <select
                  value={resourceRole}
                  onChange={e => {
                    setResourceRole(e.target.value);
                    setResourceLinkedId('');
                  }}
                >
                  <option value="admin">Administrator</option>
                  <option value="teacher">Teacher</option>
                  <option value="student">Student</option>
                  <option value="parent">Parent</option>
                </select>
              </div>

              {resourceRole !== 'admin' && (
                <div className="fld">
                  <label>
                    Link to {resourceRole === 'teacher' ? 'Teacher' : resourceRole === 'student' ? 'Student' : 'Parent'} Profile:
                  </label>
                  <select
                    value={resourceLinkedId}
                    onChange={e => setResourceLinkedId(e.target.value)}
                  >
                    <option value="">— Select {resourceRole} profile (or leave unlinked) —</option>
                    {resourceRole === 'teacher' && teachers.map(t => (
                      <option key={t.id} value={t.id}>{t.name} ({t.id}{t.subject ? ` - ${t.subject}` : ''})</option>
                    ))}
                    {resourceRole === 'student' && students.map(s => (
                      <option key={s.id} value={s.id}>{s.name} ({s.id}{s.cls ? ` · ${s.cls}` : ''})</option>
                    ))}
                    {resourceRole === 'parent' && parents.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.id}{p.phone ? ` · ${p.phone}` : ''})</option>
                    ))}
                  </select>
                  <small className="muted" style={{ fontSize: '0.78rem', marginTop: 4, display: 'block' }}>
                    Leave blank to detach without deleting the user login.
                  </small>
                </div>
              )}

              <div className="acts" style={{ marginTop: 14 }}>
                <button
                  type="button"
                  className="btn"
                  onClick={() => setResourceModalUser(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn pr"
                  disabled={resourceBusy}
                >
                  {resourceBusy ? 'Saving…' : 'Save Resource Updates'}
                </button>
              </div>
            </form>

            {/* If Parent: Linked Children Sub-Resources */}
            {(resourceModalUser.role === 'parent' || resourceModalUser.parent_id) && (
              <div className="card" style={{ padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: '0.92rem' }}>Linked Children ({resourceChildren.length})</h4>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => {
                      setResourceModalUser(null);
                      setLinkParentModal(true);
                    }}
                  >
                    ➕ Link Child
                  </button>
                </div>
                {resourceChildren.length === 0 ? (
                  <p className="muted" style={{ margin: 0, fontSize: '0.85rem' }}>No children are currently linked to this parent profile.</p>
                ) : (
                  <div className="tw">
                    <table className="rt" style={{ fontSize: '0.88rem' }}>
                      <thead>
                        <tr>
                          <th>Student</th>
                          <th>Class</th>
                          <th>Relationship</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resourceChildren.map(child => (
                          <tr key={child.student_id}>
                            <td data-l="Student"><strong>{child.student_name || child.student_id}</strong> ({child.student_id})</td>
                            <td data-l="Class">{child.cls || '—'}</td>
                            <td data-l="Relationship">{child.relationship || 'Guardian'} {child.is_primary ? '(Primary)' : ''}</td>
                            <td data-l="Action">
                              <button
                                type="button"
                                className="btn sm"
                                style={{ color: '#dc2626', borderColor: '#fca5a5' }}
                                disabled={resourceBusy}
                                onClick={() => handleDetachChild(resourceModalUser.parent_id || resourceLinkedId, child.student_id, child.student_name)}
                              >
                                Detach Child
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Modal: Confirm Permanent User Deletion & History Archive */}
      {deleteModalUser && (
        <Modal
          title={`🗑️ Delete User Account — @${deleteModalUser.username}`}
          onClose={() => setDeleteModalUser(null)}
        >
          <div style={{ padding: '4px 0' }}>
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderLeft: '4px solid #dc2626', color: '#991b1b', padding: '12px 14px', borderRadius: 8, marginBottom: 14 }}>
              <p style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>
                ⚠️ User Account Deletion (del_flg: Y)
              </p>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem', lineHeight: 1.5 }}>
                You are about to mark user account <strong>{deleteModalUser.name}</strong> (<code>@{deleteModalUser.username}</code>) as deleted (<strong>del_flg: Y</strong>).
              </p>
            </div>

            {/* User History & Activity Snapshot Preview */}
            <div style={{ background: 'var(--hv)', border: '1px solid var(--bd)', borderRadius: 8, padding: 12, marginBottom: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h4 style={{ margin: 0, fontSize: '0.88rem' }}>📜 User History & Profile Snapshot</h4>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => openUserHistoryModal(deleteModalUser)}
                >
                  👁️ View Full History Trail
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', fontSize: '0.82rem' }}>
                <div><span className="muted">Role:</span> <strong>{deleteModalUser.role}</strong></div>
                <div><span className="muted">Current del_flg:</span> <strong>del_flg ({deleteModalUser.del_flg || 'N'})</strong></div>
                <div><span className="muted">Created:</span> {new Date(deleteModalUser.created_at).toLocaleDateString()}</div>
                <div><span className="muted">Linked ID:</span> {deleteModalUser.teacher_id || deleteModalUser.student_id || deleteModalUser.parent_id || 'None'}</div>
              </div>
            </div>

            <div className="ff" style={{ marginBottom: 14 }}>
              <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 4 }}>
                Reason for deletion (saved with del_flg: Y audit):
              </label>
              <input
                type="text"
                className="fld"
                value={deleteReasonInput}
                onChange={e => setDeleteReasonInput(e.target.value)}
                placeholder="e.g. Employee departed, graduated, duplicate account"
              />
            </div>

            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderLeft: '4px solid #10b981', color: '#065f46', borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: '0.84rem' }}>
                🛡️ del_flg (Y) Status & Complete History Preserved
              </p>
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', lineHeight: 1.4 }}>
                Upon confirmation, this account's <strong>del_flg</strong> will be set to <strong>Y</strong> and login access prohibited immediately. All academic records (grades, enrollments, attendance) and audit logs remain safe and can be restored at any time.
              </p>
            </div>

            <div className="acts">
              <button
                type="button"
                className="btn"
                onClick={() => setDeleteModalUser(null)}
                disabled={deleteBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: '#dc2626', color: '#fff', borderColor: '#b91c1c' }}
                disabled={deleteBusy}
                onClick={handleDeleteUser}
              >
                {deleteBusy ? 'Updating del_flg: Y…' : '🗑️ Confirm Delete (del_flg: Y)'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Deleted User Accounts History */}
      {deletedUsersModal && (
        <Modal
          title={`📜 Deleted User Accounts History (${deletedUsers.length})`}
          onClose={() => setDeletedUsersModal(false)}
        >
          <div style={{ padding: '4px 0' }}>
            <p className="muted" style={{ margin: '0 0 14px 0', fontSize: '0.88rem' }}>
              Historical archive of user accounts that have been deleted from the system. Audit trails and activity snapshots are preserved.
            </p>

            {(!Array.isArray(deletedUsers) || deletedUsers.length === 0) ? (
              <div style={{ padding: '30px 10px', textAlign: 'center' }}>
                <p className="muted" style={{ margin: 0 }}>No deleted user accounts in history.</p>
              </div>
            ) : (
              <div className="tw">
                <table className="rt" style={{ fontSize: '0.85rem' }}>
                  <thead>
                    <tr>
                      <th>Deleted User</th>
                      <th>Role</th>
                      <th>Linked ID</th>
                      <th>Deleted At</th>
                      <th>Deleted By</th>
                      <th>Reason</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deletedUsers.map(du => (
                      <tr key={du.id}>
                        <td data-l="User">
                          <strong>{du.name || du.username}</strong>
                          <div style={{ fontSize: '0.74rem', color: 'var(--mu)' }}>@{du.username}</div>
                        </td>
                        <td data-l="Role"><Badge v="Scheduled" /> {du.role}</td>
                        <td data-l="Linked ID">{du.teacher_id || du.student_id || du.parent_id || '—'}</td>
                        <td data-l="Deleted At">{new Date(du.deleted_at).toLocaleString()}</td>
                        <td data-l="Deleted By"><strong>@{du.deleted_by}</strong></td>
                        <td data-l="Reason" style={{ maxWidth: 140, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={du.deletion_reason}>
                          {du.deletion_reason || 'Administrative'}
                        </td>
                        <td data-l="Action">
                          <button
                            type="button"
                            className="btn sm"
                            onClick={() => openUserHistoryModal(du)}
                          >
                            👁️ View History
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="acts" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn pr"
                onClick={() => setDeletedUsersModal(false)}
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal: Complete User History & Audit Trail */}
      {userHistoryModalData && (
        <Modal
          title={`📜 History & Audit Trail — @${userHistoryModalData.user.username}`}
          onClose={() => setUserHistoryModalData(null)}
        >
          <div style={{ padding: '4px 0' }}>
            <div style={{
              background: userHistoryModalData.isDeleted ? '#fef2f2' : 'var(--hv)',
              border: `1px solid ${userHistoryModalData.isDeleted ? '#fca5a5' : 'var(--bd)'}`,
              borderRadius: 8,
              padding: 12,
              marginBottom: 14
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div>
                  <strong style={{ fontSize: '1rem' }}>{userHistoryModalData.user.name || userHistoryModalData.user.username}</strong>
                  <span style={{ marginLeft: 8, color: 'var(--mu)', fontSize: '0.88rem' }}>@{userHistoryModalData.user.username}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Badge v={userHistoryModalData.user.role === 'admin' ? 'Active' : 'Scheduled'} /> {userHistoryModalData.user.role}
                  {userHistoryModalData.isDeleted && (
                    <span className="bd r" style={{ fontSize: '0.75rem', fontWeight: 700 }}>DELETED</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '6px 14px', fontSize: '0.82rem' }}>
                <div><span className="muted">Account Created:</span> {userHistoryModalData.user.account_created_at || userHistoryModalData.user.created_at ? new Date(userHistoryModalData.user.account_created_at || userHistoryModalData.user.created_at).toLocaleDateString() : '—'}</div>
                <div><span className="muted">Linked ID:</span> {userHistoryModalData.user.teacher_id || userHistoryModalData.user.student_id || userHistoryModalData.user.parent_id || '—'}</div>
                {userHistoryModalData.isDeleted && (
                  <>
                    <div><span className="muted">Deleted On:</span> {new Date(userHistoryModalData.user.deleted_at).toLocaleString()}</div>
                    <div><span className="muted">Deleted By:</span> @{userHistoryModalData.user.deleted_by}</div>
                    <div style={{ gridColumn: '1 / -1' }}><span className="muted">Deletion Reason:</span> {userHistoryModalData.user.deletion_reason}</div>
                  </>
                )}
              </div>
            </div>

            <h4 style={{ margin: '0 0 10px', fontSize: '0.9rem' }}>Activity & Audit History ({userHistoryModalData.history?.length || 0} events)</h4>

            {userHistoryModalData.loading ? (
              <p className="muted" style={{ padding: '20px 0', textAlign: 'center' }}>Loading activity history…</p>
            ) : (!userHistoryModalData.history || userHistoryModalData.history.length === 0) ? (
              <p className="muted" style={{ padding: '20px 0', textAlign: 'center', background: 'var(--hv)', borderRadius: 6 }}>
                No audit events recorded for this user yet.
              </p>
            ) : (
              <div className="tw" style={{ maxHeight: 320, overflowY: 'auto' }}>
                <table className="rt" style={{ fontSize: '0.82rem' }}>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Action</th>
                      <th>Actor</th>
                      <th>Target</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {userHistoryModalData.history.map((h, idx) => (
                      <tr key={h.id || idx}>
                        <td data-l="Time" style={{ whiteSpace: 'nowrap' }}>{new Date(h.created_at).toLocaleString()}</td>
                        <td data-l="Action"><strong>{h.action}</strong></td>
                        <td data-l="Actor">@{h.actor_username || 'system'}</td>
                        <td data-l="Target">{h.target_entity} {h.target_id ? `(${h.target_id})` : ''}</td>
                        <td data-l="Details" style={{ maxWidth: 220, fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof h.details === 'object' ? JSON.stringify(h.details) : String(h.details || '—')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="acts" style={{ marginTop: 16 }}>
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(userHistoryModalData, null, 2));
                  const a = document.createElement('a');
                  a.href = dataStr;
                  a.download = `user-history-${userHistoryModalData.user.username}.json`;
                  a.click();
                }}
              >
                📥 Download History JSON
              </button>
              <button
                type="button"
                className="btn pr"
                onClick={() => setUserHistoryModalData(null)}
              >
                Done
              </button>
            </div>
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
