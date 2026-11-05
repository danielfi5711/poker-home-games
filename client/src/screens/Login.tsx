import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api, saveToken, useAuthOptions } from '../api.js';
import { ChipIcon } from '../icons.js';
import { tr } from '../i18n.js';
import { AppTitle, LangSwitch } from '../ui.js';

interface Props {
  onAuthed: (account: Account) => void;
}

type Mode = 'login' | 'register' | 'forgot';

export function Login({ onAuthed }: Props) {
  const options = useAuthOptions();
  const phoneRecovery = options?.phoneRecovery ?? false;

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  /** A code was texted: sign-up / reset moves on to the code step. */
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function authed(result: { token: string; account: Account }) {
    saveToken(result.token);
    onAuthed(result.account);
  }

  function submit(e: Event) {
    e.preventDefault();
    void run(async () => {
      if (mode === 'login') {
        authed(await api.login(username, password));
      } else if (mode === 'register') {
        const result = await api.register(username, password, phone, codeSent ? code : '');
        if ('codeSent' in result) setCodeSent(true);
        else authed(result);
      } else if (!codeSent) {
        await api.forgotPassword(phone);
        setCodeSent(true);
      } else {
        authed(await api.resetPassword(phone, code, password));
      }
    });
  }

  function resend() {
    void run(async () => {
      if (mode === 'register') await api.register(username, password, phone);
      else await api.forgotPassword(phone);
      setCode('');
      setNote(tr.login.codeResent);
    });
  }

  function editNumber() {
    setCodeSent(false);
    setCode('');
    setError(null);
    setNote(null);
  }

  function switchMode(next: Mode) {
    setMode(next);
    setCodeSent(false);
    setCode('');
    setError(null);
    setNote(null);
    if (next === 'forgot') setPassword('');
  }

  const codeField = (
    <label class="field">
      {tr.login.code}
      <input
        value={code}
        onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, '').slice(0, 10))}
        inputMode="numeric"
        autocomplete="one-time-code"
        pattern="[0-9]*"
        placeholder="123456"
        dir="ltr"
        required
        autoFocus
      />
    </label>
  );

  const codeLinks = (
    <p class="auth__links">
      <button type="button" class="linkbtn" onClick={resend} disabled={busy}>
        {tr.login.resend}
      </button>
      <span aria-hidden="true">·</span>
      <button type="button" class="linkbtn" onClick={editNumber} disabled={busy}>
        {tr.login.changeNumber}
      </button>
    </p>
  );

  const phoneField = (
    <label class="field">
      {tr.login.phone}
      <input
        type="tel"
        inputMode="tel"
        dir="ltr"
        value={phone}
        onInput={(e) => setPhone(e.currentTarget.value)}
        placeholder={tr.login.phonePlaceholder}
        autocomplete="tel"
        required
      />
      <span class="field__hint">{tr.login.phoneWhy}</span>
    </label>
  );

  let body;
  if (mode === 'forgot') {
    body = (
      <form onSubmit={submit}>
        <h2 class="auth__heading">{tr.login.forgotTitle}</h2>
        {!codeSent ? (
          <>
            <p class="hint">{tr.login.forgotSub}</p>
            {phoneField}
            <button class="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
              {busy ? tr.login.sending : tr.login.sendCode}
            </button>
            <p class="hint auth__fine">{tr.login.noPhoneHelp}</p>
          </>
        ) : (
          <>
            <p class="hint">
              {tr.login.forgotSentTo('⁨' + phone + '⁩')}
            </p>
            {codeField}
            <label class="field">
              {tr.login.newPassword}
              <input
                type="password"
                value={password}
                onInput={(e) => setPassword(e.currentTarget.value)}
                placeholder={tr.login.passwordPlaceholderNew}
                minLength={6}
                required
                autocomplete="new-password"
              />
            </label>
            <button class="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
              {busy ? tr.login.resetting : tr.login.resetAndLogIn}
            </button>
            {codeLinks}
          </>
        )}
        <p class="auth__links">
          <button type="button" class="linkbtn" onClick={() => switchMode('login')}>
            {tr.login.backToLogin}
          </button>
        </p>
      </form>
    );
  } else if (mode === 'register' && codeSent) {
    body = (
      <form onSubmit={submit}>
        <p class="hint">{tr.login.codeSentTo('⁨' + phone + '⁩')}</p>
        {codeField}
        <button class="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
          {busy ? tr.login.creating : tr.login.create}
        </button>
        {codeLinks}
      </form>
    );
  } else {
    body = (
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

        {mode === 'register' && phoneRecovery && phoneField}

        <button class="btn btn--primary btn--lg btn--block" type="submit" disabled={busy}>
          {mode === 'login'
            ? busy
              ? tr.login.loggingIn
              : tr.login.logIn
            : busy
              ? phoneRecovery
                ? tr.login.sending
                : tr.login.creating
              : phoneRecovery
                ? tr.login.sendCode
                : tr.login.create}
        </button>

        {mode === 'login' && phoneRecovery && (
          <p class="auth__links">
            <button type="button" class="linkbtn" onClick={() => switchMode('forgot')}>
              {tr.login.forgot}
            </button>
          </p>
        )}
      </form>
    );
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
        {mode !== 'forgot' && (
          <div class={`seg ${mode === 'register' ? 'seg--right' : ''}`}>
            <span class="seg__thumb" />
            <button type="button" aria-pressed={mode === 'login'} onClick={() => switchMode('login')}>
              {tr.login.logIn}
            </button>
            <button type="button" aria-pressed={mode === 'register'} onClick={() => switchMode('register')}>
              {tr.login.signUp}
            </button>
          </div>
        )}

        {error && <p class="error">{error}</p>}
        {note && <p class="saved">✓ {note}</p>}

        {body}
      </div>

      <LangSwitch />
    </div>
  );
}
