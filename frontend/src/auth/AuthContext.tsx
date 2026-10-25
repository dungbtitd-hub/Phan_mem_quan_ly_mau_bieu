import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, resetCsrf, setUnauthorizedHandler } from '../api/client';
import type { Me } from '../api/types';

interface AuthState {
  user: Me | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<Me>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasRole: (role: string) => boolean;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { setUser(await api.get<Me>('/api/auth/me')); }
    catch { setUser(null); }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { resetCsrf(); setUser(null); });
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const me = await api.post<Me>('/api/auth/login', { username, password });
    resetCsrf(); // token gắn với danh tính phiên, phải lấy lại sau khi đăng nhập
    setUser(me);
    return me;
  }, []);

  const logout = useCallback(async () => {
    try { await api.post('/api/auth/logout'); } finally { resetCsrf(); setUser(null); }
  }, []);

  const value = useMemo<AuthState>(() => ({
    user, loading, login, logout, refresh, hasRole: (r: string) => !!user?.roles.includes(r)
  }), [user, loading, login, logout, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth phải nằm trong AuthProvider');
  return v;
}
