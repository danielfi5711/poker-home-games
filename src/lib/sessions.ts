import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId, newJoinCode } from './id.js';
import { computeSettlement } from './settlement.js';
import { getAccount } from './accounts.js';
import { notify } from './push.js';
import type { Account, BuyIn, HistoryResponse, LeaderboardEntry, Player, Session, SettleResponse } from '../shared/types.js';

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

const MAX_AMOUNT_CENTS = 100_000_00; // $100,000 — generous ceiling against fat-finger/garbage input.

function sanitizeAmountCents(amountCents: number): number {
  if (!Number.isFinite(amountCents)) throw new SessionError('Enter a valid dollar amount.', 400);
  const rounded = Math.round(amountCents);
  if (rounded < 0 || rounded > MAX_AMOUNT_CENTS) throw new SessionError('That amount looks wrong.', 400);
  return rounded;
}

export function createSession(groupId: string, name: string, host: Account): { session: Session; playerId: string } {
  const hostPlayer = newPlayer(host);
  let id = newJoinCode();
  while (data().sessions[id]) id = newJoinCode();

  const session: Session = {
    id,
    groupId,
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
  if (amountCents <= 0) throw new SessionError('Buy-in must be worth more than $0.', 400);

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
        body: `${player.name} is requesting a $${(amountCents / 100).toFixed(2)} buy-in at "${session.name}".`,
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
      ? `Your $${(target.buyIn.amountCents / 100).toFixed(2)} buy-in at "${session.name}" was approved.`
      : `Your $${(target.buyIn.amountCents / 100).toFixed(2)} buy-in request at "${session.name}" was denied.`,
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

export function settleSession(id: string, accountId: string): SettleResponse {
  const session = requireSession(id);
  if (session.status === 'settled') {
    return { session, settlement: computeSettlement(session) };
  }
  requireHost(session, accountId);
  const settlement = computeSettlement(session);
  if (!settlement.complete) {
    throw new SessionError(
      'Every player needs to cash out (even for $0) before the game can be settled.',
      409,
    );
  }
  save((d) => {
    d.sessions[id].status = 'settled';
    d.sessions[id].settledAt = Date.now();
  });
  return { session: requireSession(id), settlement };
}

export function sessionsForGroup(groupId: string): Session[] {
  return Object.values(data().sessions)
    .filter((s) => s.groupId === groupId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export function history(groupId: string): HistoryResponse {
  const cutoff = Date.now() - config.historyWindowDays * 24 * 60 * 60 * 1000;
  const sessions = Object.values(data().sessions)
    .filter((s) => s.groupId === groupId && s.status === 'settled' && (s.settledAt ?? 0) >= cutoff)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0));

  const byAccount = new Map<string, LeaderboardEntry>();
  for (const session of sessions) {
    const { netsCents } = computeSettlement(session);
    for (const player of Object.values(session.players)) {
      const existing = byAccount.get(player.accountId) ?? {
        accountId: player.accountId,
        name: getAccount(player.accountId)?.displayName ?? player.name,
        sessionsPlayed: 0,
        balanceCents: 0,
      };
      existing.sessionsPlayed += 1;
      existing.balanceCents += netsCents[player.id] ?? 0;
      byAccount.set(player.accountId, existing);
    }
  }

  const leaderboard = [...byAccount.values()].sort((a, b) => b.balanceCents - a.balanceCents);
  return { sessions, leaderboard };
}
