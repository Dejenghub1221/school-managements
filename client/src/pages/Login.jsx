import { useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { useSettings } from '../context/SettingsContext.jsx';

export default function Login() {
  const { login } = useAuth();
  const { settings } = useSettings();
  const [u, setU] = useState('admin');
  const [p, setP] = useState('school123');
  const [showPwd, setShowPwd] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

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
        <label htmlFor="u">Username / Role</label>
        <select id="u" value={u} onChange={e => setU(e.target.value)}>
          <option value="admin">admin (Administrator)</option>
          <option value="teacher">teacher (Teacher)</option>
          <option value="student">student (Student)</option>
          <option value="parent">parent (Parent)</option>
        </select>
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
  </div>
  );
}
