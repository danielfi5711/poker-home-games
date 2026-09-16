import { useEffect, useState } from 'preact/hooks';
import type { HistoryResponse } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { formatCents } from '../money.js';

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
    <div class="card">
      <h2>Leaderboard</h2>
      {error && <p class="error">{error}</p>}
      {!data && !error && <p class="muted">Loading…</p>}

      {data && (
        <>
          {data.leaderboard.length === 0 ? (
            <p class="muted">No settled games yet — finish a game to start the leaderboard.</p>
          ) : (
            <ul class="results">
              {data.leaderboard.map((entry) => (
                <li key={entry.name}>
                  <span class="results__name">
                    {entry.name} <span class="muted">({entry.sessionsPlayed} games)</span>
                  </span>
                  <span class={`results__net ${entry.netCents > 0 ? 'positive' : entry.netCents < 0 ? 'negative' : ''}`}>
                    {entry.netCents > 0 ? '+' : ''}
                    {formatCents(entry.netCents)}
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
    </div>
  );
}
