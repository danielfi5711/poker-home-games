import { useState } from 'preact/hooks';
import type { BuyIn, Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';
import { AmountModal } from './AmountModal.js';
import { BellIcon } from '../icons.js';

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
  const [flow, setFlow] = useState<'buyin' | 'cashout' | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
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

  async function settleGame() {
    setSettling(true);
    setSettleError(null);
    try {
      const { settlement } = await api.settlementPreview(session.id);
      if (!settlement.complete) {
        setSettleError('Everyone needs to cash out first — even for $0 — before you can settle the game.');
        return;
      }
      if (settlement.discrepancyCents !== 0) {
        const ok = confirm(
          `Heads up: the buy-ins and cash-outs are off by ${formatCents(Math.abs(settlement.discrepancyCents))}. Settle anyway?`,
        );
        if (!ok) return;
      }
      const result = await api.settle(session.id);
      onSettled(result.session);
    } catch (err) {
      setSettleError((err as Error).message);
    } finally {
      setSettling(false);
    }
  }

  return (
    <div class="card">
      <h2>{session.name}</h2>

      {isHost && pendingRequests.length > 0 && (
        <div class="requests">
          <h3 class="section-icon">
            <BellIcon size={16} />
            Buy-in requests ({pendingRequests.length})
          </h3>
          <ul class="requests__list">
            {pendingRequests.map(({ player, buyIn }) => (
              <li key={buyIn.id} class="requests__row">
                <span class="avatar avatar--sm" style={avatarStyle(player.accountId)}>
                  {initials(player.name)}
                </span>
                <span class="requests__text">
                  <strong>{player.name}</strong> wants to buy in for <strong>{formatCents(buyIn.amountCents)}</strong>
                </span>
                <span class="requests__actions">
                  <button
                    class="btn btn--small btn--danger"
                    onClick={() => respond(buyIn.id, false)}
                    disabled={respondingTo === buyIn.id}
                  >
                    Deny
                  </button>
                  <button
                    class="btn btn--small btn--success"
                    onClick={() => respond(buyIn.id, true)}
                    disabled={respondingTo === buyIn.id}
                  >
                    Approve
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ul class="playerlist playerlist--table">
        {players.map((p) => {
          const total = approvedTotal(p.buyIns);
          const pending = p.buyIns.filter((b) => b.status === 'pending');
          return (
            <li key={p.id} class={p.id === playerId ? 'playerlist__row--me' : ''}>
              <div class="playerlist__head">
                <span class="avatar" style={avatarStyle(p.accountId)}>
                  {initials(p.name)}
                </span>
                <span class="playerlist__name">
                  {p.name}
                  {p.id === playerId ? ' (you)' : ''}
                </span>
                {p.id === session.hostPlayerId && <span class="badge badge--host">Host</span>}
                {p.cashOut ? <span class="badge badge--done">Cashed out</span> : <span class="badge badge--live">Playing</span>}
              </div>
              <div class="playerlist__meta">
                <span class="playerlist__buyin">Bought in {formatCents(total)}</span>
                {pending.length > 0 && (
                  <span class="playerlist__pending">
                    {pending.map((b) => formatCents(b.amountCents)).join(', ')} awaiting approval
                  </span>
                )}
                {p.cashOut && <span class="playerlist__status">Cashed out {formatCents(p.cashOut.amountCents)}</span>}
              </div>
            </li>
          );
        })}
      </ul>

      {myPending.length > 0 && (
        <p class="hint">
          Your {myPending.length === 1 ? 'request' : 'requests'} for{' '}
          {myPending.map((b) => formatCents(b.amountCents)).join(', ')} {myPending.length === 1 ? 'is' : 'are'} waiting on the host.
        </p>
      )}

      <div class="actions actions--stack">
        <button class="btn btn--primary btn--big" onClick={() => setFlow('buyin')}>
          + Request a buy-in
        </button>
        {!me.cashOut && (
          <button class="btn btn--big" onClick={() => setFlow('cashout')}>
            Cash out
          </button>
        )}
      </div>

      {isHost && (
        <div class="host-panel">
          {settleError && <p class="error">{settleError}</p>}
          <button class="btn btn--primary" onClick={settleGame} disabled={settling}>
            {settling ? 'Settling…' : 'Settle game'}
          </button>
        </div>
      )}

      <button class="btn btn--ghost" onClick={onLeave}>
        Leave
      </button>

      {flow === 'buyin' && (
        <AmountModal
          title="Request a buy-in"
          hint={isHost ? 'As the host, your own buy-ins are approved automatically.' : "The host will need to approve this before it counts."}
          confirmLabel={isHost ? 'Add buy-in' : 'Send request'}
          onCancel={() => setFlow(null)}
          onConfirm={async (amountCents) => {
            const { session: updated } = await api.requestBuyIn(session.id, playerId, amountCents);
            setFlow(null);
            onChanged(updated);
          }}
        />
      )}

      {flow === 'cashout' && (
        <AmountModal
          title="Cash out"
          hint="Enter what you're leaving the table with — it's fine to enter $0."
          confirmLabel="Confirm cash-out"
          allowZero
          onCancel={() => setFlow(null)}
          onConfirm={async (amountCents) => {
            const { session: updated } = await api.cashOut(session.id, playerId, amountCents);
            setFlow(null);
            onChanged(updated);
          }}
        />
      )}
    </div>
  );
}
