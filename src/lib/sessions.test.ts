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

/** A settled table where the guest owes the host ₪20; returns that payment's id. */
function settledWithDebt() {
  const t = table();
  sessions.requestBuyIn(t.id, t.hostSeat, t.host.id, 50_00);
  sessions.requestBuyIn(t.id, t.guestSeat, t.guest.id, 50_00);
  sessions.respondToBuyIn(t.id, lastBuyIn(t.id, t.guestSeat).id, t.host.id, true);
  sessions.recordCashOut(t.id, t.hostSeat, t.host.id, 70_00);
  sessions.recordCashOut(t.id, t.guestSeat, t.guest.id, 30_00);
  sessions.settleSession(t.id, t.host.id);
  const [payment] = sessions.paymentsFor(t.guest.id);
  assert.equal(payment?.amountCents, 20_00);
  return { ...t, paymentId: payment!.id };
}

const paymentOf = (accountId: string, id: string) => sessions.paymentsFor(accountId).find((p) => p.id === id)!;

test('the payer saying they paid asks the receiver straight away; the receiver then confirms', () => {
  const t = settledWithDebt();
  assert.throws(() => sessions.markPaid(t.paymentId, t.host.id), /Only the payer/);

  sessions.markPaid(t.paymentId, t.guest.id);
  let p = paymentOf(t.guest.id, t.paymentId);
  assert.equal(p.status, 'awaiting_confirmation');

  sessions.respondPayment(t.paymentId, t.host.id, true);
  p = paymentOf(t.guest.id, t.paymentId);
  assert.equal(p.status, 'confirmed');
});

test('the receiver can confirm a payment the payer never marked as paid', () => {
  const t = settledWithDebt();
  assert.equal(paymentOf(t.host.id, t.paymentId).status, 'unpaid');
  assert.throws(() => sessions.respondPayment(t.paymentId, t.guest.id, true), /being paid/);
  sessions.respondPayment(t.paymentId, t.host.id, true);
  assert.equal(paymentOf(t.host.id, t.paymentId).status, 'confirmed');
  // Nothing to do once it's confirmed.
  assert.equal(sessions.markPaid(t.paymentId, t.guest.id).status, 'confirmed');
});

test('a settled game with only one player is left out of the history', () => {
  const host = newAccount('solo');
  const { session, playerId } = sessions.createSession('Solo', host);
  sessions.activateSession(session.id, host.id);
  sessions.requestBuyIn(session.id, playerId, host.id, 10_00);
  sessions.recordCashOut(session.id, playerId, host.id, 10_00);
  sessions.settleSession(session.id, host.id);
  assert.ok(!sessions.history().matches.some((m) => m.id === session.id));

  const t = settledWithDebt();
  assert.ok(sessions.history().matches.some((m) => m.id === t.id));
});

test("a profile counts the player's games, places, balance over time and regulars", (t) => {
  // A minute between games, so newest-first is unambiguous.
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const a = newAccount('pa');
  const b = newAccount('pb');
  const c = newAccount('pc');
  /** One settled game: [account, buy-in, cash-out] per seat, host first. */
  function play(seats: [Account, number, number][]) {
    const [hostAccount] = seats[0]!;
    const { session } = sessions.createSession('Profile game', hostAccount);
    const seatOf = new Map([[hostAccount.id, Object.keys(sessions.getSession(session.id).players)[0]!]]);
    for (const [acc] of seats.slice(1)) seatOf.set(acc.id, sessions.joinSession(session.id, acc).playerId);
    sessions.activateSession(session.id, hostAccount.id);
    for (const [acc, buyIn, cashOut] of seats) {
      const seat = seatOf.get(acc.id)!;
      sessions.requestBuyIn(session.id, seat, acc.id, buyIn);
      const pending = lastBuyIn(session.id, seat);
      if (pending.status === 'pending') sessions.respondToBuyIn(session.id, pending.id, hostAccount.id, true);
      sessions.recordCashOut(session.id, seat, acc.id, cashOut);
    }
    sessions.settleSession(session.id, hostAccount.id);
    t.mock.timers.tick(60_000);
  }

  play([[a, 50_00, 80_00], [b, 50_00, 20_00]]); // a +30
  play([[a, 50_00, 40_00], [b, 50_00, 50_00], [c, 50_00, 60_00]]); // a -10, third
  play([[b, 50_00, 50_00], [a, 50_00, 50_00]]); // a even, shares first place

  const p = sessions.profile(a.id);
  assert.equal(p.name, a.displayName);
  assert.deepEqual([p.wins, p.losses, p.breakevens], [1, 1, 1]);
  assert.deepEqual(p.matches.map((m) => [m.netCents, m.place, m.playerCount]), [[0, 1, 2], [-10_00, 3, 3], [30_00, 1, 2]]);
  assert.deepEqual(p.balanceHistory.map((h) => h.balanceCents), [30_00, 20_00, 20_00]);
  assert.equal(p.stats?.balanceCents, 20_00);
  assert.deepEqual(p.regulars.map((r) => [r.accountId, r.gamesTogether]), [[b.id, 3], [c.id, 1]]);

  const newcomer = sessions.profile(newAccount('pnew').id);
  assert.equal(newcomer.rank, null);
  assert.equal(newcomer.matches.length, 0);

  assert.throws(() => sessions.profile('nobody'), /Player not found/);
});
