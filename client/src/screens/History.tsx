import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';
import { TrophyIcon } from '../icons.js';

interface Props {
  groupId: string;
}

export function HistoryScreen({ groupId }: Props) {
  const [data, setData] = useState<HistoryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    api
      .groupHistory(groupId)
      .then(setData)
      .catch((err) => setError((err as Error).message));
  }, [groupId]);

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

          <h2>Past games</h2>
          {data.sessions.length === 0 ? (
            <p class="muted">Nothing here yet.</p>
          ) : (
            <ul class="pastgames">
              {data.sessions.map((s) => (
                <li key={s.id}>
                  <strong>{s.name}</strong>
                  <span class="muted">{s.settledAt ? new Date(s.settledAt).toLocaleDateString() : ''}</span>
                  <span class="muted">{Object.keys(s.players).length} players</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </>
  );
}
