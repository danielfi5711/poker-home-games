import type { PushSubscriptionJSON } from '../../src/shared/types.js';
import { api } from './api.js';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

/**
 * Subscribes this device to Web Push and registers it with the server, so
 * the host gets notified of buy-in requests even when the app isn't open.
 * Safe to call every time the app boots/logs in — it's a no-op once already
 * subscribed, and fails silently on browsers/contexts that don't support it.
 */
export async function ensurePushSubscription(): Promise<void> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission === 'denied') return;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();

    if (!subscription) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const { publicKey } = await api.vapidPublicKey();
      if (!publicKey) return;
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
    }

    await api.subscribePush(subscription.toJSON() as unknown as PushSubscriptionJSON);
  } catch {
    /* push unsupported, permission denied, or offline — the app works fine without it */
  }
}
