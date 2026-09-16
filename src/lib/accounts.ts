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
  return username.trim().toLowerCase();
}

export function register(username: string, password: string, displayName: string): { token: string; account: Account } {
  const normalized = normalizeUsername(username);
  if (!/^[a-z0-9_.-]{3,24}$/.test(normalized)) {
    throw new AuthError('Username must be 3-24 characters: letters, numbers, "_", "." or "-".', 400);
  }
  if (password.length < 6) throw new AuthError('Password must be at least 6 characters.', 400);
  const trimmedDisplayName = displayName.trim().slice(0, 40) || username.trim().slice(0, 40);
  if (data().usernameIndex[normalized]) throw new AuthError('That username is already taken.', 409);

  const account: StoredAccount = {
    id: newId(),
    username: normalized,
    displayName: trimmedDisplayName,
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
