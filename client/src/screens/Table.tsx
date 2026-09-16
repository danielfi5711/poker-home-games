import { useState } from 'preact/hooks';
import type { Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { PhotoFlow } from './PhotoFlow.js';

interface Props {
  session: Session;
  playerId: string;
  isHost: boolean;
  onChanged: (session: Session) => void;
  onSettled: (session: Session) => void;
  onLeave: () => void;
}

export function TableScreen({ session, playerId, isHost, onChanged, onSettled, onLeave }: Props) {
  const [flow, setFlow] = useState<'buyin' | 'cashout' | null>(null);
  const [settling, setSettling] = useState(false);
  const [settleError, setSettleError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const me = session.players[playerId]!;
  const players = Object.values(session.players).sort((a, b) => a.joinedAt - b.joinedAt);
  const shareUrl = `${location.origin}/?join=${session.id}`;

  function buyInTotal(playerBuyIns: { totalCents: number }[]): number {
    return playerBuyIns.reduce((sum, b) => sum + b.totalCents, 0);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
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
          `Heads up: the buy-ins and cash-outs are off by ${formatCents(Math.abs(settlement.discrepancyCents))} ` +
            `(someone's chip count is probably a little off). Settle anyway?`,
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
      <div class="joincode joincode--compact">
        <span class="joincode__value">{session.id}</span>
        <button class="btn btn--small" onClick={copyLink}>
          {copied ? 'Copied!' : 'Share link'}
        </button>
      </div>

      <ul class="playerlist playerlist--table">
        {players.map((p) => {
          const total = buyInTotal(p.buyIns);
          return (
            <li key={p.id} class={p.id === playerId ? 'playerlist__row--me' : ''}>
              <span class="playerlist__name">
                {p.name}
                {p.id === playerId ? ' (you)' : ''}
              </span>
              <span class="playerlist__buyin">bought in {formatCents(total)}</span>
              <span class="playerlist__status">{p.cashOut ? `cashed out ${formatCents(p.cashOut.totalCents)}` : 'still playing'}</span>
            </li>
          );
        })}
      </ul>

      <div class="actions actions--stack">
        <button class="btn btn--primary btn--big" onClick={() => setFlow('buyin')}>
          + Add my buy-in
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

      {flow && (
        <PhotoFlow
          session={session}
          playerId={playerId}
          mode={flow}
          onCancel={() => setFlow(null)}
          onDone={(s) => {
            setFlow(null);
            onChanged(s);
          }}
        />
      )}
    </div>
  );
}
