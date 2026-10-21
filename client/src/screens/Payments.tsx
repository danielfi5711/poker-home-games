import { useEffect, useRef, useState } from 'preact/hooks';
import type { PaymentView } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { formatPhone } from '../phone.js';
import { ArrowRightIcon, CheckIcon, CopyIcon, WalletIcon } from '../icons.js';
import { Avatar, Empty, Money, ScreenHead, SectionLabel, Spinner, Sheet } from '../ui.js';
import { tr } from '../i18n.js';

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
 * Bit has no public link that pre-fills the recipient or amount (only business
 * accounts get that, via payment providers), so the best we can do is launch
 * the app: an Android intent (falls back to the Play Store if Bit isn't
 * installed), or the App Store page on iOS, which has "Open". Bit's iOS URL
 * scheme isn't documented, and a wrong guess shows an "invalid address" alert,
 * so iOS stays on the App Store page. The pay sheet makes up for the missing
 * pre-fill: the number is copied before Bit opens, and when the player comes
 * back to the app a sheet offers to copy the amount.
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

const sum = (list: PaymentView[]) => list.reduce((n, p) => n + p.amountCents, 0);

/** The amount as Bit's amount field wants it pasted: "120", "12.5" — no ₪, no commas. */
const plainAmount = (cents: number) => String(cents / 100);

type Copied = 'phone' | 'amount' | null;

export function PaymentsScreen({ myAccountId, payments, error, onChanged }: Props) {
  const [paying, setPaying] = useState<PaymentView | null>(null);
  // Shown when the player switches back from Bit — usually to grab the amount.
  const [returned, setReturned] = useState<PaymentView | null>(null);
  const [copied, setCopied] = useState<Copied>(null);
  const sentToBit = useRef<PaymentView | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const all = payments ?? [];
  const toPay = all.filter((p) => p.fromAccountId === myAccountId && p.status !== 'confirmed');
  const toGet = all.filter((p) => p.toAccountId === myAccountId && p.status !== 'confirmed');
  const done = all.filter((p) => p.status === 'confirmed');
  // Payments waiting on *my* confirmation float to the top.
  const toGetSorted = [...toGet].sort(
    (a, b) => Number(b.status === 'awaiting_confirmation') - Number(a.status === 'awaiting_confirmation'),
  );

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState !== 'visible' || !sentToBit.current) return;
      setCopied(null);
      setReturned(sentToBit.current);
      sentToBit.current = null;
    }
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  async function copy(what: 'phone' | 'amount', p: PaymentView) {
    const text = what === 'phone' ? p.toPhone : plainAmount(p.amountCents);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
    } catch {
      /* clipboard blocked — both values are shown large anyway */
    }
  }

  async function startPay(p: PaymentView) {
    setCopied(null);
    setPaying(p);
    await copy('phone', p);
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
    // Re-copy right before leaving, in case the player copied the amount meanwhile.
    await copy('phone', p);
    sentToBit.current = p;
    openBit();
  }

  async function markPaid(p: PaymentView) {
    setBusyId(p.id);
    setActionError(null);
    try {
      await api.markPaid(p.id);
      onChanged();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusyId(null);
    }
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
    <div class="view">
      <ScreenHead title={tr.payments.title} sub={tr.payments.sub} />
      {error && <p class="error">{error}</p>}
      {actionError && <p class="error">{actionError}</p>}
      {!payments && !error && <Spinner />}

      {payments && (
        <>
          <div class="balance">
            <div class="balance__box balance__box--owe">
              <span class="balance__label">{tr.payments.youOwe}</span>
              <Money cents={sum(toPay)} size="lg" class={toPay.length ? 'money--down' : 'money--even'} />
            </div>
            <div class="balance__box balance__box--get">
              <span class="balance__label">{tr.payments.youreOwed}</span>
              <Money cents={sum(toGet)} size="lg" class={toGet.length ? 'money--up' : 'money--even'} />
            </div>
          </div>

          {toPay.length === 0 && toGet.length === 0 && (
            <Empty icon={<WalletIcon size={24} />} title={tr.payments.allSquare}>
              {tr.payments.allSquareSub}
            </Empty>
          )}

          {toPay.length > 0 && (
            <>
              <SectionLabel count={toPay.length}>{tr.payments.needToPay}</SectionLabel>
              {toPay.map((p) => (
                <div key={p.id} class="surface paycard">
                  <div class="paycard__top">
                    <Avatar id={p.toAccountId} name={p.toName} />
                    <span class="row__main">
                      <span class="row__title">{p.toName}</span>
                      <span class="row__sub">{p.sessionName}</span>
                    </span>
                    <Money cents={p.amountCents} size="lg" class="money--down" />
                  </div>
                  {p.status === 'awaiting_confirmation' && (
                    <span class="pill pill--gold" style={{ alignSelf: 'flex-start' }}>
                      {tr.payments.waitingToConfirm(p.toName)}
                    </span>
                  )}
                  <button class="btn btn--lg btn--block bitbtn" onClick={() => startPay(p)}>
                    <span class="bitbtn__mark">bit</span>
                    {p.status === 'awaiting_confirmation' ? tr.payments.payAgain : tr.payments.pay(formatCents(p.amountCents))}
                  </button>
                  {/* Once the receiver has been asked (confirmAskDueAt cleared), there's nothing left to say. */}
                  {!(p.status === 'awaiting_confirmation' && p.confirmAskDueAt === null) && (
                    <button class="btn btn--block" onClick={() => markPaid(p)} disabled={busyId === p.id}>
                      <CheckIcon size={15} /> {tr.payments.iPaid}
                    </button>
                  )}
                </div>
              ))}
            </>
          )}

          {toGet.length > 0 && (
            <>
              <SectionLabel count={toGet.length}>{tr.payments.needToGet}</SectionLabel>
              {toGetSorted.map((p) => {
                const ask = p.status === 'awaiting_confirmation';
                return (
                  <div key={p.id} class={`surface paycard ${ask ? 'paycard--ask' : ''}`}>
                    <div class="paycard__top">
                      <Avatar id={p.fromAccountId} name={p.fromName} />
                      <span class="row__main">
                        <span class="row__title">{p.fromName}</span>
                        <span class="row__sub">{p.sessionName}</span>
                      </span>
                      <Money cents={p.amountCents} size="lg" class="money--up" />
                    </div>
                    {ask ? (
                      <>
                        <p class="paycard__question">
                          {tr.payments.didTheySend(p.fromName, formatCents(p.amountCents))}
                        </p>
                        <div class="btnrow">
                          <button class="btn btn--danger" onClick={() => respond(p, false)} disabled={busyId === p.id}>
                            {tr.payments.notYet}
                          </button>
                          <button class="btn btn--success" onClick={() => respond(p, true)} disabled={busyId === p.id}>
                            <CheckIcon size={15} /> {tr.payments.gotIt}
                          </button>
                        </div>
                      </>
                    ) : (
                      <div class="paycard__wait">
                        <span class="pill">{tr.payments.waitingToPay(p.fromName)}</span>
                        <button class="btn btn--sm btn--success" onClick={() => respond(p, true)} disabled={busyId === p.id}>
                          <CheckIcon size={13} /> {tr.payments.gotIt}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {done.length > 0 && (
            <>
              <button class="btn btn--ghost btn--block" onClick={() => setShowDone(!showDone)} aria-expanded={showDone}>
                {showDone ? tr.payments.hideDone(done.length) : tr.payments.showDone(done.length)}
              </button>
              {showDone && (
                <div class="stack stack--tight">
                  {done.map((p) => (
                    <div key={p.id} class="transfer">
                      <span class="transfer__names">
                        <strong>{p.fromAccountId === myAccountId ? tr.common.you : p.fromName}</strong>
                        <span class="transfer__arrow">
                          <ArrowRightIcon size={14} />
                        </span>
                        <strong>{p.toAccountId === myAccountId ? tr.common.you : p.toName}</strong>
                        <span class="muted">· {p.sessionName}</span>
                      </span>
                      <Money cents={p.amountCents} />
                      <span class="pill pill--up">
                        <CheckIcon size={11} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {paying && (
        <Sheet onClose={() => setPaying(null)}>
          <h2 class="modal__title">{tr.payments.payName(paying.toName)}</h2>
          <ol class="paysteps">
            <li class="paystep">
              <span class="paystep__n">1</span>
              <span class="paystep__body">
                <span class="paystep__text">{tr.payments.step1(paying.toName)}</span>
                {paying.toPhone ? (
                  <button
                    class={`copychip ${copied === 'phone' ? 'copychip--done' : ''}`}
                    onClick={() => copy('phone', paying)}
                  >
                    <span dir="ltr">{formatPhone(paying.toPhone)}</span>
                    {copied === 'phone' ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                  </button>
                ) : (
                  <span class="muted">{tr.payments.noPhone(paying.toName)}</span>
                )}
              </span>
            </li>
            <li class="paystep">
              <span class="paystep__n">2</span>
              <span class="paystep__body">
                <span class="paystep__text">{tr.payments.step2}</span>
                <button
                  class={`copychip copychip--amount ${copied === 'amount' ? 'copychip--done' : ''}`}
                  onClick={() => copy('amount', paying)}
                >
                  {formatCents(paying.amountCents)}
                  {copied === 'amount' ? <CheckIcon size={15} /> : <CopyIcon size={15} />}
                </button>
              </span>
            </li>
            <li class="paystep">
              <span class="paystep__n">3</span>
              <span class="paystep__body">
                <span class="paystep__text">{tr.payments.step3(paying.toName)}</span>
              </span>
            </li>
          </ol>
          <p class="hint center">
            {copied === 'phone' ? tr.payments.numberCopied : ''}{tr.payments.tapToCopy}
          </p>
          <div class="btnrow">
            <button class="btn" onClick={() => setPaying(null)}>
              {tr.common.cancel}
            </button>
            <button class="btn bitbtn" onClick={() => openBitFor(paying)}>
              <span class="bitbtn__mark">bit</span>
              {tr.payments.openBit}
            </button>
          </div>
        </Sheet>
      )}

      {returned && (
        <Sheet onClose={() => setReturned(null)}>
          <h2 class="modal__title">{tr.payments.paying(returned.toName)}</h2>
          <div class="paysheet">
            <span class="balance__label">{tr.payments.amountToSend}</span>
            <Money cents={returned.amountCents} size="xl" />
            {copied && (
              <span class="copied">{copied === 'amount' ? tr.payments.amountCopied : tr.payments.numberCopiedPaste}</span>
            )}
          </div>
          <div class="btnrow">
            <button class="btn" onClick={() => copy('amount', returned)}>
              <CopyIcon size={15} /> {tr.payments.copyAmount}
            </button>
            {returned.toPhone && (
              <button class="btn" onClick={() => copy('phone', returned)}>
                <CopyIcon size={15} /> {tr.payments.copyNumber}
              </button>
            )}
          </div>
          <div class="btnrow">
            <button
              class="btn btn--ghost"
              onClick={() => {
                void markPaid(returned);
                setReturned(null);
              }}
            >
              <CheckIcon size={15} /> {tr.payments.iSentIt}
            </button>
            <button
              class="btn bitbtn"
              onClick={() => {
                sentToBit.current = returned;
                setReturned(null);
                openBit();
              }}
            >
              <span class="bitbtn__mark">bit</span>
              {tr.payments.backToBit}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
