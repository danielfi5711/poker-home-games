/** All money is integer cents — never floats — to keep settlement math exact. */

export type ChipColorId = string;

export interface ChipColor {
  id: ChipColorId;
  label: string;
  /** CSS hex color, e.g. "#d0342c". */
  hex: string;
  /** Dollar value of a single chip of this color, in cents. */
  valueCents: number;
}

/** One buy-in or cash-out, backed by a photo of the chip stack(s). */
export interface PhotoCount {
  at: number;
  /** Compressed JPEG data URL, or null if the player skipped the photo. */
  photo: string | null;
  /** What the on-device heuristic guessed per chip color. */
  detectedCounts: Record<ChipColorId, number>;
  /** What the player confirmed (starts as a copy of detectedCounts). */
  confirmedCounts: Record<ChipColorId, number>;
  /** sum(confirmedCounts[id] * palette[id].valueCents) at the time of entry. */
  totalCents: number;
}

export interface Player {
  id: string;
  name: string;
  joinedAt: number;
  buyIns: PhotoCount[];
  cashOut: PhotoCount | null;
}

export type SessionStatus = 'setup' | 'active' | 'settled';

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  status: SessionStatus;
  hostPlayerId: string;
  chipPalette: ChipColor[];
  players: Record<string, Player>;
  settledAt: number | null;
}

export interface Transfer {
  fromPlayerId: string;
  toPlayerId: string;
  amountCents: number;
}

export interface SettlementResult {
  /** cashOut - totalBuyIns per player, in cents. */
  netsCents: Record<string, number>;
  /** Minimal set of payments that settles every net. */
  transfers: Transfer[];
  /**
   * Sum of all nets. Should be 0 (chips in == chips out). A nonzero value
   * means someone's chip count doesn't add up — most likely a miscounted
   * cash-out — and is surfaced as a warning before payouts are shown.
   */
  discrepancyCents: number;
  /** True once every player at the table has recorded a cash-out. */
  complete: boolean;
}

export interface LeaderboardEntry {
  name: string;
  sessionsPlayed: number;
  netCents: number;
}

// --- REST API DTOs -----------------------------------------------------------

export interface CreateSessionRequest {
  name: string;
  hostName: string;
}

export interface JoinSessionRequest {
  name: string;
}

export interface SessionResponse {
  session: Session;
  playerId?: string;
}

export interface UpdatePaletteRequest {
  palette: Omit<ChipColor, 'id'>[];
}

export interface RecordPhotoRequest {
  photo: string | null;
  detectedCounts: Record<ChipColorId, number>;
  confirmedCounts: Record<ChipColorId, number>;
}

export interface SettleResponse {
  session: Session;
  settlement: SettlementResult;
}

export interface HistoryResponse {
  sessions: Session[];
  leaderboard: LeaderboardEntry[];
}
