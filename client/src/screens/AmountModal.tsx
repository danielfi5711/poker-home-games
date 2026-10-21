import { useState } from 'preact/hooks';
import { centsToInput, formatCents, parseShekelsToCents } from '../money.js';
import { tr } from '../i18n.js';
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
  /** Prefill, e.g. when editing a cash-out already entered. */
  initialCents?: number;
  onCancel: () => void;
  onConfirm: (amountCents: number) => Promise<void>;
}

const QUICK = [50, 100, 200, 500];

export function AmountModal({ title, hint, confirmLabel, allowZero, maxCents, quick, initialCents, onCancel, onConfirm }: Props) {
  const [shekels, setShekels] = useState(initialCents === undefined ? '' : centsToInput(initialCents));
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
        {/* Amounts read left-to-right even in Hebrew. The field is sized by a hidden copy of the text
            (.amount__field), so the whole amount always shows; long ones step down a size. */}
        <label class={`amount${shekels.length > 9 ? ' amount--xs' : shekels.length > 6 ? ' amount--sm' : ''}`} dir="ltr">
          <span class="amount__sign">₪</span>
          <span class="amount__field" data-value={shekels || '0'}>
            <input
              autoFocus
              inputMode="decimal"
              placeholder="0"
              size={1}
              value={shekels}
              onInput={(e) => setShekels(e.currentTarget.value)}
              class="amount__input"
              aria-label={tr.amount.ariaLabel}
            />
          </span>
        </label>

        {tooBig && <p class="error">{tr.amount.overLimit(formatCents(maxCents!))}</p>}

        <div class="quick">
          {(quick ?? (allowZero ? [0, ...QUICK.slice(0, 3)] : QUICK)).map((n) => (
            <button type="button" key={n} onClick={() => setShekels(String(n))}>
              ₪{n}
            </button>
          ))}
        </div>

        <div class="btnrow">
          <button type="button" class="btn btn--lg" onClick={onCancel} disabled={busy}>
            {tr.common.cancel}
          </button>
          <button type="submit" class="btn btn--primary btn--lg" disabled={busy || !valid}>
            {busy ? tr.common.saving : confirmLabel}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
