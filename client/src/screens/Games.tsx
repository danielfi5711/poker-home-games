import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse, MatchSummary } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { ArrowRightIcon, ChevronDownIcon, CrownIcon, ReceiptIcon } from '../icons.js';
import { Avatar, Empty, Money, ScreenHead, Spinner } from '../ui.js';

interface Props {
  myAccountId: string;
}

/** Recent finished games: each one's results and who has to pay whom. */
export function GamesScreen({ myAccountId }: Props) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => {
    api
      .history()
      .then((d) => {
        setData(d);
        setOpenId(d.matches[0]?.id ?? null); // newest game starts expanded
      })
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div class="view">
      <ScreenHead title="Games" sub="Every finished game, its results and payments." />
      {error && <p class="error">{error}</p>}
      {!data && !error && <Spinner />}

      {data && data.matches.length === 0 && (
        <Empty icon={<ReceiptIcon size={24} />} title="No finished games yet">
          Once a host settles a game, its results and payments show up here.
        </Empty>
      )}

      {data?.matches.map((m) => (
        <GameCard key={m.id} match={m} myAccountId={myAccountId} open={openId === m.id} onToggle={() => setOpenId(openId === m.id ? null : m.id)} />
      ))}
    </div>
  );
}

interface CardProps {
  match: MatchSummary;
  myAccountId: string;
  open: boolean;
  onToggle: () => void;
}

const statusPill = (status: string | null) =>
  status === 'confirmed' ? (
    <span class="pill pill--up paylabel">Paid ✓</span>
  ) : status === 'awaiting_confirmation' ? (
    <span class="pill pill--gold paylabel">Waiting</span>
  ) : status === 'unpaid' ? (
    <span class="pill pill--down paylabel">Unpaid</span>
  ) : null;

function GameCard({ match, myAccountId, open, onToggle }: CardProps) {
  const players = [...match.players].sort((a, b) => b.netCents - a.netCents);
  const winner = players[0];
  const me = match.players.find((p) => p.accountId === myAccountId);
  const date = new Date(match.settledAt);

  return (
    <article class={`surface game ${open ? 'game--open' : ''}`}>
      <button class="game__head" onClick={onToggle} aria-expanded={open}>
        <span class="game__date">
          <span class="game__day">{date.getDate()}</span>
          <span class="game__month">{date.toLocaleDateString('en-US', { month: 'short' })}</span>
        </span>
        <span class="row__main">
          <span class="row__title">{match.name}</span>
          <span class="row__sub">
            {winner && winner.netCents > 0 ? (
              <>
                <span style={{ color: 'var(--gold)' }}>
                  <CrownIcon size={11} />
                </span>{' '}
                {winner.name} +{formatCents(winner.netCents)} · {match.players.length} players
              </>
            ) : (
              `${match.players.length} players`
            )}
          </span>
        </span>
        {me && <Money cents={me.netCents} signed size="lg" />}
        <span class="game__chev">
          <ChevronDownIcon size={18} />
        </span>
      </button>

      <div class="game__body">
        <div class="game__inner">
          <div class="game__section">
            {players.map((p) => (
              <div key={p.accountId} class={`minirow ${p.accountId === myAccountId ? 'minirow--me' : ''}`}>
                <Avatar id={p.accountId} name={p.name} size="sm" />
                <span class="minirow__name">
                  {p.name}
                  {p.accountId === myAccountId ? ' (you)' : ''}
                </span>
                <Money cents={p.netCents} signed />
              </div>
            ))}
          </div>

          <div class="game__divider" />

          <div class="game__section" style={{ paddingTop: '12px' }}>
            <span class="label" style={{ margin: '0 0 2px' }}>
              Who pays whom
            </span>
            {match.discrepancyCents !== 0 && (
              <p class="warning">Buy-ins and cash-outs were off by {formatCents(Math.abs(match.discrepancyCents))}.</p>
            )}
            {match.transfers.length === 0 ? (
              <p class="muted">Nobody owes anybody — everyone broke even.</p>
            ) : (
              match.transfers.map((t, i) => {
                const mine = t.fromAccountId === myAccountId || t.toAccountId === myAccountId;
                return (
                  <div key={i} class={`transfer ${mine ? 'transfer--me' : ''}`}>
                    <span class="transfer__names">
                      <strong>{t.fromAccountId === myAccountId ? 'You' : t.fromName}</strong>
                      <span class="transfer__arrow">
                        <ArrowRightIcon size={14} />
                      </span>
                      <strong>{t.toAccountId === myAccountId ? 'You' : t.toName}</strong>
                    </span>
                    <Money cents={t.amountCents} />
                    {statusPill(t.status)}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
