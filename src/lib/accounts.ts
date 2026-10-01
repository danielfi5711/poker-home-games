import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { config } from '../config.js';
import { JsonStore } from './store.js';
import { newId } from './id.js';
import type { Account } from '../shared/types.js';

export class AuthError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

interface StoredAccount extends Account {
  passwordHash: string;
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
  return { id: account.id, username: account.username, displayName: account.displayName, createdAt: account.createdAt };
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
const USERNAME_FORMAT_MESSAGE =
  'Name must be 3-24 characters: letters (any language), numbers, spaces, "_", "." or "-" — and can\'t start or end with a space or symbol.';

function validateUsernameFormat(normalized: string): void {
  if (!USERNAME_PATTERN.test(normalized)) {
    throw new AuthError(USERNAME_FORMAT_MESSAGE, 400);
  }
}

export function register(username: string, password: string): { token: string; account: Account } {
  const normalized = normalizeUsername(username);
  validateUsernameFormat(normalized);
  if (password.length < 6) throw new AuthError('Password must be at least 6 characters.', 400);
  if (data().usernameIndex[normalized]) throw new AuthError('That username is already taken.', 409);

  const account: StoredAccount = {
    id: newId(),
    username: normalized,
    // displayName always matches the username (as typed, not lowercased) — no separate field.
    displayName: username.trim().replace(/\s+/g, ' ').slice(0, 40),
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
