import { useState } from 'preact/hooks';
import type { BuyIn, Session } from '../../../src/shared/types.js';
import { MAX_BUY_IN_CENTS } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { AmountModal } from './AmountModal.js';
import { SettleSheet } from './SettleSheet.js';
import { tr } from '../i18n.js';
import { BellIcon, PlusIcon } from '../icons.js';
import { Avatar, Money, SectionLabel } from '../ui.js';

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

  const me = session.players[playerId]!;
  const players = Object.values(session.players).sort((a, b) => a.joinedAt - b.joinedAt);

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
        <p class="warning">{tr.table.myPending(myPending.map((b) => formatCents(b.amountCents)))}</p>
      )}

      <SectionLabel count={players.length}>{tr.table.players}</SectionLabel>
      <ul class="surface rows">
        {players.map((p) => {
          const total = approvedTotal(p.buyIns);
          const pending = p.buyIns.filter((b) => b.status === "pending");
          const net = p.cashOut ? p.cashOut.amountCents - total : null;
          return (
            <li key={p.id} class={`row ${p.id === playerId ? "row--me" : ""}`}>
              <Avatar id={p.accountId} name={p.name} />
              <span class="row__main">
                <span class="row__title">
                  {p.name}
                  {p.id === playerId && <span class="muted">{tr.common.youSuffix}</span>}
                </span>
                <span class="seat__status">
                  <span class="row__sub">{tr.table.inAmount(formatCents(total))}</span>
                  {p.id === session.hostPlayerId && <span class="pill pill--gold">{tr.common.host}</span>}
                  {pending.length > 0 && <span class="pill pill--info">{tr.table.pending(pending.map((b) => formatCents(b.amountCents)))}</span>}
                </span>
              </span>
              <span class="row__end">
                {p.cashOut ? (
                  <>
                    <span class="row__sub">{tr.table.outAmount(formatCents(p.cashOut.amountCents))}</span>
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

      {isHost && (
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
          <button class="btn btn--lg" disabled>
            {tr.table.cashedOut(formatCents(me.cashOut.amountCents))}
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
