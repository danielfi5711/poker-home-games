import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse, LeaderboardEntry } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { CrownIcon, TrophyIcon } from '../icons.js';
import { Avatar, Empty, Money, ScreenHead, SectionLabel, Spinner } from '../ui.js';

function streakBadge(type: 'win' | 'loss' | null, count: number) {
  if (!type || count < 2) return null;
  return (
    <span class={`pill streak ${type === 'win' ? 'pill--up' : 'pill--info'}`}>
      {type === 'win' ? '🔥' : '🧊'} {count}
    </span>
  );
}

function PodiumSpot({ entry, place }: { entry: LeaderboardEntry | undefined; place: 1 | 2 | 3 }) {
  if (!entry) return <div />;
  return (
    <div class={`podium__spot podium__spot--${place}`}>
      {place === 1 && (
        <span class="podium__crown">
          <CrownIcon size={22} />
        </span>
      )}
      <Avatar id={entry.accountId} name={entry.name} size={place === 1 ? 'xl' : 'lg'} />
      <span class="podium__name">{entry.name}</span>
      <Money cents={entry.balanceCents} signed size="sm" />
      <div class="podium__block">{place}</div>
    </div>
  );
}

export function LeaderboardScreen({ myAccountId }: { myAccountId: string }) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .history()
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, []);

  const board = data?.leaderboard ?? [];
  const h = data?.highlights;
  const anyHighlight = h && (h.hottest || h.coldest || h.biggestWin || h.biggestLoss);

  return (
    <div class="view">
      <ScreenHead title="Leaderboard" sub="All-time results across every game." />
      {error && <p class="error">{error}</p>}
      {!data && !error && <Spinner />}

      {data && board.length === 0 && (
        <Empty icon={<TrophyIcon size={24} />} title="No results yet">
          Finish a game and the standings show up here.
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
            <li key={entry.accountId} class={`row ${entry.accountId === myAccountId ? 'row--me' : ''}`}>
              <span class="rank">{i + 1}</span>
              <Avatar id={entry.accountId} name={entry.name} />
              <span class="row__main">
                <span class="row__title">
                  {entry.name}
                  {entry.accountId === myAccountId && <span class="muted"> · you</span>}
                </span>
                <span class="row__sub">
                  {entry.sessionsPlayed} {entry.sessionsPlayed === 1 ? 'game' : 'games'}
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
          <SectionLabel>Highlights</SectionLabel>
          <div class="highlights">
            {h.hottest && (
              <div class="highlight">
                <span class="highlight__icon">🔥</span>
                <span class="highlight__label">Hot streak</span>
                <span class="highlight__who">{h.hottest.name}</span>
                <span class="muted">{h.hottest.streakCount} wins in a row</span>
              </div>
            )}
            {h.coldest && (
              <div class="highlight">
                <span class="highlight__icon">🧊</span>
                <span class="highlight__label">Cold streak</span>
                <span class="highlight__who">{h.coldest.name}</span>
                <span class="muted">{h.coldest.streakCount} losses in a row</span>
              </div>
            )}
            {h.biggestWin && (
              <div class="highlight">
                <span class="highlight__icon">💰</span>
                <span class="highlight__label">Biggest win</span>
                <span class="highlight__who">{h.biggestWin.name}</span>
                <Money cents={h.biggestWin.amountCents} signed size="sm" />
              </div>
            )}
            {h.biggestLoss && (
              <div class="highlight">
                <span class="highlight__icon">📉</span>
                <span class="highlight__label">Biggest loss</span>
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
