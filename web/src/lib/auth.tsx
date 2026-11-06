import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, ApiError, SessionUser } from './api';
import { cacheClear } from './localStore';
import { myItems, refreshBootstrap, setOutboxUser, syncOutbox } from './outbox';
import { disablePush } from './push';

const SAVED_USER = 'session-user';

function savedUser(): SessionUser | null {
  try {
    return JSON.parse(localStorage.getItem(SAVED_USER) ?? 'null');
  } catch {
    return null;
  }
}

// Remembers who is signed in, for opening the app without signal. A different person on the same
// phone starts with nothing saved from the last one.
async function rememberUser(user: SessionUser | null) {
  const previous = savedUser();
  if (previous && user && previous.id !== user.id) await cacheClear();
  try {
    if (user) localStorage.setItem(SAVED_USER, JSON.stringify(user));
    else localStorage.removeItem(SAVED_USER);
  } catch {
    // Storage unavailable: the app works online only.
  }
  setOutboxUser(user?.id ?? null);
  if (user) {
    void syncOutbox();
    void refreshBootstrap();
  }
}

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
      .then(async (res) => {
        await rememberUser(res.user ?? null);
        setUser(res.user ?? null);
        setNeedsSetup(!!res.needsSetup);
      })
      .catch(async (err) => {
        // No signal: carry on as the person last signed in here; the server still checks on sync.
        // Any other failure means "not signed in", never a stuck loading screen.
        const offlineUser = err instanceof ApiError && err.status === 0 ? savedUser() : null;
        if (!offlineUser) await rememberUser(null);
        else setOutboxUser(offlineUser.id);
        setUser(offlineUser);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const { user: next } = await api.auth.login(username, password);
    await rememberUser(next);
    setUser(next);
  }, []);

  const setup = useCallback(async (username: string, password: string) => {
    const { user: next } = await api.auth.setup(username, password);
    await rememberUser(next);
    setUser(next);
    setNeedsSetup(false);
  }, []);

  const logout = useCallback(async () => {
    const waiting = (await myItems()).length;
    if (waiting && !window.confirm(`${waiting} change(s) on this phone haven’t reached the server. They’ll wait here and send the next time you sign in. Sign out?`)) return;
    // Shared phones: this person's reminders and saved data leave with them.
    await disablePush().catch(() => undefined);
    await cacheClear();
    try {
      await api.auth.logout();
    } finally {
      await rememberUser(null);
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
