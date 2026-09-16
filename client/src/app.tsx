import { useEffect, useState } from 'preact/hooks';
import type { Account, Group, Session } from '../../src/shared/types.js';
import {
  api,
  loadSavedGroupId,
  loadSavedIdentity,
  loadToken,
  saveGroupId,
  saveIdentity,
  saveToken,
  usePolledSession,
} from './api.js';
import { Login } from './screens/Login.js';
import { Groups } from './screens/Groups.js';
import { GroupScreen } from './screens/GroupScreen.js';
import { ChipSetupScreen } from './screens/ChipSetup.js';
import { TableScreen } from './screens/Table.js';
import { SettlementScreen } from './screens/Settlement.js';
import { ChipIcon } from './icons.js';

type View = 'login' | 'groups' | 'group' | 'session';

export function App() {
  const [booting, setBooting] = useState(true);
  const [view, setView] = useState<View>('login');
  const [account, setAccount] = useState<Account | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const token = loadToken();
      if (!token) {
        setBooting(false);
        return;
      }
      try {
        const { account } = await api.me();
        setAccount(account);

        const savedSession = loadSavedIdentity();
        if (savedSession) {
          try {
            const { group } = await api.getGroup(savedSession.groupId);
            setGroup(group);
            setSessionId(savedSession.sessionId);
            setPlayerId(savedSession.playerId);
            setView('session');
            return;
          } catch {
            saveIdentity(null);
          }
        }

        const savedGroupId = loadSavedGroupId();
        if (savedGroupId) {
          try {
            const { group } = await api.getGroup(savedGroupId);
            setGroup(group);
            setView('group');
            return;
          } catch {
            saveGroupId(null);
          }
        }

        setView('groups');
      } catch {
        saveToken(null);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  const { session, error, setSession } = usePolledSession(view === 'session' ? sessionId : null);

  function onAuthed(acc: Account) {
    setAccount(acc);
    setView('groups');
  }

  function enterGroup(g: Group) {
    saveGroupId(g.id);
    setGroup(g);
    setView('group');
  }

  function leaveGroup() {
    saveGroupId(null);
    setGroup(null);
    setView('groups');
  }

  function enterSession(s: Session, pid: string) {
    if (!group) return;
    saveIdentity({ groupId: group.id, sessionId: s.id, playerId: pid });
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
    setView('group');
  }

  async function logout() {
    try {
      await api.logout();
    } catch {
      /* token may already be stale server-side — clear local state regardless */
    }
    saveToken(null);
    saveIdentity(null);
    saveGroupId(null);
    setAccount(null);
    setGroup(null);
    setSessionId(null);
    setPlayerId(null);
    setView('login');
  }

  const me = session && playerId ? (session.players[playerId] ?? null) : null;
  const isHost = !!(session && playerId && session.hostPlayerId === playerId);

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
          onClick={() => setView(account ? (group ? (session ? 'session' : 'group') : 'groups') : 'login')}
        >
          <ChipIcon size={22} />
          <span class="topbar__brand-text">Poker Night</span>
        </button>
        {account && (
          <nav class="topbar__nav">
            {group && (
              <button
                class={`topbar__link ${view === 'group' || view === 'session' ? 'topbar__link--active' : ''}`}
                onClick={() => setView(session ? 'session' : 'group')}
              >
                {group.name}
              </button>
            )}
            <button class="topbar__link" onClick={logout}>
              Log out
            </button>
          </nav>
        )}
      </header>

      <main class="app__main">
        {view === 'login' && <Login onAuthed={onAuthed} />}

        {view === 'groups' && account && <Groups onEnter={enterGroup} />}

        {view === 'group' && group && <GroupScreen group={group} onEnterSession={enterSession} onBack={leaveGroup} />}

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
              Back to group
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
