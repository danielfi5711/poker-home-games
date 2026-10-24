import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { BuyIn, BuyInStatus, Player, Session } from '../shared/types.js';
import { computeSettlement } from './settlement.js';

function buyIn(amountCents: number, status: BuyInStatus = 'approved'): BuyIn {
  return { id: Math.random().toString(36), amountCents, requestedAt: 0, status, respondedAt: 0 };
}

function player(id: string, buyIns: BuyIn[], cashOutCents: number | null, earlierCashOutsCents?: number): Player {
  return {
    id,
    accountId: `acct-${id}`,
    name: id,
    joinedAt: 0,
    buyIns,
    cashOut: cashOutCents === null ? null : { amountCents: cashOutCents, at: 0 },
    earlierCashOutsCents,
  };
}

function session(...players: Player[]): Session {
  return {
    id: 'TEST',
    name: 'Test',
    createdAt: 0,
    status: 'active',
    hostPlayerId: players[0]!.id,
    players: Object.fromEntries(players.map((p) => [p.id, p])),
    settledAt: null,
  };
}

test('nets are cash-out minus approved buy-ins, and losers pay winners', () => {
  const result = computeSettlement(
    session(player('a', [buyIn(50_00)], 90_00), player('b', [buyIn(50_00)], 10_00), player('c', [buyIn(20_00)], 20_00)),
  );
  assert.deepEqual(result.netsCents, { a: 40_00, b: -40_00, c: 0 });
  assert.equal(result.discrepancyCents, 0);
  assert.deepEqual(
    result.transfers.map((t) => [t.fromPlayerId, t.toPlayerId, t.amountCents]),
    [['b', 'a', 40_00]],
  );
});

test('several losers are matched against several winners', () => {
  const result = computeSettlement(
    session(
      player('a', [buyIn(50_00)], 100_00),
      player('b', [buyIn(50_00)], 70_00),
      player('c', [buyIn(50_00)], 0),
      player('d', [buyIn(50_00)], 30_00),
    ),
  );
  const paid: Record<string, number> = {};
  for (const t of result.transfers) {
    paid[t.fromPlayerId] = (paid[t.fromPlayerId] ?? 0) - t.amountCents;
    paid[t.toPlayerId] = (paid[t.toPlayerId] ?? 0) + t.amountCents;
  }
  assert.deepEqual(paid, { a: 50_00, b: 20_00, c: -50_00, d: -20_00 });
});

test('a mismatch between money in and money out is reported', () => {
  const result = computeSettlement(session(player('a', [buyIn(50_00)], 60_00), player('b', [buyIn(50_00)], 30_00)));
  assert.equal(result.discrepancyCents, -10_00);
});

test('pending and denied buy-ins are not counted', () => {
  const result = computeSettlement(
    session(player('a', [buyIn(50_00), buyIn(20_00, 'pending'), buyIn(30_00, 'denied')], 50_00), player('b', [buyIn(10_00)], 10_00)),
  );
  assert.deepEqual(result.netsCents, { a: 0, b: 0 });
});

test('earlier cash-outs from before a re-buy count as money out', () => {
  // In 50 + 20, out 30 (before re-buying) + 45.
  const result = computeSettlement(session(player('a', [buyIn(50_00), buyIn(20_00)], 45_00, 30_00), player('b', [buyIn(50_00)], 45_00)));
  assert.deepEqual(result.netsCents, { a: 5_00, b: -5_00 });
  assert.equal(result.discrepancyCents, 0);
});

test('a missing cash-out makes the settlement incomplete', () => {
  const result = computeSettlement(session(player('a', [buyIn(50_00)], 50_00), player('b', [buyIn(50_00)], null)));
  assert.equal(result.complete, false);
});

test('on a bank game the host pays every other player their whole cash-out', () => {
  // Host a, b re-bought after cashing out ₪15, c busted.
  const s = {
    ...session(player('a', [buyIn(50_00)], 60_00), player('b', [buyIn(50_00), buyIn(50_00)], 45_00, 15_00), player('c', [buyIn(30_00)], 0)),
    bank: true,
  };
  const result = computeSettlement(s);
  assert.deepEqual(result.transfers, [{ fromPlayerId: 'a', toPlayerId: 'b', amountCents: 60_00 }]);
  // Nets (and so the leaderboard) don't depend on who pays whom.
  assert.deepEqual(result.netsCents, computeSettlement({ ...s, bank: false }).netsCents);
  assert.deepEqual(result.netsCents, { a: 10_00, b: -40_00, c: -30_00 });
});
