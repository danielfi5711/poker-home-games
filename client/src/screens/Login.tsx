import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api, saveToken } from '../api.js';
import { ChipIcon } from '../icons.js';

interface Props {
  onAuthed: (account: Account) => void;
}

export function Login({ onAuthed }: Props) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = mode === 'login' ? await api.login(username, password) : await api.register(username, password, phone);
      saveToken(result.token);
      onAuthed(result.account);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next);
    setError(null);
  }

  return (
    <div class="auth view">
      <div class="auth__hero">
        <div class="auth__logo">
          <ChipIcon size={72} />
        </div>
        <h1 class="auth__title">
          Poker <span>Night</span>
        </h1>
        <p class="auth__tag">Buy-ins, cash-outs and who pays whom — sorted for your home game.</p>
        <div class="suits" aria-hidden="true">
          <span>♠</span>
          <span>♥</span>
          <span>♣</span>
          <span>♦</span>
        </div>
      </div>

      <div class="surface auth__card">
        <div class={`seg ${mode === 'register' ? 'seg--right' : ''}`}>
          <span class="seg__thumb" />
          <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
            Log in
          </button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
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
              placeholder={mode === 'register' ? 'What friends call you' : 'yourname'}
              maxLength={24}
              required
              autocomplete="username"
              dir="auto"
            />
          </label>

          <label class="field">
            Password
            <input
              type="password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={mode === 'register' ? 'At least 6 characters' : '••••••'}
              minLength={mode === 'register' ? 6 : undefined}
              required
              autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <label class="field">
              Phone number <span class="muted">· friends pay you on Bit with it</span>
              <input
                type="tel"
                inputMode="tel"
                dir="ltr"
                value={phone}
                onInput={(e) => setPhone(e.currentTarget.value)}
                placeholder="050-123-4567"
                required
                autocomplete="tel"
              />
            </label>
          )}

          <button class="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
            {busy ? (mode === 'login' ? 'Logging in…' : 'Creating account…') : mode === 'login' ? 'Log in' : 'Create account'}
          </button>
        </form>
      </div>
    </div>
  );
}
