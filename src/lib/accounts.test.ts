import assert from 'node:assert/strict';
import { randomBytes, scryptSync } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, test } from 'node:test';

// Throwaway local files only, set before anything imports config.ts (see sessions.test.ts) — never Turso, and no
// Twilio keys, so SMS goes to the in-memory dev sender and nothing is ever really texted.
const dir = mkdtempSync(join(tmpdir(), 'poker-accounts-test-'));
const accountsFile = join(dir, 'accounts.json');
Object.assign(process.env, {
  NODE_ENV: 'test',
  TURSO_DATABASE_URL: '',
  TURSO_AUTH_TOKEN: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  TWILIO_ACCOUNT_SID: '',
  TWILIO_AUTH_TOKEN: '',
  TWILIO_VERIFY_SERVICE_SID: '',
  DATA_FILE: join(dir, 'sessions.json'),
  ACCOUNTS_FILE: accountsFile,
  PUSH_FILE: join(dir, 'push.json'),
});

function hash(password: string): string {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${scryptSync(password, salt, 64).toString('hex')}`;
}

// An accounts store from before recovery phones: no phoneIndex, accounts without a phone.
const old = {
  id: 'acc-old',
  username: 'yoni',
  displayName: 'Yoni',
  lang: 'he',
  passwordHash: hash('hunter22'),
  createdAt: 1_700_000_001_000,
};
writeFileSync(
  accountsFile,
  JSON.stringify({
    accounts: { [old.id]: old },
    usernameIndex: { yoni: old.id },
    tokens: { tok1: { accountId: old.id, createdAt: 1_700_000_002_000 } },
  }),
);

const { libsqlEnabled } = await import('./libsql.js');
const accounts = await import('./accounts.js');
const sms = await import('./sms.js');

beforeEach(() => sms.resetSmsLimits());

async function signUp(username: string, password: string, phone: string) {
  const first = await accounts.register(username, password, 'en', phone);
  assert.deepEqual(first, { codeSent: true });
  const code = sms.lastDevCode(accounts.normalizePhone(phone))!;
  const done = await accounts.register(username, password, 'en', phone, code);
  assert.ok('token' in done);
  return done;
}

test('an older store loads: accounts, tokens and passwords untouched, no phone yet', async () => {
  assert.equal(libsqlEnabled(), false, 'tests must never run against Turso');
  await accounts.initAccounts();
  assert.equal(sms.smsEnabled(), true, 'dev/test uses the console SMS sender');
  assert.equal(accounts.accountForToken('tok1')?.id, old.id);
  assert.equal(accounts.login('Yoni', 'hunter22').account.id, old.id);
  assert.equal(accounts.getAccount(old.id)?.phoneHint, null);
});

test('phone numbers normalize to E.164', () => {
  assert.equal(accounts.normalizePhone('050-123-4567'), '+972501234567');
  assert.equal(accounts.normalizePhone('+972 50 123 4567'), '+972501234567');
  assert.equal(accounts.normalizePhone('00972501234567'), '+972501234567');
  assert.equal(accounts.normalizePhone('+1 (555) 123-4567'), '+15551234567');
  for (const bad of ['', '12345', '0312345678', '+0123456789', 'phone']) {
    assert.throws(() => accounts.normalizePhone(bad), /valid mobile number/);
  }
});

test('sign-up: wrong code creates nothing; right code creates the account with a masked phone', async () => {
  assert.deepEqual(await accounts.register('dana', 'secret123', 'en', '050-111-2222'), { codeSent: true });
  await assert.rejects(accounts.register('dana', 'secret123', 'en', '050-111-2222', '000000x'), /wrong or has expired/);
  assert.throws(() => accounts.login('dana', 'secret123'), /Incorrect username or password/);

  const code = sms.lastDevCode('+972501112222')!;
  const done = await accounts.register('dana', 'secret123', 'en', '050-111-2222', code);
  assert.ok('token' in done);
  assert.equal(done.account.phoneHint, '•••• 2222');
  assert.equal(JSON.stringify(done).includes('501112222'), false, 'full number never leaves the server');

  // The code is used up.
  await assert.rejects(accounts.register('dana2', 'secret123', 'en', '050-111-3333', code), /wrong or has expired/);
});

test('sign-up checks name, password and phone before texting anything', async () => {
  await assert.rejects(accounts.register('dana', 'secret123', 'en', '050-999-0000'), /already taken/);
  await assert.rejects(accounts.register('fresh', '123', 'en', '050-999-0000'), /at least 6/);
  await assert.rejects(accounts.register('fresh', 'secret123', 'en', ''), /valid mobile number/);
  await assert.rejects(accounts.register('fresh', 'secret123', 'en', '+972501112222'), /already used by another account/);
  assert.equal(sms.lastDevCode('+972509990000'), undefined);
});

test('forgot password: code resets it, logs out every device and logs this one in', async () => {
  const { token: oldToken, account } = await signUp('moshe', 'oldpass1', '052-333-4444');

  // Unknown number: same answer, nothing sent, and no code can work.
  assert.deepEqual(await accounts.requestPasswordReset('052-000-0000', 'en'), { codeSent: true });
  assert.equal(sms.lastDevCode('+972520000000'), undefined);
  await assert.rejects(accounts.resetPassword('052-000-0000', '123456', 'newpass1'), /wrong or has expired/);

  sms.resetSmsLimits();
  assert.deepEqual(await accounts.requestPasswordReset('+972 52 333 4444', 'en'), { codeSent: true });
  const code = sms.lastDevCode('+972523334444')!;
  await assert.rejects(accounts.resetPassword('052-333-4444', code, '123'), /at least 6/);
  await assert.rejects(accounts.resetPassword('052-333-4444', '999999', 'newpass1'), /wrong or has expired/);

  const reset = await accounts.resetPassword('052-333-4444', code, 'newpass1');
  assert.equal(reset.account.id, account.id);
  assert.equal(reset.account.username, 'moshe', 'they see their username too');
  assert.equal(accounts.accountForToken(oldToken), null, 'old logins are gone');
  assert.equal(accounts.accountForToken(reset.token)?.id, account.id);
  assert.throws(() => accounts.login('moshe', 'oldpass1'), /Incorrect/);
  assert.equal(accounts.login('moshe', 'newpass1').account.id, account.id);
});

test('existing account adds a phone without a password, but changing it needs the password', async () => {
  assert.deepEqual(await accounts.setPhone(old.id, '054-555-6666', '', '', 'he'), { codeSent: true });
  const added = await accounts.setPhone(old.id, '054-555-6666', sms.lastDevCode('+972545556666')!, '', 'he');
  assert.ok('account' in added);
  assert.equal(added.account.phoneHint, '•••• 6666');

  await assert.rejects(accounts.setPhone(old.id, '054-555-7777', '', 'wrong', 'he'), /Incorrect password/);
  await assert.rejects(accounts.setPhone(old.id, '050-111-2222', '', 'hunter22', 'he'), /already used/);
  await accounts.setPhone(old.id, '054-555-7777', '', 'hunter22', 'he');
  await accounts.setPhone(old.id, '054-555-7777', sms.lastDevCode('+972545557777')!, 'hunter22', 'he');

  // The old number is free again, and recovery goes to the new one.
  assert.equal(accounts.getAccount(old.id)?.phoneHint, '•••• 7777');
  assert.deepEqual(await accounts.register('taker', 'secret123', 'en', '054-555-6666'), { codeSent: true });
  await assert.rejects(accounts.register('taker', 'secret123', 'en', '054-555-7777'), /already used/);
  await accounts.requestPasswordReset('054-555-7777', 'en');
  const reset = await accounts.resetPassword('054-555-7777', sms.lastDevCode('+972545557777')!, 'hunter22');
  assert.equal(reset.account.id, old.id);
});

test('change password keeps this device logged in and logs out the others', async () => {
  const { token: a } = accounts.login('yoni', 'hunter22');
  const { token: b } = accounts.login('yoni', 'hunter22');
  assert.throws(() => accounts.changePassword(old.id, 'wrong', 'brandnew1', a), /Incorrect password/);
  assert.throws(() => accounts.changePassword(old.id, 'hunter22', '123', a), /at least 6/);
  accounts.changePassword(old.id, 'hunter22', 'brandnew1', a);
  assert.equal(accounts.accountForToken(a)?.id, old.id);
  assert.equal(accounts.accountForToken(b), null);
  assert.equal(accounts.login('yoni', 'brandnew1').account.id, old.id);
});

test('codes per phone are rate-limited', async () => {
  for (let i = 0; i < 3; i++) await accounts.register(`spam${i}`, 'secret123', 'en', '058-777-8888');
  await assert.rejects(accounts.register('spam9', 'secret123', 'en', '058-777-8888'), /Too many codes/);
});
