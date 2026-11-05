import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId } from './id.js';
import { checkCode, sendCode, smsEnabled } from './sms.js';
import type { Account, Lang } from '../shared/types.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface StoredAccount extends Omit<Account, 'lang' | 'phoneHint'> {
  passwordHash: string;
  /** Verified recovery phone in E.164 form ("+972501234567"). Missing = none set. */
  phone?: string;
  /** Missing on accounts made before languages existed — read as 'en'. */
  lang?: Lang;
}

interface AuthToken {
  accountId: string;
  createdAt: number;
}

interface Data {
  accounts: Record<string, StoredAccount>;
  /** username (lowercased) -> account id, kept in step with `accounts`. */
  usernameIndex: Record<string, string>;
  tokens: Record<string, AuthToken>;
  /** recovery phone (E.164) -> account id, kept in step with `accounts`. One account per phone. */
  phoneIndex: Record<string, string>;
}

let store: JsonStore<Data>;

export async function initAccounts(): Promise<void> {
  store = await JsonStore.load<Data>(config.accountsFile, { accounts: {}, usernameIndex: {}, tokens: {}, phoneIndex: {} });
  // Stores written before recovery phones existed have no phoneIndex yet.
  if (!data().phoneIndex) save((d) => void (d.phoneIndex = {}));
}

function data(): Data {
  return store.get();
}

function save(mutator: (data: Data) => void): void {
  store.update(mutator);
}

function toPublic(account: StoredAccount): Account {
  return {
    id: account.id,
    username: account.username,
    displayName: account.displayName,
    lang: account.lang ?? 'en', // accounts made before languages existed
    createdAt: account.createdAt,
    phoneHint: account.phone ? maskPhone(account.phone) : null,
  };
}

function maskPhone(phone: string): string {
  return `•••• ${phone.slice(-4)}`;
}

export const PHONE_FORMAT_MESSAGE = 'Enter a valid mobile number, like 050-123-4567 or +1 555 123 4567.';

/**
 * A mobile number in E.164 form ("+972501234567"). Takes an international number ("+1 555 123 4567",
 * "00972…") or an Israeli local mobile ("050-123-4567", the app's home market).
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (/^05\d{8}$/.test(digits)) digits = `+972${digits.slice(1)}`;
  if (!/^\+[1-9]\d{7,14}$/.test(digits)) throw new AuthError(PHONE_FORMAT_MESSAGE, 400);
  return digits;
}

function validatePassword(password: string): void {
  if (password.length < 6) throw new AuthError('Password must be at least 6 characters.', 400);
}

async function requireValidCode(phone: string, code: string): Promise<void> {
  if (!(await checkCode(phone, code))) throw new AuthError('That code is wrong or has expired.', 400);
}

function newToken(d: Data, accountId: string): string {
  const token = randomBytes(32).toString('hex');
  d.tokens[token] = { accountId, createdAt: Date.now() };
  return token;
}

/** Log an account out everywhere, except (optionally) the token making the request. */
function dropTokens(d: Data, accountId: string, keep?: string): void {
  for (const [token, entry] of Object.entries(d.tokens)) {
    if (entry.accountId === accountId && token !== keep) delete d.tokens[token];
  }
}

function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function normalizeUsername(username: string): string {
  return username.trim().replace(/\s+/g, ' ').toLowerCase();
}

// Letters from any script (Hebrew included — `\p{L}` is Unicode-general,
// not Latin-only), numbers, single internal spaces, "_", "." or "-"; must
// start and end on a letter/number so it can't be all punctuation/spaces.
const USERNAME_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N} _.-]{1,22}[\p{L}\p{N}]$/u;
export const USERNAME_FORMAT_MESSAGE =
  'Name must be 3-24 characters: letters (any language), numbers, spaces, "_", "." or "-" — and can\'t start or end with a space or symbol.';

function validateUsernameFormat(normalized: string): void {
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new AuthError(USERNAME_FORMAT_MESSAGE, 400);
  }
}

export type RegisterResult = { codeSent: true } | { token: string; account: Account };

/**
 * Sign up. When SMS is set up a recovery phone is required, in two calls: without `code` everything is checked
 * and a code is texted (`{ codeSent: true }`); with `code` the account is created. Without SMS, `phone` and
 * `code` are ignored and the account is created at once.
 */
export async function register(
  username: string,
  password: string,
  lang: Lang = 'en',
  phoneRaw = '',
  code = '',
): Promise<RegisterResult> {
  const normalized = normalizeUsername(username);
  validateUsernameFormat(normalized);
  validatePassword(password);
  if (data().usernameIndex[normalized]) throw new AuthError('That username is already taken.', 409);

  let phone: string | undefined;
  if (smsEnabled()) {
    phone = normalizePhone(phoneRaw);
    if (data().phoneIndex[phone]) throw new AuthError('That phone number is already used by another account.', 409);
    if (!code) {
      await sendCode(phone, lang);
      return { codeSent: true };
    }
    await requireValidCode(phone, code);
  }
  return createAccount(username, password, lang, phone);
}

/**
 * Create the account. `register()` calls this once the phone (if any) is verified; tests call it directly to
 * make accounts without the SMS step. Everything is checked again here: someone could have taken the name or
 * number while the code was on its way.
 */
export function createAccount(username: string, password: string, lang: Lang = 'en', phone?: string): { token: string; account: Account } {
  const normalized = normalizeUsername(username);
  validateUsernameFormat(normalized);
  validatePassword(password);
  if (data().usernameIndex[normalized]) throw new AuthError('That username is already taken.', 409);
  if (phone && data().phoneIndex[phone]) throw new AuthError('That phone number is already used by another account.', 409);

  const account: StoredAccount = {
    id: newId(),
    username: normalized,
    // displayName always matches the username (as typed, not lowercased) — no separate field.
    displayName: username.trim().replace(/\s+/g, ' ').slice(0, 40),
    lang,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
    ...(phone ? { phone } : {}),
  };

  let token = '';
  save((d) => {
    d.accounts[account.id] = account;
    d.usernameIndex[normalized] = account.id;
    if (phone) d.phoneIndex[phone] = account.id;
    token = newToken(d, account.id);
  });

  return { token, account: toPublic(account) };
}

export function login(username: string, password: string): { token: string; account: Account } {
  const normalized = normalizeUsername(username);
  const accountId = data().usernameIndex[normalized];
  const account = accountId ? data().accounts[accountId] : undefined;
  if (!account || !verifyPassword(password, account.passwordHash)) {
    throw new AuthError('Incorrect username or password.', 401);
  }
  let token = '';
  save((d) => {
    token = newToken(d, account.id);
  });
  return { token, account: toPublic(account) };
}

/** Change password while logged in. Every other device is logged out; the one asking stays in. */
export function changePassword(accountId: string, currentPassword: string, newPassword: string, keepToken?: string): Account {
  const account = data().accounts[accountId];
  if (!account) throw new AuthError('Account not found.', 404);
  if (!verifyPassword(currentPassword, account.passwordHash)) throw new AuthError('Incorrect password.', 401);
  validatePassword(newPassword);
  save((d) => {
    d.accounts[accountId].passwordHash = hashPassword(newPassword);
    dropTokens(d, accountId, keepToken);
  });
  return toPublic(data().accounts[accountId]);
}

/**
 * Add or change the recovery phone, in two calls like sign-up (without `code`: text a code; with it: save).
 * Adding the first phone only needs the login; replacing one also needs the current password, so a stolen
 * login can't move the account's recovery to the thief's number.
 */
export async function setPhone(
  accountId: string,
  phoneRaw: string,
  code: string,
  currentPassword: string,
  lang: Lang,
): Promise<{ codeSent: true } | { account: Account }> {
  if (!smsEnabled()) throw new AuthError('Phone verification is not available.', 503);
  const account = data().accounts[accountId];
  if (!account) throw new AuthError('Account not found.', 404);
  if (account.phone && !verifyPassword(currentPassword, account.passwordHash)) {
    throw new AuthError('Incorrect password.', 401);
  }
  const phone = normalizePhone(phoneRaw);
  const owner = data().phoneIndex[phone];
  if (owner && owner !== accountId) throw new AuthError('That phone number is already used by another account.', 409);
  if (!code) {
    await sendCode(phone, lang);
    return { codeSent: true };
  }
  await requireValidCode(phone, code);
  const takenMeanwhile = data().phoneIndex[phone];
  if (takenMeanwhile && takenMeanwhile !== accountId) {
    throw new AuthError('That phone number is already used by another account.', 409);
  }
  save((d) => {
    const old = d.accounts[accountId].phone;
    if (old && d.phoneIndex[old] === accountId) delete d.phoneIndex[old];
    d.accounts[accountId].phone = phone;
    d.phoneIndex[phone] = accountId;
  });
  return { account: toPublic(data().accounts[accountId]) };
}

/**
 * "Forgot password", step 1: text a code to the phone if an account has it. Answers the same either way, so it
 * can't be used to find out whose number is registered.
 */
export async function requestPasswordReset(phoneRaw: string, lang: Lang): Promise<{ codeSent: true }> {
  if (!smsEnabled()) throw new AuthError('Phone verification is not available.', 503);
  const phone = normalizePhone(phoneRaw);
  const accountId = data().phoneIndex[phone];
  if (accountId) await sendCode(phone, data().accounts[accountId]?.lang ?? lang);
  return { codeSent: true };
}

/**
 * "Forgot password", step 2: the right code sets a new password, logs the account out everywhere and logs this
 * device in — which also shows them their username, in case that was forgotten too.
 */
export async function resetPassword(phoneRaw: string, code: string, newPassword: string): Promise<{ token: string; account: Account }> {
  if (!smsEnabled()) throw new AuthError('Phone verification is not available.', 503);
  const phone = normalizePhone(phoneRaw);
  validatePassword(newPassword);
  const accountId = data().phoneIndex[phone];
  // No account on that number: same answer as a wrong code (no code was ever sent to it).
  if (!accountId || !data().accounts[accountId]) throw new AuthError('That code is wrong or has expired.', 400);
  await requireValidCode(phone, code);
  let token = '';
  save((d) => {
    d.accounts[accountId].passwordHash = hashPassword(newPassword);
    dropTokens(d, accountId);
    token = newToken(d, accountId);
  });
  return { token, account: toPublic(data().accounts[accountId]) };
}

/** Requires the current password, same as any other security-relevant account change. */
export function changeUsername(accountId: string, newUsername: string, currentPassword: string): Account {
  const account = data().accounts[accountId];
  if (!account) throw new AuthError('Account not found.', 404);
  if (!verifyPassword(currentPassword, account.passwordHash)) {
    throw new AuthError('Incorrect password.', 401);
  }

  const normalized = normalizeUsername(newUsername);
  validateUsernameFormat(normalized);
  const existingOwner = data().usernameIndex[normalized];
  if (existingOwner && existingOwner !== accountId) {
    throw new AuthError('That username is already taken.', 409);
  }

  const oldNormalized = account.username;
  save((d) => {
    delete d.usernameIndex[oldNormalized];
    d.usernameIndex[normalized] = accountId;
    d.accounts[accountId].username = normalized;
    d.accounts[accountId].displayName = newUsername.trim().replace(/\s+/g, ' ').slice(0, 40);
  });
  return toPublic(data().accounts[accountId]);
}

export function setLang(accountId: string, lang: Lang): Account {
  const account = data().accounts[accountId];
  if (!account) throw new AuthError('Account not found.', 404);
  save((d) => {
    d.accounts[accountId].lang = lang;
  });
  return toPublic(data().accounts[accountId]);
}

/** For push notifications: the language a given account reads. */
export function langOf(accountId: string): Lang {
  return data().accounts[accountId]?.lang ?? 'en';
}

export function logout(token: string): void {
  save((d) => {
    delete d.tokens[token];
  });
}

export function accountForToken(token: string): Account | null {
  const entry = data().tokens[token];
  if (!entry) return null;
  const account = data().accounts[entry.accountId];
  return account ? toPublic(account) : null;
}

export function getAccount(accountId: string): Account | null {
  const account = data().accounts[accountId];
  return account ? toPublic(account) : null;
}
