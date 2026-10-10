import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';
import { TrophyIcon } from '../icons.js';

function streakBadge(type: 'win' | 'loss' | null, count: number) {
  if (!type || count < 2) return null;
  return <span class={`streak streak--${type}`}>{type === 'win' ? '🔥' : '🧊'} {count}</span>;
}

export function HistoryScreen() {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .history()
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, []);

  return (
    <>
      <h2 class="section-icon">
        <TrophyIcon size={20} />
        All-Time Leaderboard
      </h2>
      {error && <p class="error">{error}</p>}
      {!data && !error && <p class="muted">Loading…</p>}

      {data && (
        <>
          {(data.highlights.hottest || data.highlights.coldest || data.highlights.biggestWin || data.highlights.biggestLoss) && (
            <ul class="highlights">
              {data.highlights.hottest && (
                <li class="highlights__item highlights__item--hot">
                  🔥 <strong>{data.highlights.hottest.name}</strong> is on a {data.highlights.hottest.streakCount}-game win streak
                </li>
              )}
              {data.highlights.coldest && (
                <li class="highlights__item highlights__item--cold">
                  🧊 <strong>{data.highlights.coldest.name}</strong> is on a {data.highlights.coldest.streakCount}-game cold streak
                </li>
              )}
              {data.highlights.biggestWin && (
                <li class="highlights__item">
                  💰 Biggest win: <strong>{data.highlights.biggestWin.name}</strong> +{formatCents(data.highlights.biggestWin.amountCents)} (
                  {data.highlights.biggestWin.matchName})
                </li>
              )}
              {data.highlights.biggestLoss && (
                <li class="highlights__item">
                  📉 Biggest loss: <strong>{data.highlights.biggestLoss.name}</strong> {formatCents(data.highlights.biggestLoss.amountCents)} (
                  {data.highlights.biggestLoss.matchName})
                </li>
              )}
            </ul>
          )}

          {data.leaderboard.length === 0 ? (
            <p class="muted">No settled games yet — finish a game to start the leaderboard.</p>
          ) : (
            <ul class="results">
              {data.leaderboard.map((entry, i) => (
                <li key={entry.accountId} class={i < 3 ? `results__row--medal results__row--medal-${i + 1}` : ''}>
                  <span class="results__player">
                    <span class={`leaderboard__rank leaderboard__rank--${i + 1}`}>{i + 1}</span>
                    <span class="avatar avatar--sm" style={avatarStyle(entry.accountId)}>
                      {initials(entry.name)}
                    </span>
                    <span class="results__name">
                      {entry.name} <span class="muted">({entry.sessionsPlayed} games)</span>
                      {streakBadge(entry.currentStreakType, entry.currentStreakCount)}
                    </span>
                  </span>
                  <span class={`results__net ${entry.balanceCents > 0 ? 'positive' : entry.balanceCents < 0 ? 'negative' : ''}`}>
                    {entry.balanceCents > 0 ? '+' : ''}
                    {formatCents(entry.balanceCents)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <h2>Match History</h2>
          {data.matches.length === 0 ? (
            <p class="muted">Nothing here yet.</p>
          ) : (
            <ul class="matches">
              {data.matches.map((m) => (
                <li key={m.id} class="matches__item">
                  <div class="matches__head">
                    <strong>{m.name}</strong>
                    <span class="muted">{new Date(m.settledAt).toLocaleDateString()}</span>
                  </div>
                  <ul class="matches__players">
                    {[...m.players]
                      .sort((a, b) => b.netCents - a.netCents)
                      .map((p) => (
                        <li key={p.accountId}>
                          <span class="avatar avatar--sm" style={avatarStyle(p.accountId)}>
                            {initials(p.name)}
                          </span>
                          <span class="matches__playername">{p.name}</span>
                          <span class={`results__net ${p.netCents > 0 ? 'positive' : p.netCents < 0 ? 'negative' : ''}`}>
                            {p.netCents > 0 ? '+' : ''}
                            {formatCents(p.netCents)}
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
