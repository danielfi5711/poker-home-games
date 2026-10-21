import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { before, test } from 'node:test';

// Throwaway local files only. These are set before anything imports config.ts, and dotenv never overrides a
// variable that is already set (even to ''), so a local .env can't point the tests at Turso or real push.
const dir = mkdtempSync(join(tmpdir(), 'poker-sessions-test-'));
Object.assign(process.env, {
  TURSO_DATABASE_URL: '',
  TURSO_AUTH_TOKEN: '',
  VAPID_PUBLIC_KEY: '',
  VAPID_PRIVATE_KEY: '',
  DATA_FILE: join(dir, 'sessions.json'),
  ACCOUNTS_FILE: join(dir, 'accounts.json'),
  PUSH_FILE: join(dir, 'push.json'),
});

const { libsqlEnabled } = await import('./libsql.js');
const accounts = await import('./accounts.js');
const sessions = await import('./sessions.js');
type Account = ReturnType<typeof accounts.register>['account'];

let phone = 0;
function newAccount(name: string): Account {
  return accounts.register(`${name}${phone}`, 'secret123', `05200000${String(phone++).padStart(2, '0')}`).account;
}

before(async () => {
  assert.equal(libsqlEnabled(), false, 'tests must never run against Turso');
  await accounts.initAccounts();
  await sessions.initSessions();
});

/** A started table: a host and one other player, each holding their seat id. */
function table() {
  const host = newAccount('host');
  const guest = newAccount('guest');
  const { session, playerId: hostSeat } = sessions.createSession('Test', host);
  const { playerId: guestSeat } = sessions.joinSession(session.id, guest);
  sessions.activateSession(session.id, host.id);
  return { id: session.id, host, guest, hostSeat, guestSeat };
}

function lastBuyIn(id: string, seat: string) {
  return sessions.getSession(id).players[seat]!.buyIns.at(-1)!;
}

test('a buy-in over ₪50 is refused', () => {
  const t = table();
  assert.throws(() => sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 50_01), /at most ₪50/);
});

test("the host's buy-ins approve themselves; everyone else's wait", () => {
  const t = table();
  sessions.requestBuyIn(t.id, t.hostSeat, t.host.id, 50_00);
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 50_00);
  assert.equal(lastBuyIn(t.id, t.hostSeat).status, 'approved');
  assert.equal(lastBuyIn(t.id, t.guestSeat).status, 'pending');
});

test('an approved re-buy after a cash-out reopens the seat and banks the earlier cash-out', () => {
  const t = table();
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 50_00);
  sessions.respondToBuyIn(t.id, lastBuyIn(t.id, t.guestSeat).id, t.host.id, true);
  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 30_00);

  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 20_00);
  // Still cashed out while the re-buy waits for the host.
  assert.equal(sessions.getSession(t.id).players[t.guestSeat]!.cashOut?.amountCents, 30_00);

  sessions.respondToBuyIn(t.id, lastBuyIn(t.id, t.guestSeat).id, t.host.id, true);
  let seat = sessions.getSession(t.id).players[t.guestSeat]!;
  assert.equal(seat.cashOut, null);
  assert.equal(seat.earlierCashOutsCents, 30_00);

  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 45_00);
  seat = sessions.getSession(t.id).players[t.guestSeat]!;
  assert.equal(seat.cashOut?.amountCents, 45_00);
  assert.equal(sessions.previewSettlement(t.id).netsCents[t.guestSeat], 5_00); // in 70, out 75
});

test('a denied re-buy leaves the player cashed out', () => {
  const t = table();
  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 0);
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 20_00);
  sessions.respondToBuyIn(t.id, lastBuyIn(t.id, t.guestSeat).id, t.host.id, false);
  const seat = sessions.getSession(t.id).players[t.guestSeat]!;
  assert.equal(seat.cashOut?.amountCents, 0);
  assert.equal(seat.earlierCashOutsCents, undefined);
});

test('settling waits for every cash-out and every pending request', () => {
  const t = table();
  sessions.requestBuyIn(t.id, t.hostSeat, t.host.id, 50_00);
  sessions.recordCashOut(t.id, t.hostSeat, t.host.id, 50_00);
  assert.throws(() => sessions.settleSession(t.id, t.host.id), /Enter a cash-out for/);

  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 0);
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 10_00);
  assert.throws(() => sessions.settleSession(t.id, t.host.id), /pending buy-in/);

  sessions.removeBuyIn(t.id, lastBuyIn(t.id, t.guestSeat).id, t.guest.id);
  assert.equal(sessions.settleSession(t.id, t.host.id).session.status, 'settled');
});

test('a cash-out can be corrected before the game is settled', () => {
  const t = table();
  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 40_00);
  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 35_00);
  assert.equal(sessions.getSession(t.id).players[t.guestSeat]!.cashOut?.amountCents, 35_00);
});

test('removing buy-ins: owner cancels a waiting request, only the host removes an approved one', () => {
  const t = table();
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 20_00);
  const pending = lastBuyIn(t.id, t.guestSeat);
  sessions.removeBuyIn(t.id, pending.id, t.guest.id);
  assert.equal(sessions.getSession(t.id).players[t.guestSeat]!.buyIns.length, 0);

  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 30_00);
  const approved = lastBuyIn(t.id, t.guestSeat);
  sessions.respondToBuyIn(t.id, approved.id, t.host.id, true);
  assert.throws(() => sessions.removeBuyIn(t.id, approved.id, t.guest.id), /Only the host/);

  const stranger = newAccount('stranger');
  sessions.requestBuyIn(t.id, t.hostSeat, t.host.id, 10_00);
  assert.throws(() => sessions.removeBuyIn(t.id, lastBuyIn(t.id, t.hostSeat).id, stranger.id), /Only the host/);

  sessions.removeBuyIn(t.id, approved.id, t.host.id);
  assert.equal(sessions.getSession(t.id).players[t.guestSeat]!.buyIns.length, 0);
});

test("nobody but the owner or the host can cancel a waiting request, and denied ones can't be removed", () => {
  const t = table();
  const stranger = newAccount('stranger');
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 20_00);
  const pending = lastBuyIn(t.id, t.guestSeat);
  assert.throws(() => sessions.removeBuyIn(t.id, pending.id, stranger.id), /belongs to someone else/);

  sessions.respondToBuyIn(t.id, pending.id, t.host.id, false);
  assert.throws(() => sessions.removeBuyIn(t.id, pending.id, t.host.id), /already handled/);
});
