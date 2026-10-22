import { randomBytes } from 'node:crypto';
import { config } from '../config.js';
import { JsonStore } from './store.js';
import { AuthError } from './accounts.js';

/**
 * Profile pictures. The client crops and compresses a photo to a small square
 * JPEG before upload, so each one is a few tens of KB — small enough to keep
 * as base64 in their own store, apart from the accounts blob that's rewritten
 * on every login.
 */

interface Photo {
  /** Random per upload: part of the image URL, so a new photo is a new URL (cache-busting) and URLs can't be guessed. */
  version: string;
  jpegBase64: string;
}

interface Data {
  /** accountId -> that account's current photo. */
  photos: Record<string, Photo>;
}

/** A 256px JPEG is far below this; it only stops someone storing something huge. */
const MAX_PHOTO_BYTES = 200 * 1024;
const JPEG_DATA_URL = 'data:image/jpeg;base64,';

let store: JsonStore<Data>;

export async function initAvatars(): Promise<void> {
  store = await JsonStore.load<Data>(config.avatarsFile, { photos: {} });
}

/** accountId -> photo version, for every account with a photo. */
export function avatarVersions(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [accountId, photo] of Object.entries(store.get().photos)) out[accountId] = photo.version;
  return out;
}

export function setAvatar(accountId: string, dataUrl: string): string {
  if (!dataUrl.startsWith(JPEG_DATA_URL)) throw new AuthError("That photo couldn't be used.", 400);
  const jpegBase64 = dataUrl.slice(JPEG_DATA_URL.length);
  const bytes = Buffer.from(jpegBase64, 'base64');
  // JPEG files start with FF D8.
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new AuthError("That photo couldn't be used.", 400);
  if (bytes.length > MAX_PHOTO_BYTES) throw new AuthError('That photo is too large.', 400);

  const version = randomBytes(8).toString('hex');
  store.update((d) => {
    d.photos[accountId] = { version, jpegBase64: bytes.toString('base64') };
  });
  return version;
}

export function removeAvatar(accountId: string): void {
  if (!store.get().photos[accountId]) return;
  store.update((d) => {
    delete d.photos[accountId];
  });
}

/** The JPEG for this exact version, or null if it was replaced/removed (or never existed). */
export function avatarImage(accountId: string, version: string): Buffer | null {
  const photo = store.get().photos[accountId];
  return photo && photo.version === version ? Buffer.from(photo.jpegBase64, 'base64') : null;
}
