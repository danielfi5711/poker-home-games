import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import type {
  Account,
  AuthOptions,
  AuthResponse,
  CodeSentResponse,
  HistoryResponse,
  Lang,
  Payment,
  PaymentsResponse,
  ProfileResponse,
  PushSubscriptionJSON,
  Session,
  SessionResponse,
  SettleResponse,
  SettlementResult,
  VapidKeyResponse,
} from '../../src/shared/types.js';
import { lang, tr } from './i18n.js';

const BASE = '/api';
const TOKEN_KEY = 'poker.authToken';

export function loadToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function saveToken(token: string | null): void {
  screenCache.clear();
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* localStorage unavailable — login just won't survive a refresh */
  }
}

/**
 * Ask the browser not to evict this origin's storage under pressure, so the
 * saved login survives until the player explicitly logs out.
 */
export function requestPersistentStorage(): void {
  try {
    void navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* unsupported — best effort */
  }
}

/** A failed API call. `status` is 0 when the server couldn't be reached at all. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = loadToken();
  const headers: Record<string, string> = { 'x-lang': lang };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(tr.common.networkError, 0);
  }
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message = typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

let authOptionsCache: AuthOptions | null = null;

/** Whether phone recovery is on (null while loading). Fetched once per page load. */
export function useAuthOptions(): AuthOptions | null {
  const [options, setOptions] = useState<AuthOptions | null>(authOptionsCache);
  useEffect(() => {
    if (authOptionsCache) return;
    let alive = true;
    const load = (attempt: number): void => {
      api
        .authOptions()
        .then((o) => {
          authOptionsCache = o;
          if (alive) setOptions(o);
        })
        .catch(() => {
          if (alive) setTimeout(() => load(attempt + 1), Math.min(1000 * 2 ** attempt, 5000));
        });
    };
    load(0);
    return () => {
      alive = false;
    };
  }, []);
  return options;
}

export const api = {
  authOptions: () => req<AuthOptions>('GET', '/auth/options'),
  /** Without `code` (and when phone recovery is on): checks everything and texts a code. With it: creates the account. */
  register: (username: string, password: string, phone = '', code = '') =>
    req<AuthResponse | CodeSentResponse>('POST', '/auth/register', { username, password, phone, code }),
  forgotPassword: (phone: string) => req<CodeSentResponse>('POST', '/auth/forgot', { phone }),
  resetPassword: (phone: string, code: string, newPassword: string) =>
    req<AuthResponse>('POST', '/auth/reset', { phone, code, newPassword }),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ account: Account }>('PUT', '/auth/password', { currentPassword, newPassword }),
  /** Without `code`: texts one. With it: saves the number. `currentPassword` is needed to replace an existing one. */
  setPhone: (phone: string, code = '', currentPassword = '') =>
    req<{ account: Account } | CodeSentResponse>('PUT', '/auth/phone', { phone, code, currentPassword }),
  setLang: (lang: Lang) => req<{ account: Account }>('PUT', '/auth/lang', { lang }),
  login: (username: string, password: string) => req<AuthResponse>('POST', '/auth/login', { username, password }),
  logout: () => req<{ ok: true }>('POST', '/auth/logout'),
  me: () => req<{ account: Account }>('GET', '/auth/me'),
  changeUsername: (newUsername: string, currentPassword: string) =>
    req<{ account: Account }>('PUT', '/auth/username', { newUsername, currentPassword }),

  avatars: () => req<{ avatars: Record<string, string> }>('GET', '/avatars'),
  setAvatar: (image: string) => req<{ avatars: Record<string, string> }>('PUT', '/auth/avatar', { image }),
  removeAvatar: () => req<{ avatars: Record<string, string> }>('DELETE', '/auth/avatar'),

  vapidPublicKey: () => req<VapidKeyResponse>('GET', '/push/vapid-public-key'),
  subscribePush: (subscription: PushSubscriptionJSON) => req<{ ok: true }>('POST', '/push/subscribe', { subscription }),

  payments: () => req<PaymentsResponse>('GET', '/payments'),
  markPaid: (id: string) => req<{ payment: Payment }>('POST', `/payments/${id}/paid`),
  respondPayment: (id: string, received: boolean) => req<{ payment: Payment }>('POST', `/payments/${id}/respond`, { received }),
  history: (since?: number) => req<HistoryResponse>('GET', since ? `/history?since=${since}` : '/history'),
  profile: (accountId: string) => req<ProfileResponse>('GET', `/profiles/${accountId}`),
  sessions: () => req<{ sessions: Session[] }>('GET', '/sessions'),
  createSession: (name: string) => req<SessionResponse>('POST', '/sessions', { name }),

  join: (id: string) => req<SessionResponse>('POST', `/sessions/${id}/join`),
  close: (id: string) => req<{ ok: true }>('POST', `/sessions/${id}/close`),
  get: (id: string) => req<{ session: Session }>('GET', `/sessions/${id}`),
  requestBuyIn: (id: string, playerId: string, amountCents: number) =>
    req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/buyins`, { amountCents }),
  respondToBuyIn: (id: string, buyInId: string, approve: boolean) =>
    req<{ session: Session }>('POST', `/sessions/${id}/buyins/${buyInId}/respond`, { approve }),
  removeBuyIn: (id: string, buyInId: string) => req<{ session: Session }>('DELETE', `/sessions/${id}/buyins/${buyInId}`),
  cashOut: (id: string, playerId: string, amountCents: number) =>
    req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/cashout`, { amountCents }),
  settlementPreview: (id: string) => req<{ settlement: SettlementResult }>('GET', `/sessions/${id}/settlement`),
  settle: (id: string) => req<SettleResponse>('POST', `/sessions/${id}/settle`),
  reopen: (id: string) => req<{ session: Session }>('POST', `/sessions/${id}/reopen`),
};

const SAVED_KEY = 'poker.activeSession';

export interface SavedIdentity {
  sessionId: string;
  playerId: string;
}

export function loadSavedIdentity(): SavedIdentity | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedIdentity) : null;
  } catch {
    return null;
  }
}

export function saveIdentity(identity: SavedIdentity | null): void {
  try {
    if (identity) localStorage.setItem(SAVED_KEY, JSON.stringify(identity));
    else localStorage.removeItem(SAVED_KEY);
  } catch {
    /* localStorage unavailable — session just won't survive a refresh */
  }
}

/** Polls a session's state every `intervalMs` so every open phone stays live. */
export function usePolledSession(sessionId: string | null, intervalMs = 3000) {
  const [session, setSessionState] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Every poll and every local update takes a ticket; a poll response is only
  // applied if nothing newer has landed since it was sent. Without this, a
  // poll that was already in flight when you tapped "buy in" could come back
  // with the old state and make your action look like it never happened.
  const ticket = useRef(0);
  const applied = useRef(0);

  const setSession = useCallback((s: Session | null) => {
    ticket.current += 1;
    applied.current = ticket.current;
    setSessionState(s);
  }, []);

  const reload = useCallback(async () => {
    if (!sessionId) return;
    const mine = ++ticket.current;
    try {
      const { session } = await api.get(sessionId);
      if (mine < applied.current) return; // stale — a newer state is already showing
      applied.current = mine;
      setSessionState(session);
      setError(null);
    } catch (err) {
      if (mine >= applied.current) setError((err as Error).message);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return;
    void reload();
    const timer = setInterval(() => void reload(), intervalMs);
    return () => clearInterval(timer);
  }, [sessionId, intervalMs, reload]);

  return { session, error, reload, setSession };
}

/** Last data each home tab loaded, by key, so returning to a tab shows it at once. */
const screenCache = new Map<string, unknown>();

/**
 * Loads a home tab's data, remembering the last result under `key`. Coming
 * back to a tab shows what it had right away (no loader) and refreshes it
 * quietly behind the scenes. When `key` changes to one not loaded yet, the
 * previous data stays up until the new data arrives. `error` is only set
 * when there's nothing to show.
 */
export function useCachedLoad<T>(key: string, load: () => Promise<T>) {
  const [data, setData] = useState<T | null>(() => (screenCache.get(key) as T | undefined) ?? null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    if (screenCache.has(key)) setData(screenCache.get(key) as T);
    setError(null);
    load()
      .then((r) => {
        screenCache.set(key, r);
        if (current) setData(r);
      })
      .catch((err) => {
        if (current && !screenCache.has(key)) setError((err as Error).message);
      });
    return () => {
      current = false;
    };
  }, [key]);

  return { data, error };
}
