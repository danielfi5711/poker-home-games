import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api, saveToken } from '../api.js';
import { ChipIcon } from '../icons.js';
import { tr } from '../i18n.js';
import { AppTitle, LangSwitch } from '../ui.js';

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
        <AppTitle />
        <p class="auth__tag">{tr.login.tagline}</p>
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
            {tr.login.logIn}
          </button>
          <button type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
            {tr.login.signUp}
          </button>
        </div>

        {error && <p class="error">{error}</p>}

        <form onSubmit={submit}>
          <label class="field">
            {tr.login.username}
            <input
              value={username}
              onInput={(e) => setUsername(e.currentTarget.value)}
              placeholder={mode === 'register' ? tr.login.usernamePlaceholderNew : tr.login.usernamePlaceholder}
              maxLength={24}
              required
              autocomplete="username"
              dir="auto"
            />
          </label>

          <label class="field">
            {tr.login.password}
            <input
              type="password"
              value={password}
              onInput={(e) => setPassword(e.currentTarget.value)}
              placeholder={mode === 'register' ? tr.login.passwordPlaceholderNew : '••••••'}
              minLength={mode === 'register' ? 6 : undefined}
              required
              autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <label class="field">
              {tr.login.phone} <span class="muted">{tr.login.phoneWhy}</span>
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
            {busy ? (mode === 'login' ? tr.login.loggingIn : tr.login.creating) : mode === 'login' ? tr.login.logIn : tr.login.create}
          </button>
        </form>
      </div>

      <LangSwitch />
    </div>
  );
}
