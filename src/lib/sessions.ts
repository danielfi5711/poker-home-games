import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId, newJoinCode } from './id.js';
import { computeSettlement } from './settlement.js';
import { getAccount } from './accounts.js';
import type {
  Account,
  ChipColor,
  ChipColorId,
  HistoryResponse,
  LeaderboardEntry,
  Player,
  PhotoCount,
  Session,
  SettleResponse,
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

/** Setup/start/settle are host-only, verified against the logged-in account, not just a client-supplied id. */
function requireHost(session: Session, accountId: string): void {
  const host = session.players[session.hostPlayerId];
  if (!host || host.accountId !== accountId) {
    throw new SessionError('Only the host can do that.', 403);
  }
}

function newPlayer(account: Account): Player {
  return { id: newId(), accountId: account.id, name: account.displayName, joinedAt: Date.now(), buyIns: [], cashOut: null };
}

/** Recompute a photo entry's total from confirmedCounts against the session's
 *  current palette — never trust a client-supplied total. */
function priceCounts(palette: ChipColor[], confirmedCounts: Record<ChipColorId, number>): number {
  let totalCents = 0;
  for (const color of palette) {
    const count = confirmedCounts[color.id];
    if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
      totalCents += Math.round(count) * color.valueCents;
    }
  }
  return totalCents;
}

function sanitizeCounts(
  palette: ChipColor[],
  counts: Record<ChipColorId, number> | undefined,
): Record<ChipColorId, number> {
  const out: Record<ChipColorId, number> = {};
  if (!counts) return out;
  for (const color of palette) {
    const n = counts[color.id];
    out[color.id] = typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  }
  return out;
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
    chipPalette: [],
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

export function updatePalette(id: string, accountId: string, palette: Omit<ChipColor, 'id'>[]): Session {
  const session = requireSession(id);
  requireHost(session, accountId);
  if (session.status !== 'setup') {
    throw new SessionError('Chip values can only be changed before the game starts.', 409);
  }
  if (palette.length === 0) throw new SessionError('Add at least one chip color.', 400);

  const withIds: ChipColor[] = palette.map((c, i) => ({
    id: session.chipPalette[i]?.id ?? newId(),
    label: c.label.trim().slice(0, 20) || `Chip ${i + 1}`,
    hex: /^#[0-9a-fA-F]{6}$/.test(c.hex) ? c.hex : '#888888',
    valueCents: Math.max(1, Math.round(c.valueCents || 0)),
  }));

  save((d) => {
    d.sessions[id].chipPalette = withIds;
  });
  return requireSession(id);
}

export function activateSession(id: string, accountId: string): Session {
  const session = requireSession(id);
  requireHost(session, accountId);
  if (session.status !== 'setup') return session;
  if (session.chipPalette.length === 0) {
    throw new SessionError('Set up the chip colors and values before starting.', 400);
  }
  save((d) => {
    d.sessions[id].status = 'active';
  });
  return requireSession(id);
}

function recordPhoto(
  session: Session,
  photo: string | null,
  detectedCounts: Record<ChipColorId, number> | undefined,
  confirmedCounts: Record<ChipColorId, number> | undefined,
): PhotoCount {
  const confirmed = sanitizeCounts(session.chipPalette, confirmedCounts);
  const detected = sanitizeCounts(session.chipPalette, detectedCounts);
  return {
    at: Date.now(),
    photo: photo ?? null,
    detectedCounts: detected,
    confirmedCounts: confirmed,
    totalCents: priceCounts(session.chipPalette, confirmed),
  };
}

export function addBuyIn(
  id: string,
  playerId: string,
  accountId: string,
  photo: string | null,
  detectedCounts: Record<ChipColorId, number> | undefined,
  confirmedCounts: Record<ChipColorId, number> | undefined,
): Session {
  const session = requireSession(id);
  if (session.status === 'settled') throw new SessionError('This game has already been settled.', 409);
  requirePlayerOwnedBy(session, playerId, accountId);

  const entry = recordPhoto(session, photo, detectedCounts, confirmedCounts);
  if (entry.totalCents <= 0) throw new SessionError('Buy-in must be worth more than $0.', 400);

  save((d) => {
    d.sessions[id].players[playerId].buyIns.push(entry);
  });
  return requireSession(id);
}

export function recordCashOut(
  id: string,
  playerId: string,
  accountId: string,
  photo: string | null,
  detectedCounts: Record<ChipColorId, number> | undefined,
  confirmedCounts: Record<ChipColorId, number> | undefined,
): Session {
  const session = requireSession(id);
  if (session.status === 'settled') throw new SessionError('This game has already been settled.', 409);
  requirePlayerOwnedBy(session, playerId, accountId);

  const entry = recordPhoto(session, photo, detectedCounts, confirmedCounts);

  save((d) => {
    d.sessions[id].players[playerId].cashOut = entry;
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
