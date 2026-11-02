import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

// Throwaway local files only, set before anything imports config.ts (see sessions.test.ts) — never Turso.
const dir = mkdtempSync(join(tmpdir(), 'poker-accounts-test-'));
const accountsFile = join(dir, 'accounts.json');
Object.assign(process.env, {
  TURSO_DATABASE_URL: '',
  TURSO_AUTH_TOKEN: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  DATA_FILE: join(dir, 'sessions.json'),
  ACCOUNTS_FILE: accountsFile,
  PUSH_FILE: join(dir, 'push.json'),
});

function hash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

// An accounts store as it looked before phones were removed: one account with a phone, one older one without.
const withPhone = {
  id: 'acc-with-phone',
  username: 'dana',
  displayName: 'Dana',
  phone: '0501234567',
  lang: 'he',
  passwordHash: hash('secret123'),
  createdAt: 1_700_000_000_000,
};
const withoutPhone = {
  id: 'acc-no-phone',
  username: 'yoni',
  displayName: 'Yoni',
  passwordHash: hash('hunter22'),
  createdAt: 1_700_000_001_000,
};
const seeded = {
  accounts: { [withPhone.id]: withPhone, [withoutPhone.id]: withoutPhone },
  usernameIndex: { dana: withPhone.id, yoni: withoutPhone.id },
  tokens: { tok1: { accountId: withPhone.id, createdAt: 1_700_000_002_000 } },
};
writeFileSync(accountsFile, JSON.stringify(seeded));

const { libsqlEnabled } = await import('./libsql.js');
const accounts = await import('./accounts.js');

test('startup strips the stored phone and leaves every other account field as it was', async () => {
  assert.equal(libsqlEnabled(), false, 'tests must never run against Turso');
  await accounts.initAccounts();

  // Persisted, not just in memory.
  const stored = JSON.parse(readFileSync(accountsFile, 'utf8'));
  const { phone: _dropped, ...expectedWithPhone } = withPhone;
  assert.deepEqual(stored.accounts[withPhone.id], expectedWithPhone);
  assert.deepEqual(stored.accounts[withoutPhone.id], withoutPhone);
  assert.deepEqual(stored.usernameIndex, seeded.usernameIndex);
  assert.deepEqual(stored.tokens, seeded.tokens);

  // The same account still works: its token, its password, its id.
  assert.equal(accounts.accountForToken('tok1')?.id, withPhone.id);
  assert.equal(accounts.login('Dana', 'secret123').account.id, withPhone.id);
  assert.equal(accounts.getAccount(withPhone.id)?.lang, 'he');
  assert.equal('phone' in accounts.getAccount(withPhone.id)!, false);

  // Running it again is a no-op.
  await accounts.initAccounts();
  assert.deepEqual(JSON.parse(readFileSync(accountsFile, 'utf8')).accounts, stored.accounts);
});

test('sign-up needs only a username and password', () => {
  const { account } = accounts.register('newbie', 'secret123');
  assert.equal('phone' in account, false);
});
