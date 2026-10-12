import { createContext, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const SettingsCtx = createContext();

export const useSettings = () => useContext(SettingsCtx);

export function SettingsProvider({ children }) {
  const [settings, setSettingsState] = useState({
    school: 'ABC Academy',
    year: '2026/27',
    cur: '$',
    theme: 'system'
  });

  const applyThemeAndChrome = s => {
    document.title = `${s.school} – School Managements`;
    if (s.theme === 'system') {
      document.documentElement.removeAttribute('data-theme');
    } else {
      document.documentElement.dataset.theme = s.theme;
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
