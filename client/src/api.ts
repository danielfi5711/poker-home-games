import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  Account,
  AuthResponse,
  ChipColor,
  ChipColorId,
  Group,
  HistoryResponse,
  Session,
  SessionResponse,
  SettleResponse,
  SettlementResult,
  VisionCountResponse,
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

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const token = loadToken();
  const headers: Record<string, string> = {};
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;

  const res = await fetch(BASE + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}) as Record<string, unknown>);
  if (!res.ok) {
    const message = typeof (data as { error?: unknown }).error === 'string' ? (data as { error: string }).error : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return data as T;
}

export interface PhotoPayload {
  photo: string | null;
  detectedCounts: Record<ChipColorId, number>;
  confirmedCounts: Record<ChipColorId, number>;
}

export const api = {
  register: (username: string, password: string, displayName: string) =>
    req<AuthResponse>('POST', '/auth/register', { username, password, displayName }),
  login: (username: string, password: string) => req<AuthResponse>('POST', '/auth/login', { username, password }),
  logout: () => req<{ ok: true }>('POST', '/auth/logout'),
  me: () => req<{ account: Account }>('GET', '/auth/me'),

  myGroups: () => req<{ groups: Group[] }>('GET', '/groups'),
  createGroup: (name: string) => req<{ group: Group }>('POST', '/groups', { name }),
  joinGroup: (joinCode: string) => req<{ group: Group }>('POST', '/groups/join', { joinCode }),
  getGroup: (groupId: string) => req<{ group: Group }>('GET', `/groups/${groupId}`),
  groupHistory: (groupId: string) => req<HistoryResponse>('GET', `/groups/${groupId}/history`),
  groupSessions: (groupId: string) => req<{ sessions: Session[] }>('GET', `/groups/${groupId}/sessions`),
  createSession: (groupId: string, name: string) => req<SessionResponse>('POST', `/groups/${groupId}/sessions`, { name }),

  join: (id: string) => req<SessionResponse>('POST', `/sessions/${id}/join`),
  get: (id: string) => req<{ session: Session }>('GET', `/sessions/${id}`),
  setPalette: (id: string, palette: Omit<ChipColor, 'id'>[]) => req<{ session: Session }>('PUT', `/sessions/${id}/palette`, { palette }),
  activate: (id: string) => req<{ session: Session }>('POST', `/sessions/${id}/activate`),
  addBuyIn: (id: string, playerId: string, payload: PhotoPayload) => req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/buyins`, payload),
  cashOut: (id: string, playerId: string, payload: PhotoPayload) => req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/cashout`, payload),
  visionCount: (id: string, photo: string) => req<VisionCountResponse>('POST', `/sessions/${id}/vision-count`, { photo }),
  settlementPreview: (id: string) => req<{ settlement: SettlementResult }>('GET', `/sessions/${id}/settlement`),
  settle: (id: string) => req<SettleResponse>('POST', `/sessions/${id}/settle`),
};

const SAVED_KEY = 'poker.activeSession';

export interface SavedIdentity {
  groupId: string;
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

const SAVED_GROUP_KEY = 'poker.activeGroup';

export function loadSavedGroupId(): string | null {
  try {
    return localStorage.getItem(SAVED_GROUP_KEY);
  } catch {
    return null;
  }
}

export function saveGroupId(groupId: string | null): void {
  try {
    if (groupId) localStorage.setItem(SAVED_GROUP_KEY, groupId);
    else localStorage.removeItem(SAVED_GROUP_KEY);
  } catch {
    /* ignore */
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
