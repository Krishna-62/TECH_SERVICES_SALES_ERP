import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, SessionUser } from './api';

interface AuthState {
  user: SessionUser | null;
  needsSetup: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  setup: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.auth
      .me()
      .then((res) => {
        setUser(res.user ?? null);
        setNeedsSetup(!!res.needsSetup);
      })
      // Any failure (401, network) means "not signed in" — never a stuck loading screen.
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    setUser((await api.auth.login(username, password)).user);
  }, []);

  const setup = useCallback(async (username: string, password: string) => {
    setUser((await api.auth.setup(username, password)).user);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, needsSetup, loading, login, setup, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
