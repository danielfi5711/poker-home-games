import { useEffect, useState } from 'preact/hooks';
import type { Session, SettlementResult } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { ArrowRightIcon } from '../icons.js';
import { Avatar, Money, SectionLabel, Spinner } from '../ui.js';
import { tr } from '../i18n.js';
import { profileTap } from '../profileNav.js';

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
        <span class="finale__label">{session.name} · {tr.settlement.final}</span>
        {settlement ? (
          <>
            <Money cents={myNet} signed size="xl" />
            <p class="hint">
              {myNet > 0 ? tr.settlement.won : myNet < 0 ? tr.settlement.lost : tr.settlement.even}
              {myTransfers.length > 0 && tr.settlement.seePayments}
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
              {tr.settlement.offBy(formatCents(Math.abs(settlement.discrepancyCents)))}
            </p>
          )}

          <SectionLabel>{tr.settlement.results}</SectionLabel>
          <ul class="surface rows">
            {ranked.map((p, i) => (
              <li key={p.id} class={`row tappable ${p.id === playerId ? 'row--me' : ''}`} {...profileTap(p.accountId)}>
                <span class="rank">{i + 1}</span>
                <Avatar id={p.accountId} name={p.name} />
                <span class="row__main">
                  <span class="row__title">
                    {p.name}
                    {p.id === playerId && <span class="muted">{tr.common.youSuffix}</span>}
                  </span>
                </span>
                <Money cents={settlement.netsCents[p.id] ?? 0} signed size="lg" />
              </li>
            ))}
          </ul>

          <SectionLabel>{tr.settlement.whoPaysWhom}</SectionLabel>
          {settlement.transfers.length === 0 ? (
            <p class="muted">{tr.settlement.allEven}</p>
          ) : (
            <div class="stack stack--tight">
              {settlement.transfers.map((t, i) => {
                const mine = t.fromPlayerId === playerId || t.toPlayerId === playerId;
                return (
                  <div key={i} class={`transfer ${mine ? 'transfer--me' : ''}`}>
                    <span class="transfer__names">
                      <strong>{t.fromPlayerId === playerId ? tr.common.you : session.players[t.fromPlayerId]?.name}</strong>
                      <span class="transfer__arrow">
                        <ArrowRightIcon size={14} />
                      </span>
                      <strong>{t.toPlayerId === playerId ? tr.common.you : session.players[t.toPlayerId]?.name}</strong>
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
        {myTransfers.length > 0 ? tr.settlement.goToPayments : tr.settlement.done}
      </button>
    </div>
  );
}
