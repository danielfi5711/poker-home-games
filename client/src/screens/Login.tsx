import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api, saveToken } from '../api.js';

interface Props {
  onAuthed: (account: Account) => void;
}

export function Login({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = mode === 'login' ? await api.login(username, password) : await api.register(username, password);
      saveToken(result.token);
      onAuthed(result.account);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <div class="tabs">
        <button class={`tab ${mode === 'login' ? 'tab--active' : ''}`} onClick={() => setMode('login')}>
          Log in
        </button>
        <button class={`tab ${mode === 'register' ? 'tab--active' : ''}`} onClick={() => setMode('register')}>
          Sign up
        </button>
      </div>

      {error && <p class="error">{error}</p>}

      <form onSubmit={submit}>
        <label class="field">
          Username
          <input
            value={username}
            onInput={(e) => setUsername(e.currentTarget.value)}
            placeholder="yourname"
            maxLength={24}
            required
            autocomplete="username"
          />
        </label>
        {mode === 'register' && <p class="hint">This is what friends see on the leaderboard and at the table.</p>}

        <label class="field">
          Password
          <input
            type="password"
            value={password}
            onInput={(e) => setPassword(e.currentTarget.value)}
            placeholder={mode === 'register' ? 'At least 6 characters' : 'Password'}
            minLength={mode === 'register' ? 6 : undefined}
            required
            autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
          />
        </label>

        <button class="btn btn--primary" type="submit" disabled={busy}>
          {busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
    </div>
  );
}
