import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse, MatchSummary } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';
import { ArrowRightIcon, ChevronDownIcon, ReceiptIcon } from '../icons.js';

interface Props {
  myAccountId: string;
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
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
    <>
      <h2 class="section-icon">
        <ReceiptIcon size={20} />
        Recent Games
      </h2>
      {error && <p class="error">{error}</p>}
      {!data && !error && <p class="muted">Loading…</p>}

      {data &&
        (data.matches.length === 0 ? (
          <p class="muted">No finished games yet — once a host settles a game, its results and payments show up here.</p>
        ) : (
          <ul class="games">
            {data.matches.map((m) => (
              <GameCard
                key={m.id}
                match={m}
                myAccountId={myAccountId}
                open={openId === m.id}
                onToggle={() => setOpenId(openId === m.id ? null : m.id)}
              />
            ))}
          </ul>
        ))}
    </>
  );
}

interface CardProps {
  match: MatchSummary;
  myAccountId: string;
  open: boolean;
  onToggle: () => void;
}

function GameCard({ match, myAccountId, open, onToggle }: CardProps) {
  const players = [...match.players].sort((a, b) => b.netCents - a.netCents);
  const me = match.players.find((p) => p.accountId === myAccountId);

  return (
    <li class={`games__item ${open ? 'games__item--open' : ''}`}>
      <button class="games__head" onClick={onToggle} aria-expanded={open}>
        <span class="games__title">
          <strong>{match.name}</strong>
          <span class="muted">
            {formatDate(match.settledAt)} · {match.players.length} players
          </span>
        </span>
        {me && (
          <span class={`results__net ${me.netCents > 0 ? 'positive' : me.netCents < 0 ? 'negative' : ''}`}>
            {me.netCents > 0 ? '+' : ''}
            {formatCents(me.netCents)}
          </span>
        )}
        <span class="games__chevron">
          <ChevronDownIcon size={18} />
        </span>
      </button>

      <div class="games__body">
        <div class="games__inner">
          <h3>Results</h3>
          <ul class="matches__players">
            {players.map((p) => (
              <li key={p.accountId}>
                <span class="avatar avatar--sm" style={avatarStyle(p.accountId)}>
                  {initials(p.name)}
                </span>
                <span class="matches__playername">
                  {p.name}
                  {p.accountId === myAccountId ? ' (you)' : ''}
                </span>
                <span class={`results__net ${p.netCents > 0 ? 'positive' : p.netCents < 0 ? 'negative' : ''}`}>
                  {p.netCents > 0 ? '+' : ''}
                  {formatCents(p.netCents)}
                </span>
              </li>
            ))}
          </ul>

          <h3>Who pays whom</h3>
          {match.discrepancyCents !== 0 && (
            <p class="warning">
              Buy-ins and cash-outs were off by {formatCents(Math.abs(match.discrepancyCents))} — these payments are the
              best available split.
            </p>
          )}
          {match.transfers.length === 0 ? (
            <p class="muted">Nobody owes anybody — everyone broke even.</p>
          ) : (
            <ul class="transfers">
              {match.transfers.map((t, i) => {
                const mine = t.fromAccountId === myAccountId || t.toAccountId === myAccountId;
                return (
                  <li key={i} class={mine ? 'transfers__row--me' : ''}>
                    <span class="transfers__names">
                      <strong>{t.fromAccountId === myAccountId ? 'You' : t.fromName}</strong>
                      <ArrowRightIcon size={14} />
                      <strong>{t.toAccountId === myAccountId ? 'You' : t.toName}</strong>
                    </span>
                    <span class="transfers__amount">{formatCents(t.amountCents)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </li>
  );
}
