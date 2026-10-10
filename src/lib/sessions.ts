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

/** Buy-ins, cash-outs, and rejoining are only ever done as the account you're logged in as. */
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
  requirePlayerOwnedBy(session, playerId, accountId);
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
  save((d) => {
    d.sessions[id].status = 'settled';
    d.sessions[id].settledAt = Date.now();
  });
  notifySettled(session, settlement);
  return { session: requireSession(id), settlement };
}

/** Tell every player at the table what they owe or are owed, so nobody has to ask. */
function notifySettled(session: Session, settlement: SettlementResult): void {
  const shekels = (cents: number) => `₪${(cents / 100).toFixed(2)}`;
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
      url: '/?tab=games',
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
      transfers: transfers.map((t) => ({
        fromAccountId: session.players[t.fromPlayerId]?.accountId ?? '',
        fromName: nameOf(t.fromPlayerId),
        toAccountId: session.players[t.toPlayerId]?.accountId ?? '',
        toName: nameOf(t.toPlayerId),
        amountCents: t.amountCents,
      })),
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
