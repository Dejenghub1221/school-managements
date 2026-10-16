import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useSettings } from './context/SettingsContext.jsx';
import { useLang } from './context/LangContext.jsx';
import { Icon } from './icons.jsx';
import { Notifications } from './components/index.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EntityPage from './pages/EntityPage.jsx';
import Attendance from './pages/Attendance.jsx';
import Exams from './pages/Exams.jsx';
import Fees from './pages/Fees.jsx';
import Timetable from './pages/Timetable.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';

const NAV = [
  ['dashboard', 'dashboard', '/'],
  ['students', 'students', '/students'],
  ['teachers', 'teachers', '/teachers'],
  ['classes', 'classes', '/classes'],
  ['subjects', 'subjects', '/subjects'],
  ['attendance', 'attendance', '/attendance'],
  ['exams', 'exams', '/exams'],
  ['assignments', 'assignments', '/assignments'],
  ['fees', 'fees', '/fees'],
  ['parents', 'parents', '/parents'],
  ['timetable', 'timetable', '/timetable'],
  ['library', 'library', '/library'],
  ['reports', 'reports', '/reports'],
  ['settings', 'settings', '/settings']
];

const ROLES = {
  admin: 'Administrator',
  teacher: 'Teacher',
  student: 'Student',
  parent: 'Parent'
};

function Guard({ k, children }) {
  const { see } = useAuth();
  return see(k) ? children : <Navigate to="/" replace />;
}

function Layout() {
  const { user, logout, switchRole, see, can } = useAuth();
  const { settings, updateSettings } = useSettings();
  const { t, lang, switchLang } = useLang();
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const navigate = useNavigate();

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    setOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const onKey = e => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const currentNav = NAV.find(n => (n[2] === '/' ? location.pathname === '/' : location.pathname.startsWith(n[2]))) || NAV[0];
  const activeKey = currentNav[0];
  const isReadOnly = activeKey !== 'dashboard' && !can(activeKey);

  // Theme toggle — stored in localStorage so it works for ALL roles (no API needed)
  const [localTheme, setLocalTheme] = useState(() => localStorage.getItem('theme') || 'system');

  useEffect(() => {
    const theme = localTheme === 'system' ? null : localTheme;
    if (theme) {
      document.documentElement.dataset.theme = theme;
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    localStorage.setItem('theme', localTheme);
  }, [localTheme]);

  const toggleTheme = () => {
    setLocalTheme(prev => prev === 'dark' ? 'light' : 'dark');
  };
  const isDark = localTheme === 'dark' ||
    (localTheme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    document.body.classList.toggle('ro', isReadOnly);
    return () => document.body.classList.remove('ro');
  }, [isReadOnly]);

  const handleRoleChange = async e => {
    const newRole = e.target.value;
    try {
      await switchRole(newRole);
      navigate('/');
    } catch (err) {
      console.error(err);
    }
  };

  const whoText =
    user.role === 'admin'
      ? `${ROLES[user.role]} · full access`
      : user.role === 'teacher'
      ? `${ROLES[user.role]} · Ms. Alemu`
      : user.role === 'student'
      ? `${ROLES[user.role]} · Dejenie Abebe`
      : `${ROLES[user.role]} · Dejenie Hassan`;

  return (
    <>
      <aside
        id="side"
        className={`${open ? 'open' : ''} ${collapsed ? 'collapsed' : ''}`.trim()}
        aria-label="Main navigation"
      >
        <div className="brand">
          <div className="brand-info">
            <a href="/" className="brand-link" aria-label="Go to dashboard">
              <img src="/School_icon.png" alt="School logo" className="brand-logo" />
            </a>
            <span id="bn">{settings.school}</span>
          </div>
          <button
            type="button"
            className="side-toggle"
            id="side-toggle"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={() => {
              if (window.innerWidth < 1024) {
                setOpen(false);
              } else {
                toggleCollapsed();
              }
            }}
          >
            <svg viewBox="0 0 24 24" className="side-toggle-ic" aria-hidden="true">
              <polyline points={collapsed ? '9 6 15 12 9 18' : '15 6 9 12 15 18'} />
            </svg>
          </button>
        </div>
        <div id="who" className="who">{whoText}</div>
        <nav id="nav" aria-label="Main navigation">
          {NAV.filter(n => see(n[0])).map(([k, , to]) => (
            <NavLink
              key={k}
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
              title={collapsed ? t(k) : undefined}
            >
              <Icon name={k} />
              <span>{t(k)}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* Skip to main content — accessibility */}
      <a href="#main" className="skip-link">Skip to main content</a>

      <div id="ov" className={open ? 'on' : ''} onClick={() => setOpen(false)} aria-hidden="true" />

      <div className={`wrap ${collapsed ? 'collapsed' : ''}`.trim()}>
        <header className="top" role="banner">
          <button
            className="btn"
            id="mb"
            aria-controls="side"
            aria-expanded={open}
            aria-label={open ? t('close') : t('menu')}
            onClick={() => setOpen(!open)}
          >
            {open ? t('close') : t('menu')}
          </button>
          <strong id="pt">{t(activeKey)}</strong>
          {isReadOnly && <span className="bd y" id="vo">{t('viewOnly')}</span>}
          <span id="ay">{t('academicYear')} {settings.year}</span>

          {/* Language switcher */}
          <button
            className="btn sm"
            aria-label={t('language')}
            title={t('language')}
            onClick={() => switchLang(lang === 'en' ? 'am' : 'en')}
          >
            🌐 {lang === 'en' ? 'EN' : 'አማ'}
          </button>

          {/* Dark / light mode toggle */}
          <button
            className="btn sm"
            aria-label={isDark ? t('lightMode') : t('darkMode')}
            title={isDark ? t('lightMode') : t('darkMode')}
            onClick={toggleTheme}
          >
            {isDark ? '☀️' : '🌙'}
          </button>

          {/* Notification bell */}
          <Notifications />

          <select
            id="role"
            aria-label="View as role (demo)"
            value={user.role}
            onChange={handleRoleChange}
          >
            {Object.entries(ROLES).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <button className="btn sm signout-btn" onClick={logout} title={t('signOut')} aria-label={t('signOut')}>
            <svg viewBox="0 0 24 24" className="ic" aria-hidden="true" style={{width:16,height:16}}>
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {t('signOut')}
          </button>
        </header>

        <main id="main" tabIndex="-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/students" element={<Guard k="students"><EntityPage k="students" /></Guard>} />
            <Route path="/teachers" element={<Guard k="teachers"><EntityPage k="teachers" /></Guard>} />
            <Route path="/classes" element={<Guard k="classes"><EntityPage k="classes" /></Guard>} />
            <Route path="/subjects" element={<Guard k="subjects"><EntityPage k="subjects" /></Guard>} />
            <Route path="/attendance" element={<Guard k="attendance"><Attendance /></Guard>} />
            <Route path="/exams" element={<Guard k="exams"><Exams /></Guard>} />
            <Route path="/assignments" element={<Guard k="assignments"><EntityPage k="assignments" /></Guard>} />
            <Route path="/fees" element={<Guard k="fees"><Fees /></Guard>} />
            <Route path="/parents" element={<Guard k="parents"><EntityPage k="parents" /></Guard>} />
            <Route path="/timetable" element={<Guard k="timetable"><Timetable /></Guard>} />
            <Route path="/library" element={<Guard k="library"><EntityPage k="library" /></Guard>} />
            <Route path="/reports" element={<Guard k="reports"><Reports /></Guard>} />
            <Route path="/settings" element={<Guard k="settings"><Settings /></Guard>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <footer className="app-footer">
          <span>© {new Date().getFullYear()} School-Management SC. {t('allRights')}</span>
        </footer>
      </div>
    </>
  );
}

export default function App() {
  const { user } = useAuth();
  return user ? <Layout /> : <Login />;
}
