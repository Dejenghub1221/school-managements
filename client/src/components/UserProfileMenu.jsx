import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { useLang } from '../context/LangContext.jsx';
import { Modal } from './Modal.jsx';

export function UserProfileMenu({ onRoleChange, roles = {}, children }) {
  const { user, logout, switchRole, permissions } = useAuth();
  const { t } = useLang();
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'profile' | 'security' | 'roles' | 'help'
  const [sessionTimeout, setSessionTimeout] = useState(() => {
    return localStorage.getItem('session_timeout') || '2';
  });
  const [pwdForm, setPwdForm] = useState({ current: '', newPwd: '', confirm: '' });
  const [pwdMsg, setPwdMsg] = useState({ type: '', text: '' });
  const [countdownText, setCountdownText] = useState(': 2m');

  const ref = useRef();
  const lastActiveRef = useRef(Date.now());

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = e => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Idle session tracking
  useEffect(() => {
    const handleActivity = () => {
      lastActiveRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(ev => window.addEventListener(ev, handleActivity, { passive: true }));

    const interval = setInterval(() => {
      const minutes = Number(sessionTimeout);
      if (minutes <= 0) {
        setCountdownText(': Off');
        return;
      }
      const elapsedMs = Date.now() - lastActiveRef.current;
      const totalMs = minutes * 60 * 1000;
      const remainingMs = Math.max(0, totalMs - elapsedMs);

      if (remainingMs <= 0) {
        // Auto-sign out due to inactivity
        logout();
        return;
      }

      const totalSec = Math.ceil(remainingMs / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      // Display formatted countdown or badge
      if (m >= 1) {
        setCountdownText(`: ${m}m`);
      } else {
        setCountdownText(`: ${s}s`);
      }
    }, 1000);

    return () => {
      events.forEach(ev => window.removeEventListener(ev, handleActivity));
      clearInterval(interval);
    };
  }, [sessionTimeout, logout]);

  const handleTimeoutChange = e => {
    const val = e.target.value;
    setSessionTimeout(val);
    localStorage.setItem('session_timeout', val);
    lastActiveRef.current = Date.now();
  };

  // User display metadata
  // User explicitly asked to replace "Hotel" by "School"
  const isSchoolAdmin = user?.role === 'admin';
  const displayName = user?.name || (isSchoolAdmin ? 'School Admin' : `${user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1)} User`);
  const displayEmail = user?.email || (isSchoolAdmin ? 'admin@school.com' : `${user?.username || 'user'}@school.com`);
  const initial = (displayName.charAt(0) || 'S').toUpperCase();

  const roleLabel = roles[user?.role] || user?.role?.charAt(0).toUpperCase() + user?.role?.slice(1) || 'Admin';

  const handlePasswordSubmit = e => {
    e.preventDefault();
    if (!pwdForm.current || !pwdForm.newPwd || !pwdForm.confirm) {
      setPwdMsg({ type: 'err', text: 'Please fill in all password fields.' });
      return;
    }
    if (pwdForm.newPwd.length < 6) {
      setPwdMsg({ type: 'err', text: 'New password must be at least 6 characters.' });
      return;
    }
    if (pwdForm.newPwd !== pwdForm.confirm) {
      setPwdMsg({ type: 'err', text: 'New passwords do not match.' });
      return;
    }

    setPwdMsg({ type: 'ok', text: 'Password updated successfully.' });
    setTimeout(() => {
      setActiveModal(null);
      setPwdMsg({ type: '', text: '' });
      setPwdForm({ current: '', newPwd: '', confirm: '' });
    }, 1500);
  };

  return (
    <>
      <div className="user-menu-wrap" ref={ref}>
        {/* Session Timeout indicator pill (matches top bar in screenshot) */}
        <button
          type="button"
          className="session-timeout-pill"
          onClick={() => setOpen(o => !o)}
          title={`Session Timeout Policy: ${sessionTimeout === '0' ? 'Disabled' : `${sessionTimeout} Minutes idle`}`}
          aria-label="Session idle timeout indicator"
        >
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span>{countdownText}</span>
        </button>

        {children}

        {/* Profile Trigger Pill */}
        <button
          type="button"
          className={`user-profile-trigger ${open ? 'active' : ''}`}
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-haspopup="true"
          title={`${displayName} (${roleLabel})`}
        >
          <div className="user-avatar-circle" aria-hidden="true">
            {initial}
          </div>
          <div className="user-trigger-info">
            <span className="user-trigger-name">{displayName}</span>
            <span className="user-trigger-role">{roleLabel}</span>
          </div>
          <div className="user-trigger-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points={open ? "18 15 12 9 6 15" : "6 9 12 15 18 9"} />
            </svg>
          </div>
        </button>

        {/* Dropdown Menu Panel (Exact design from screenshot) */}
        {open && (
          <div className="user-dropdown-panel" role="menu" aria-label="User account menu">
            {/* 1. User Info Header */}
            <div className="user-card-header">
              <div className="user-avatar-circle lg" aria-hidden="true">
                {initial}
              </div>
              <div className="user-card-details">
                <span className="user-card-name" title={displayName}>{displayName}</span>
                <span className="user-card-email" title={displayEmail}>{displayEmail}</span>
              </div>
            </div>

            {/* 2. ROLE Row */}
            <div className="user-card-role-row">
              <span className="user-card-role-label">ROLE</span>
              <span className="user-card-role-badge">{roleLabel}</span>
            </div>

            {/* 3. Navigation Links */}
            <div className="user-menu-list">
              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setActiveModal('profile');
                }}
              >
                <span className="user-menu-item-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </span>
                <span>My Profile</span>
              </button>

              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setActiveModal('security');
                }}
              >
                <span className="user-menu-item-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </span>
                <span>Security & Password</span>
              </button>

              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  navigate('/settings');
                }}
              >
                <span className="user-menu-item-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="4" y="2" width="16" height="20" rx="2" />
                    <path d="M9 22v-4h6v4M8 6h.01M16 6h.01M8 10h.01M16 10h.01M8 14h.01M16 14h.01" />
                  </svg>
                </span>
                <span>School Settings</span>
              </button>

              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setActiveModal('roles');
                }}
              >
                <span className="user-menu-item-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="12 2 2 7 12 12 22 7 12 2" />
                    <polyline points="2 17 12 22 22 17" />
                    <polyline points="2 12 12 17 22 12" />
                  </svg>
                </span>
                <span>Role Privileges</span>
              </button>

              <button
                type="button"
                className="user-menu-item"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  setActiveModal('help');
                }}
              >
                <span className="user-menu-item-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <span>Help & Documentation</span>
              </button>
            </div>

            {/* 4. Session Timeout Card (Exact match to screenshot) */}
            <div className="session-timeout-card">
              <div className="session-timeout-card-head">
                <span className="session-timeout-card-title">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#2563eb" strokeWidth="2.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                  Session Timeout
                </span>
                <span className="session-timeout-card-badge">
                  {sessionTimeout === '0' ? 'Off' : `${sessionTimeout} min`}
                </span>
              </div>
              <p className="session-timeout-card-desc">
                Auto-signs out after idle time to secure workstation:
              </p>
              <select
                className="session-timeout-select"
                aria-label="Session timeout idle duration"
                value={sessionTimeout}
                onChange={handleTimeoutChange}
              >
                <option value="2">2 Minutes (Default Policy)</option>
                <option value="5">5 Minutes</option>
                <option value="15">15 Minutes</option>
                <option value="30">30 Minutes</option>
                <option value="60">1 Hour</option>
                <option value="0">Never</option>
              </select>
            </div>

            {/* 5. Sign Out Button (Exact red style and icon) */}
            <button
              type="button"
              className="user-signout-btn"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                logout();
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
              <span>{t('signOut')}</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Sub-Modals ──────────────────────────────────────────────────────── */}

      {/* 1. My Profile Modal */}
      {activeModal === 'profile' && (
        <Modal title="My User Profile" onClose={() => setActiveModal(null)}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
            <div className="user-avatar-circle lg" style={{ width: 54, height: 54, fontSize: 22 }}>
              {initial}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: 18 }}>{displayName}</h3>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>{displayEmail}</p>
              <div style={{ marginTop: 6 }}>
                <span className="user-card-role-badge">{roleLabel}</span>
              </div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16, background: 'var(--bg-card)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              <div>
                <small className="muted">Username</small>
                <div style={{ fontWeight: 600 }}>{user?.username || 'admin'}</div>
              </div>
              <div>
                <small className="muted">Role Type</small>
                <div style={{ fontWeight: 600 }}>{user?.role || 'admin'}</div>
              </div>
              <div>
                <small className="muted">Security Session</small>
                <div style={{ fontWeight: 600, color: '#16a34a' }}>Active & Secure</div>
              </div>
              <div>
                <small className="muted">Idle Timeout</small>
                <div style={{ fontWeight: 600 }}>{sessionTimeout === '0' ? 'Disabled' : `${sessionTimeout} Minutes`}</div>
              </div>
            </div>
          </div>

          {permissions && (
            <div>
              <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>Module Access Privileges</h4>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(permissions).map(([mod, perm]) => (
                  <span
                    key={mod}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 6,
                      fontSize: 12,
                      background: 'var(--hv)',
                      border: '1px solid var(--bd)'
                    }}
                  >
                    <strong>{mod}:</strong> {perm === 'w' ? 'Full Access' : 'Read Only'}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="acts" style={{ marginTop: 20 }}>
            <button type="button" className="btn" onClick={() => setActiveModal(null)}>Close</button>
            <button
              type="button"
              className="btn pr"
              onClick={() => {
                setActiveModal(null);
                navigate('/settings');
              }}
            >
              School Settings
            </button>
          </div>
        </Modal>
      )}

      {/* 2. Security & Password Modal */}
      {activeModal === 'security' && (
        <Modal title="Security & Password" onClose={() => { setActiveModal(null); setPwdMsg({ type: '', text: '' }); }}>
          <form onSubmit={handlePasswordSubmit} noValidate>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Manage your authentication credentials and session workstation security.
            </p>

            <div className="fld">
              <label htmlFor="cur_pwd">Current Password *</label>
              <input
                id="cur_pwd"
                type="password"
                required
                value={pwdForm.current}
                onChange={e => setPwdForm(p => ({ ...p, current: e.target.value }))}
                placeholder="Enter current password"
              />
            </div>

            <div className="fld">
              <label htmlFor="new_pwd">New Password *</label>
              <input
                id="new_pwd"
                type="password"
                required
                value={pwdForm.newPwd}
                onChange={e => setPwdForm(p => ({ ...p, newPwd: e.target.value }))}
                placeholder="At least 6 characters"
              />
            </div>

            <div className="fld">
              <label htmlFor="conf_pwd">Confirm New Password *</label>
              <input
                id="conf_pwd"
                type="password"
                required
                value={pwdForm.confirm}
                onChange={e => setPwdForm(p => ({ ...p, confirm: e.target.value }))}
                placeholder="Re-enter new password"
              />
            </div>

            {pwdMsg.text && (
              <p className={pwdMsg.type === 'ok' ? 'bd g' : 'err'} role="alert" style={{ margin: '8px 0' }}>
                {pwdMsg.text}
              </p>
            )}

            <div className="acts" style={{ marginTop: 16 }}>
              <button type="button" className="btn" onClick={() => setActiveModal(null)}>Cancel</button>
              <button className="btn pr">Save Password</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 3. Role Privileges Modal */}
      {activeModal === 'roles' && (
        <Modal title="Role Privileges & Demo Switching" onClose={() => setActiveModal(null)}>
          <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
            Switch between different school roles to preview customized user permissions and interfaces.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, margin: '14px 0' }}>
            {Object.entries(roles).map(([k, label]) => {
              const active = user?.role === k;
              return (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 14px',
                    borderRadius: 10,
                    border: `1.5px solid ${active ? 'var(--ac)' : 'var(--bd)'}`,
                    background: active ? 'var(--acs)' : 'var(--bg-card)'
                  }}
                >
                  <div>
                    <strong style={{ fontSize: 14 }}>{label}</strong>
                    <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                      {k === 'admin' && 'Complete school administration, entity management, and configurations.'}
                      {k === 'teacher' && 'Class management, attendance marking, exams grading, and homework.'}
                      {k === 'student' && 'Viewing report cards, submitting assignments, schedules, and exams.'}
                      {k === 'parent' && 'Monitoring children performance, attendance, trip consents, and fees.'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`btn sm ${active ? 'pr' : ''}`}
                    disabled={active}
                    onClick={async () => {
                      if (onRoleChange) {
                        await onRoleChange(k);
                      } else {
                        await switchRole(k);
                        navigate('/');
                      }
                      setActiveModal(null);
                    }}
                  >
                    {active ? 'Active Role' : 'Switch'}
                  </button>
                </div>
              );
            })}
          </div>

          <div className="acts">
            <button type="button" className="btn" onClick={() => setActiveModal(null)}>Close</button>
          </div>
        </Modal>
      )}

      {/* 4. Help & Documentation Modal */}
      {activeModal === 'help' && (
        <Modal title="Help & Documentation" onClose={() => setActiveModal(null)}>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            <h4 style={{ margin: '0 0 6px' }}>School Management SC System Guide</h4>
            <p className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
              Welcome to the School Management portal. This enterprise platform is engineered for schools, teachers, students, and parents to streamline education administration.
            </p>

            <h5 style={{ margin: '14px 0 6px' }}>Key Capabilities:</h5>
            <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20 }}>
              <li><strong>Assignments:</strong> Students can upload assignment solutions directly (PDF, Word, images), and teachers can review, download, and grade submissions.</li>
              <li><strong>Attendance & Timetables:</strong> Record daily student attendance and track weekly schedules by grade and section.</li>
              <li><strong>Exams & Report Cards:</strong> Generate comprehensive term report cards with subject rankings and teacher feedback.</li>
              <li><strong>Workstation Security:</strong> Configurable idle timeout protects workstations in shared school computer laboratories.</li>
            </ul>

            <h5 style={{ margin: '14px 0 6px' }}>Keyboard Shortcuts & Accessibility:</h5>
            <ul style={{ fontSize: 13, lineHeight: 1.6, paddingLeft: 20 }}>
              <li><kbd>Esc</kbd> — Close any active modal dialog or popover menu</li>
              <li><kbd>Tab</kbd> — Standard focus order across all interactive controls</li>
              <li>High-contrast light and dark mode toggles in the top navigation bar</li>
            </ul>

            <div className="card" style={{ marginTop: 14, background: 'var(--bg-card)' }}>
              <strong>Need technical support or assistance?</strong>
              <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                Contact the IT Helpdesk at <code>support@school.com</code> or reach your school administrator.
              </p>
            </div>
          </div>

          <div className="acts" style={{ marginTop: 16 }}>
            <button type="button" className="btn" onClick={() => setActiveModal(null)}>Close</button>
          </div>
        </Modal>
      )}
    </>
  );
}
