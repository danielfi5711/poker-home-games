import { useState } from 'preact/hooks';
import type { Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { initials } from '../initials.js';
import { avatarStyle } from '../avatarColor.js';

interface Props {
  session: Session;
  isHost: boolean;
  onChanged: (session: Session) => void;
  onLeave: () => void;
}

export function LobbyScreen({ session, isHost, onChanged, onLeave }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const players = Object.values(session.players).sort((a, b) => a.joinedAt - b.joinedAt);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { session: updated } = await api.activate(session.id);
      onChanged(updated);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <h2>{session.name}</h2>
      <p class="hint">Waiting in the lobby — the host starts the game once everyone's in.</p>

      <h3>Players ({players.length})</h3>
      <ul class="playerlist">
        {players.map((p) => (
          <li key={p.id}>
            <span class="avatar" style={avatarStyle(p.accountId)}>
              {initials(p.name)}
            </span>
            <span class="playerlist__name">{p.name}</span>
            {p.id === session.hostPlayerId && <span class="badge badge--host">Host</span>}
          </li>
        ))}
      </ul>

      {error && <p class="error">{error}</p>}

      {isHost ? (
        <button class="btn btn--primary btn--big" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : 'Start game'}
        </button>
      ) : (
        <p class="muted">Waiting for the host to start the game…</p>
      )}

      <button class="btn btn--ghost" onClick={onLeave}>
        Leave
      </button>
    </div>
  );
}
