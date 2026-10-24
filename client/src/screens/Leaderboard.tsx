import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse, LeaderboardEntry } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { CrownIcon, TrophyIcon } from '../icons.js';
import { Avatar, Empty, Money, ScreenHead, SectionLabel, Spinner } from '../ui.js';
import { tr } from '../i18n.js';
import { profileTap } from '../profileNav.js';

function streakBadge(type: 'win' | 'loss' | null, count: number) {
  if (!type || count < 2) return null;
  return (
    <span class={`pill streak ${type === 'win' ? 'pill--up' : 'pill--info'}`}>
      {type === 'win' ? '🔥' : '🧊'} {count}
    </span>
  );
}

/** Champion's confetti: [left %, delay s, duration s, color]. Fixed, so it doesn't reshuffle on re-render. */
const CONFETTI: [number, number, number, string][] = [
  [8, 0, 2.6, 'var(--gold)'],
  [22, 1.1, 3.1, 'var(--down)'],
  [35, 0.5, 2.4, 'var(--up)'],
  [50, 1.7, 2.9, 'var(--gold-hi)'],
  [63, 0.2, 2.7, 'var(--info)'],
  [77, 1.4, 3.3, 'var(--down)'],
  [90, 0.8, 2.5, 'var(--gold)'],
  [15, 2.2, 2.8, 'var(--info)'],
  [57, 2.6, 3, 'var(--up)'],
  [84, 1.9, 2.6, 'var(--gold-hi)'],
];

/**
 * A little medal-colored figure dancing on its podium block, with the player's
 * avatar (their photo, if they have one) as its face. Each place has its own
 * dance — 1st jumps and raises the roof, 2nd does the disco point, 3rd the robot —
 * all on the same 120 bpm beat so the three dance together.
 */
function Dancer({ entry, place }: { entry: LeaderboardEntry; place: 1 | 2 | 3 }) {
  return (
    <div class={`dancer dancer--${place}`} aria-hidden="true">
      <span class="dancer__shadow" />
      <span class="dancer__fig">
        <span class="dancer__leg dancer__leg--l">
          <span class="dancer__shin" />
        </span>
        <span class="dancer__leg dancer__leg--r">
          <span class="dancer__shin" />
        </span>
        <span class="dancer__torso">{place}</span>
        <span class="dancer__arm dancer__arm--l">
          <span class="dancer__fore">
            <span class="dancer__hand" />
          </span>
        </span>
        <span class="dancer__arm dancer__arm--r">
          <span class="dancer__fore">
            <span class="dancer__hand" />
          </span>
        </span>
        <span class="dancer__head">
          {place === 1 && (
            <span class="dancer__crown">
              <CrownIcon size={20} />
            </span>
          )}
          <Avatar id={entry.accountId} name={entry.name} size="lg" />
        </span>
      </span>
    </div>
  );
}

function PodiumSpot({ entry, place }: { entry: LeaderboardEntry | undefined; place: 1 | 2 | 3 }) {
  if (!entry) return <div />;
  return (
    <div class={`podium__spot podium__spot--${place} tappable`} {...profileTap(entry.accountId)}>
      <span class="podium__light" />
      {place === 1 && (
        <span class="confetti" aria-hidden="true">
          {CONFETTI.map(([left, delay, duration, color], i) => (
            <i key={i} style={{ left: `${left}%`, animationDelay: `${delay}s`, animationDuration: `${duration}s`, background: color }} />
          ))}
        </span>
      )}
      <Dancer entry={entry} place={place} />
      <div class="podium__block">
        <span class="podium__place">{place}</span>
        <span class="podium__name">{entry.name}</span>
        <Money cents={entry.balanceCents} signed size="sm" />
      </div>
    </div>
  );
}

const PERIODS = ['month', 'year', 'all'] as const;
type Period = (typeof PERIODS)[number];

/** Start of this month / year on the player's own clock (0 = all time). */
function periodStart(period: Period): number {
  const now = new Date();
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1).getTime();
  if (period === 'year') return new Date(now.getFullYear(), 0, 1).getTime();
  return 0;
}

export function LeaderboardScreen({ myAccountId }: { myAccountId: string }) {
  const [period, setPeriod] = useState<Period>('all');
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Switching periods keeps the old standings on screen until the new ones arrive.
  useEffect(() => {
    let current = true;
    setError(null);
    api
      .history(periodStart(period))
      .then((r) => current && setData(r))
      .catch((err) => current && setError((err as Error).message));
    return () => {
      current = false;
    };
  }, [period]);

  const board = data?.leaderboard ?? [];
  const h = data?.highlights;
  const anyHighlight = h && (h.hottest || h.coldest || h.biggestWin || h.biggestLoss);

  return (
    <div class="view">
      <ScreenHead title={tr.leaderboard.title} sub={tr.leaderboard.sub} />

      <div class="streetseg" role="group" style={{ '--i': PERIODS.indexOf(period), '--n': PERIODS.length }}>
        <span class="streetseg__thumb" />
        {PERIODS.map((p) => (
          <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>
            {tr.leaderboard.periods[p]}
          </button>
        ))}
      </div>

      {error && <p class="error">{error}</p>}
      {!data && !error && <Spinner />}

      {data && board.length === 0 && (
        <Empty
          icon={<TrophyIcon size={24} />}
          title={period === 'month' ? tr.leaderboard.emptyMonth : period === 'year' ? tr.leaderboard.emptyYear : tr.leaderboard.empty}
        >
          {period === 'all' ? tr.leaderboard.emptySub : tr.leaderboard.emptyPeriodSub}
        </Empty>
      )}

      {board.length > 0 && (
        <div class="podium">
          <PodiumSpot entry={board[1]} place={2} />
          <PodiumSpot entry={board[0]} place={1} />
          <PodiumSpot entry={board[2]} place={3} />
        </div>
      )}

      {board.length > 0 && (
        <ul class="surface rows">
          {board.map((entry, i) => (
            <li key={entry.accountId} class={`row tappable ${entry.accountId === myAccountId ? 'row--me' : ''}`} {...profileTap(entry.accountId)}>
              <span class="rank">{i + 1}</span>
              <Avatar id={entry.accountId} name={entry.name} />
              <span class="row__main">
                <span class="row__title">
                  {entry.name}
                  {entry.accountId === myAccountId && <span class="muted">{tr.common.youSuffix}</span>}
                </span>
                <span class="row__sub">
                  {tr.leaderboard.games(entry.sessionsPlayed)}
                </span>
              </span>
              <span class="row__end">
                <Money cents={entry.balanceCents} signed size="lg" />
                {streakBadge(entry.currentStreakType, entry.currentStreakCount)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {anyHighlight && (
        <>
          <SectionLabel>{tr.leaderboard.highlights}</SectionLabel>
          <div class="highlights">
            {h.hottest && (
              <div class="highlight tappable" {...profileTap(h.hottest.accountId)}>
                <span class="highlight__icon">🔥</span>
                <span class="highlight__label">{tr.leaderboard.hotStreak}</span>
                <span class="highlight__who">{h.hottest.name}</span>
                <span class="muted">{tr.leaderboard.winsInARow(h.hottest.streakCount)}</span>
              </div>
            )}
            {h.coldest && (
              <div class="highlight tappable" {...profileTap(h.coldest.accountId)}>
                <span class="highlight__icon">🧊</span>
                <span class="highlight__label">{tr.leaderboard.coldStreak}</span>
                <span class="highlight__who">{h.coldest.name}</span>
                <span class="muted">{tr.leaderboard.lossesInARow(h.coldest.streakCount)}</span>
              </div>
            )}
            {h.biggestWin && (
              <div class="highlight tappable" {...profileTap(h.biggestWin.accountId)}>
                <span class="highlight__icon">💰</span>
                <span class="highlight__label">{tr.leaderboard.biggestWin}</span>
                <span class="highlight__who">{h.biggestWin.name}</span>
                <Money cents={h.biggestWin.amountCents} signed size="sm" />
              </div>
            )}
            {h.biggestLoss && (
              <div class="highlight tappable" {...profileTap(h.biggestLoss.accountId)}>
                <span class="highlight__icon">📉</span>
                <span class="highlight__label">{tr.leaderboard.biggestLoss}</span>
                <span class="highlight__who">{h.biggestLoss.name}</span>
                <Money cents={h.biggestLoss.amountCents} signed size="sm" />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
