import { useEffect, useState } from 'preact/hooks';
import { api } from './api.js';

/**
 * Profile pictures: which accounts have one (accountId -> photo version),
 * shared by every `Avatar`. Kept outside component state so the whole app
 * reads one copy, the same way `i18n.ts` shares the language.
 */

type Versions = Record<string, string>;

let versions: Versions = {};
const listeners = new Set<(v: Versions) => void>();
/** Bumped on every change, so a refresh that started before it can't bring back an old photo. */
let generation = 0;

export function setAvatarVersions(next: Versions): void {
  generation++;
  versions = next;
  listeners.forEach((l) => l(next));
}

export function refreshAvatars(): void {
  const startedAt = generation;
  api
    .avatars()
    .then((r) => {
      if (generation === startedAt) setAvatarVersions(r.avatars);
    })
    .catch(() => {
      /* keep the last known photos; retried on the next refresh */
    });
}

/** The photo URL for an account, or null (show initials). Re-renders when photos change. */
export function useAvatarUrl(accountId: string): string | null {
  const [current, setCurrent] = useState(versions);
  useEffect(() => {
    listeners.add(setCurrent);
    setCurrent(versions);
    return () => {
      listeners.delete(setCurrent);
    };
  }, []);
  const version = current[accountId];
  return version ? `/api/avatars/${encodeURIComponent(accountId)}/${version}` : null;
}

const PHOTO_PX = 256;

/** Center-crops a picked photo to a square and shrinks it to a small JPEG data URL for upload. */
export async function photoToJpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_PX;
  canvas.height = PHOTO_PX;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, PHOTO_PX, PHOTO_PX);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}
