import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ShareIcon } from './icons.js';
import { tr, useLang } from './i18n.js';
import { AppTitle, LangSwitch } from './ui.js';

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
  useLang(); // InstallGate sits above App, so it re-renders the whole tree on a language change

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
      <div class="surface installgate__card">
        <img src="/icons/icon-192.png" width={80} height={80} class="installgate__icon" alt="" />
        <AppTitle />
        <LangSwitch />
        <p class="muted">{tr.install.body}</p>

        {deferredPrompt && (
          <button class="btn btn--primary btn--lg btn--block" onClick={handleInstallClick} disabled={installing}>
            {installing ? tr.install.installing : tr.install.install}
          </button>
        )}

        {!deferredPrompt && ios && (
          <ol class="installgate__steps">
            <li>
              {tr.install.iosStep1Before} <strong>{tr.install.share}</strong>{' '}
              <span class="installgate__shareicon">
                <ShareIcon size={14} />
              </span>{' '}
              {tr.install.iosStep1After}
            </li>
            <li>
              {tr.install.iosStep2Before} <strong>{tr.install.addToHome}</strong>
            </li>
            <li>
              {tr.install.iosStep3Tap} <strong>{tr.install.add}</strong>
              {tr.install.iosStep3Open} <strong>{tr.appName}</strong> {tr.install.iosStep3After}
            </li>
          </ol>
        )}

        {!deferredPrompt && !ios && <p class="hint">{tr.install.otherBrowsers}</p>}
      </div>
    </div>
  );
}
