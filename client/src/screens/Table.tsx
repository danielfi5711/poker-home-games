import { useState } from 'preact/hooks';
import type { BuyIn, Session } from '../../../src/shared/types.js';
import { MAX_BUY_IN_CENTS, totalCashOutCents } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { AmountModal } from './AmountModal.js';
import { ConfirmModal } from './ConfirmModal.js';
import { SettleSheet } from './SettleSheet.js';
import { tr } from '../i18n.js';
import { openProfile } from '../profileNav.js';
import { BellIcon, PlusIcon } from '../icons.js';
import { Avatar, Money, SectionLabel, Sheet } from '../ui.js';

interface Props {
  session: Session;
  playerId: string;
  isHost: boolean;
  onChanged: (session: Session) => void;
  onSettled: (session: Session) => void;
  onLeave: () => void;
}

function approvedTotal(buyIns: BuyIn[]): number {
  return buyIns.filter((b) => b.status === 'approved').reduce((sum, b) => sum + b.amountCents, 0);
}

export function TableScreen({ session, playerId, isHost, onChanged, onSettled, onLeave }: Props) {
  const [flow, setFlow] = useState<'buyin' | null>(null);
  /** Whose cash-out is being entered — your own, or (host only) another player's. */
  const [cashOutFor, setCashOutFor] = useState<string | null>(null);
  const [settleOpen, setSettleOpen] = useState(false);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  /** Host: whose approved buy-ins are listed for removal, then the one being confirmed. */
  const [buyInsFor, setBuyInsFor] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ name: string; buyIn: BuyIn } | null>(null);
  const [confirmClose, setConfirmClose] = useState(false);

  const me = session.players[playerId]!;
  const players = Object.values(session.players).sort((a, b) => a.joinedAt - b.joinedAt);
  // Until someone buys in, the host can simply close the table (opened by mistake, game's off).
  const noBuyIns = players.every((p) => p.buyIns.every((b) => b.status === 'denied'));

  async function closeTable() {
    setConfirmClose(false);
    try {
      await api.close(session.id);
    } catch {
      /* already gone, or someone just bought in — the next poll shows which */
      return;
    }
    onLeave();
  }

  const pendingRequests = players.flatMap((p) => p.buyIns.filter((b) => b.status === 'pending').map((b) => ({ player: p, buyIn: b })));
  const myPending = me.buyIns.filter((b) => b.status === 'pending');

  async function respond(buyInId: string, approve: boolean) {
    setRespondingTo(buyInId);
    try {
      const { session: updated } = await api.respondToBuyIn(session.id, buyInId, approve);
      onChanged(updated);
    } catch {
      /* the next poll will reconcile either way */
    } finally {
      setRespondingTo(null);
    }
  }

  async function removeBuyIn(buyInId: string) {
    setRespondingTo(buyInId);
    try {
      const { session: updated } = await api.removeBuyIn(session.id, buyInId);
      onChanged(updated);
    } catch {
      /* the next poll will reconcile either way */
    } finally {
      setRespondingTo(null);
    }
  }

  const pot = players.reduce((sum, p) => sum + approvedTotal(p.buyIns), 0);
  const stillPlaying = players.filter((p) => !p.cashOut).length;

  return (
    <div class="view">
      <section class="tablehead">
        <div class="tablehead__top">
          <span class="row__main">
            <h1 class="tablehead__name">{session.name}</h1>
            <span class="row__sub">
              {tr.table.stillPlaying(stillPlaying, players.length)}
            </span>
          </span>
          <span class="pill pill--up">
            <span class="dot-live" /> {tr.common.live}
          </span>
        </div>
        <div class="stats">
          <div class="stat stat--gold">
            <span class="stat__label">{tr.table.pot}</span>
            <span class="stat__value">{formatCents(pot)}</span>
          </div>
          <div class="stat">
            <span class="stat__label">{tr.table.youreIn}</span>
            <span class="stat__value">{formatCents(approvedTotal(me.buyIns))}</span>
          </div>
          <div class="stat">
            <span class="stat__label">{tr.table.players}</span>
            <span class="stat__value">{players.length}</span>
          </div>
        </div>
      </section>

      {isHost && pendingRequests.length > 0 && (
        <section class="requests">
          <h2 class="requests__title">
            <BellIcon size={15} />
            {tr.table.requests(pendingRequests.length)}
          </h2>
          {pendingRequests.map(({ player, buyIn }) => (
            <div key={buyIn.id} class="request">
              <Avatar id={player.accountId} name={player.name} size="sm" />
              <span class="request__text">
                <strong>{player.name}</strong> · <Money cents={buyIn.amountCents} />
              </span>
              <span class="request__actions">
                <button class="btn btn--sm btn--danger" onClick={() => respond(buyIn.id, false)} disabled={respondingTo === buyIn.id}>
                  {tr.table.deny}
                </button>
                <button class="btn btn--sm btn--success" onClick={() => respond(buyIn.id, true)} disabled={respondingTo === buyIn.id}>
                  {tr.table.approve}
                </button>
              </span>
            </div>
          ))}
        </section>
      )}

      {myPending.length > 0 && (
        <div class="warning mypending">
          <p>{tr.table.myPending(myPending.map((b) => formatCents(b.amountCents)))}</p>
          {myPending.map((b) => (
            <button key={b.id} class="btn btn--sm" onClick={() => removeBuyIn(b.id)} disabled={respondingTo === b.id}>
              {tr.table.cancelRequest(formatCents(b.amountCents))}
            </button>
          ))}
        </div>
      )}

      <SectionLabel count={players.length}>{tr.table.players}</SectionLabel>
      <ul class="surface rows">
        {players.map((p) => {
          const total = approvedTotal(p.buyIns);
          const pending = p.buyIns.filter((b) => b.status === "pending");
          const net = p.cashOut ? totalCashOutCents(p) - total : null;
          return (
            <li key={p.id} class={`row ${p.id === playerId ? "row--me" : ""}`}>
              <button type="button" class="avbtn" onClick={() => openProfile(p.accountId)} aria-label={p.name}>
                <Avatar id={p.accountId} name={p.name} />
              </button>
              <span class="row__main">
                <span class="row__title">
                  {p.name}
                  {p.id === playerId && <span class="muted">{tr.common.youSuffix}</span>}
                </span>
                <span class="seat__status">
                  {isHost && total > 0 ? (
                    <button type="button" class="row__sub row__link" onClick={() => setBuyInsFor(p.id)}>
                      {tr.table.inAmount(formatCents(total))}
                    </button>
                  ) : (
                    <span class="row__sub">{tr.table.inAmount(formatCents(total))}</span>
                  )}
                  {!p.cashOut && p.earlierCashOutsCents ? (
                    <span class="row__sub">{tr.table.outSoFar(formatCents(p.earlierCashOutsCents))}</span>
                  ) : null}
                  {p.id === session.hostPlayerId && <span class="pill pill--gold">{tr.common.host}</span>}
                  {pending.length > 0 && <span class="pill pill--info">{tr.table.pending(pending.map((b) => formatCents(b.amountCents)))}</span>}
                </span>
              </span>
              <span class="row__end">
                {p.cashOut ? (
                  <>
                    <span class="row__sub">{tr.table.outAmount(formatCents(totalCashOutCents(p)))}</span>
                    <Money cents={net!} signed />
                  </>
                ) : isHost && p.id !== playerId ? (
                  <button class="btn btn--sm" onClick={() => setCashOutFor(p.id)}>
                    {tr.table.cashOut}
                  </button>
                ) : (
                  <span class="pill pill--up">{tr.table.playing}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {isHost && noBuyIns && (
        <button class="btn btn--ghost btn--block" onClick={() => setConfirmClose(true)}>
          {tr.table.closeTable}
        </button>
      )}

      {isHost && !noBuyIns && (
        <div class="hostbar">
          <button class="btn btn--lg btn--block" style={{ borderColor: "var(--gold-line)", color: "var(--gold-hi)" }} onClick={() => setSettleOpen(true)}>
            {tr.table.endAndSettle}
          </button>
        </div>
      )}

      <button class="btn btn--ghost btn--block" onClick={onLeave}>
        {tr.common.backToTables}
      </button>

      <div class="actionbar">
        <button class="btn btn--primary btn--lg" onClick={() => setFlow("buyin")}>
          <PlusIcon size={17} /> {tr.table.buyIn}
        </button>
        {!me.cashOut ? (
          <button class="btn btn--lg" onClick={() => setCashOutFor(playerId)}>
            {tr.table.cashOut}
          </button>
        ) : (
          <button class="btn btn--lg" onClick={() => setCashOutFor(playerId)}>
            {myPending.length > 0 ? tr.table.rebuyPending : tr.table.cashedOutEdit(formatCents(totalCashOutCents(me)))}
          </button>
        )}
      </div>

      {settleOpen && (
        <SettleSheet session={session} onChanged={onChanged} onSettled={onSettled} onCancel={() => setSettleOpen(false)} />
      )}

      {flow === 'buyin' && (
        <AmountModal
          title={tr.table.buyIn}
          hint={
            (isHost ? tr.table.buyInHintHost : tr.table.buyInHintPlayer) +
            ' ' +
            tr.table.maxPerBuyIn(formatCents(MAX_BUY_IN_CENTS))
          }
          maxCents={MAX_BUY_IN_CENTS}
          quick={[10, 20, 30, 50]}
          confirmLabel={isHost ? tr.table.addBuyIn : tr.table.sendRequest}
          onCancel={() => setFlow(null)}
          onConfirm={async (amountCents) => {
            const { session: updated } = await api.requestBuyIn(session.id, playerId, amountCents);
            setFlow(null);
            onChanged(updated);
          }}
        />
      )}

      {buyInsFor && session.players[buyInsFor] && (
        <Sheet onClose={() => setBuyInsFor(null)}>
          <h2 class="modal__title">{tr.table.buyInsOf(session.players[buyInsFor].name)}</h2>
          <p class="hint">
            {tr.table.removeHint}
            {buyInsFor !== playerId && tr.table.removeHintNotify}
          </p>
          <ul class="surface rows">
            {session.players[buyInsFor].buyIns
              .filter((b) => b.status === 'approved')
              .map((b) => (
                <li key={b.id} class="row">
                  <span class="row__main">
                    <span class="row__title">
                      <Money cents={b.amountCents} />
                    </span>
                    <span class="row__sub">
                      {new Date(b.respondedAt ?? b.requestedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </span>
                  <button
                    class="btn btn--sm btn--danger"
                    onClick={() => {
                      setRemoving({ name: session.players[buyInsFor]!.name, buyIn: b });
                      setBuyInsFor(null);
                    }}
                  >
                    {tr.table.remove}
                  </button>
                </li>
              ))}
          </ul>
          <button class="btn btn--lg btn--block" onClick={() => setBuyInsFor(null)}>
            {tr.common.back}
          </button>
        </Sheet>
      )}

      {confirmClose && (
        <ConfirmModal
          title={tr.table.closeTitle}
          body={tr.table.closeBody}
          confirmLabel={tr.table.closeTable}
          danger
          onCancel={() => setConfirmClose(false)}
          onConfirm={closeTable}
        />
      )}

      {removing && (
        <ConfirmModal
          title={tr.table.removeTitle(formatCents(removing.buyIn.amountCents), removing.name)}
          body={tr.table.removeBody}
          confirmLabel={tr.table.remove}
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => {
            void removeBuyIn(removing.buyIn.id);
            setRemoving(null);
          }}
        />
      )}

      {cashOutFor && session.players[cashOutFor] && (
        <AmountModal
          title={cashOutFor === playerId ? tr.table.cashOut : tr.table.cashOutName(session.players[cashOutFor].name)}
          hint={
            cashOutFor === playerId
              ? tr.table.cashOutHintSelf
              : tr.table.cashOutHintOther(session.players[cashOutFor].name)
          }
          confirmLabel={tr.table.confirmCashOut}
          allowZero
          initialCents={session.players[cashOutFor].cashOut?.amountCents}
          onCancel={() => setCashOutFor(null)}
          onConfirm={async (amountCents) => {
            const { session: updated } = await api.cashOut(session.id, cashOutFor, amountCents);
            setCashOutFor(null);
            onChanged(updated);
          }}
        />
      )}
    </div>
  );
}
