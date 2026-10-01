import webpush from 'web-push';
import { config } from '../config.js';
import { JsonStore } from './store.js';
import type { PushSubscriptionJSON } from '../shared/types.js';

interface Data {
  /** accountId -> every device/browser subscription registered for it. */
  subscriptions: Record<string, PushSubscriptionJSON[]>;
}

let store: JsonStore<Data>;

export async function initPush(): Promise<void> {
  store = await JsonStore.load<Data>(config.pushFile, { subscriptions: {} });
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
  }
}

export function pushEnabled(): boolean {
  return Boolean(config.vapidPublicKey && config.vapidPrivateKey);
}

export function vapidPublicKey(): string {
  return config.vapidPublicKey;
}

function sameSubscription(a: PushSubscriptionJSON, b: PushSubscriptionJSON): boolean {
  return a.endpoint === b.endpoint;
}

export function subscribe(accountId: string, subscription: PushSubscriptionJSON): void {
  store.update((d) => {
    const existing = d.subscriptions[accountId] ?? [];
    d.subscriptions[accountId] = [...existing.filter((s) => !sameSubscription(s, subscription)), subscription];
  });
}

function removeSubscription(accountId: string, endpoint: string): void {
  store.update((d) => {
    const existing = d.subscriptions[accountId];
    if (!existing) return;
    d.subscriptions[accountId] = existing.filter((s) => s.endpoint !== endpoint);
  });
}

export interface NotifyPayload {
  title: string;
  body: string;
  /** Relative URL to focus/open when the notification is tapped. */
  url: string;
}

/** Fire-and-forget: a push failure never blocks the buy-in/approval request that triggered it. */
export function notify(accountId: string, payload: NotifyPayload): void {
  if (!pushEnabled()) return;
  const subs = store.get().subscriptions[accountId] ?? [];
  for (const sub of subs) {
    webpush.sendNotification(sub, JSON.stringify(payload)).catch((err: unknown) => {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        // Subscription expired or was revoked on the client — stop trying it.
        removeSubscription(accountId, sub.endpoint);
      }
    });
  }
}
