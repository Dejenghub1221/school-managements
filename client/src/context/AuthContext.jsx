import { createContext, useContext, useState } from 'react';
import { api } from '../api/index.js';

const Ctx = createContext();
export const useAuth = () => useContext(Ctx);

// Client-side fallback permissions (mirrors server API/auth.js PM)
const PM_CLIENT = {
  teacher: { dashboard: 'r', teacherApp: 'w', students: 'r', teachers: 'r', classes: 'r', subjects: 'r', attendance: 'w', exams: 'w', assignments: 'w', parents: 'r', timetable: 'r', library: 'r', reports: 'r', lms: 'w' },
  student: { dashboard: 'r', studentApp: 'w', students: 'r', classes: 'r', subjects: 'r', exams: 'r', assignments: 'r', timetable: 'r', library: 'r', fees: 'r', attendance: 'r', lms: 'w' },
  parent:  { dashboard: 'r', familyPortal: 'w', parentApp: 'w', students: 'r', classes: 'r', subjects: 'r', exams: 'r', assignments: 'r', timetable: 'r', fees: 'r', attendance: 'r', lms: 'r' },
};

export function AuthProvider({ children }) {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('session') || 'null'));

  const login = async (username, password) => {
    const d = await api('/login', { method: 'POST', body: { username, password } });
    localStorage.setItem('token', d.token);
    localStorage.setItem('session', JSON.stringify(d));
    setSession(d);
    return d;
  };

  const switchRole = async role => {
    return login(role, 'school123');
  };

  const logout = () => {
    localStorage.clear();
    setSession(null);
  };

  const see = k => {
    // Use token permissions first; fall back to role-based check for missing keys
    if (session?.permissions?.[k]) return true;
    const role = session?.user?.role;
    return role === 'admin' || !!(PM_CLIENT[role]?.[k]);
  };
  const can = k => session?.user?.role === 'admin' || session?.permissions?.[k] === 'w';

  const updateUser = updates => {
    setSession(prev => {
      if (!prev) return prev;
      const updatedUser = { ...(prev.user || {}), ...updates };
      const newSession = { ...prev, user: updatedUser };
      localStorage.setItem('session', JSON.stringify(newSession));
      return newSession;
    });
  };

  return (
    <Ctx.Provider value={{ user: session?.user, permissions: session?.permissions, login, logout, switchRole, see, can, updateUser }}>
      {children}
    </Ctx.Provider>
  );
}
