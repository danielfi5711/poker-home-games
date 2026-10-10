import { useEffect, useState } from 'preact/hooks';
import type { Account, Session } from '../../src/shared/types.js';
import {
  api,
  ApiError,
  loadSavedIdentity,
  loadToken,
  saveIdentity,
  requestPersistentStorage,
  saveToken,
  usePolledSession,
} from './api.js';
import { Login } from './screens/Login.js';
import { TablesScreen } from './screens/Tables.js';
import { LeaderboardScreen } from './screens/Leaderboard.js';
import { GamesScreen } from './screens/Games.js';
import { LobbyScreen } from './screens/Lobby.js';
import { TableScreen } from './screens/Table.js';
import { SettlementScreen } from './screens/Settlement.js';
import { SettingsScreen } from './screens/Settings.js';
import { ChipIcon, BellIcon, GearIcon, CardsIcon, TrophyIcon, ReceiptIcon } from './icons.js';
import { ensurePushSubscription } from './push.js';

type View = 'login' | 'home' | 'session' | 'settings';
type HomeTab = 'tables' | 'leaderboard' | 'games';

const HOME_TABS: { id: HomeTab; label: string; icon: typeof CardsIcon }[] = [
  { id: 'tables', label: 'Tables', icon: CardsIcon },
  { id: 'leaderboard', label: 'Leaderboard', icon: TrophyIcon },
  { id: 'games', label: 'Games', icon: ReceiptIcon },
];

/** `?tab=games` (e.g. from a "game is over" notification) opens straight to that tab. */
function tabFromUrl(url: string): HomeTab | null {
  const tab = new URL(url, location.origin).searchParams.get('tab');
  return HOME_TABS.some((t) => t.id === tab) ? (tab as HomeTab) : null;
}

export function App() {
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>('login');
  const [account, setAccount] = useState<Account | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [returnView, setReturnView] = useState<View>('home');
  const [homeTab, setHomeTab] = useState<HomeTab>(() => tabFromUrl(location.href) ?? 'tables');

  // A tapped notification focuses the already-open app and posts its URL here.
  useEffect(() => {
    const sw = navigator.serviceWorker;
    if (!sw) return;
    function onMessage(e: MessageEvent) {
      const data = e.data as { type?: string; url?: string } | null;
      const tab = data?.type === 'open' && data.url ? tabFromUrl(data.url) : null;
      if (tab) openHomeTab(tab);
    }
    sw.addEventListener('message', onMessage);
    return () => sw.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    (async () => {
      const token = loadToken();
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        requestPersistentStorage();
        // Only a rejected token (401) logs the player out. A network error or
        // the server waking from sleep just retries — the login is kept until
        // the player logs out themselves.
        let account: Account;
        for (let attempt = 0; ; attempt++) {
          try {
            ({ account } = await api.me());
            break;
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) throw err;
            await new Promise((r) => setTimeout(r, Math.min(1000 * 2 ** attempt, 5000)));
          }
        }
        setAccount(account);
        void ensurePushSubscription();

        const savedSession = loadSavedIdentity();
        if (savedSession && !tabFromUrl(location.href)) {
          setSessionId(savedSession.sessionId);
          setPlayerId(savedSession.playerId);
          setView('session');
          return;
        }

        setView('home');
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) saveToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const { session, error, setSession } = usePolledSession(view === 'session' ? sessionId : null);

  function onAuthed(acc: Account) {
    setAccount(acc);
    void ensurePushSubscription();
    setView('home');
  }

  function enterSession(s: Session, pid: string) {
    saveIdentity({ sessionId: s.id, playerId: pid });
    setSession(s);
    setSessionId(s.id);
    setPlayerId(pid);
    setView('session');
  }

  function leaveSession() {
    saveIdentity(null);
    setSessionId(null);
    setPlayerId(null);
    setSession(null);
    setView('home');
  }

  function openHomeTab(tab: HomeTab) {
    setHomeTab(tab);
    setView('home');
  }

  function openSettings() {
    setReturnView(view);
    setView('settings');
  }

  function closeSettings() {
    setView(returnView);
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* token may already be stale server-side — clear local state regardless */
    }
    saveToken(null);
    saveIdentity(null);
    setAccount(null);
    setSessionId(null);
    setPlayerId(null);
    setView('login');
  }

  const me = session && playerId ? (session.players[playerId] ?? null) : null;
  const isHost = !!(session && playerId && session.hostPlayerId === playerId);
  const pendingCount =
    isHost && session ? Object.values(session.players).reduce((n, p) => n + p.buyIns.filter((b) => b.status === 'pending').length, 0) : 0;

  if (booting) {
    return (
      <div class="app">
        <main class="app__main">
          <p class="muted center">Loading…</p>
        </main>
      </div>
    );
  }

  return (
    <div class="app">
      <header class="topbar">
        <button
          class="topbar__brand"
          onClick={() => (account ? openHomeTab('tables') : setView('login'))}
        >
          <ChipIcon size={22} />
          <span class="topbar__brand-text">Poker Night</span>
        </button>
        {account && (
          <nav class="topbar__nav">
            {session && (
              <button
                class={`topbar__link ${view === 'session' ? 'topbar__link--active' : ''}`}
                onClick={() => setView('session')}
              >
                Table
                {pendingCount > 0 && (
                  <span class="topbar__bell">
                    <BellIcon size={13} />
                    <span class="topbar__bell-count">{pendingCount}</span>
                  </span>
                )}
              </button>
            )}
            <button
              class={`topbar__link topbar__link--icon ${view === 'settings' ? 'topbar__link--active' : ''}`}
              onClick={openSettings}
              aria-label="Settings"
            >
              <GearIcon size={18} />
            </button>
          </nav>
        )}
      </header>

      <main class="app__main">
        {view === 'login' && <Login onAuthed={onAuthed} />}

        {view === 'home' && account && (
          <div class="tabpanel" key={homeTab}>
            {homeTab === 'tables' && <TablesScreen onEnterSession={enterSession} />}
            {homeTab === 'leaderboard' && (
              <div class="card">
                <LeaderboardScreen />
              </div>
            )}
            {homeTab === 'games' && (
              <div class="card">
                <GamesScreen myAccountId={account.id} />
              </div>
            )}
          </div>
        )}

        {view === 'session' && session && playerId && me && (
          <>
            {session.status === 'setup' && (
              <LobbyScreen session={session} isHost={isHost} onChanged={setSession} onLeave={leaveSession} />
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
            {session.status === 'settled' && (
              <SettlementScreen
                session={session}
                playerId={playerId}
                onLeave={() => {
                  leaveSession();
                  openHomeTab('games');
                }}
              />
            )}
          </>
        )}

        {view === 'session' && sessionId && !session && !error && <p class="muted center">Loading game…</p>}
        {view === 'session' && error && (
          <div class="card center">
            <p>{error}</p>
            <button class="btn" onClick={leaveSession}>
              Back to tables
            </button>
          </div>
        )}

        {view === 'settings' && account && (
          <SettingsScreen account={account} onAccountChanged={setAccount} onLogout={logout} onBack={closeSettings} />
        )}
      </main>

      {account && view !== 'login' && (
        <nav class="bottomnav" aria-label="Main">
          {HOME_TABS.map(({ id, label, icon: Icon }) => {
            const active = view === 'home' && homeTab === id;
            return (
              <button
                key={id}
                class={`bottomnav__item ${active ? 'bottomnav__item--active' : ''}`}
                onClick={() => openHomeTab(id)}
                aria-current={active ? 'page' : undefined}
              >
                <Icon size={22} />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
