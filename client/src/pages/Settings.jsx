import { useState } from 'react';
import { useSettings } from '../context/SettingsContext.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { Toast } from '../components/index.js';

export default function Settings() {
  const { settings, updateSettings } = useSettings();
  const { can } = useAuth();
  const write = can('settings');

  const [school, setSchool] = useState(settings.school || 'ABC Academy');
  const [year, setYear] = useState(settings.year || '2026/27');
  const [cur, setCur] = useState(settings.cur || '$');
  const [theme, setTheme] = useState(settings.theme || 'system');

  const [err, setErr] = useState('');
  const [toast, setToast] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async e => {
    e.preventDefault();
    if (!school.trim()) {
      setErr('School name is required.');
      return;
    }
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

  return (
    <>
      <div className="head">
        <h1>Settings</h1>
      </div>

      <form className="card" style={{ maxWidth: 520 }} onSubmit={handleSubmit} noValidate>
        <div className="fld">
          <label htmlFor="s1">School name</label>
          <input
            id="s1"
            value={school}
            disabled={!write}
            onChange={e => setSchool(e.target.value)}
          />
        </div>

        <div className="fld">
          <label htmlFor="s2">Academic year</label>
          <input
            id="s2"
            value={year}
            disabled={!write}
            onChange={e => setYear(e.target.value)}
          />
        </div>

        <div className="fld">
          <label htmlFor="s3">Currency symbol</label>
          <input
            id="s3"
            value={cur}
            maxLength={4}
            disabled={!write}
            onChange={e => setCur(e.target.value)}
          />
        </div>

        <div className="fld">
          <label htmlFor="s4">Theme</label>
          <select
            id="s4"
            value={theme}
            disabled={!write}
            onChange={e => setTheme(e.target.value)}
          >
            <option value="system">system</option>
            <option value="light">light</option>
            <option value="dark">dark</option>
          </select>
        </div>

        {err && <p className="err" role="alert">{err}</p>}

        {write && (
          <div className="acts">
            <button className="btn pr" disabled={busy}>
              {busy ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        )}
      </form>

      <Toast msg={toast} onDone={() => setToast('')} />
    </>
  );
}
