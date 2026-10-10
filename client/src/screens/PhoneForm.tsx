import { useState } from 'preact/hooks';
import type { Account } from '../../../src/shared/types.js';
import { api } from '../api.js';

interface Props {
  initial?: string;
  submitLabel: string;
  onSaved: (account: Account) => void;
  onCancel?: () => void;
}

/** Enter/change your Israeli mobile — the number friends pay you on with Bit. */
export function PhoneForm({ initial = '', submitLabel, onSaved, onCancel }: Props) {
  const [phone, setPhone] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { account } = await api.setPhone(phone);
      onSaved(account);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} class="settings__editform">
      {error && <p class="error">{error}</p>}
      <label class="field">
        Phone number
        <input
          type="tel"
          inputMode="tel"
          dir="ltr"
          value={phone}
          onInput={(e) => setPhone(e.currentTarget.value)}
          placeholder="050-123-4567"
          autocomplete="tel"
          required
          autoFocus
        />
      </label>
      <div class="actions">
        {onCancel && (
          <button type="button" class="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" class="btn btn--primary" disabled={busy}>
          {busy ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  );
}
