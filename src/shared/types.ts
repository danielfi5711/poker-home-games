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
  /** The account that owns this seat — identity now comes from login, not a typed name. */
  accountId: string;
  /** Snapshot of the account's display name at join time. */
  name: string;
  joinedAt: number;
  buyIns: PhotoCount[];
  cashOut: PhotoCount | null;
}

export type SessionStatus = 'setup' | 'active' | 'settled';

export interface Session {
  id: string;
  /** Every table belongs to exactly one group — only that group's members can see or join it. */
  groupId: string;
  name: string;
  createdAt: number;
  status: SessionStatus;
  hostPlayerId: string;
  chipPalette: ChipColor[];
  players: Record<string, Player>;
  settledAt: number | null;
}

/** A logged-in player. Never carries the password hash — that never leaves the server. */
export interface Account {
  id: string;
  username: string;
  displayName: string;
  createdAt: number;
}

/** A friend group: its own roster and its own leaderboard, scoped to the tables created inside it. */
export interface Group {
  id: string;
  name: string;
  /** Shareable code a friend types in to join this group. */
  joinCode: string;
  ownerAccountId: string;
  memberAccountIds: string[];
  createdAt: number;
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
  accountId: string;
  name: string;
  sessionsPlayed: number;
  /** Running total of every settled game's net for this account in this group — the group's "balance." */
  balanceCents: number;
}

// --- REST API DTOs -----------------------------------------------------------

export interface RegisterRequest {
  username: string;
  password: string;
  displayName: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

export interface CreateGroupRequest {
  name: string;
}

export interface JoinGroupRequest {
  joinCode: string;
}

export interface GroupResponse {
  group: Group;
}

export interface GroupListResponse {
  groups: Group[];
}

export interface CreateSessionRequest {
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

export interface VisionCountRequest {
  /** JPEG/PNG data URL of the chip photo. */
  photo: string;
  palette: ChipColor[];
}

/** One physical stack the AI vision counter found in the photo. */
export interface VisionStackDetection {
  colorId: ChipColorId;
  count: number;
  /** Bounding box as a percentage (0-100) of the photo's width/height, from the top-left corner. */
  box: { xMinPct: number; yMinPct: number; xMaxPct: number; yMaxPct: number };
}

export interface VisionCountResponse {
  counts: Record<ChipColorId, number>;
  stacks: VisionStackDetection[];
  /** The model's own read on how trustworthy this count is — "low" surfaces a warning to double-check before confirming. */
  confidence: 'high' | 'medium' | 'low';
}

export interface SettleResponse {
  session: Session;
  settlement: SettlementResult;
}

export interface HistoryResponse {
  sessions: Session[];
  leaderboard: LeaderboardEntry[];
}
