import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { avatarStyle } from '../avatarColor.js';
import { initials } from '../initials.js';
import { ConfirmModal } from './ConfirmModal.js';

interface Props {
  account: Account;
  onAccountChanged: (account: Account) => void;
  onLogout: () => void;
  onBack: () => void;
}

export function SettingsScreen({ account, onAccountChanged, onLogout, onBack }: Props) {
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState(account.username);
  const [currentPassword, setCurrentPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNote, setSavedNote] = useState(false);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  function startEditingName() {
    setNewUsername(account.username);
    setCurrentPassword('');
    setError(null);
    setEditingName(true);
  }

  async function saveName(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account: updated } = await api.changeUsername(newUsername, currentPassword);
      onAccountChanged(updated);
      setEditingName(false);
      setSavedNote(true);
      setTimeout(() => setSavedNote(false), 2500);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <button class="btn btn--ghost" onClick={onBack}>
        ← Back
      </button>
      <h2>Settings</h2>

      <h3>Account</h3>
      <div class="settings__account">
        <span class="avatar" style={avatarStyle(account.id)}>
          {initials(account.displayName)}
        </span>
        <span class="settings__name">{account.displayName}</span>
      </div>

      {savedNote && <p class="hint settings__saved">Name updated.</p>}

      {!editingName ? (
        <button class="btn" onClick={startEditingName}>
          Change name
        </button>
      ) : (
        <form onSubmit={saveName} class="settings__editform">
          {error && <p class="error">{error}</p>}
          <label class="field">
            New name
            <input
              value={newUsername}
              onInput={(e) => setNewUsername(e.currentTarget.value)}
              maxLength={24}
              required
              autoFocus
              dir="auto"
            />
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
          <div class="actions">
            <button type="button" class="btn" onClick={() => setEditingName(false)} disabled={busy}>
              Cancel
            </button>
            <button type="submit" class="btn btn--primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save name'}
            </button>
          </div>
        </form>
      )}

      <h3>Session</h3>
      <button class="btn btn--danger" onClick={() => setConfirmingLogout(true)}>
        Log out
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
