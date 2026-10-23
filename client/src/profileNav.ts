/**
 * Opening a player's profile from anywhere: any screen that shows a player
 * calls `openProfile(accountId)` (or spreads `profileTap(accountId)` onto the
 * row/avatar), and `App` — which owns navigation — switches to the profile view.
 */

type Listener = (accountId: string) => void;
const listeners = new Set<Listener>();

export function openProfile(accountId: string): void {
  listeners.forEach((l) => l(accountId));
}

export function onOpenProfile(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Makes a non-button element (a list row, a podium spot) open that player's profile on tap or Enter. */
export function profileTap(accountId: string) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: () => openProfile(accountId),
    onKeyDown: (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openProfile(accountId);
      }
    },
  };
}
