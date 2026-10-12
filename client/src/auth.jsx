import { createContext, useContext, useState } from 'react';
import { api } from './api.js';

const Ctx = createContext();
export const useAuth = () => useContext(Ctx);

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

  const see = k => !!session?.permissions?.[k];
  const can = k => session?.permissions?.[k] === 'w';

  return (
    <Ctx.Provider value={{ user: session?.user, permissions: session?.permissions, login, logout, switchRole, see, can }}>
      {children}
    </Ctx.Provider>
  );
}
