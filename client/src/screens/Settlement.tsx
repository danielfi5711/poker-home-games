import { useEffect, useState } from 'preact/hooks';
import type { Session, SettlementResult } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';

interface Props {
  session: Session;
  playerId: string;
  onLeave: () => void;
}

export function SettlementScreen({ session, playerId, onLeave }: Props) {
  const [settlement, setSettlement] = useState<SettlementResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .settlementPreview(session.id)
      .then((r) => setSettlement(r.settlement))
      .catch((err) => setError((err as Error).message));
  }, [session.id]);

  const players = Object.values(session.players).sort((a, b) => a.joinedAt - b.joinedAt);

  return (
    <div class="card">
      <h2>{session.name} — final</h2>

      {error && <p class="error">{error}</p>}
      {!settlement && !error && <p class="muted">Loading…</p>}

      {settlement && (
        <>
          {settlement.discrepancyCents !== 0 && (
            <p class="warning">
              Buy-ins and cash-outs are off by {formatCents(Math.abs(settlement.discrepancyCents))} — someone's chip
              count probably wasn't quite right. Payouts below are still the best available split.
            </p>
          )}

          <h3>Results</h3>
          <ul class="results">
            {players.map((p) => {
              const net = settlement.netsCents[p.id] ?? 0;
              return (
                <li key={p.id} class={p.id === playerId ? 'results__row--me' : ''}>
                  <span class="results__name">
                    {p.name}
                    {p.id === playerId ? ' (you)' : ''}
                  </span>
                  <span class={`results__net ${net > 0 ? 'positive' : net < 0 ? 'negative' : ''}`}>
                    {net > 0 ? '+' : ''}
                    {formatCents(net)}
                  </span>
                </li>
              );
            })}
          </ul>

          <h3>Who pays whom</h3>
          {settlement.transfers.length === 0 ? (
            <p class="muted">Nobody owes anybody — everyone broke even.</p>
          ) : (
            <ul class="transfers">
              {settlement.transfers.map((t, i) => (
                <li key={i}>
                  <strong>{session.players[t.fromPlayerId]?.name}</strong> pays <strong>{session.players[t.toPlayerId]?.name}</strong>{' '}
                  {formatCents(t.amountCents)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      <button class="btn btn--primary" onClick={onLeave}>
        Done
      </button>
    </div>
  );
}
