import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId } from './id.js';
import type { Account, Lang } from '../shared/types.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface StoredAccount extends Omit<Account, 'lang'> {
  passwordHash: string;
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
}

let store: JsonStore<Data>;

export async function initAccounts(): Promise<void> {
  store = await JsonStore.load<Data>(config.accountsFile, { accounts: {}, usernameIndex: {}, tokens: {} });
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
    phone: account.phone ?? null,
    lang: account.lang ?? 'en', // accounts made before languages existed
    createdAt: account.createdAt,
  };
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

/**
 * Israeli mobile numbers only: accepts "050-123-4567",
 * "050 1234567", "+972 50 123 4567", "972501234567" and returns "0501234567".
 */
export function normalizeIsraeliMobile(raw: string): string {
  let digits = raw.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (digits.startsWith('972')) digits = `0${digits.slice(3)}`;
  if (!/^05\d{8}$/.test(digits)) {
    throw new AuthError('Enter a valid Israeli mobile number, like 050-123-4567.', 400);
  }
  return digits;
}

function validateUsernameFormat(normalized: string): void {
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new AuthError(USERNAME_FORMAT_MESSAGE, 400);
  }
}

export function register(username: string, password: string, phoneRaw: string, lang: Lang = 'en'): { token: string; account: Account } {
  const normalized = normalizeUsername(username);
  validateUsernameFormat(normalized);
  if (password.length < 6) throw new AuthError('Password must be at least 6 characters.', 400);
  const phone = normalizeIsraeliMobile(phoneRaw);
  if (data().usernameIndex[normalized]) throw new AuthError('That username is already taken.', 409);

  const account: StoredAccount = {
    id: newId(),
    username: normalized,
    // displayName always matches the username (as typed, not lowercased) — no separate field.
    displayName: username.trim().replace(/\s+/g, ' ').slice(0, 40),
    phone,
    lang,
    passwordHash: hashPassword(password),
    createdAt: Date.now(),
  };
  const token = randomBytes(32).toString('hex');

  save((d) => {
    d.accounts[account.id] = account;
    d.usernameIndex[normalized] = account.id;
    d.tokens[token] = { accountId: account.id, createdAt: Date.now() };
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
  const token = randomBytes(32).toString('hex');
  save((d) => {
    d.tokens[token] = { accountId: account.id, createdAt: Date.now() };
  });
  return { token, account: toPublic(account) };
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

export function setPhone(accountId: string, phoneRaw: string): Account {
  const account = data().accounts[accountId];
  if (!account) throw new AuthError('Account not found.', 404);
  const phone = normalizeIsraeliMobile(phoneRaw);
  save((d) => {
    d.accounts[accountId].phone = phone;
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
