// Account login / register gate (Phase-6 Onboarding v2). Shown before the character flow
// only when a server is configured; single-player never sees it. On success it hands the
// session token up to App, which stores it and passes it into the game connection.

import { useState } from 'react';
import { login, register } from '../net/authClient.js';
import { colors, panel, button } from './theme.js';

const input: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '9px 11px',
  marginTop: 6,
  borderRadius: 6,
  border: `1px solid ${colors.panelBorder}`,
  background: 'rgba(0,0,0,0.35)',
  color: colors.ink,
  fontSize: 14,
};

export function LoginScreen({
  serverUrl,
  onAuthed,
}: {
  serverUrl: string;
  onAuthed: (token: string) => void;
}): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const result = await (mode === 'login'
      ? login(serverUrl, email, password)
      : register(serverUrl, email, password));
    setBusy(false);
    if (result.ok) onAuthed(result.token);
    else setError(result.error);
  };

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 40%, #241a12 0%, #0b0806 80%)',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <form onSubmit={(e) => void submit(e)} style={{ ...panel, width: 320, padding: 22 }}>
        <div style={{ fontSize: 22, fontWeight: 800, color: colors.gold, textAlign: 'center' }}>
          Pathlands
        </div>
        <div style={{ fontSize: 12, color: colors.inkDim, textAlign: 'center', marginBottom: 16 }}>
          {mode === 'login' ? 'Sign in to enter the world' : 'Create an account'}
        </div>

        <label style={{ fontSize: 12, color: colors.inkDim }}>
          Email
          <input
            style={input}
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
        <label style={{ fontSize: 12, color: colors.inkDim, display: 'block', marginTop: 12 }}>
          Password
          <input
            style={input}
            type="password"
            autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>

        {error !== null && (
          <div style={{ color: '#e0736a', fontSize: 12, marginTop: 12 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={busy}
          style={{ ...button, width: '100%', marginTop: 16, padding: 10 }}
        >
          {busy ? '…' : mode === 'login' ? 'Sign in' : 'Create account'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 12, fontSize: 12, color: colors.inkDim }}>
          {mode === 'login' ? 'New here? ' : 'Have an account? '}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login');
              setError(null);
            }}
            style={{
              background: 'none',
              border: 'none',
              color: colors.accent,
              cursor: 'pointer',
              padding: 0,
              font: 'inherit',
            }}
          >
            {mode === 'login' ? 'Create an account' : 'Sign in'}
          </button>
        </div>
      </form>
    </div>
  );
}
