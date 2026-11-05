import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../api/index.js';

const SettingsCtx = createContext();

export const useSettings = () => useContext(SettingsCtx);

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState({
    school: 'ABC Academy',
    year: '2026/27',
    cur: '$',
    theme: 'light'
  });

  const applyThemeAndChrome = s => {
    document.title = `${s.school} – School Managements`;
    const userTheme = localStorage.getItem('theme');
    const effectiveTheme = userTheme || s.theme || 'light';
    if (effectiveTheme === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = effectiveTheme;
    }
  };

  useEffect(() => {
    api('/settings')
      .then(d => {
        if (d && d.school) {
          setSettingsState(d);
          applyThemeAndChrome(d);
        }
      })
      .catch(() => { });
  }, []);

  const updateSettings = async newSettings => {
    const updated = await api('/settings', { method: 'PUT', body: newSettings });
    setSettingsState(updated);
    if (newSettings.theme) {
      localStorage.setItem('theme', newSettings.theme);
    }
    applyThemeAndChrome(updated);
    return updated;
  };

  const money = n => (settings.cur || '$') + Number(n || 0).toLocaleString();

  return (
    <SettingsCtx.Provider value={{ settings, updateSettings, money }}>
      {children}
    </SettingsCtx.Provider>
  );
}
