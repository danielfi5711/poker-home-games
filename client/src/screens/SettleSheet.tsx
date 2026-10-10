import { useState } from 'preact/hooks';
import type { BuyIn, Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents, parseShekelsToCents } from '../money.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';

interface Props {
  session: Session;
  onChanged: (session: Session) => void;
  onSettled: (session: Session) => void;
  onCancel: () => void;
}

function approvedTotal(buyIns: BuyIn[]): number {
  return buyIns.filter((b) => b.status === 'approved').reduce((sum, b) => sum + b.amountCents, 0);
}

function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/**
 * The host's end-of-game check: every player's cash-out in one place, with a
 * live "money in vs. money out" total, so nothing is silently counted as ₪0.
 */
export function SettleSheet({ session, onChanged, onSettled, onCancel }: Props) {
  const players = Object.values(session.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(players.map((p) => [p.id, p.cashOut ? centsToInput(p.cashOut.amountCents) : ''])),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [acceptMismatch, setAcceptMismatch] = useState(false);

  const pendingCount = players.reduce((n, p) => n + p.buyIns.filter((b) => b.status === 'pending').length, 0);
  const totalIn = players.reduce((sum, p) => sum + approvedTotal(p.buyIns), 0);
  const entered = (id: string) => (values[id] ?? '').trim() !== '';
  const totalOut = players.reduce((sum, p) => sum + (entered(p.id) ? parseShekelsToCents(values[p.id]!) : 0), 0);
  const missing = players.filter((p) => !entered(p.id));
  const diff = totalOut - totalIn; // 0 = balanced
  const invalid = players.some((p) => entered(p.id) && (!Number.isFinite(Number(values[p.id])) || Number(values[p.id]) < 0));

  // With exactly one box left, the remainder is the only number that balances the table.
  const remainder = totalIn - totalOut;
  const canFill = missing.length === 1 && remainder >= 0;

  function setValue(id: string, v: string) {
    setAcceptMismatch(false);
    setValues((prev) => ({ ...prev, [id]: v }));
  }

  async function settle() {
    setBusy(true);
    setError(null);
    try {
      let latest = session;
      for (const p of players) {
        const cents = parseShekelsToCents(values[p.id]!);
        if (p.cashOut?.amountCents === cents) continue;
        ({ session: latest } = await api.cashOut(session.id, p.id, cents));
      }
      onChanged(latest);
      const result = await api.settle(session.id);
      onSettled(result.session);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  const ready = pendingCount === 0 && missing.length === 0 && !invalid;
  const balanced = diff === 0;

  return (
    <div class="modal" onClick={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div class="modal__panel">
        <div class="modal__handle" />
        <h2>Settle "{session.name}"</h2>
        <p class="hint">Enter what each player left the table with — ₪0 if they busted.</p>

        {pendingCount > 0 && (
          <p class="warning">
            {pendingCount} buy-in {pendingCount === 1 ? 'request is' : 'requests are'} still waiting — approve or deny{' '}
            {pendingCount === 1 ? 'it' : 'them'} first.
          </p>
        )}

        <ul class="settle__list">
          {players.map((p) => (
            <li key={p.id} class={`settle__row ${entered(p.id) ? '' : 'settle__row--missing'}`}>
              <span class="avatar avatar--sm" style={avatarStyle(p.accountId)}>
                {initials(p.name)}
              </span>
              <span class="settle__who">
                <strong>{p.name}</strong>
                <span class="muted">In {formatCents(approvedTotal(p.buyIns))}</span>
              </span>
              <span class="amountfield settle__input">
                <span class="amountfield__sign">₪</span>
                <input
                  inputMode="decimal"
                  placeholder="?"
                  value={values[p.id]}
                  onInput={(e) => setValue(p.id, e.currentTarget.value)}
                  class="amountfield__input"
                  aria-label={`${p.name} cash-out`}
                />
              </span>
            </li>
          ))}
        </ul>

        {canFill && (
          <button class="btn btn--small" onClick={() => setValue(missing[0]!.id, centsToInput(remainder))}>
            Fill {missing[0]!.name} with the rest — {formatCents(remainder)}
          </button>
        )}

        <div class={`settle__totals ${missing.length === 0 ? (balanced ? 'settle__totals--ok' : 'settle__totals--off') : ''}`}>
          <span>
            In <strong>{formatCents(totalIn)}</strong>
          </span>
          <span>
            Out <strong>{formatCents(totalOut)}</strong>
          </span>
          <span>
            {missing.length > 0
              ? `${missing.length} missing`
              : balanced
                ? 'Balanced ✓'
                : `${diff > 0 ? 'Over' : 'Short'} by ${formatCents(Math.abs(diff))}`}
          </span>
        </div>

        {ready && !balanced && (
          <label class="settle__accept">
            <input type="checkbox" checked={acceptMismatch} onChange={(e) => setAcceptMismatch(e.currentTarget.checked)} />
            The chips really don't add up — settle anyway, off by {formatCents(Math.abs(diff))}.
          </label>
        )}

        {error && <p class="error">{error}</p>}

        <div class="actions">
          <button class="btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button class="btn btn--primary" onClick={settle} disabled={busy || !ready || (!balanced && !acceptMismatch)}>
            {busy ? 'Settling…' : 'Settle game'}
          </button>
        </div>
      </div>
    </div>
  );
}
