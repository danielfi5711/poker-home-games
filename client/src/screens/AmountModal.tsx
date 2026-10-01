import { useState } from 'preact/hooks';
import { parseDollarsToCents, formatCents } from '../money.js';

interface Props {
  title: string;
  hint: string;
  confirmLabel: string;
  /** Cash-outs are allowed to be $0 (busted out); buy-ins must be worth something. */
  allowZero?: boolean;
  onCancel: () => void;
  onConfirm: (amountCents: number) => Promise<void>;
}

export function AmountModal({ title, hint, confirmLabel, allowZero, onCancel, onConfirm }: Props) {
  const [dollars, setDollars] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseDollarsToCents(dollars);
  const valid = allowZero ? amountCents >= 0 && dollars.trim() !== '' : amountCents > 0;

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm(amountCents);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <div class="modal">
      <div class="modal__panel">
        <div class="modal__handle" />
        <h2>{title}</h2>
        <p class="hint">{hint}</p>
        {error && <p class="error">{error}</p>}

        <form onSubmit={submit}>
          <label class="field">
            Amount
            <div class="amountfield">
              <span class="amountfield__sign">$</span>
              <input
                autoFocus
                inputMode="decimal"
                placeholder="0.00"
                value={dollars}
                onInput={(e) => setDollars(e.currentTarget.value)}
                class="amountfield__input"
              />
            </div>
          </label>

          <div class="amountfield__preview">{formatCents(amountCents)}</div>

          <div class="actions">
            <button type="button" class="btn" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" class="btn btn--primary" disabled={busy || !valid}>
              {busy ? 'Saving…' : confirmLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
