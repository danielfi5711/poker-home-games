import { useState } from 'preact/hooks';
import type { PaymentView } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { formatPhone } from '../phone.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';
import { CheckIcon, WalletIcon } from '../icons.js';

interface Props {
  myAccountId: string;
  payments: PaymentView[] | null;
  error: string | null;
  onChanged: () => void;
}

const BIT_ANDROID_PACKAGE = 'com.bnhp.payments.paymentsapp';
const BIT_PLAY_STORE = `https://play.google.com/store/apps/details?id=${BIT_ANDROID_PACKAGE}`;
const BIT_APP_STORE = 'https://apps.apple.com/il/app/id1182007739';

/**
 * Bit has no public link that pre-fills the recipient or amount, so the best
 * we can do is launch the app: an Android intent (falls back to the Play Store
 * if Bit isn't installed), or the App Store page on iOS, which has "Open".
 */
function openBit(): void {
  if (/Android/i.test(navigator.userAgent)) {
    location.href =
      `intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;` +
      `package=${BIT_ANDROID_PACKAGE};S.browser_fallback_url=${encodeURIComponent(BIT_PLAY_STORE)};end`;
  } else {
    location.href = BIT_APP_STORE;
  }
}

/** Items that need *you* to do something — drives the bottom-nav badge. */
export function paymentsNeedingAction(payments: PaymentView[], myAccountId: string): number {
  return payments.filter(
    (p) =>
      (p.fromAccountId === myAccountId && p.status !== 'confirmed') ||
      (p.toAccountId === myAccountId && p.status === 'awaiting_confirmation'),
  ).length;
}

function Person({ accountId, name }: { accountId: string; name: string }) {
  return (
    <span class="pay__person">
      <span class="avatar avatar--sm" style={avatarStyle(accountId)}>
        {initials(name)}
      </span>
      <strong>{name}</strong>
    </span>
  );
}

export function PaymentsScreen({ myAccountId, payments, error, onChanged }: Props) {
  const [paying, setPaying] = useState<PaymentView | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const all = payments ?? [];
  const toPay = all.filter((p) => p.fromAccountId === myAccountId && p.status !== 'confirmed');
  const toGet = all.filter((p) => p.toAccountId === myAccountId && p.status !== 'confirmed');
  const done = all.filter((p) => p.status === 'confirmed');

  async function startPay(p: PaymentView) {
    setCopied(false);
    setPaying(p);
    if (p.toPhone) {
      try {
        await navigator.clipboard.writeText(p.toPhone);
        setCopied(true);
      } catch {
        /* clipboard blocked — the number is shown large in the sheet anyway */
      }
    }
  }

  async function openBitFor(p: PaymentView) {
    setActionError(null);
    try {
      await api.startPayment(p.id);
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
      return;
    }
    setPaying(null);
    openBit();
  }

  async function respond(p: PaymentView, received: boolean) {
    setBusyId(p.id);
    setActionError(null);
    try {
      await api.respondPayment(p.id, received);
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div class="card">
      <h2 class="section-icon">
        <WalletIcon size={20} />
        Payments
      </h2>
      {error && <p class="error">{error}</p>}
      {actionError && <p class="error">{actionError}</p>}
      {!payments && !error && <p class="muted">Loading…</p>}

      {payments && (
        <>
          <h3>You need to pay</h3>
          {toPay.length === 0 ? (
            <p class="muted">You're all paid up. 🎉</p>
          ) : (
            <ul class="pay">
              {toPay.map((p) => (
                <li key={p.id} class="pay__item pay__item--owe">
                  <div class="pay__row">
                    <Person accountId={p.toAccountId} name={p.toName} />
                    <span class="pay__amount negative">{formatCents(p.amountCents)}</span>
                  </div>
                  <div class="pay__meta muted">
                    {p.sessionName}
                    {p.status === 'awaiting_confirmation' && <span class="pay__status pay__status--wait">Waiting for {p.toName} to confirm</span>}
                  </div>
                  <button class="btn btn--primary pay__bit" onClick={() => startPay(p)}>
                    {p.status === 'awaiting_confirmation' ? 'Pay again with Bit' : 'Pay with Bit'}
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3>You need to get</h3>
          {toGet.length === 0 ? (
            <p class="muted">Nobody owes you anything right now.</p>
          ) : (
            <ul class="pay">
              {toGet.map((p) => (
                <li key={p.id} class={`pay__item ${p.status === 'awaiting_confirmation' ? 'pay__item--ask' : ''}`}>
                  <div class="pay__row">
                    <Person accountId={p.fromAccountId} name={p.fromName} />
                    <span class="pay__amount positive">{formatCents(p.amountCents)}</span>
                  </div>
                  <div class="pay__meta muted">{p.sessionName}</div>
                  {p.status === 'awaiting_confirmation' ? (
                    <>
                      <p class="pay__question">Did {p.fromName} send you {formatCents(p.amountCents)} on Bit?</p>
                      <div class="actions">
                        <button class="btn btn--danger" onClick={() => respond(p, false)} disabled={busyId === p.id}>
                          Not yet
                        </button>
                        <button class="btn btn--success" onClick={() => respond(p, true)} disabled={busyId === p.id}>
                          <CheckIcon size={14} /> Got it
                        </button>
                      </div>
                    </>
                  ) : (
                    <span class="pay__status">Waiting for {p.fromName} to pay</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {done.length > 0 && (
            <>
              <button class="btn btn--ghost btn--between" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                <span>Done ({done.length})</span>
                <span class="muted">{showDone ? 'Hide' : 'Show'}</span>
              </button>
              {showDone && (
                <ul class="transfers">
                  {done.map((p) => (
                    <li key={p.id}>
                      <span class="transfers__names">
                        <strong>{p.fromAccountId === myAccountId ? 'You' : p.fromName}</strong>→
                        <strong>{p.toAccountId === myAccountId ? 'You' : p.toName}</strong>
                        <span class="muted">· {p.sessionName}</span>
                      </span>
                      <span class="pay__done">
                        {formatCents(p.amountCents)} <CheckIcon size={13} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}

      {paying && (
        <div class="modal" onClick={(e) => e.target === e.currentTarget && setPaying(null)}>
          <div class="modal__panel">
            <div class="modal__handle" />
            <h2>Pay {paying.toName}</h2>
            <div class="pay__sheet">
              <div class="pay__sheet-row">
                <span class="muted">Amount</span>
                <span class="pay__sheet-amount">{formatCents(paying.amountCents)}</span>
              </div>
              <div class="pay__sheet-row">
                <span class="muted">Phone</span>
                <span class="pay__sheet-phone" dir="ltr">
                  {paying.toPhone ? formatPhone(paying.toPhone) : 'No number yet'}
                </span>
              </div>
            </div>
            <p class="hint">
              {paying.toPhone
                ? copied
                  ? `${paying.toName}'s number is copied — in Bit, paste it as the recipient and enter ${formatCents(paying.amountCents)}.`
                  : `In Bit, send ${formatCents(paying.amountCents)} to the number above.`
                : `${paying.toName} hasn't added a phone number yet — ask them for it.`}{' '}
              {paying.toName} will be asked to confirm a minute later.
            </p>
            <div class="actions">
              <button class="btn" onClick={() => setPaying(null)}>
                Cancel
              </button>
              <button class="btn btn--primary" onClick={() => openBitFor(paying)}>
                Open Bit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
