import { useState } from 'preact/hooks';
import type { Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { Avatar, SectionLabel } from '../ui.js';

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
  const host = session.players[session.hostPlayerId];

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
    <div class="view">
      <section class="lobbyhead">
        <span class="pill pill--gold">Lobby</span>
        <h1 class="lobbyhead__title">{session.name}</h1>
        <span class="waitdots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <p class="hint">{isHost ? 'Start the game once everyone has joined.' : `Waiting for ${host?.name ?? 'the host'} to start the game.`}</p>
      </section>

      <SectionLabel count={players.length}>At the table</SectionLabel>
      <ul class="surface rows">
        {players.map((p) => (
          <li key={p.id} class="row">
            <Avatar id={p.accountId} name={p.name} />
            <span class="row__main">
              <span class="row__title">{p.name}</span>
            </span>
            {p.id === session.hostPlayerId && <span class="pill pill--gold">Host</span>}
          </li>
        ))}
      </ul>

      {error && <p class="error">{error}</p>}

      {isHost && (
        <button class="btn btn--primary btn--lg btn--block" onClick={start} disabled={busy}>
          {busy ? 'Starting…' : `Start game · ${players.length} ${players.length === 1 ? 'player' : 'players'}`}
        </button>
      )}

      <button class="btn btn--ghost btn--block" onClick={onLeave}>
        Back to tables
      </button>
    </div>
  );
}
