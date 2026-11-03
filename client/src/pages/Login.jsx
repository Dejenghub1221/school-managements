import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';
import { api } from '../api/index.js';
import { Modal } from '../components/Modal.jsx';

export default function Login() {
  const { login } = useAuth();
  const { settings } = useSettings();
  const [u, setU] = useState('admin');
  const [p, setP] = useState('school123');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  // Forgot Password modal state
  const [forgotModal, setForgotModal] = useState(false);
  const [forgotUsername, setForgotUsername] = useState('');
  const [forgotContact, setForgotContact] = useState('');
  const [forgotReason, setForgotReason] = useState('');
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotSuccess, setForgotSuccess] = useState('');
  const [forgotErr, setForgotErr] = useState('');

  const submit = async e => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await login(u, p);
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  const quickLogin = async role => {
    setU(role);
    setP('school123');
    setBusy(true);
    setErr('');
    try {
      await login(role, 'school123');
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  const handleForgotSubmit = async e => {
    e.preventDefault();
    if (!forgotUsername.trim()) {
      setForgotErr('Please enter your username or ID.');
      return;
    }
    setForgotBusy(true);
    setForgotErr('');
    try {
      const res = await api('/forgot-password', {
        method: 'POST',
        body: {
          username: forgotUsername.trim(),
          contactInfo: forgotContact.trim(),
          reason: forgotReason.trim()
        }
      });
      setForgotSuccess(res.message || 'Request successfully submitted to the Administrator.');
    } catch (x) {
      setForgotErr(x.message);
    } finally {
      setForgotBusy(false);
    }
  };

  return (
    <div className="login-page">
      <form className="card login" onSubmit={submit} noValidate>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <img src="/sl_icon.png" alt="School logo" style={{ width: 42, height: 42, objectFit: 'contain', flexShrink: 0, background: 'none', borderRadius: 0 }} />
          <strong style={{ fontSize: '1.25rem', fontFamily: "'Bricolage Grotesque', sans-serif", color: 'var(--tx)' }}>
            {settings?.school || 'ABC Academy'}
          </strong>
        </div>
        <h1>Sign in</h1>

      <div className="fld">
        <label htmlFor="u">Username</label>
        <input
          id="u"
          type="text"
          value={u}
          onChange={e => setU(e.target.value)}
          placeholder="Enter username"
          autoComplete="username"
          required
        />
      </div>

      <div className="fld">
        <label htmlFor="p">Password</label>
        <div className="pwd-wrap">
          <input
            id="p"
            type={showPwd ? 'text' : 'password'}
            value={p}
            onChange={e => setP(e.target.value)}
            autoComplete="current-password"
          />
          <button
            type="button"
            className="pwd-toggle"
            aria-label={showPwd ? 'Hide password' : 'Show password'}
            title={showPwd ? 'Hide password' : 'Show password'}
            onClick={() => setShowPwd(!showPwd)}
          >
            {showPwd ? (
              <svg viewBox="0 0 24 24" className="ic" aria-hidden="true">
                <path d="M 2.5 14 A 9.5 8 0 0 1 21.5 14" />
                <circle cx="12" cy="14" r="3.8" />
                <line x1="3" y1="4" x2="21" y2="22" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="ic" aria-hidden="true">
                <path d="M 2.5 14 A 9.5 8 0 0 1 21.5 14" />
                <circle cx="12" cy="14" r="3.8" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {err && <p className="err" role="alert">{err}</p>}

      <button className="btn pr" disabled={busy} style={{ marginTop: 8 }}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>

      <div style={{ display: 'flex', justifyContent: 'center', marginTop: 12, marginBottom: 4 }}>
        <button
          type="button"
          onClick={() => {
            setForgotUsername(u || '');
            setForgotContact('');
            setForgotReason('');
            setForgotSuccess('');
            setForgotErr('');
            setForgotModal(true);
          }}
          style={{
            background: 'none',
            border: 'none',
            padding: '4px 8px',
            fontSize: '0.88rem',
            color: 'var(--ac)',
            cursor: 'pointer',
            textDecoration: 'underline',
            fontWeight: 500
          }}
        >
          Forgot password?
        </button>
      </div>

      <div style={{ marginTop: 14 }}>
        <small className="muted" style={{ display: 'block', marginBottom: 6 }}>
          Quick sign in as demo role:
        </small>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {['admin', 'teacher', 'student', 'parent'].map(role => (
            <button
              key={role}
              type="button"
              className="btn sm"
              onClick={() => quickLogin(role)}
            >
              {role}
            </button>
          ))}
        </div>
      </div>
      <div className="login-footer">
        © {new Date().getFullYear()} School-Management SC. All rights reserved.
      </div>
    </form>

    {forgotModal && (
      <Modal
        title="🔒 Password Reset Notice"
        onClose={() => setForgotModal(false)}
      >
        <div style={{ background: 'var(--hv, #f8fafc)', border: '1px solid var(--bd, #e2e8f0)', borderLeft: '4px solid #2563eb', borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <strong style={{ display: 'block', color: '#1e40af', fontSize: '0.95rem', marginBottom: 4 }}>
            Institutional Security Policy
          </strong>
          <p style={{ margin: 0, fontSize: '0.85rem', lineHeight: 1.5, color: 'var(--tx)' }}>
            For academic integrity and student privacy, <strong>only the School Administrator can reset user account passwords</strong>. Self-service password changes are disabled for security.
          </p>
        </div>

        {forgotSuccess ? (
          <div style={{ padding: '8px 0' }}>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', padding: '12px 14px', borderRadius: 8, fontSize: '0.9rem', marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>✓ Reset Request Queued for Administrator</p>
              <p style={{ margin: '6px 0 0', fontSize: '0.85rem' }}>{forgotSuccess}</p>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--tx)', marginBottom: 16 }}>
              Please visit the School Administrator's office (Room 102) or email <strong>admin@school.com</strong> with your ID to collect your temporary login credentials.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn pr" onClick={() => setForgotModal(false)}>
                Close
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleForgotSubmit} noValidate>
            <p style={{ fontSize: '0.88rem', color: 'var(--tx)', marginTop: 0, marginBottom: 14 }}>
              Enter your username or ID below. An official password reset request will be placed in the Administrator's queue.
            </p>

            <div className="fld">
              <label htmlFor="f_u">Username or Student/Staff ID *</label>
              <input
                id="f_u"
                type="text"
                required
                placeholder="e.g. student, teacher, S1034..."
                value={forgotUsername}
                onChange={e => setForgotUsername(e.target.value)}
              />
            </div>

            <div className="fld">
              <label htmlFor="f_c">Contact Phone or Email (Optional)</label>
              <input
                id="f_c"
                type="text"
                placeholder="Where the administrator can reach you"
                value={forgotContact}
                onChange={e => setForgotContact(e.target.value)}
              />
            </div>

            <div className="fld">
              <label htmlFor="f_r">Reason / Details (Optional)</label>
              <textarea
                id="f_r"
                rows={2}
                placeholder="e.g. Forgot login password for academic portal..."
                value={forgotReason}
                onChange={e => setForgotReason(e.target.value)}
              />
            </div>

            {forgotErr && <p className="err" role="alert">{forgotErr}</p>}

            <div style={{ background: 'var(--hv)', border: '1px solid var(--bd)', borderRadius: 6, padding: '10px 12px', fontSize: '0.82rem', marginBottom: 16 }}>
              <strong>Direct Administrative Assistance:</strong>
              <div style={{ marginTop: 4 }}>📧 Admin Email: <code>admin@school.com</code></div>
              <div>📞 School Office: <code>+251 91 123 4567</code> (Mon–Fri, 8 AM–5 PM)</div>
              <div>🏢 Location: Main Admin Office, Room 102</div>
            </div>

            <div className="acts">
              <button type="button" className="btn" onClick={() => setForgotModal(false)}>
                Cancel
              </button>
              <button className="btn pr" disabled={forgotBusy}>
                {forgotBusy ? 'Submitting…' : 'Submit Request to Admin'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    )}
  </div>
  );
}
