import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { LockIcon, PhoneIcon } from '../icons.js';
import { SectionLabel } from '../ui.js';
import { tr } from '../i18n.js';

interface Props {
  account: Account;
  /** SMS is set up on the server; without it there's no recovery phone row. */
  phoneRecovery: boolean;
  /** Open the phone editor right away (coming from the "add a recovery phone" prompt). */
  openPhone?: boolean;
  onAccountChanged: (account: Account) => void;
  flash: (message: string) => void;
}

/** Settings → Security: the recovery phone (add/change with an SMS code) and change password. */
export function SecuritySection({ account, phoneRecovery, openPhone, onAccountChanged, flash }: Props) {
  const [editing, setEditing] = useState<'phone' | 'password' | null>(openPhone && phoneRecovery ? 'phone' : null);
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function open(which: 'phone' | 'password') {
    setEditing(which);
    setPhone('');
    setCode('');
    setCodeSent(false);
    setCurrentPassword('');
    setNewPassword('');
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function savePhone(e: Event) {
    e.preventDefault();
    void run(async () => {
      const result = await api.setPhone(phone, codeSent ? code : '', currentPassword);
      if ('codeSent' in result) {
        setCodeSent(true);
        return;
      }
      onAccountChanged(result.account);
      setEditing(null);
      flash(tr.security.phoneUpdated);
    });
  }

  function savePassword(e: Event) {
    e.preventDefault();
    void run(async () => {
      const { account: updated } = await api.changePassword(currentPassword, newPassword);
      onAccountChanged(updated);
      setEditing(null);
      flash(tr.security.passwordUpdated);
    });
  }

  const replacing = account.phoneHint !== null;

  return (
    <>
      <SectionLabel>{tr.security.title}</SectionLabel>
      <div class="surface">
        {phoneRecovery && (
          <>
            <div class="setting">
              <span class="setting__icon">
                <PhoneIcon />
              </span>
              <span class="setting__main">
                <span class="setting__label">{tr.security.recoveryPhone}</span>
                <span class={`setting__value ${replacing ? '' : 'setting__value--warn'}`}>
                  {replacing ? <bdi dir="ltr">{account.phoneHint}</bdi> : tr.security.none}
                </span>
              </span>
              {editing !== 'phone' && (
                <button class="btn btn--sm" onClick={() => open('phone')}>
                  {replacing ? tr.settings.change : tr.security.add}
                </button>
              )}
            </div>
            {editing === 'phone' && (
              <div style={{ padding: '0 16px 16px' }}>
                <form onSubmit={savePhone}>
                  {error && <p class="error">{error}</p>}
                  {!codeSent ? (
                    <>
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
                          autoFocus
                        />
                        <span class="field__hint">{tr.login.phoneWhy}</span>
                      </label>
                      {replacing && (
                        <label class="field">
                          {tr.settings.currentPassword}
                          <input
                            type="password"
                            value={currentPassword}
                            onInput={(e) => setCurrentPassword(e.currentTarget.value)}
                            placeholder={tr.settings.confirmItsYou}
                            required
                            autocomplete="current-password"
                          />
                        </label>
                      )}
                    </>
                  ) : (
                    <>
                      <p class="hint">{tr.login.codeSentTo('⁨' + phone + '⁩')}</p>
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
                    </>
                  )}
                  <div class="btnrow">
                    <button
                      type="button"
                      class="btn"
                      onClick={() => (codeSent ? setCodeSent(false) : setEditing(null))}
                      disabled={busy}
                    >
                      {codeSent ? tr.login.changeNumber : tr.common.cancel}
                    </button>
                    <button type="submit" class="btn btn--primary" disabled={busy}>
                      {busy ? tr.login.sending : codeSent ? tr.security.verify : tr.login.sendCode}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </>
        )}

        <div class="setting">
          <span class="setting__icon">
            <LockIcon />
          </span>
          <span class="setting__main">
            <span class="setting__label">{tr.security.passwordLabel}</span>
            <span class="setting__value">••••••••</span>
          </span>
          {editing !== 'password' && (
            <button class="btn btn--sm" onClick={() => open('password')}>
              {tr.settings.change}
            </button>
          )}
        </div>
        {editing === 'password' && (
          <div style={{ padding: '0 16px 16px' }}>
            <form onSubmit={savePassword}>
              {error && <p class="error">{error}</p>}
              <label class="field">
                {tr.settings.currentPassword}
                <input
                  type="password"
                  value={currentPassword}
                  onInput={(e) => setCurrentPassword(e.currentTarget.value)}
                  required
                  autocomplete="current-password"
                  autoFocus
                />
              </label>
              <label class="field">
                {tr.login.newPassword}
                <input
                  type="password"
                  value={newPassword}
                  onInput={(e) => setNewPassword(e.currentTarget.value)}
                  placeholder={tr.login.passwordPlaceholderNew}
                  minLength={6}
                  required
                  autocomplete="new-password"
                />
              </label>
              <div class="btnrow">
                <button type="button" class="btn" onClick={() => setEditing(null)} disabled={busy}>
                  {tr.common.cancel}
                </button>
                <button type="submit" class="btn btn--primary" disabled={busy}>
                  {busy ? tr.common.saving : tr.security.savePassword}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </>
  );
}
