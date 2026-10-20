/**
 * All money is in shekels (₪), stored as integer agorot/cents — never
 * floats — to keep settlement math exact. Field names stay "*Cents" (the
 * generic hundredth-of-a-unit, same convention regardless of currency).
 */

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

/** House rule: a single buy-in can be at most ₪50 (buy in again for more). Shared by server + client. */
export const MAX_BUY_IN_CENTS = 50_00;

export type SessionStatus = 'setup' | 'active' | 'settled';

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  /** 'setup' = lobby, waiting for the host to start; 'active' = playing; 'settled' = final. */
  status: SessionStatus;
  hostPlayerId: string;
  players: Record<string, Player>;
  settledAt: number | null;
  /** Last time the host had the lobby open — an unstarted table whose host is gone gets closed. */
  hostSeenAt?: number;
  /** Created when the game is settled — one per who-pays-whom transfer. Absent on older games. */
  payments?: Payment[];
}

export type PaymentStatus = 'unpaid' | 'awaiting_confirmation' | 'confirmed';

/**
 * One settled-game debt. Bit has no API to verify a transfer, so "paid" means
 * the receiver confirmed it: the payer taps Pay (-> awaiting_confirmation),
 * and a minute later the receiver is asked whether the money arrived.
 */
export interface Payment {
  id: string;
  sessionId: string;
  sessionName: string;
  fromAccountId: string;
  fromName: string;
  toAccountId: string;
  toName: string;
  amountCents: number;
  status: PaymentStatus;
  payTappedAt: number | null;
  /** When to ask the receiver to confirm; cleared once asked. Stored so a restart never loses it. */
  confirmAskDueAt: number | null;
  confirmedAt: number | null;
  createdAt: number;
}

/** A payment as its payer/receiver sees it — with the receiver's phone so the payer can send via Bit. */
export interface PaymentView extends Payment {
  toPhone: string | null;
}

export interface PaymentsResponse {
  payments: PaymentView[];
}

/** A logged-in player. Never carries the password hash — that never leaves the server. */
export interface Account {
  id: string;
  username: string;
  displayName: string;
  /** Israeli mobile, normalized to 05XXXXXXXX — friends pay you on Bit with it. Null on accounts made before it was required. */
  phone: string | null;
  /** UI language — also the language of this account's push notifications. */
  lang: Lang;
  createdAt: number;
}

export type Lang = 'en' | 'he';
export const LANGS: readonly Lang[] = ['en', 'he'];

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'he';
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

export type StreakType = 'win' | 'loss' | null;

/** All-time, across every settled game — a player's running balance and streaks. */
export interface LeaderboardEntry {
  accountId: string;
  name: string;
  sessionsPlayed: number;
  balanceCents: number;
  /** The player's streak as of their most recent match — null if it just broke (a breakeven game). */
  currentStreakType: StreakType;
  currentStreakCount: number;
  longestWinStreak: number;
  longestLossStreak: number;
  /** Biggest single-match net, 0 if they've never won/lost respectively. Loss is stored negative. */
  biggestWinCents: number;
  biggestLossCents: number;
}

/** One player's result in one specific settled match. */
export interface MatchPlayerResult {
  accountId: string;
  name: string;
  netCents: number;
}

/** One payment needed to square up a settled match. */
export interface MatchTransfer {
  fromAccountId: string;
  fromName: string;
  toAccountId: string;
  toName: string;
  amountCents: number;
  /** Set when the game has tracked payments (games settled after payments were added). */
  paymentId: string | null;
  status: PaymentStatus | null;
}

/** A settled match's per-player breakdown — the "match history" entry. */
export interface MatchSummary {
  id: string;
  name: string;
  settledAt: number;
  players: MatchPlayerResult[];
  /** Minimal set of payments that squares everyone up for this match. */
  transfers: MatchTransfer[];
  /** Nonzero when buy-ins and cash-outs didn't add up (see `SettlementResult`). */
  discrepancyCents: number;
}

export interface HistoryHighlights {
  hottest: { accountId: string; name: string; streakCount: number } | null;
  coldest: { accountId: string; name: string; streakCount: number } | null;
  biggestWin: { accountId: string; name: string; amountCents: number; matchName: string } | null;
  biggestLoss: { accountId: string; name: string; amountCents: number; matchName: string } | null;
}

// --- REST API DTOs -----------------------------------------------------------

export interface RegisterRequest {
  username: string;
  password: string;
  phone: string;
}

export interface LoginRequest {
  username: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

export interface ChangeUsernameRequest {
  newUsername: string;
  currentPassword: string;
}

export interface AccountResponse {
  account: Account;
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
  matches: MatchSummary[];
  leaderboard: LeaderboardEntry[];
  highlights: HistoryHighlights;
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
