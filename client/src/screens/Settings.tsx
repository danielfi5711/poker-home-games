import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { ConfirmModal } from './ConfirmModal.js';
import { PhoneForm } from './PhoneForm.js';
import { formatPhone } from '../phone.js';
import { ArrowLeftIcon, LogoutIcon, PhoneIcon, UserIcon } from '../icons.js';
import { Avatar, ScreenHead, SectionLabel } from '../ui.js';

interface Props {
  account: Account;
  onAccountChanged: (account: Account) => void;
  onLogout: () => void;
  onBack: () => void;
}

export function SettingsScreen({ account, onAccountChanged, onLogout, onBack }: Props) {
  const [editing, setEditing] = useState<'name' | 'phone' | null>(null);
  const [newUsername, setNewUsername] = useState(account.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  function flash(message: string) {
    setSaved(message);
    setTimeout(() => setSaved(null), 2500);
  }

  function startEditingName() {
    setNewUsername(account.displayName);
    setCurrentPassword('');
    setError(null);
    setEditing('name');
  }

  async function saveName(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account: updated } = await api.changeUsername(newUsername, currentPassword);
      onAccountChanged(updated);
      setEditing(null);
      flash('Name updated.');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="view">
      <ScreenHead
        title="Settings"
        action={
          <button class="iconbtn" onClick={onBack} aria-label="Back">
            <ArrowLeftIcon />
          </button>
        }
      />

      <section class="surface profile">
        <Avatar id={account.id} name={account.displayName} size="xl" />
        <span class="row__main">
          <span class="profile__name">{account.displayName}</span>
          <span class="row__sub" dir="ltr">
            {account.phone ? formatPhone(account.phone) : 'No phone number'}
          </span>
        </span>
      </section>

      {saved && <p class="saved">✓ {saved}</p>}

      <SectionLabel>Account</SectionLabel>
      <div class="surface">
        <div class="setting">
          <span class="setting__icon">
            <UserIcon />
          </span>
          <span class="setting__main">
            <span class="setting__label">Name</span>
            <span class="setting__value">{account.displayName}</span>
          </span>
          {editing !== 'name' && (
            <button class="btn btn--sm" onClick={startEditingName}>
              Change
            </button>
          )}
        </div>
        {editing === 'name' && (
          <div style={{ padding: '0 16px 16px' }}>
            <form onSubmit={saveName}>
              {error && <p class="error">{error}</p>}
              <label class="field">
                New name
                <input value={newUsername} onInput={(e) => setNewUsername(e.currentTarget.value)} maxLength={24} required autoFocus dir="auto" />
              </label>
              <label class="field">
                Current password
                <input
                  type="password"
                  value={currentPassword}
                  onInput={(e) => setCurrentPassword(e.currentTarget.value)}
                  placeholder="To confirm it's you"
                  required
                  autocomplete="current-password"
                />
              </label>
              <div class="btnrow">
                <button type="button" class="btn" onClick={() => setEditing(null)} disabled={busy}>
                  Cancel
                </button>
                <button type="submit" class="btn btn--primary" disabled={busy}>
                  {busy ? 'Saving…' : 'Save name'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div class="setting">
          <span class="setting__icon">
            <PhoneIcon />
          </span>
          <span class="setting__main">
            <span class="setting__label">Phone · friends pay you on Bit with it</span>
            <span class="setting__value" dir="ltr" style={{ textAlign: 'start' }}>
              {account.phone ? formatPhone(account.phone) : 'Not set'}
            </span>
          </span>
          {editing !== 'phone' && (
            <button class="btn btn--sm" onClick={() => setEditing('phone')}>
              Change
            </button>
          )}
        </div>
        {editing === 'phone' && (
          <div style={{ padding: '0 16px 16px' }}>
            <PhoneForm
              initial={account.phone ?? ''}
              submitLabel="Save number"
              onCancel={() => setEditing(null)}
              onSaved={(updated) => {
                onAccountChanged(updated);
                setEditing(null);
                flash('Phone number updated.');
              }}
            />
          </div>
        )}
      </div>

      <button class="btn btn--danger btn--lg btn--block" onClick={() => setConfirmingLogout(true)}>
        <LogoutIcon /> Log out
      </button>

      {confirmingLogout && (
        <ConfirmModal
          title="Log out?"
          body="You'll need your username and password to log back in."
          confirmLabel="Log out"
          danger
          onCancel={() => setConfirmingLogout(false)}
          onConfirm={() => {
            setConfirmingLogout(false);
            onLogout();
          }}
        />
      )}
    </div>
  );
}
