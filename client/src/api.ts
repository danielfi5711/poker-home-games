import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  Account,
  AuthResponse,
  HistoryResponse,
  Payment,
  PaymentsResponse,
  PushSubscriptionJSON,
  Session,
  SessionResponse,
  SettleResponse,
  SettlementResult,
  VapidKeyResponse,
} from '../../src/shared/types.js';

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
  const headers: Record<string, string> = {};
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
    throw new ApiError('Could not reach the server.', 0);
  }
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message = typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `Request failed (${res.status})`;
    throw new ApiError(message, res.status);
  }
  return data as T;
}

export const api = {
  register: (username: string, password: string, phone: string) =>
    req<AuthResponse>('POST', '/auth/register', { username, password, phone }),
  setPhone: (phone: string) => req<{ account: Account }>('PUT', '/auth/phone', { phone }),
  login: (username: string, password: string) => req<AuthResponse>('POST', '/auth/login', { username, password }),
  logout: () => req<{ ok: true }>('POST', '/auth/logout'),
  me: () => req<{ account: Account }>('GET', '/auth/me'),
  changeUsername: (newUsername: string, currentPassword: string) =>
    req<{ account: Account }>('PUT', '/auth/username', { newUsername, currentPassword }),

  vapidPublicKey: () => req<VapidKeyResponse>('GET', '/push/vapid-public-key'),
  subscribePush: (subscription: PushSubscriptionJSON) => req<{ ok: true }>('POST', '/push/subscribe', { subscription }),

  payments: () => req<PaymentsResponse>('GET', '/payments'),
  startPayment: (id: string) => req<{ payment: Payment }>('POST', `/payments/${id}/start`),
  respondPayment: (id: string, received: boolean) => req<{ payment: Payment }>('POST', `/payments/${id}/respond`, { received }),
  history: () => req<HistoryResponse>('GET', '/history'),
  sessions: () => req<{ sessions: Session[] }>('GET', '/sessions'),
  createSession: (name: string) => req<SessionResponse>('POST', '/sessions', { name }),

  join: (id: string) => req<SessionResponse>('POST', `/sessions/${id}/join`),
  get: (id: string) => req<{ session: Session }>('GET', `/sessions/${id}`),
  activate: (id: string) => req<{ session: Session }>('POST', `/sessions/${id}/activate`),
  requestBuyIn: (id: string, playerId: string, amountCents: number) =>
    req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/buyins`, { amountCents }),
  respondToBuyIn: (id: string, buyInId: string, approve: boolean) =>
    req<{ session: Session }>('POST', `/sessions/${id}/buyins/${buyInId}/respond`, { approve }),
  cashOut: (id: string, playerId: string, amountCents: number) =>
    req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/cashout`, { amountCents }),
  settlementPreview: (id: string) => req<{ settlement: SettlementResult }>('GET', `/sessions/${id}/settlement`),
  settle: (id: string) => req<SettleResponse>('POST', `/sessions/${id}/settle`),
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
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!sessionId) return;
    try {
      const { session } = await api.get(sessionId);
      setSession(session);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
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
