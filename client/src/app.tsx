import { useEffect, useState } from 'preact/hooks';
import type { Account, PaymentView, Session } from '../../src/shared/types.js';
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
import { PaymentsScreen, paymentsNeedingAction } from './screens/Payments.js';
import { PhoneForm } from './screens/PhoneForm.js';
import { LobbyScreen } from './screens/Lobby.js';
import { TableScreen } from './screens/Table.js';
import { SettlementScreen } from './screens/Settlement.js';
import { SettingsScreen } from './screens/Settings.js';
import { ChipIcon, GearIcon, CardsIcon, TrophyIcon, ReceiptIcon, WalletIcon } from './icons.js';
import { Avatar, ScreenHead, Spinner } from './ui.js';
import { ensurePushSubscription } from './push.js';
import { tr, useLang } from './i18n.js';

type View = 'login' | 'home' | 'session' | 'settings';
type HomeTab = 'tables' | 'leaderboard' | 'games' | 'payments';

const HOME_TABS: { id: HomeTab; icon: typeof CardsIcon }[] = [
  { id: 'tables', icon: CardsIcon },
  { id: 'leaderboard', icon: TrophyIcon },
  { id: 'games', icon: ReceiptIcon },
  { id: 'payments', icon: WalletIcon },
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
  const [payments, setPayments] = useState<PaymentView[] | null>(null);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const lang = useLang();

  // The server needs the account's language for push notifications. The
  // device's choice wins: it's what the player sees and picked last.
  useEffect(() => {
    if (!account || account.lang === lang) return;
    api
      .setLang(lang)
      .then((r) => setAccount(r.account))
      .catch(() => {
        /* retried on the next language change or launch */
      });
  }, [account?.id, account?.lang, lang]);

  function refreshPayments() {
    api
      .payments()
      .then((r) => {
        setPayments(r.payments);
        setPaymentsError(null);
      })
      .catch((err) => setPaymentsError((err as Error).message));
  }

  // Payments drive the bottom-nav badge, so keep them fresh while logged in —
  // faster on the Payments tab itself, where a confirmation can land any second.
  const onPaymentsTab = view === 'home' && homeTab === 'payments';
  useEffect(() => {
    if (!account?.phone) return;
    refreshPayments();
    const timer = setInterval(refreshPayments, onPaymentsTab ? 8000 : 30000);
    return () => clearInterval(timer);
  }, [account?.id, account?.phone, onPaymentsTab]);

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

  // Tapping the button again while Settings is open closes it — remembering
  // 'settings' as the return view would leave Back stuck on Settings.
  function toggleSettings() {
    if (view === 'settings') return closeSettings();
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
  // Accounts made before phones were required must add one before using the app.
  const needsPhone = !!account && !account.phone && view !== 'login' && view !== 'settings';
  const badge = account && payments ? paymentsNeedingAction(payments, account.id) : 0;

  const showNav = !!(account && account.phone && view !== 'login');

  if (booting) {
    return (
      <div class="app">
        <main class="app__main">
          <Spinner label={tr.app.opening} />
        </main>
      </div>
    );
  }

  return (
    <div class={`app ${showNav ? "app--nav" : ""}`}>
      {view !== "login" && (
        <header class="topbar">
          <button class="brand" onClick={() => (account ? openHomeTab("tables") : setView("login"))}>
            <ChipIcon size={26} />
            <span class="brand__name">{tr.appName}</span>
          </button>
          {account && (
            <div class="topbar__actions">
              {session && session.status !== "settled" && view !== "session" && (
                <button class="livechip" onClick={() => setView("session")}>
                  <span class="livechip__dot" />
                  {tr.app.backToTable}
                  {pendingCount > 0 && <span class="count">{pendingCount}</span>}
                </button>
              )}
              <button
                class={`acctbtn ${view === "settings" ? "acctbtn--active" : ""}`}
                onClick={toggleSettings}
                aria-label={tr.app.settings}
                aria-pressed={view === "settings"}
              >
                <Avatar id={account.id} name={account.displayName} size="sm" />
                <span class="acctbtn__gear">
                  <GearIcon size={11} />
                </span>
              </button>
            </div>
          )}
        </header>
      )}

      <main class="app__main">
        {view === "login" && <Login onAuthed={onAuthed} />}

        {needsPhone && account && (
          <div class="view">
            <ScreenHead title={tr.app.oneMoreThing} sub={tr.app.addPhoneSub} />
            <div class="surface surface--pad">
              <PhoneForm submitLabel={tr.app.continue} onSaved={setAccount} />
            </div>
          </div>
        )}

        {!needsPhone && view === "home" && account && (
          <div key={homeTab}>
            {homeTab === "tables" && <TablesScreen onEnterSession={enterSession} />}
            {homeTab === "leaderboard" && <LeaderboardScreen myAccountId={account.id} />}
            {homeTab === "games" && <GamesScreen myAccountId={account.id} />}
            {homeTab === "payments" && (
              <PaymentsScreen myAccountId={account.id} payments={payments} error={paymentsError} onChanged={refreshPayments} />
            )}
          </div>
        )}

        {!needsPhone && view === "session" && session && playerId && me && (
          <>
            {session.status === "setup" && <LobbyScreen session={session} isHost={isHost} onChanged={setSession} onLeave={leaveSession} />}
            {session.status === "active" && (
              <TableScreen
                session={session}
                playerId={playerId}
                isHost={isHost}
                onChanged={setSession}
                onSettled={setSession}
                onLeave={leaveSession}
              />
            )}
            {session.status === "settled" && (
              <SettlementScreen
                session={session}
                playerId={playerId}
                onLeave={() => {
                  leaveSession();
                  openHomeTab("payments");
                }}
              />
            )}
          </>
        )}

        {!needsPhone && view === "session" && sessionId && !session && !error && <Spinner label={tr.app.loadingGame} />}
        {!needsPhone && view === "session" && error && (
          <div class="view">
            <p class="error">{error}</p>
            <button class="btn btn--block" onClick={leaveSession}>
              {tr.common.backToTables}
            </button>
          </div>
        )}

        {view === "settings" && account && (
          <SettingsScreen account={account} onAccountChanged={setAccount} onLogout={logout} onBack={closeSettings} />
        )}
      </main>

      {showNav && (
        <nav class="bottomnav" aria-label="Main">
          {HOME_TABS.map(({ id, icon: Icon }) => {
            const active = view === 'home' && homeTab === id;
            return (
              <button
                key={id}
                class={`bottomnav__item ${active ? 'bottomnav__item--active' : ''}`}
                onClick={() => openHomeTab(id)}
                aria-current={active ? 'page' : undefined}
              >
                <span class="bottomnav__icon">
                  <Icon size={22} />
                  {id === 'payments' && badge > 0 && <span class="count bottomnav__badge">{badge}</span>}
                </span>
                <span>{tr.app.tabs[id]}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}
