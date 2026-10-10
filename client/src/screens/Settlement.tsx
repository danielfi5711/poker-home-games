import { useEffect, useState } from 'preact/hooks';
import type { Session, SettlementResult } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { ArrowRightIcon } from '../icons.js';
import { Avatar, Money, SectionLabel, Spinner } from '../ui.js';

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

  const players = Object.values(session.players);
  const ranked = settlement ? [...players].sort((a, b) => (settlement.netsCents[b.id] ?? 0) - (settlement.netsCents[a.id] ?? 0)) : players;
  const myNet = settlement?.netsCents[playerId] ?? 0;
  const myTransfers = settlement?.transfers.filter((t) => t.fromPlayerId === playerId || t.toPlayerId === playerId) ?? [];

  return (
    <div class="view">
      <section class="finale">
        <span class="finale__label">{session.name} · Final</span>
        {settlement ? (
          <>
            <Money cents={myNet} signed size="xl" />
            <p class="hint">
              {myNet > 0 ? 'Nice — you won tonight.' : myNet < 0 ? 'Rough night. Next time.' : 'You broke even.'}
              {myTransfers.length > 0 && ' Your payments are in the Payments tab.'}
            </p>
          </>
        ) : (
          !error && <Spinner />
        )}
      </section>

      {error && <p class="error">{error}</p>}

      {settlement && (
        <>
          {settlement.discrepancyCents !== 0 && (
            <p class="warning">
              Buy-ins and cash-outs are off by {formatCents(Math.abs(settlement.discrepancyCents))} — payments below are the best available split.
            </p>
          )}

          <SectionLabel>Results</SectionLabel>
          <ul class="surface rows">
            {ranked.map((p, i) => (
              <li key={p.id} class={`row ${p.id === playerId ? 'row--me' : ''}`}>
                <span class="rank">{i + 1}</span>
                <Avatar id={p.accountId} name={p.name} />
                <span class="row__main">
                  <span class="row__title">
                    {p.name}
                    {p.id === playerId && <span class="muted"> · you</span>}
                  </span>
                </span>
                <Money cents={settlement.netsCents[p.id] ?? 0} signed size="lg" />
              </li>
            ))}
          </ul>

          <SectionLabel>Who pays whom</SectionLabel>
          {settlement.transfers.length === 0 ? (
            <p class="muted">Nobody owes anybody — everyone broke even.</p>
          ) : (
            <div class="stack stack--tight">
              {settlement.transfers.map((t, i) => {
                const mine = t.fromPlayerId === playerId || t.toPlayerId === playerId;
                return (
                  <div key={i} class={`transfer ${mine ? 'transfer--me' : ''}`}>
                    <span class="transfer__names">
                      <strong>{t.fromPlayerId === playerId ? 'You' : session.players[t.fromPlayerId]?.name}</strong>
                      <span class="transfer__arrow">
                        <ArrowRightIcon size={14} />
                      </span>
                      <strong>{t.toPlayerId === playerId ? 'You' : session.players[t.toPlayerId]?.name}</strong>
                    </span>
                    <Money cents={t.amountCents} />
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      <button class="btn btn--primary btn--lg btn--block" onClick={onLeave}>
        {myTransfers.length > 0 ? 'Go to payments' : 'Done'}
      </button>
    </div>
  );
}
