import { useState } from 'preact/hooks';
import type { PaymentView } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { ArrowRightIcon, CheckIcon, WalletIcon } from '../icons.js';
import { Avatar, Empty, Money, ScreenHead, SectionLabel, Spinner } from '../ui.js';
import { tr } from '../i18n.js';

interface Props {
  myAccountId: string;
  payments: PaymentView[] | null;
  error: string | null;
  onChanged: () => void;
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

export function PaymentsScreen({ myAccountId, payments, error, onChanged }: Props) {
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
                  {p.status === 'awaiting_confirmation' ? (
                    <span class="pill pill--gold" style={{ alignSelf: 'flex-start' }}>
                      {tr.payments.waitingToConfirm(p.toName)}
                    </span>
                  ) : (
                    <button class="btn btn--primary btn--lg btn--block" onClick={() => markPaid(p)} disabled={busyId === p.id}>
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
    </div>
  );
}
