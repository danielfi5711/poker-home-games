import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { tr } from './i18n.js';
import { AppTitle } from './ui.js';

declare const __BUILD_ID__: string;

const RESTART_KEY = 'poker.updateRestarts';

/** The build the server is serving now, or null if we can't tell (offline, dev, old server). */
async function serverBuild(): Promise<string | null> {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: unknown };
    return typeof body.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}

function waitForActivation(sw: ServiceWorker, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    if (sw.state === 'activated' || sw.state === 'redundant') return resolve();
    const timer = setTimeout(resolve, timeoutMs);
    sw.addEventListener('statechange', () => {
      if (sw.state === 'activated' || sw.state === 'redundant') {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}

/**
 * Restart into the new build: have the service worker fetch it (it skips
 * waiting and claims the page, see sw.ts), then reload. If a restart already
 * came back to this screen, the precache is clearly stuck — drop it so the
 * reload goes to the network (the worker falls back to the network for
 * anything not cached). The worker itself stays registered, so push
 * notifications keep working.
 */
async function restartIntoNewBuild(): Promise<void> {
  let tries = 0;
  try {
    tries = Number(sessionStorage.getItem(RESTART_KEY)) || 0;
    sessionStorage.setItem(RESTART_KEY, String(tries + 1));
  } catch {
    /* no storage — just reload */
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.update().catch(() => {});
      const incoming = reg.installing ?? reg.waiting;
      if (incoming) await waitForActivation(incoming, 15_000);
    }
    if (tries > 0 && 'caches' in window) {
      const names = await caches.keys();
      await Promise.all(names.map((n) => caches.delete(n)));
    }
  } catch {
    /* reload anyway */
  }
  location.reload();
}

/**
 * Blocks the app once the server is serving a newer build than the one
 * running here, until the player restarts. Checked when the app opens and
 * every time it comes back to the foreground (an installed PWA is usually
 * resumed, not relaunched). Offline or unknown = let them in.
 */
export function UpdateGate({ children }: { children: ComponentChildren }) {
  const [outdated, setOutdated] = useState(false);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    if (__BUILD_ID__ === 'dev') return;
    let alive = true;
    async function check() {
      const latest = await serverBuild();
      if (!alive || latest === null) return;
      if (latest === __BUILD_ID__) {
        try {
          sessionStorage.removeItem(RESTART_KEY);
        } catch {
          /* ignore */
        }
        return;
      }
      setOutdated(true);
    }
    void check();
    const onVisible = () => document.visibilityState === 'visible' && void check();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  if (!outdated) return <>{children}</>;

  function restart() {
    setRestarting(true);
    void restartIntoNewBuild();
  }

  return (
    <div class="installgate">
      <div class="surface installgate__card">
        <img src="/icons/icon-192.png" width={80} height={80} class="installgate__icon" alt="" />
        <AppTitle />
        <h2 class="updategate__title">{tr.update.title}</h2>
        <p class="muted">{tr.update.body}</p>
        <button class="btn btn--primary btn--lg btn--block" onClick={restart} disabled={restarting}>
          {restarting ? tr.update.restarting : tr.update.restart}
        </button>
      </div>
    </div>
  );
}
