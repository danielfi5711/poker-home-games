/** All money is integer cents — never floats — to keep settlement math exact. */

export type BuyInStatus = 'pending' | 'approved' | 'denied';

/** A buy-in request. Host-approved before it counts toward any total (the
 *  host's own requests auto-approve — there's no one above the host). */
export interface BuyIn {
  id: string;
  amountCents: number;
  requestedAt: number;
  status: BuyInStatus;
  respondedAt: number | null;
}

export interface CashOut {
  amountCents: number;
  at: number;
}

export interface Player {
  id: string;
  /** The account that owns this seat — identity now comes from login, not a typed name. */
  accountId: string;
  /** Snapshot of the account's display name at join time. */
  name: string;
  joinedAt: number;
  buyIns: BuyIn[];
  cashOut: CashOut | null;
}

export type SessionStatus = 'setup' | 'active' | 'settled';

export interface Session {
  id: string;
  /** Every table belongs to exactly one group — only that group's members can see or join it. */
  groupId: string;
  name: string;
  createdAt: number;
  /** 'setup' = lobby, waiting for the host to start; 'active' = playing; 'settled' = final. */
  status: SessionStatus;
  hostPlayerId: string;
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
  /** cashOut - approved buy-ins per player, in cents. */
  netsCents: Record<string, number>;
  /** Minimal set of payments that settles every net. */
  transfers: Transfer[];
  /**
   * Sum of all nets. Should be 0 (money in == money out). A nonzero value
   * means someone's numbers don't add up and is surfaced as a warning
   * before payouts are shown.
   */
  discrepancyCents: number;
  /** True once every player at the table has recorded a cash-out. */
  complete: boolean;
}

/** All-time, across every settled game in a group — a player's running balance. */
export interface LeaderboardEntry {
  accountId: string;
  name: string;
  sessionsPlayed: number;
  balanceCents: number;
}

// --- REST API DTOs -----------------------------------------------------------

export interface RegisterRequest {
  username: string;
  password: string;
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

export interface RequestBuyInRequest {
  amountCents: number;
}

export interface RespondBuyInRequest {
  approve: boolean;
}

export interface CashOutRequest {
  amountCents: number;
}

export interface SettleResponse {
  session: Session;
  settlement: SettlementResult;
}

export interface HistoryResponse {
  sessions: Session[];
  leaderboard: LeaderboardEntry[];
}

// --- Push notifications -------------------------------------------------------

export interface PushSubscriptionKeys {
  p256dh: string;
  auth: string;
}

export interface PushSubscriptionJSON {
  endpoint: string;
  keys: PushSubscriptionKeys;
}

export interface SubscribePushRequest {
  subscription: PushSubscriptionJSON;
}

export interface VapidKeyResponse {
  publicKey: string;
}
