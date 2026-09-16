import { useEffect, useState } from 'preact/hooks';
import type { Group, Session } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { HistoryScreen } from './History.js';
import { LinkIcon, CheckIcon } from '../icons.js';

interface Props {
  group: Group;
  onEnterSession: (session: Session, playerId: string) => void;
  onBack: () => void;
}

export function GroupScreen({ group, onEnterSession, onBack }: Props) {
  const [tab, setTab] = useState<'tables' | 'leaderboard'>('tables');
  const [sessions, setSessions] = useState<Session[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [gameName, setGameName] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    api
      .groupSessions(group.id)
      .then((r) => setSessions(r.sessions))
      .catch((err) => setError((err as Error).message));
  }, [group.id]);

  async function createTable(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.createSession(group.id, gameName);
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

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(group.joinCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — the code is shown on screen regardless */
    }
  }

  const active = (sessions ?? []).filter((s) => s.status !== 'settled');

  return (
    <div class="card">
      <button class="btn btn--ghost" onClick={onBack}>
        ← All groups
      </button>
      <h2>{group.name}</h2>
      <div class="joincode joincode--compact">
        <div>
          <div class="joincode__label">Group code</div>
          <div class="joincode__value">{group.joinCode}</div>
        </div>
        <button class={`btn btn--small ${copied ? 'btn--copied' : ''}`} onClick={copyCode}>
          {copied ? <CheckIcon size={13} /> : <LinkIcon size={13} />}
          {copied ? 'Copied!' : 'Copy code'}
        </button>
      </div>

      <div class="tabs">
        <button class={`tab ${tab === 'tables' ? 'tab--active' : ''}`} onClick={() => setTab('tables')}>
          Tables
        </button>
        <button class={`tab ${tab === 'leaderboard' ? 'tab--active' : ''}`} onClick={() => setTab('leaderboard')}>
          Leaderboard
        </button>
      </div>

      {error && <p class="error">{error}</p>}

      {tab === 'tables' ? (
        <>
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

          <h3>New table</h3>
          <form onSubmit={createTable}>
            <label class="field">
              Table name
              <input value={gameName} onInput={(e) => setGameName(e.currentTarget.value)} placeholder="Friday Night" maxLength={60} />
            </label>
            <button class="btn btn--primary" type="submit" disabled={busy}>
              {busy ? 'Creating…' : 'Create table'}
            </button>
          </form>
        </>
      ) : (
        <HistoryScreen groupId={group.id} />
      )}
    </div>
  );
}
