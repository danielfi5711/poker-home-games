import { useCallback, useEffect, useState } from 'preact/hooks';
import type {
  ChipColor,
  ChipColorId,
  HistoryResponse,
  Session,
  SessionResponse,
  SettleResponse,
  SettlementResult,
} from '../../src/shared/types.js';

const BASE = '/api';

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
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
  createSession: (name: string, hostName: string) => req<SessionResponse>('POST', '/sessions', { name, hostName }),
  join: (id: string, name: string) => req<SessionResponse>('POST', `/sessions/${id}/join`, { name }),
  get: (id: string) => req<{ session: Session }>('GET', `/sessions/${id}`),
  setPalette: (id: string, palette: Omit<ChipColor, 'id'>[]) => req<{ session: Session }>('PUT', `/sessions/${id}/palette`, { palette }),
  activate: (id: string) => req<{ session: Session }>('POST', `/sessions/${id}/activate`),
  addBuyIn: (id: string, playerId: string, payload: PhotoPayload) => req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/buyins`, payload),
  cashOut: (id: string, playerId: string, payload: PhotoPayload) => req<{ session: Session }>('POST', `/sessions/${id}/players/${playerId}/cashout`, payload),
  settlementPreview: (id: string) => req<{ settlement: SettlementResult }>('GET', `/sessions/${id}/settlement`),
  settle: (id: string) => req<SettleResponse>('POST', `/sessions/${id}/settle`),
  history: () => req<HistoryResponse>('GET', '/history'),
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
