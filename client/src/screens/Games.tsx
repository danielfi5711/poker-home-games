import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse, MatchSummary, Session } from '../../../src/shared/types.js';
import { canReopen } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { ConfirmModal } from './ConfirmModal.js';
import { formatCents } from '../money.js';
import { ArrowRightIcon, ChevronDownIcon, CrownIcon, ReceiptIcon } from '../icons.js';
import { Avatar, Empty, Money, ScreenHead, Spinner } from '../ui.js';
import { locale, tr } from '../i18n.js';
import { profileTap } from '../profileNav.js';

interface Props {
  myAccountId: string;
  onEnterSession: (session: Session, playerId: string) => void;
}

/** Recent finished games: each one's results and who has to pay whom. */
export function GamesScreen({ myAccountId, onEnterSession }: Props) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reopening, setReopening] = useState<string | null>(null);

  // The host reopens a just-settled game and lands back at its (live again) table.
  async function reopen(id: string) {
    setReopening(null);
    setError(null);
    try {
      await api.reopen(id);
      const { session, playerId } = await api.join(id);
      onEnterSession(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  useEffect(() => {
    api
      .history()
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <div class="view">
      <ScreenHead title={tr.games.title} sub={tr.games.sub} />
      {error && <p class="error">{error}</p>}
      {!data && !error && <Spinner />}

      {data && data.matches.length === 0 && (
        <Empty icon={<ReceiptIcon size={24} />} title={tr.games.empty}>
          {tr.games.emptySub}
        </Empty>
      )}

      {data?.matches.map((m) => (
        <GameCard
          key={m.id}
          match={m}
          myAccountId={myAccountId}
          open={openId === m.id}
          onToggle={() => setOpenId(openId === m.id ? null : m.id)}
          onReopen={() => setReopening(m.id)}
        />
      ))}

      {reopening && (
        <ConfirmModal
          title={tr.settlement.reopenTitle}
          body={tr.settlement.reopenBody}
          confirmLabel={tr.settlement.reopen}
          onCancel={() => setReopening(null)}
          onConfirm={() => reopen(reopening)}
        />
      )}
    </div>
  );
}

interface CardProps {
  match: MatchSummary;
  myAccountId: string;
  open: boolean;
  onToggle: () => void;
  onReopen: () => void;
}

const statusPill = (status: string | null) =>
  status === 'confirmed' ? (
    <span class="pill pill--up paylabel">{tr.games.paid}</span>
  ) : status === 'awaiting_confirmation' ? (
    <span class="pill pill--gold paylabel">{tr.games.waiting}</span>
  ) : status === 'unpaid' ? (
    <span class="pill pill--down paylabel">{tr.games.unpaid}</span>
  ) : null;

function GameCard({ match, myAccountId, open, onToggle, onReopen }: CardProps) {
  const players = [...match.players].sort((a, b) => b.netCents - a.netCents);
  const reopenable =
    match.hostAccountId === myAccountId && canReopen(match.settledAt, match.transfers.map((t) => t.status));
  const winner = players[0];
  const me = match.players.find((p) => p.accountId === myAccountId);
  const date = new Date(match.settledAt);

  return (
    <article class={`surface game ${open ? 'game--open' : ''}`}>
      <button class="game__head" onClick={onToggle} aria-expanded={open}>
        <span class="game__date">
          <span class="game__day">{date.getDate()}</span>
          <span class="game__month">{date.toLocaleDateString(locale(), { month: 'short' })}</span>
        </span>
        <span class="row__main">
          <span class="row__title">{match.name}</span>
          <span class="row__sub">
            {winner && winner.netCents > 0 ? (
              <>
                <span style={{ color: 'var(--gold)' }}>
                  <CrownIcon size={11} />
                </span>{' '}
                {winner.name} +{formatCents(winner.netCents)} · {tr.common.players(match.players.length)}
              </>
            ) : (
              tr.common.players(match.players.length)
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
              <div key={p.accountId} class={`minirow tappable ${p.accountId === myAccountId ? 'minirow--me' : ''}`} {...profileTap(p.accountId)}>
                <Avatar id={p.accountId} name={p.name} size="sm" />
                <span class="minirow__name">
                  {p.name}
                  {p.accountId === myAccountId ? tr.common.youParen : ''}
                </span>
                <Money cents={p.netCents} signed />
              </div>
            ))}
          </div>

          <div class="game__divider" />

          <div class="game__section" style={{ paddingTop: '12px' }}>
            <span class="label" style={{ margin: '0 0 2px' }}>
              {tr.settlement.whoPaysWhom}
            </span>
            {match.discrepancyCents !== 0 && (
              <p class="warning">{tr.games.offBy(formatCents(Math.abs(match.discrepancyCents)))}</p>
            )}
            {match.transfers.length === 0 ? (
              <p class="muted">{tr.settlement.allEven}</p>
            ) : (
              match.transfers.map((t, i) => {
                const mine = t.fromAccountId === myAccountId || t.toAccountId === myAccountId;
                return (
                  <div key={i} class={`transfer ${mine ? 'transfer--me' : ''}`}>
                    <span class="transfer__names">
                      <strong>{t.fromAccountId === myAccountId ? tr.common.you : t.fromName}</strong>
                      <span class="transfer__arrow">
                        <ArrowRightIcon size={14} />
                      </span>
                      <strong>{t.toAccountId === myAccountId ? tr.common.you : t.toName}</strong>
                    </span>
                    <Money cents={t.amountCents} />
                    {statusPill(t.status)}
                  </div>
                );
              })
            )}
            {reopenable && (
              <button class="btn btn--ghost btn--block" onClick={onReopen}>
                {tr.settlement.reopen}
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
