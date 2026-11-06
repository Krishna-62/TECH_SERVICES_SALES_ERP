import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Button, Notice, TextField } from '../components/ui';

// Sign-in, or first-run setup of the initial administrator when the database has no users.
export default function SignIn({ mode }: { mode: 'login' | 'setup' }) {
  const { login, setup } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const isSetup = mode === 'setup';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    try {
      await (isSetup ? setup : login)(username.trim(), password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <img src="/logo.png" alt="Technicon Services" className="w-64 max-w-full mb-8 rounded" />

        <h1 className="text-2xl font-bold tracking-tight">{isSetup ? 'Create the first administrator' : 'Sign in'}</h1>
        <p className="text-sm text-ink-muted mt-1 mb-6">
          {isSetup
            ? 'No accounts exist yet. This account can add everyone else.'
            : 'Use the account your administrator gave you.'}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
          {error && <Notice tone="error">{error}</Notice>}
          <TextField
            label="Username"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <TextField
            label="Password"
            type="password"
            autoComplete={isSetup ? 'new-password' : 'current-password'}
            hint={isSetup ? 'At least 8 characters.' : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={busy || !username.trim() || !password} className="mt-2">
            {busy ? 'Please wait…' : isSetup ? 'Create administrator' : 'Sign in'}
          </Button>
        </form>
      </div>
    </div>
  );
}
