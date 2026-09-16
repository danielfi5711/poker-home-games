import { useEffect, useState } from 'preact/hooks';
import type { Session } from '../../src/shared/types.js';
import { api, loadSavedIdentity, saveIdentity, usePolledSession } from './api.js';
import { Home } from './screens/Home.js';
import { ChipSetupScreen } from './screens/ChipSetup.js';
import { TableScreen } from './screens/Table.js';
import { SettlementScreen } from './screens/Settlement.js';
import { HistoryScreen } from './screens/History.js';
import { ChipIcon } from './icons.js';

type View = 'home' | 'session' | 'history';

export function App() {
  const [view, setView] = useState<View>('home');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);

  useEffect(() => {
    const saved = loadSavedIdentity();
    if (saved) {
      setSessionId(saved.sessionId);
      setPlayerId(saved.playerId);
      setView('session');
    }
  }, []);

  const { session, error, reload, setSession } = usePolledSession(view === 'session' ? sessionId : null);

  function enterSession(s: Session, pid: string) {
    saveIdentity({ sessionId: s.id, playerId: pid });
    setSession(s);
    setSessionId(s.id);
    setPlayerId(pid);
    setView('session');
    setBootError(null);
  }

  function leaveSession() {
    saveIdentity(null);
    setSessionId(null);
    setPlayerId(null);
    setSession(null);
    setView('home');
  }

  const me = session && playerId ? (session.players[playerId] ?? null) : null;
  const isHost = !!(session && playerId && session.hostPlayerId === playerId);

  return (
    <div class="app">
      <header class="topbar">
        <button class="topbar__brand" onClick={() => setView(session ? 'session' : 'home')}>
          <ChipIcon size={22} />
          <span class="topbar__brand-text">Poker Night</span>
        </button>
        <nav class="topbar__nav">
          {session && (
            <button
              class={`topbar__link ${view === 'session' ? 'topbar__link--active' : ''}`}
              onClick={() => setView('session')}
            >
              {session.name}
            </button>
          )}
          <button
            class={`topbar__link ${view === 'history' ? 'topbar__link--active' : ''}`}
            onClick={() => setView('history')}
          >
            History
          </button>
        </nav>
      </header>

      <main class="app__main">
        {view === 'home' && <Home onEnter={enterSession} error={bootError} setError={setBootError} />}

        {view === 'session' && session && playerId && me && (
          <>
            {session.status === 'setup' && (
              <ChipSetupScreen session={session} isHost={isHost} onChanged={setSession} onLeave={leaveSession} />
            )}
            {session.status === 'active' && (
              <TableScreen
                session={session}
                playerId={playerId}
                isHost={isHost}
                onChanged={setSession}
                onSettled={setSession}
                onLeave={leaveSession}
              />
            )}
            {session.status === 'settled' && <SettlementScreen session={session} playerId={playerId} onLeave={leaveSession} />}
          </>
        )}

        {view === 'session' && sessionId && !session && !error && <p class="muted center">Loading game…</p>}
        {view === 'session' && error && (
          <div class="card center">
            <p>{error}</p>
            <button class="btn" onClick={leaveSession}>
              Back to start
            </button>
          </div>
        )}

        {view === 'history' && <HistoryScreen />}
      </main>
    </div>
  );
}
