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
  Session,
  SettleResponse,
  SettlementResult,
} from '../shared/types.js';

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
}

let store: JsonStore<Data>;

export async function initSessions(): Promise<void> {
  store = await JsonStore.load<Data>(config.dataFile, { sessions: {} });
}

function data(): Data {
  return store.get();
}

function save(mutator: (data: Data) => void): void {
  store.update(mutator);
}

function requireSession(id: string): Session {
  const session = data().sessions[id.toUpperCase()];
  if (!session) throw new SessionError(`No game found for code "${id}".`, 404);
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

export function getSession(id: string): Session {
  return requireSession(id);
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

  const isHost = session.hostPlayerId === playerId;
  const buyIn: BuyIn = {
    id: newId(),
    amountCents,
    requestedAt: Date.now(),
    status: isHost ? 'approved' : 'pending',
    respondedAt: isHost ? Date.now() : null,
  };

  save((d) => {
    d.sessions[id].players[playerId].buyIns.push(buyIn);
  });

  if (!isHost) {
    const host = session.players[session.hostPlayerId];
    if (host) {
      notify(host.accountId, {
        title: `${player.name} wants to buy in`,
        body: `${player.name} is requesting a ₪${(amountCents / 100).toFixed(2)} buy-in at "${session.name}".`,
        url: `/?session=${session.id}`,
      });
    }
  }

  return requireSession(id);
}

/** Host-only: approve or deny a pending buy-in request. The requesting player gets a push either way. */
export function respondToBuyIn(id: string, buyInId: string, accountId: string, approve: boolean): Session {
  const session = requireSession(id);
  requireHost(session, accountId);

  let target: { player: Player; buyIn: BuyIn } | null = null;
  for (const player of Object.values(session.players)) {
    const buyIn = player.buyIns.find((b) => b.id === buyInId);
    if (buyIn) {
      target = { player, buyIn };
      break;
    }
  }
  if (!target) throw new SessionError('That buy-in request no longer exists.', 404);
  if (target.buyIn.status !== 'pending') throw new SessionError('That request was already handled.', 409);

  const status = approve ? 'approved' : 'denied';
  save((d) => {
    const buyIn = d.sessions[id].players[target!.player.id].buyIns.find((b) => b.id === buyInId)!;
    buyIn.status = status;
    buyIn.respondedAt = Date.now();
  });

  notify(target.player.accountId, {
    title: approve ? 'Buy-in approved' : 'Buy-in denied',
    body: approve
      ? `Your ₪${(target.buyIn.amountCents / 100).toFixed(2)} buy-in at "${session.name}" was approved.`
      : `Your ₪${(target.buyIn.amountCents / 100).toFixed(2)} buy-in request at "${session.name}" was denied.`,
    url: `/?session=${session.id}`,
  });

  return requireSession(id);
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

  if (byHost) {
    notify(player.accountId, {
      title: 'The host cashed you out',
      body: `You were cashed out for ₪${(amountCents / 100).toFixed(2)} at "${session.name}".`,
      url: `/?session=${session.id}`,
    });
  }
  return requireSession(id);
}

export function previewSettlement(id: string): SettleResponse['settlement'] {
  return computeSettlement(requireSession(id));
}

/**
 * The host can end the game whenever they're ready — there's no requirement
 * that every player has recorded a cash-out first. Anyone who hasn't is
 * simply treated as cashing out for ₪0 (settlement.ts already defaults a
 * missing cash-out to 0), since the host is the one physically watching the
 * table and chips.
 */
export function settleSession(id: string, accountId: string): SettleResponse {
  const session = requireSession(id);
  if (session.status === 'settled') {
    return { session, settlement: computeSettlement(session) };
  }
  requireHost(session, accountId);
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
      confirmAskDueAt: null,
      confirmedAt: null,
      createdAt: now,
    };
  });
  save((d) => {
    d.sessions[id].status = 'settled';
    d.sessions[id].settledAt = now;
    d.sessions[id].payments = payments;
  });
  notifySettled(session, settlement);
  return { session: requireSession(id), settlement };
}

// --- Payments ----------------------------------------------------------------

/** How long after the payer taps "Pay with Bit" the receiver is asked to confirm. */
const CONFIRM_ASK_DELAY_MS = 60_000;

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

/** Every payment you owe or are owed, newest first, with the receiver's phone for Bit. */
export function paymentsFor(accountId: string): PaymentView[] {
  return Object.values(data().sessions)
    .flatMap((s) => s.payments ?? [])
    .filter((p) => p.fromAccountId === accountId || p.toAccountId === accountId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((p) => ({ ...p, toPhone: getAccount(p.toAccountId)?.phone ?? null }));
}

/** The payer tapped "Pay with Bit" — ask the receiver to confirm in a minute (re-tapping re-arms it). */
export function startPayment(paymentId: string, accountId: string): Payment {
  const { session, payment } = findPayment(paymentId);
  if (payment.fromAccountId !== accountId) throw new SessionError('Only the payer can do that.', 403);
  if (payment.status === 'confirmed') return payment;
  const now = Date.now();
  return updatePayment(session.id, paymentId, (p) => {
    p.status = 'awaiting_confirmation';
    p.payTappedAt = now;
    p.confirmAskDueAt = now + CONFIRM_ASK_DELAY_MS;
  });
}

/** The receiver says whether the money actually arrived. */
export function respondPayment(paymentId: string, accountId: string, received: boolean): Payment {
  const { session, payment } = findPayment(paymentId);
  if (payment.toAccountId !== accountId) throw new SessionError('Only the person being paid can confirm.', 403);
  if (payment.status === 'confirmed') return payment;

  if (received) {
    const updated = updatePayment(session.id, paymentId, (p) => {
      p.status = 'confirmed';
      p.confirmAskDueAt = null;
      p.confirmedAt = Date.now();
    });
    notify(payment.fromAccountId, {
      title: 'Payment confirmed ✓',
      body: `${payment.toName} got your ${shekels(payment.amountCents)} for "${payment.sessionName}".`,
      url: '/?tab=payments',
    });
    return updated;
  }

  const updated = updatePayment(session.id, paymentId, (p) => {
    p.status = 'unpaid';
    p.confirmAskDueAt = null;
  });
  notify(payment.fromAccountId, {
    title: 'You still need to pay',
    body: `${payment.toName} hasn't received your ${shekels(payment.amountCents)} for "${payment.sessionName}" yet.`,
    url: '/?tab=payments',
  });
  return updated;
}

/**
 * Sends each due "did the money arrive?" question once. Runs on an interval;
 * due times live in the stored data, so a restart never loses one.
 */
export function sweepPaymentConfirmations(): void {
  const now = Date.now();
  for (const session of Object.values(data().sessions)) {
    for (const payment of session.payments ?? []) {
      if (payment.status !== 'awaiting_confirmation' || payment.confirmAskDueAt === null || payment.confirmAskDueAt > now) continue;
      updatePayment(session.id, payment.id, (p) => {
        p.confirmAskDueAt = null;
      });
      notify(payment.toAccountId, {
        title: `Did ${payment.fromName} pay you?`,
        body: `${payment.fromName} went to send you ${shekels(payment.amountCents)} on Bit for "${payment.sessionName}". Tap to confirm.`,
        url: '/?tab=payments',
      });
    }
  }
}

/** Tell every player at the table what they owe or are owed, so nobody has to ask. */
function notifySettled(session: Session, settlement: SettlementResult): void {
  for (const player of Object.values(session.players)) {
    const pays = settlement.transfers.filter((t) => t.fromPlayerId === player.id);
    const gets = settlement.transfers.filter((t) => t.toPlayerId === player.id);
    const lines = [
      ...pays.map((t) => `Send ${shekels(t.amountCents)} to ${session.players[t.toPlayerId]?.name ?? '?'}`),
      ...gets.map((t) => `${session.players[t.fromPlayerId]?.name ?? '?'} sends you ${shekels(t.amountCents)}`),
    ];
    notify(player.accountId, {
      title: `"${session.name}" is over`,
      body: lines.length > 0 ? lines.join('\n') : 'You broke even — nothing to pay.',
      url: lines.length > 0 ? '/?tab=payments' : '/?tab=games',
    });
  }
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
  const settled = Object.values(data().sessions).filter(
    (s) => s.status === 'settled' && (s.settledAt ?? 0) >= cutoff,
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
