import { useState } from "preact/hooks";
import type { PaymentView } from "../../../src/shared/types.js";
import { api } from "../api.js";
import { formatCents } from "../money.js";
import { formatPhone } from "../phone.js";
import { ArrowRightIcon, CheckIcon, CopyIcon, WalletIcon } from "../icons.js";
import {
  Avatar,
  Empty,
  Money,
  ScreenHead,
  SectionLabel,
  Spinner,
  Sheet,
} from "../ui.js";

interface Props {
  myAccountId: string;
  payments: PaymentView[] | null;
  error: string | null;
  onChanged: () => void;
}

const BIT_ANDROID_PACKAGE = "com.bnhp.payments.paymentsapp";
const BIT_PLAY_STORE = `https://play.google.com/store/apps/details?id=${BIT_ANDROID_PACKAGE}`;
const BIT_APP_STORE = "https://apps.apple.com/il/app/id1182007739";

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
export function paymentsNeedingAction(
  payments: PaymentView[],
  myAccountId: string,
): number {
  return payments.filter(
    (p) =>
      (p.fromAccountId === myAccountId && p.status !== "confirmed") ||
      (p.toAccountId === myAccountId && p.status === "awaiting_confirmation"),
  ).length;
}

const sum = (list: PaymentView[]) =>
  list.reduce((n, p) => n + p.amountCents, 0);

export function PaymentsScreen({
  myAccountId,
  payments,
  error,
  onChanged,
}: Props) {
  const [paying, setPaying] = useState<PaymentView | null>(null);
  const [copied, setCopied] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const all = payments ?? [];
  const toPay = all.filter(
    (p) => p.fromAccountId === myAccountId && p.status !== "confirmed",
  );
  const toGet = all.filter(
    (p) => p.toAccountId === myAccountId && p.status !== "confirmed",
  );
  const done = all.filter((p) => p.status === "confirmed");
  // Payments waiting on *my* confirmation float to the top.
  const toGetSorted = [...toGet].sort(
    (a, b) =>
      Number(b.status === "awaiting_confirmation") -
      Number(a.status === "awaiting_confirmation"),
  );

  async function copyPhone(p: PaymentView) {
    if (!p.toPhone) return;
    try {
      await navigator.clipboard.writeText(p.toPhone);
      setCopied(true);
    } catch {
      /* clipboard blocked — the number is shown large anyway */
    }
  }

  async function startPay(p: PaymentView) {
    setCopied(false);
    setPaying(p);
    await copyPhone(p);
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
    <div class="view">
      <ScreenHead
        title="Payments"
        sub="Settle up after the game — confirmed by whoever gets paid."
      />
      {error && <p class="error">{error}</p>}
      {actionError && <p class="error">{actionError}</p>}
      {!payments && !error && <Spinner />}

      {payments && (
        <>
          <div class="balance">
            <div class="balance__box balance__box--owe">
              <span class="balance__label">You owe</span>
              <Money
                cents={sum(toPay)}
                size="lg"
                class={toPay.length ? "money--down" : "money--even"}
              />
            </div>
            <div class="balance__box balance__box--get">
              <span class="balance__label">You're owed</span>
              <Money
                cents={sum(toGet)}
                size="lg"
                class={toGet.length ? "money--up" : "money--even"}
              />
            </div>
          </div>

          {toPay.length === 0 && toGet.length === 0 && (
            <Empty icon={<WalletIcon size={24} />} title="All square">
              Nobody owes anybody right now.
            </Empty>
          )}

          {toPay.length > 0 && (
            <>
              <SectionLabel count={toPay.length}>You need to pay</SectionLabel>
              {toPay.map((p) => (
                <div key={p.id} class="surface paycard">
                  <div class="paycard__top">
                    <Avatar id={p.toAccountId} name={p.toName} />
                    <span class="row__main">
                      <span class="row__title">{p.toName}</span>
                      <span class="row__sub">{p.sessionName}</span>
                    </span>
                    <Money
                      cents={p.amountCents}
                      size="lg"
                      class="money--down"
                    />
                  </div>
                  {p.status === "awaiting_confirmation" && (
                    <span
                      class="pill pill--gold"
                      style={{ alignSelf: "flex-start" }}
                    >
                      Waiting for {p.toName} to confirm
                    </span>
                  )}
                  <button
                    class="btn btn--lg btn--block bitbtn"
                    onClick={() => startPay(p)}
                  >
                    <span class="bitbtn__mark">bit</span>
                    {p.status === "awaiting_confirmation"
                      ? "Pay again"
                      : `Pay ${formatCents(p.amountCents)}`}
                  </button>
                </div>
              ))}
            </>
          )}

          {toGet.length > 0 && (
            <>
              <SectionLabel count={toGet.length}>You need to get</SectionLabel>
              {toGetSorted.map((p) => {
                const ask = p.status === "awaiting_confirmation";
                return (
                  <div
                    key={p.id}
                    class={`surface paycard ${ask ? "paycard--ask" : ""}`}
                  >
                    <div class="paycard__top">
                      <Avatar id={p.fromAccountId} name={p.fromName} />
                      <span class="row__main">
                        <span class="row__title">{p.fromName}</span>
                        <span class="row__sub">{p.sessionName}</span>
                      </span>
                      <Money
                        cents={p.amountCents}
                        size="lg"
                        class="money--up"
                      />
                    </div>
                    {ask ? (
                      <>
                        <p class="paycard__question">
                          Did {p.fromName} send you {formatCents(p.amountCents)}{" "}
                          on Bit?
                        </p>
                        <div class="btnrow">
                          <button
                            class="btn btn--danger"
                            onClick={() => respond(p, false)}
                            disabled={busyId === p.id}
                          >
                            Not yet
                          </button>
                          <button
                            class="btn btn--success"
                            onClick={() => respond(p, true)}
                            disabled={busyId === p.id}
                          >
                            <CheckIcon size={15} /> Got it
                          </button>
                        </div>
                      </>
                    ) : (
                      <span class="pill" style={{ alignSelf: "flex-start" }}>
                        Waiting for {p.fromName} to pay
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {done.length > 0 && (
            <>
              <button
                class="btn btn--ghost btn--block"
                onClick={() => setShowDone(!showDone)}
                aria-expanded={showDone}
              >
                {showDone ? "Hide" : "Show"} completed ({done.length})
              </button>
              {showDone && (
                <div class="stack stack--tight">
                  {done.map((p) => (
                    <div key={p.id} class="transfer">
                      <span class="transfer__names">
                        <strong>
                          {p.fromAccountId === myAccountId ? "You" : p.fromName}
                        </strong>
                        <span class="transfer__arrow">
                          <ArrowRightIcon size={14} />
                        </span>
                        <strong>
                          {p.toAccountId === myAccountId ? "You" : p.toName}
                        </strong>
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
          <h2 class="modal__title">Pay {paying.toName}</h2>
          <div class="paysheet">
            <span class="balance__label">Send on Bit</span>
            <Money cents={paying.amountCents} size="xl" />
            {paying.toPhone ? (
              <button
                class="paysheet__phone"
                style={{ border: "none", cursor: "pointer", color: "inherit" }}
                onClick={() => copyPhone(paying)}
              >
                <span dir="ltr">{formatPhone(paying.toPhone)}</span>
                <CopyIcon size={15} />
              </button>
            ) : (
              <span class="muted">
                {paying.toName} hasn't added a phone number yet
              </span>
            )}
            {copied && (
              <span class="copied">✓ Number copied — paste it in Bit</span>
            )}
          </div>
          <p class="hint center">
            {paying.toName} will be asked to confirm a minute after you open
            Bit.
          </p>
          <div class="btnrow">
            <button class="btn" onClick={() => setPaying(null)}>
              Cancel
            </button>
            <button class="btn bitbtn" onClick={() => openBitFor(paying)}>
              <span class="bitbtn__mark">bit</span>
              Open Bit
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}
