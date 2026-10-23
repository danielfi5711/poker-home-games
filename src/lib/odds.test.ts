import assert from 'node:assert/strict';
import { test } from 'node:test';
import { categoryOf, evaluate, exactOdds, parseCard, sampleOdds, topRankOf } from '../shared/odds.js';

const cards = (text: string) => text.split(' ').map(parseCard);
const hand = (text: string) => evaluate(cards(text));

test('names every category from seven cards', () => {
  assert.equal(categoryOf(hand('As Ks Qs Js Ts 2d 3c')), 'straightFlush');
  assert.equal(topRankOf(hand('As Ks Qs Js Ts 2d 3c')), 12);
  assert.equal(categoryOf(hand('9c 9d 9h 9s Ad 2c 3h')), 'quads');
  assert.equal(categoryOf(hand('9c 9d 9h 4s 4d 2c 3h')), 'fullHouse');
  assert.equal(categoryOf(hand('9c 9d 9h 4s 4d 4c 3h')), 'fullHouse');
  assert.equal(categoryOf(hand('2h 7h 9h Jh Kh 2d 2c')), 'flush');
  assert.equal(categoryOf(hand('Ah 2d 3c 4s 5h Kd Qc')), 'straight');
  assert.equal(categoryOf(hand('9c 9d 9h 4s 6d Kc 3h')), 'trips');
  assert.equal(categoryOf(hand('9c 9d 4h 4s 6d 6c 3h')), 'twoPair');
  assert.equal(categoryOf(hand('9c 9d 4h 2s 6d Kc 3h')), 'pair');
  assert.equal(categoryOf(hand('9c Jd 4h 2s 6d Kc 3h')), 'highCard');
});

test('breaks ties by the right cards', () => {
  // The wheel is the lowest straight.
  assert.ok(hand('Ah 2d 3c 4s 5h Kd Qd') < hand('2d 3c 4s 5h 6h Kd Qd'));
  // Two pair from three pairs: the best two plus the best other card.
  assert.equal(hand('Ac Ad Kh Ks Qd Qc 2h'), hand('Ac Ad Kh Ks Qd 3c 2h'));
  assert.ok(hand('Ac Ad Kh Ks Jd 3c 2h') < hand('Ac Ad Kh Ks Qd 3c 2h'));
  // Kicker decides a pair; a sixth-best card never does.
  assert.ok(hand('Ac Ad 9h 7s 5d 3c 2h') < hand('Ac Ad Th 7s 5d 3c 2h'));
  assert.equal(hand('Ac Ad Kh Qs Jd 3c 2h'), hand('Ac Ad Kh Qs Jd 4c 2h'));
  // Full house: the bigger three of a kind wins first.
  assert.ok(hand('Kc Kd Kh 2s 2d') < hand('Ac Ad Ah 3s 3d'));
});

test('the river is settled outright', () => {
  const t = exactOdds([cards('Ah Kh'), cards('2c 2d')], cards('Qh Jh Th 2s 7c'));
  assert.equal(t.trials, 1);
  assert.deepEqual(t.wins, [1, 0]);
});

test('a board that plays for everyone splits the pot', () => {
  const t = exactOdds([cards('2c 3d'), cards('2h 3s'), cards('4c 5d')], cards('Ah Kh Qh Jh Th'));
  assert.deepEqual(t.ties, [1, 1, 1]);
  assert.deepEqual(t.equity, [1 / 3, 1 / 3, 1 / 3]);
});

test('on the flop every turn and river is counted', () => {
  const t = exactOdds([cards('As Ad'), cards('Ks Kd')], cards('2c 7h 9d'));
  assert.equal(t.trials, (45 * 44) / 2);
  assert.ok(t.exact);
  // Kings need one of the two remaining kings (or a straight that doesn't help aces).
  const kings = t.wins[1]! / t.trials;
  assert.ok(kings > 0.08 && kings < 0.1, `kings won ${kings}`);
  const equity = t.equity.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(equity - t.trials) < 1e-9);
});

test('a hand drawing dead on the turn has 0%', () => {
  const t = exactOdds([cards('As Ad'), cards('Ks Kd')], cards('Ah Ac 7h 9d'));
  assert.equal(t.trials, 44);
  assert.equal(t.wins[1], 0);
});

test('pre-flop sampling lands near the known aces-vs-kings odds', () => {
  let seed = 1;
  const random = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const t = sampleOdds([cards('As Ah'), cards('Ks Kh')], [], 40_000, random);
  const aces = t.equity[0]! / t.trials;
  assert.ok(Math.abs(aces - 0.82) < 0.015, `aces had ${aces}`);
});

test('a card used twice is refused', () => {
  assert.throws(() => exactOdds([cards('As Ah'), cards('As Kh')], cards('2c 3c 4c')));
});
