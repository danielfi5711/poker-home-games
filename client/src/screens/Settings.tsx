import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { ConfirmModal } from './ConfirmModal.js';
import { PhoneForm } from './PhoneForm.js';
import { formatPhone } from '../phone.js';
import { ArrowLeftIcon, CameraIcon, LogoutIcon, PhoneIcon, UserIcon } from '../icons.js';
import { photoToJpeg, setAvatarVersions, useAvatarUrl } from '../avatars.js';
import { Avatar, LangSwitch, ScreenHead, SectionLabel } from '../ui.js';
import { tr } from '../i18n.js';

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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const hasPhoto = useAvatarUrl(account.id) !== null;

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
      flash(tr.settings.nameUpdated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function pickPhoto(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // picking the same file again should still fire
    if (!file) return;
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      let image: string;
      try {
        image = await photoToJpeg(file);
      } catch {
        throw new Error(tr.settings.photoUnreadable);
      }
      setAvatarVersions((await api.setAvatar(image)).avatars);
      flash(tr.settings.photoUpdated);
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function removePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      setAvatarVersions((await api.removeAvatar()).avatars);
      flash(tr.settings.photoRemoved);
    } catch (err) {
      setPhotoError((err as Error).message);
    } finally {
      setPhotoBusy(false);
    }
  }

  return (
    <div class="view">
      <ScreenHead
        title={tr.settings.title}
        action={
          <button class="iconbtn" onClick={onBack} aria-label={tr.common.back}>
            <ArrowLeftIcon />
          </button>
        }
      />

      <section class="surface profile">
        <label class={`profile__photo ${photoBusy ? 'profile__photo--busy' : ''}`} aria-label={hasPhoto ? tr.settings.changePhoto : tr.settings.addPhoto}>
          <Avatar id={account.id} name={account.displayName} size="xl" />
          <span class="profile__cam">
            <CameraIcon size={14} />
          </span>
          <input type="file" accept="image/*" class="sr-only" onChange={pickPhoto} disabled={photoBusy} />
        </label>
        <span class="row__main">
          <span class="profile__name">{account.displayName}</span>
          <span class="row__sub">
            {account.phone ? <bdi dir="ltr">{formatPhone(account.phone)}</bdi> : tr.settings.noPhone}
          </span>
          <span class="profile__photoactions">
            {photoBusy ? (
              <span class="profile__photolink">{tr.settings.uploadingPhoto}</span>
            ) : (
              <>
                <label class="profile__photolink">
                  {hasPhoto ? tr.settings.changePhoto : tr.settings.addPhoto}
                  <input type="file" accept="image/*" class="sr-only" onChange={pickPhoto} />
                </label>
                {hasPhoto && (
                  <button class="profile__photolink profile__photolink--muted" onClick={removePhoto}>
                    {tr.settings.removePhoto}
                  </button>
                )}
              </>
            )}
          </span>
        </span>
      </section>

      {photoError && <p class="error">{photoError}</p>}
      {saved && <p class="saved">✓ {saved}</p>}

      <SectionLabel>{tr.settings.account}</SectionLabel>
      <div class="surface">
        <div class="setting">
          <span class="setting__icon">
            <UserIcon />
          </span>
          <span class="setting__main">
            <span class="setting__label">{tr.settings.name}</span>
            <span class="setting__value">{account.displayName}</span>
          </span>
          {editing !== 'name' && (
            <button class="btn btn--sm" onClick={startEditingName}>
              {tr.settings.change}
            </button>
          )}
        </div>
        {editing === 'name' && (
          <div style={{ padding: '0 16px 16px' }}>
            <form onSubmit={saveName}>
              {error && <p class="error">{error}</p>}
              <label class="field">
                {tr.settings.newName}
                <input value={newUsername} onInput={(e) => setNewUsername(e.currentTarget.value)} maxLength={24} required autoFocus dir="auto" />
              </label>
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
              <div class="btnrow">
                <button type="button" class="btn" onClick={() => setEditing(null)} disabled={busy}>
                  {tr.common.cancel}
                </button>
                <button type="submit" class="btn btn--primary" disabled={busy}>
                  {busy ? tr.common.saving : tr.settings.saveName}
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
            <span class="setting__label">{tr.settings.phoneLabel}</span>
            <span class="setting__value">
              {account.phone ? <bdi dir="ltr">{formatPhone(account.phone)}</bdi> : tr.settings.notSet}
            </span>
          </span>
          {editing !== 'phone' && (
            <button class="btn btn--sm" onClick={() => setEditing('phone')}>
              {tr.settings.change}
            </button>
          )}
        </div>
        {editing === 'phone' && (
          <div style={{ padding: '0 16px 16px' }}>
            <PhoneForm
              initial={account.phone ?? ''}
              submitLabel={tr.settings.saveNumber}
              onCancel={() => setEditing(null)}
              onSaved={(updated) => {
                onAccountChanged(updated);
                setEditing(null);
                flash(tr.settings.phoneUpdated);
              }}
            />
          </div>
        )}
      </div>

      <SectionLabel>{tr.settings.language}</SectionLabel>
      <LangSwitch />

      <button class="btn btn--danger btn--lg btn--block" onClick={() => setConfirmingLogout(true)}>
        <LogoutIcon /> {tr.settings.logOut}
      </button>

      {confirmingLogout && (
        <ConfirmModal
          title={tr.settings.logOutTitle}
          body={tr.settings.logOutBody}
          confirmLabel={tr.settings.logOut}
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
