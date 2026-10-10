import { useState } from 'preact/hooks';
import { parseShekelsToCents } from '../money.js';
import { Sheet } from '../ui.js';

interface Props {
  title: string;
  hint: string;
  confirmLabel: string;
  /** Cash-outs are allowed to be ₪0 (busted out); buy-ins must be worth something. */
  allowZero?: boolean;
  /** Largest allowed amount, in cents. */
  maxCents?: number;
  /** Quick-pick amounts in shekels. */
  quick?: number[];
  onCancel: () => void;
  onConfirm: (amountCents: number) => Promise<void>;
}

const QUICK = [50, 100, 200, 500];

export function AmountModal({ title, hint, confirmLabel, allowZero, maxCents, quick, onCancel, onConfirm }: Props) {
  const [shekels, setShekels] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountCents = parseShekelsToCents(shekels);
  const tooBig = maxCents !== undefined && amountCents > maxCents;
  const valid = (allowZero ? amountCents >= 0 && shekels.trim() !== '' : amountCents > 0) && !tooBig;

  async function submit(e: Event) {
    e.preventDefault();
    if (!valid || busy) return;
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
    <Sheet onClose={() => !busy && onCancel()}>
      <h2 class="modal__title">{title}</h2>
      <p class="hint">{hint}</p>
      {error && <p class="error">{error}</p>}

      <form onSubmit={submit}>
        <label class="amount">
          <span class="amount__sign">₪</span>
          <input
            autoFocus
            inputMode="decimal"
            placeholder="0"
            value={shekels}
            onInput={(e) => setShekels(e.currentTarget.value)}
            class="amount__input"
            style={{ width: `${Math.max(1, shekels.length || 1) + 0.4}ch` }}
            aria-label="Amount in shekels"
          />
        </label>

        {tooBig && <p class="error">That's over the ₪{maxCents! / 100} limit for one buy-in.</p>}

        <div class="quick">
          {(quick ?? (allowZero ? [0, ...QUICK.slice(0, 3)] : QUICK)).map((n) => (
            <button type="button" key={n} onClick={() => setShekels(String(n))}>
              ₪{n}
            </button>
          ))}
        </div>

        <div class="btnrow">
          <button type="button" class="btn btn--lg" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="submit" class="btn btn--primary btn--lg" disabled={busy || !valid}>
            {busy ? 'Saving…' : confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
