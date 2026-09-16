import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';

function isStandalone(): boolean {
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone = (window.navigator as unknown as { standalone?: boolean }).standalone === true;
  return displayModeStandalone || iosStandalone;
}

function isIOS(): boolean {
  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports as "Macintosh" but exposes multi-touch, unlike a real Mac.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1);
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * Blocks the app UI behind an install screen until the PWA is actually
 * installed (running in standalone display mode) — this is meant to be an
 * installed app, not a page people just keep open in a browser tab.
 */
export function InstallGate({ children }: { children: ComponentChildren }) {
  const [installed, setInstalled] = useState(isStandalone());
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia('(display-mode: standalone)');
    const onDisplayModeChange = () => setInstalled(isStandalone());
    mql.addEventListener('change', onDisplayModeChange);

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onAppInstalled);
    return () => {
      mql.removeEventListener('change', onDisplayModeChange);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onAppInstalled);
    };
  }, []);

  if (installed) return <>{children}</>;

  async function handleInstallClick() {
    if (!deferredPrompt) return;
    setInstalling(true);
    await deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    setInstalling(false);
    if (choice.outcome === 'accepted') setDeferredPrompt(null);
  }

  const ios = isIOS();

  return (
    <div class="installgate">
      <div class="installgate__card">
        <img src="/icons/icon-192.png" width={80} height={80} class="installgate__icon" alt="" />
        <h1>Poker Night</h1>
        <p class="muted">
          This only runs as an installed app — add it to your home screen to open it.
        </p>

        {deferredPrompt && (
          <button class="btn btn--primary btn--big" onClick={handleInstallClick} disabled={installing}>
            {installing ? 'Installing…' : 'Install App'}
          </button>
        )}

        {!deferredPrompt && ios && (
          <ol class="installgate__steps">
            <li>
              Tap the <strong>Share</strong> button <span class="installgate__shareicon">⬆️</span> in Safari's
              toolbar
            </li>
            <li>
              Scroll down and tap <strong>Add to Home Screen</strong>
            </li>
            <li>
              Tap <strong>Add</strong>, then open <strong>Poker Night</strong> from your home screen
            </li>
          </ol>
        )}

        {!deferredPrompt && !ios && (
          <p class="hint">
            Open this page on your phone in Chrome or Safari, then use the browser menu to
            "Add to Home Screen" / "Install app." (Desktop browsers that don't support installing a PWA
            can't open this app.)
          </p>
        )}
      </div>
    </div>
  );
}
