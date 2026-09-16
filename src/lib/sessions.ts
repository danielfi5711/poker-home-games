import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId, newJoinCode } from './id.js';
import { computeSettlement } from './settlement.js';
import type {
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

function newPlayer(name: string): Player {
  const trimmed = name.trim().slice(0, 40);
  if (!trimmed) throw new SessionError('Name is required.', 400);
  return { id: newId(), name: trimmed, joinedAt: Date.now(), buyIns: [], cashOut: null };
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

export function createSession(name: string, hostName: string): { session: Session; playerId: string } {
  const host = newPlayer(hostName);
  let id = newJoinCode();
  while (data().sessions[id]) id = newJoinCode();

  const session: Session = {
    id,
    name: name.trim().slice(0, 60) || 'Poker Night',
    createdAt: Date.now(),
    status: 'setup',
    hostPlayerId: host.id,
    chipPalette: [],
    players: { [host.id]: host },
    settledAt: null,
  };

  save((d) => {
    d.sessions[id] = session;
  });
  return { session, playerId: host.id };
}

export function getSession(id: string): Session {
  return requireSession(id);
}

export function joinSession(id: string, name: string): { session: Session; playerId: string } {
  const session = requireSession(id);
  if (session.status === 'settled') {
    throw new SessionError('This game has already been settled.', 409);
  }
  const player = newPlayer(name);
  save((d) => {
    d.sessions[session.id].players[player.id] = player;
  });
  return { session: requireSession(id), playerId: player.id };
}

export function updatePalette(id: string, palette: Omit<ChipColor, 'id'>[]): Session {
  const session = requireSession(id);
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

export function activateSession(id: string): Session {
  const session = requireSession(id);
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
  photo: string | null,
  detectedCounts: Record<ChipColorId, number> | undefined,
  confirmedCounts: Record<ChipColorId, number> | undefined,
): Session {
  const session = requireSession(id);
  if (session.status === 'settled') throw new SessionError('This game has already been settled.', 409);
  requirePlayer(session, playerId);

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
  photo: string | null,
  detectedCounts: Record<ChipColorId, number> | undefined,
  confirmedCounts: Record<ChipColorId, number> | undefined,
): Session {
  const session = requireSession(id);
  if (session.status === 'settled') throw new SessionError('This game has already been settled.', 409);
  requirePlayer(session, playerId);

  const entry = recordPhoto(session, photo, detectedCounts, confirmedCounts);

  save((d) => {
    d.sessions[id].players[playerId].cashOut = entry;
  });
  return requireSession(id);
}

export function previewSettlement(id: string): SettleResponse['settlement'] {
  return computeSettlement(requireSession(id));
}

export function settleSession(id: string): SettleResponse {
  const session = requireSession(id);
  if (session.status === 'settled') {
    return { session, settlement: computeSettlement(session) };
  }
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

export function history(): HistoryResponse {
  const cutoff = Date.now() - config.historyWindowDays * 24 * 60 * 60 * 1000;
  const sessions = Object.values(data().sessions)
    .filter((s) => s.status === 'settled' && (s.settledAt ?? 0) >= cutoff)
    .sort((a, b) => (b.settledAt ?? 0) - (a.settledAt ?? 0));

  const byName = new Map<string, LeaderboardEntry>();
  for (const session of sessions) {
    const { netsCents } = computeSettlement(session);
    for (const player of Object.values(session.players)) {
      const key = player.name.trim().toLowerCase();
      if (!key) continue;
      const existing = byName.get(key) ?? { name: player.name.trim(), sessionsPlayed: 0, netCents: 0 };
      existing.sessionsPlayed += 1;
      existing.netCents += netsCents[player.id] ?? 0;
      byName.set(key, existing);
    }
  }

  const leaderboard = [...byName.values()].sort((a, b) => b.netCents - a.netCents);
  return { sessions, leaderboard };
}
