import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId, newJoinCode } from './id.js';
import { computeSettlement } from './settlement.js';
import { getAccount } from './accounts.js';
import { notify } from './push.js';
import type {
  Account,
  BuyIn,
  HistoryHighlights,
  HistoryResponse,
  LeaderboardEntry,
  MatchSummary,
  Payment,
  PaymentView,
  Player,
  PlayerProfile,
  ProfileMatch,
  ProfileRegular,
  Session,
  SettleResponse,
} from '../shared/types.js';
import { MAX_BUY_IN_CENTS } from '../shared/types.js';

export class SessionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface Data {
  sessions: Record<string, Session>;
  /** One-time data fixes already applied (see `runMigrations`). */
  migrations?: string[];
}

let store: JsonStore<Data>;

export async function initSessions(): Promise<void> {
  store = await JsonStore.load<Data>(config.dataFile, { sessions: {} });
  runMigrations();
}

/** One-shot data fixes, each recorded by name so it never runs twice. */
function runMigrations(): void {
  const done = new Set(data().migrations ?? []);
  const apply = (name: string, fix: (d: Data) => void) => {
    if (done.has(name)) return;
    save((d) => {
      fix(d);
      d.migrations = [...(d.migrations ?? []), name];
    });
    console.log(`Migration applied: ${name}`);
  };

  // 2026-10-10: the owner asked to clear the leaderboard (only test games so
  // far). The leaderboard and Games tab are derived from settled tables, so
  // drop those along with their payments.
  apply('2026-10-10-clear-leaderboard', (d) => {
    for (const [id, session] of Object.entries(d.sessions)) {
      if (session.status === 'settled') delete d.sessions[id];
    }
  });
}

function data(): Data {
  return store.get();
}

function save(mutator: (data: Data) => void): void {
  store.update(mutator);
}

function requireSession(id: string): Session {
  const session = data().sessions[id.toUpperCase()];
  if (!session) throw new SessionError('This table is gone — the host closed it.', 404);
  return session;
}

function requirePlayer(session: Session, playerId: string): Player {
  const player = session.players[playerId];
  if (!player) throw new SessionError('Player is not in this game.', 404);
  return player;
}

/** Buy-ins and rejoining are only ever done as the account you're logged in as (cash-outs may also come from the host). */
function requirePlayerOwnedBy(session: Session, playerId: string, accountId: string): Player {
  const player = requirePlayer(session, playerId);
  if (player.accountId !== accountId) throw new SessionError('That seat belongs to someone else.', 403);
  return player;
}

/** Starting/approving/settling are host-only, verified against the logged-in account, not just a client-supplied id. */
function requireHost(session: Session, accountId: string): Player {
  const host = session.players[session.hostPlayerId];
  if (!host || host.accountId !== accountId) {
    throw new SessionError('Only the host can do that.', 403);
  }
  return host;
}

function newPlayer(account: Account): Player {
  return { id: newId(), accountId: account.id, name: account.displayName, joinedAt: Date.now(), buyIns: [], cashOut: null };
}

const MAX_AMOUNT_CENTS = 100_000_00; // ₪100,000 — generous ceiling against fat-finger/garbage input.

function sanitizeAmountCents(amountCents: number): number {
  if (!Number.isFinite(amountCents)) throw new SessionError('Enter a valid amount.', 400);
  const rounded = Math.round(amountCents);
  if (rounded < 0 || rounded > MAX_AMOUNT_CENTS) throw new SessionError('That amount looks wrong.', 400);
  return rounded;
}

export function createSession(name: string, host: Account): { session: Session; playerId: string } {
  const hostPlayer = newPlayer(host);
  let id = newJoinCode();
  while (data().sessions[id]) id = newJoinCode();

  const session: Session = {
    id,
    name: name.trim().slice(0, 60) || 'Poker Night',
    createdAt: Date.now(),
    status: 'setup',
    hostPlayerId: hostPlayer.id,
    players: { [hostPlayer.id]: hostPlayer },
    settledAt: null,
  };

  save((d) => {
    d.sessions[id] = session;
  });
  return { session, playerId: hostPlayer.id };
}

/** How long an unstarted table survives without its host having the lobby open. */
const ABANDONED_LOBBY_MS = 15 * 60_000;
/** Only persist host presence this often, so an open lobby isn't a database write every poll. */
const HOST_SEEN_WRITE_MS = 60_000;

export function getSession(id: string, viewerAccountId?: string): Session {
  const session = requireSession(id);
  const host = session.players[session.hostPlayerId];
  if (session.status === 'setup' && viewerAccountId && host?.accountId === viewerAccountId) {
    const now = Date.now();
    if (now - (session.hostSeenAt ?? 0) > HOST_SEEN_WRITE_MS) {
      save((d) => {
        d.sessions[session.id].hostSeenAt = now;
      });
    }
  }
  return requireSession(id);
}

function closeTable(session: Session): void {
  save((d) => {
    delete d.sessions[session.id];
  });
}

/** The host left the lobby before starting — the table goes away with them. */
export function leaveSession(id: string, accountId: string): { closed: boolean } {
  const session = requireSession(id);
  const host = session.players[session.hostPlayerId];
  if (session.status !== 'setup' || host?.accountId !== accountId) return { closed: false };
  closeTable(session);
  return { closed: true };
}

/** Closes unstarted tables whose host hasn't had the lobby open for a while (app closed, wandered off). */
export function closeAbandonedLobbies(): void {
  const cutoff = Date.now() - ABANDONED_LOBBY_MS;
  for (const session of Object.values(data().sessions)) {
    if (session.status !== 'setup') continue;
    if ((session.hostSeenAt ?? session.createdAt) > cutoff) continue;
    closeTable(session);
    console.log(`Closed abandoned lobby ${session.id}`);
  }
}

/** Joining is idempotent — reopening a table you're already seated at returns your existing seat. */
export function joinSession(id: string, account: Account): { session: Session; playerId: string } {
  const session = requireSession(id);
  const existing = Object.values(session.players).find((p) => p.accountId === account.id);
  if (existing) return { session, playerId: existing.id };

  if (session.status === 'settled') {
    throw new SessionError('This game has already been settled.', 409);
  }
  const player = newPlayer(account);
  save((d) => {
    d.sessions[session.id].players[player.id] = player;
  });
  return { session: requireSession(id), playerId: player.id };
}

export function activateSession(id: string, accountId: string): Session {
  const session = requireSession(id);
  requireHost(session, accountId);
  if (session.status !== 'setup') return session;
  save((d) => {
    d.sessions[id].status = 'active';
  });
  return requireSession(id);
}

/**
 * A player asks to buy in for `amountCents`. The host's own requests
 * auto-approve (there's no one above the host); everyone else's request sits
 * `pending` until the host approves or denies it, and the host gets a push
 * notification so they don't have to be staring at the app.
 */
export function requestBuyIn(id: string, playerId: string, accountId: string, amountCentsRaw: number): Session {
  const session = requireSession(id);
  if (session.status !== 'active') throw new SessionError('The game needs to be started before buy-ins can be recorded.', 409);
  const player = requirePlayerOwnedBy(session, playerId, accountId);
  const amountCents = sanitizeAmountCents(amountCentsRaw);
  if (amountCents <= 0) throw new SessionError('Buy-in must be worth more than ₪0.', 400);
  if (amountCents > MAX_BUY_IN_CENTS) throw new SessionError('A buy-in can be at most ₪50.', 400);

  const isHost = session.hostPlayerId === playerId;
  const buyIn: BuyIn = {
    id: newId(),
    amountCents,
    requestedAt: Date.now(),
    status: isHost ? 'approved' : 'pending',
    respondedAt: isHost ? Date.now() : null,
  };

  save((d) => {
    const p = d.sessions[id].players[playerId];
    p.buyIns.push(buyIn);
    if (buyIn.status === 'approved') reopenSeat(p);
  });

  return requireSession(id);
}

/** Host-only: approve or deny a pending buy-in request. */
export function respondToBuyIn(id: string, buyInId: string, accountId: string, approve: boolean): Session {
  const session = requireSession(id);
  requireHost(session, accountId);

  const target = requireBuyIn(session, buyInId);
  if (target.buyIn.status !== 'pending') throw new SessionError('That request was already handled.', 409);

  const status = approve ? 'approved' : 'denied';
  save((d) => {
    const buyIn = d.sessions[id].players[target!.player.id].buyIns.find((b) => b.id === buyInId)!;
    buyIn.status = status;
    buyIn.respondedAt = Date.now();
    if (approve) reopenSeat(d.sessions[id].players[target!.player.id]);
  });

  return requireSession(id);
}

function requireBuyIn(session: Session, buyInId: string): { player: Player; buyIn: BuyIn } {
  for (const player of Object.values(session.players)) {
    const buyIn = player.buyIns.find((b) => b.id === buyInId);
    if (buyIn) return { player, buyIn };
  }
  throw new SessionError('That buy-in request no longer exists.', 404);
}

/**
 * Undo a buy-in mid-game. A waiting request can be cancelled by whoever asked for it (or the host);
 * an approved one only by the host — that's the "approved it by mistake" / "typed the wrong amount" fix.
 * A seat that buy-in reopened stays open: the player just cashes out again (₪0 if nothing went back in).
 */
export function removeBuyIn(id: string, buyInId: string, accountId: string): Session {
  const session = requireSession(id);
  if (session.status === 'settled') throw new SessionError('This game has already been settled.', 409);
  const { player, buyIn } = requireBuyIn(session, buyInId);
  const host = session.players[session.hostPlayerId];
  const byHost = host?.accountId === accountId;
  if (buyIn.status === 'denied') throw new SessionError('That request was already handled.', 409);
  if (buyIn.status === 'approved') requireHost(session, accountId);
  else if (player.accountId !== accountId && !byHost) throw new SessionError('That seat belongs to someone else.', 403);

  save((d) => {
    const p = d.sessions[session.id].players[player.id];
    p.buyIns = p.buyIns.filter((b) => b.id !== buyInId);
  });
  return requireSession(id);
}

/**
 * An approved buy-in after a cash-out puts the player back at the table: bank what they already took
 * out and clear `cashOut`, so they can cash out again and settling waits for that second cash-out.
 */
function reopenSeat(player: Player): void {
  if (!player.cashOut) return;
  player.earlierCashOutsCents = (player.earlierCashOutsCents ?? 0) + player.cashOut.amountCents;
  player.cashOut = null;
}

export function recordCashOut(id: string, playerId: string, accountId: string, amountCentsRaw: number): Session {
  const session = requireSession(id);
  if (session.status === 'settled') throw new SessionError('This game has already been settled.', 409);
  // A player cashes themselves out; the host can also do it for anyone who
  // left without entering theirs, so the game can still be settled properly.
  const player = requirePlayer(session, playerId);
  const byHost = player.accountId !== accountId;
  if (byHost) requireHost(session, accountId);
  const amountCents = sanitizeAmountCents(amountCentsRaw);

  save((d) => {
    d.sessions[id].players[playerId].cashOut = { amountCents, at: Date.now() };
  });
  return requireSession(id);
}

export function previewSettlement(id: string): SettleResponse['settlement'] {
  return computeSettlement(requireSession(id));
}

/**
 * Host-only. Every player must have a cash-out (the host can enter it for
 * them via `recordCashOut`) and no buy-in may still be pending — otherwise
 * money silently goes missing from the settlement.
 */
export function settleSession(id: string, accountId: string): SettleResponse {
  const session = requireSession(id);
  if (session.status === 'settled') {
    return { session, settlement: computeSettlement(session) };
  }
  requireHost(session, accountId);
  // Never settle with silent gaps: a missing cash-out used to count as ₪0,
  // which made chips vanish and everyone look like they lost.
  const players = Object.values(session.players);
  const missing = players.filter((p) => !p.cashOut).map((p) => p.name);
  if (missing.length > 0) {
    throw new SessionError(`Enter a cash-out for ${missing.join(', ')} before settling.`, 409);
  }
  if (players.some((p) => p.buyIns.some((b) => b.status === 'pending'))) {
    throw new SessionError('Approve or deny the pending buy-in requests before settling.', 409);
  }
  const settlement = computeSettlement(session);
  const now = Date.now();
  const payments: Payment[] = settlement.transfers.map((t) => {
    const from = session.players[t.fromPlayerId]!;
    const to = session.players[t.toPlayerId]!;
    return {
      id: newId(),
      sessionId: id,
      sessionName: session.name,
      fromAccountId: from.accountId,
      fromName: from.name,
      toAccountId: to.accountId,
      toName: to.name,
      amountCents: t.amountCents,
      status: 'unpaid',
      payTappedAt: null,
      confirmedAt: null,
      createdAt: now,
    };
  });
  save((d) => {
    d.sessions[id].status = 'settled';
    d.sessions[id].settledAt = now;
    d.sessions[id].payments = payments;
  });
  return { session: requireSession(id), settlement };
}

// --- Payments ----------------------------------------------------------------

const shekels = (cents: number) => `₪${(cents / 100).toFixed(2)}`;

function findPayment(paymentId: string): { session: Session; payment: Payment } {
  for (const session of Object.values(data().sessions)) {
    const payment = session.payments?.find((p) => p.id === paymentId);
    if (payment) return { session, payment };
  }
  throw new SessionError('Payment not found.', 404);
}

function updatePayment(sessionId: string, paymentId: string, mutate: (p: Payment) => void): Payment {
  save((d) => {
    const p = d.sessions[sessionId]?.payments?.find((x) => x.id === paymentId);
    if (p) mutate(p);
  });
  return findPayment(paymentId).payment;
}

/** Every payment you owe or are owed, newest first, with the receiver's phone. */
export function paymentsFor(accountId: string): PaymentView[] {
  return Object.values(data().sessions)
    .flatMap((s) => s.payments ?? [])
    .filter((p) => p.fromAccountId === accountId || p.toAccountId === accountId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({ ...p, toPhone: getAccount(p.toAccountId)?.phone ?? null }));
}

/**
 * The payer says they've sent the money (however they paid): ask the receiver to confirm. Saying it
 * again re-asks.
 */
export function markPaid(paymentId: string, accountId: string): Payment {
  const { session, payment } = findPayment(paymentId);
  if (payment.fromAccountId !== accountId) throw new SessionError('Only the payer can do that.', 403);
  if (payment.status === 'confirmed') return payment;
  const updated = updatePayment(session.id, paymentId, (p) => {
    p.status = 'awaiting_confirmation';
    p.payTappedAt ??= Date.now();
  });
  notify(payment.toAccountId, (t) => ({
    title: t.saysPaidTitle(payment.fromName),
    body: t.saysPaidBody(payment.fromName, shekels(payment.amountCents), payment.sessionName),
    url: '/?tab=payments',
  }));
  return updated;
}

/**
 * The receiver says whether the money actually arrived. They can confirm at any point — even if the
 * payer never said they paid (paid in cash, forgot to tap) — which closes the payment.
 */
export function respondPayment(paymentId: string, accountId: string, received: boolean): Payment {
  const { session, payment } = findPayment(paymentId);
  if (payment.toAccountId !== accountId) throw new SessionError('Only the person being paid can confirm.', 403);
  if (payment.status === 'confirmed') return payment;

  if (received) {
    const updated = updatePayment(session.id, paymentId, (p) => {
      p.status = 'confirmed';
      p.confirmedAt = Date.now();
    });
    notify(payment.fromAccountId, (t) => ({
      title: t.paymentConfirmedTitle,
      body: t.paymentConfirmedBody(payment.toName, shekels(payment.amountCents), payment.sessionName),
      url: '/?tab=payments',
    }));
    return updated;
  }

  const updated = updatePayment(session.id, paymentId, (p) => {
    p.status = 'unpaid';
  });
  notify(payment.fromAccountId, (t) => ({
    title: t.stillNeedToPayTitle,
    body: t.stillNeedToPayBody(payment.toName, shekels(payment.amountCents), payment.sessionName),
    url: '/?tab=payments',
  }));
  return updated;
}

export function allSessions(): Session[] {
  return Object.values(data().sessions).sort((a, b) => b.createdAt - a.createdAt);
}

interface StreakAccumulator extends LeaderboardEntry {
  biggestWinMatchName: string | null;
  biggestLossMatchName: string | null;
}

export function history(): HistoryResponse {
  const cutoff = Date.now() - config.historyWindowDays * 24 * 60 * 60 * 1000;
  // A game with a single player isn't a real game (usually a test or a table nobody joined): leave it out of
  // the Games tab and the leaderboard both.
  const settled = Object.values(data().sessions).filter(
    (s) => s.status === 'settled' && (s.settledAt ?? 0) >= cutoff && Object.keys(s.players).length > 1,
  );
  // Oldest-first so streaks accumulate in actual chronological order; the
  // running streak after the loop is, by definition, the *current* one.
  const chronological = [...settled].sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));

  const byAccount = new Map<string, StreakAccumulator>();
  const matches: MatchSummary[] = [];

  for (const session of chronological) {
    const { netsCents, transfers, discrepancyCents } = computeSettlement(session);
    const matchPlayers: MatchSummary['players'] = [];

    for (const player of Object.values(session.players)) {
      const net = netsCents[player.id] ?? 0;
      const name = getAccount(player.accountId)?.displayName ?? player.name;
      matchPlayers.push({ accountId: player.accountId, name, netCents: net });

      const entry: StreakAccumulator =
        byAccount.get(player.accountId) ??
        {
          accountId: player.accountId,
          name,
          sessionsPlayed: 0,
          balanceCents: 0,
          currentStreakType: null,
          currentStreakCount: 0,
          longestWinStreak: 0,
          longestLossStreak: 0,
          biggestWinCents: 0,
          biggestLossCents: 0,
          biggestWinMatchName: null,
          biggestLossMatchName: null,
        };

      entry.name = name;
      entry.sessionsPlayed += 1;
      entry.balanceCents += net;

      // Capture the streak as it stood *before* this match, so we can tell
      // whether this match extends it or starts a new one.
      const prevStreakType = entry.currentStreakType;
      const prevStreakCount = entry.currentStreakCount;

      if (net > 0) {
        entry.currentStreakType = 'win';
        entry.currentStreakCount = prevStreakType === 'win' ? prevStreakCount + 1 : 1;
        entry.longestWinStreak = Math.max(entry.longestWinStreak, entry.currentStreakCount);
        if (net > entry.biggestWinCents) {
          entry.biggestWinCents = net;
          entry.biggestWinMatchName = session.name;
        }
      } else if (net < 0) {
        entry.currentStreakType = 'loss';
        entry.currentStreakCount = prevStreakType === 'loss' ? prevStreakCount + 1 : 1;
        entry.longestLossStreak = Math.max(entry.longestLossStreak, entry.currentStreakCount);
        if (net < entry.biggestLossCents) {
          entry.biggestLossCents = net;
          entry.biggestLossMatchName = session.name;
        }
      } else {
        entry.currentStreakType = null;
        entry.currentStreakCount = 0;
      }

      byAccount.set(player.accountId, entry);
    }

    const nameOf = (playerId: string) => {
      const player = session.players[playerId];
      return player ? (getAccount(player.accountId)?.displayName ?? player.name) : '?';
    };
    matches.push({
      id: session.id,
      name: session.name,
      settledAt: session.settledAt ?? session.createdAt,
      players: matchPlayers,
      transfers: transfers.map((t) => {
        const fromAccountId = session.players[t.fromPlayerId]?.accountId ?? '';
        const toAccountId = session.players[t.toPlayerId]?.accountId ?? '';
        const payment = session.payments?.find(
          (p) => p.fromAccountId === fromAccountId && p.toAccountId === toAccountId && p.amountCents === t.amountCents,
        );
        return {
          fromAccountId,
          fromName: nameOf(t.fromPlayerId),
          toAccountId,
          toName: nameOf(t.toPlayerId),
          amountCents: t.amountCents,
          paymentId: payment?.id ?? null,
          status: payment?.status ?? null,
        };
      }),
      discrepancyCents,
    });
  }

  matches.sort((a, b) => b.settledAt - a.settledAt);
  const entries = [...byAccount.values()];
  const leaderboard: LeaderboardEntry[] = entries
    .map(({ biggestWinMatchName, biggestLossMatchName, ...entry }) => entry)
    .sort((a, b) => b.balanceCents - a.balanceCents);

  const hottest = entries
    .filter((e) => e.currentStreakType === 'win' && e.currentStreakCount >= 2)
    .sort((a, b) => b.currentStreakCount - a.currentStreakCount)[0];
  const coldest = entries
    .filter((e) => e.currentStreakType === 'loss' && e.currentStreakCount >= 2)
    .sort((a, b) => b.currentStreakCount - a.currentStreakCount)[0];
  const biggestWin = entries.filter((e) => e.biggestWinCents > 0).sort((a, b) => b.biggestWinCents - a.biggestWinCents)[0];
  const biggestLoss = entries.filter((e) => e.biggestLossCents < 0).sort((a, b) => a.biggestLossCents - b.biggestLossCents)[0];

  const highlights: HistoryHighlights = {
    hottest: hottest ? { accountId: hottest.accountId, name: hottest.name, streakCount: hottest.currentStreakCount } : null,
    coldest: coldest ? { accountId: coldest.accountId, name: coldest.name, streakCount: coldest.currentStreakCount } : null,
    biggestWin: biggestWin
      ? { accountId: biggestWin.accountId, name: biggestWin.name, amountCents: biggestWin.biggestWinCents, matchName: biggestWin.biggestWinMatchName ?? '' }
      : null,
    biggestLoss: biggestLoss
      ? { accountId: biggestLoss.accountId, name: biggestLoss.name, amountCents: biggestLoss.biggestLossCents, matchName: biggestLoss.biggestLossMatchName ?? '' }
      : null,
  };

  return { matches, leaderboard, highlights };
}

/** One player's profile: their leaderboard row plus a per-game breakdown, from the same games as `history()`. */
export function profile(accountId: string): PlayerProfile {
  const account = getAccount(accountId);
  if (!account) throw new SessionError('Player not found.', 404);

  const { matches, leaderboard } = history();
  const rankIndex = leaderboard.findIndex((e) => e.accountId === accountId);
  const together = new Map<string, ProfileRegular>();
  const mine: ProfileMatch[] = [];

  for (const match of matches) {
    const me = match.players.find((p) => p.accountId === accountId);
    if (!me) continue;
    mine.push({
      id: match.id,
      name: match.name,
      settledAt: match.settledAt,
      netCents: me.netCents,
      place: 1 + match.players.filter((p) => p.netCents > me.netCents).length,
      playerCount: match.players.length,
    });
    for (const other of match.players) {
      if (other.accountId === accountId) continue;
      const seen = together.get(other.accountId);
      if (seen) seen.gamesTogether++;
      else together.set(other.accountId, { accountId: other.accountId, name: other.name, gamesTogether: 1 });
    }
  }

  let running = 0;
  const balanceHistory = [...mine].reverse().map((m) => ({ at: m.settledAt, balanceCents: (running += m.netCents) }));

  return {
    accountId,
    name: account.displayName,
    memberSince: account.createdAt,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    rankedPlayers: leaderboard.length,
    stats: rankIndex >= 0 ? leaderboard[rankIndex]! : null,
    wins: mine.filter((m) => m.netCents > 0).length,
    losses: mine.filter((m) => m.netCents < 0).length,
    breakevens: mine.filter((m) => m.netCents === 0).length,
    balanceHistory,
    matches: mine,
    regulars: [...together.values()].sort((a, b) => b.gamesTogether - a.gamesTogether).slice(0, 3),
  };
}
