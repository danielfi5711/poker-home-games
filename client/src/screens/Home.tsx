import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../../src/shared/types.js';
import { api } from '../api.js';

interface Props {
  onEnter: (session: Session, playerId: string) => void;
  error: string | null;
  setError: (err: string | null) => void;
}

function joinCodeFromUrl(): string {
  return new URLSearchParams(location.search).get('join')?.toUpperCase() ?? '';
}

export function Home({ onEnter, error, setError }: Props) {
  const initialJoinCode = joinCodeFromUrl();
  const [mode, setMode] = useState<'create' | 'join'>(initialJoinCode ? 'join' : 'create');
  const [gameName, setGameName] = useState('');
  const [hostName, setHostName] = useState('');
  const [joinCode, setJoinCode] = useState(initialJoinCode);
  const [joinName, setJoinName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (initialJoinCode) history.replaceState(null, '', location.pathname);
  }, []);

  async function create(e: Event) {
    e.preventDefault();
    if (!hostName.trim()) return setError('Enter your name.');
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.createSession(gameName, hostName);
      onEnter(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function join(e: Event) {
    e.preventDefault();
    if (!joinCode.trim() || !joinName.trim()) return setError('Enter the game code and your name.');
    setBusy(true);
    setError(null);
    try {
      const { session, playerId } = await api.join(joinCode.trim().toUpperCase(), joinName);
      onEnter(session, playerId!);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div class="card">
      <div class="tabs">
        <button class={`tab ${mode === 'create' ? 'tab--active' : ''}`} onClick={() => setMode('create')}>
          New game
        </button>
        <button class={`tab ${mode === 'join' ? 'tab--active' : ''}`} onClick={() => setMode('join')}>
          Join a game
        </button>
      </div>

      {error && <p class="error">{error}</p>}

      {mode === 'create' ? (
        <form onSubmit={create}>
          <label class="field">
            Game name
            <input value={gameName} onInput={(e) => setGameName(e.currentTarget.value)} placeholder="Friday Night" maxLength={60} />
          </label>
          <label class="field">
            Your name
            <input value={hostName} onInput={(e) => setHostName(e.currentTarget.value)} placeholder="Your name" maxLength={40} required />
          </label>
          <button class="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create game'}
          </button>
          <p class="hint">You'll set the chip colors and values next, then get a code to share with everyone.</p>
        </form>
      ) : (
        <form onSubmit={join}>
          <label class="field">
            Game code
            <input
              value={joinCode}
              onInput={(e) => setJoinCode(e.currentTarget.value.toUpperCase())}
              placeholder="ABCDE"
              maxLength={8}
              class="field__code"
              required
            />
          </label>
          <label class="field">
            Your name
            <input value={joinName} onInput={(e) => setJoinName(e.currentTarget.value)} placeholder="Your name" maxLength={40} required />
          </label>
          <button class="btn btn--primary" type="submit" disabled={busy}>
            {busy ? 'Joining…' : 'Join game'}
          </button>
        </form>
      )}
    </div>
  );
}
