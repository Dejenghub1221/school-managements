import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import { useSettings } from './context/SettingsContext.jsx';
import { useLang } from './context/LangContext.jsx';
import { Icon } from './icons.jsx';
import { Notifications, UserProfileMenu } from './components/index.js';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EntityPage from './pages/EntityPage.jsx';
import Attendance from './pages/Attendance.jsx';
import Exams from './pages/Exams.jsx';
import Fees from './pages/Fees.jsx';
import Timetable from './pages/Timetable.jsx';
import Reports from './pages/Reports.jsx';
import Settings from './pages/Settings.jsx';
import Profile from './pages/Profile.jsx';
import Lms from './pages/Lms.jsx';
import ParentApp from './pages/ParentApp.jsx';
import StudentApp from './pages/StudentApp.jsx';
import TeacherApp from './pages/TeacherApp.jsx';

const NAV = [
  ['dashboard', 'dashboard', '/'],
  ['teacherApp', 'teacherApp', '/teacher-app'],
  ['studentApp', 'studentApp', '/student-app'],
  ['familyPortal', 'familyPortal', '/family-portal'],
  ['lms', 'lms', '/lms'],
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

const NAV_BY_ROLE = {
  admin: ['dashboard', 'teacherApp', 'studentApp', 'familyPortal', 'lms', 'students', 'teachers', 'classes', 'subjects', 'attendance', 'exams', 'assignments', 'fees', 'parents', 'timetable', 'library', 'reports', 'settings'],
  teacher: ['dashboard', 'lms', 'students', 'classes', 'subjects', 'attendance', 'exams', 'assignments', 'timetable', 'library', 'reports'],
  student: ['dashboard', 'lms', 'exams', 'assignments', 'timetable', 'library', 'fees', 'attendance'],
  parent:  ['dashboard', 'lms', 'exams', 'assignments', 'timetable', 'fees', 'attendance']
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

  const [settingsNavOpen, setSettingsNavOpen] = useState(() => {
    return location.pathname.startsWith('/settings');
  });

  useEffect(() => {
    if (location.pathname.startsWith('/settings')) {
      setSettingsNavOpen(true);
    }
  }, [location.pathname]);

  const settingsSubItems = [
    { id: 'general', label: 'General' },
    ...(user?.role === 'admin' ? [{ id: 'accounts', label: 'Accounts & Linking' }] : []),
    ...(user?.role === 'admin' ? [{ id: 'teaching', label: 'Teaching & Staff Leave' }] : []),
    { id: 'announcements', label: 'Announcements' },
    ...(user?.role === 'admin' ? [
      { id: 'promotion', label: 'Class Promotion' },
      { id: 'audit', label: 'Audit Log' }
    ] : [])
  ];

  const currentSettingsTab = location.pathname === '/settings'
    ? (new URLSearchParams(location.search).get('tab') || 'general')
    : null;

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
  const [localTheme, setLocalTheme] = useState(() => localStorage.getItem('theme') || 'light');

  useEffect(() => {
    const effectiveTheme = localTheme === 'system'
      ? (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : localTheme;
    document.documentElement.dataset.theme = effectiveTheme;
    localStorage.setItem('theme', localTheme);
  }, [localTheme]);

  const toggleTheme = () => {
    setLocalTheme(prev => {
      const isCurrentDark = document.documentElement.dataset.theme === 'dark';
      const next = isCurrentDark ? 'light' : 'dark';
      localStorage.setItem('theme', next);
      document.documentElement.dataset.theme = next;
      return next;
    });
  };
  const isDark = localTheme === 'dark' ||
    (localTheme === 'system' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ||
    document.documentElement.dataset.theme === 'dark';

  useEffect(() => {
    document.body.classList.toggle('ro', isReadOnly);
    return () => document.body.classList.remove('ro');
  }, [isReadOnly]);

  const handleRoleChange = async target => {
    const newRole = typeof target === 'string' ? target : target?.target?.value;
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
            <Icon name="menu" className="side-toggle-ic" />
          </button>
        </div>
        <div id="who" className="who">{whoText}</div>
        <nav id="nav" aria-label="Main navigation">
          {NAV.filter(n => (NAV_BY_ROLE[user?.role] || NAV.map(x => x[0])).includes(n[0]) && see(n[0])).map(([k, , to]) => {
            if (k === 'settings') {
              return (
                <div key={k} className={`side-nav-group ${settingsNavOpen ? 'expanded' : ''}`}>
                  <div className={`side-nav-parent-row ${location.pathname.startsWith('/settings') ? 'active-parent' : ''}`}>
                    <Link
                      to={currentSettingsTab ? `/settings?tab=${currentSettingsTab}` : '/settings'}
                      className={location.pathname.startsWith('/settings') && !settingsNavOpen ? 'active' : ''}
                      title={collapsed ? t('settings') : undefined}
                      onClick={() => {
                        if (collapsed) toggleCollapsed();
                        setSettingsNavOpen(true);
                      }}
                    >
                      <Icon name="settings" />
                      <span>{t('settings')}</span>
                    </Link>
                    {!collapsed && (
                      <button
                        type="button"
                        className={`side-nav-chevron-btn ${settingsNavOpen ? 'expanded' : ''}`}
                        aria-label={settingsNavOpen ? 'Collapse Settings components' : 'Expand Settings components'}
                        aria-expanded={settingsNavOpen}
                        title={settingsNavOpen ? 'Collapse Settings' : 'Expand Settings'}
                        onClick={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          setSettingsNavOpen(prev => !prev);
                        }}
                      >
                        <svg
                          className="chevron-icon"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <polyline points={settingsNavOpen ? "6 9 12 15 18 9" : "15 18 9 12 15 6"} />
                        </svg>
                      </button>
                    )}
                  </div>

                  {!collapsed && settingsNavOpen && (
                    <div className="side-submenu-list" role="region" aria-label="Settings components">
                      {settingsSubItems.map(sub => {
                        const isSubActive = location.pathname === '/settings' && currentSettingsTab === sub.id;
                        return (
                          <Link
                            key={sub.id}
                            to={`/settings?tab=${sub.id}`}
                            className={`side-sublink ${isSubActive ? 'active' : ''}`}
                            onClick={() => {
                              if (window.innerWidth < 1024) setOpen(false);
                            }}
                          >
                            <span className="side-sublink-bullet">•</span>
                            <span>{t(sub.id) || sub.label}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            return (
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
            );
          })}
        </nav>
      </aside>

      {/* Skip to main content — accessibility */}
      <a href="#main" className="skip-link">Skip to main content</a>

      <div id="ov" className={open ? 'on' : ''} onClick={() => setOpen(false)} aria-hidden="true" />

      <div className={`wrap ${collapsed ? 'collapsed' : ''}`.trim()}>
        <header className="top" role="banner">
          <button
            type="button"
            className="top-menu-btn"
            id="mb"
            aria-controls="side"
            aria-expanded={window.innerWidth < 1024 ? open : !collapsed}
            aria-label="Toggle navigation menu"
            title="Toggle navigation menu"
            onClick={() => {
              if (window.innerWidth < 1024) {
                setOpen(o => !o);
              } else {
                toggleCollapsed();
              }
            }}
          >
            <Icon name="menu" className="menu-icon" />
          </button>
          <strong id="pt">
            {user?.role === 'parent' && activeKey === 'dashboard'
              ? t('familyPortal')
              : user?.role === 'student' && activeKey === 'dashboard'
              ? t('studentApp')
              : user?.role === 'teacher' && activeKey === 'dashboard'
              ? t('teacherApp')
              : activeKey === 'settings' && currentSettingsTab
              ? `${t('settings')} · ${t(currentSettingsTab) || currentSettingsTab}`
              : t(activeKey)}
          </strong>
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

          {/* User profile menu with session timeout, notifications, and profile popover */}
          <UserProfileMenu onRoleChange={handleRoleChange} roles={ROLES}>
            <Notifications />
          </UserProfileMenu>
        </header>

        <main id="main" tabIndex="-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/teacher-app" element={<Guard k="teacherApp"><TeacherApp /></Guard>} />
            <Route path="/student-app" element={<Guard k="studentApp"><StudentApp /></Guard>} />
            <Route path="/family-portal" element={<Guard k="familyPortal"><ParentApp /></Guard>} />
            <Route path="/parent-app" element={<Guard k="familyPortal"><ParentApp /></Guard>} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/lms/*" element={<Guard k="lms"><Lms /></Guard>} />
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
