import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { autoSessionName } from '../sessionName.js';
import { CardsIcon } from '../icons.js';

interface Props {
  onEnterSession: (session: Session, playerId: string) => void;
}

/** Start a new table or rejoin one that's still in progress. */
export function TablesScreen({ onEnterSession }: Props) {
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .sessions()
      .then((r) => setSessions(r.sessions))
      .catch((err) => setError((err as Error).message));
  }, []);

  async function createTable() {
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.createSession(autoSessionName());
      onEnterSession(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function openTable(s: Session) {
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.join(s.id);
      onEnterSession(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = (sessions ?? []).filter((s) => s.status !== 'settled');

  return (
    <div class="card">
      <h2 class="section-icon">
        <CardsIcon size={20} />
        Tables
      </h2>
      {error && <p class="error">{error}</p>}

      {active.length > 0 && (
        <>
          <h3>In progress</h3>
          <ul class="pastgames">
            {active.map((s) => (
              <li key={s.id}>
                <button class="btn btn--ghost btn--between" onClick={() => openTable(s)} disabled={busy}>
                  <strong>{s.name}</strong>
                  <span class="muted">
                    {Object.keys(s.players).length} players · {s.status}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <button class="btn btn--primary btn--big" onClick={createTable} disabled={busy}>
        {busy ? 'Creating…' : `+ Start a table — "${autoSessionName()}"`}
      </button>
    </div>
  );
}
