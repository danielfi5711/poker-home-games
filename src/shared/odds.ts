/**
 * Texas Hold'em odds for the Odds tab: a 5–7 card hand evaluator plus win/tie
 * percentages for up to `MAX_HANDS` known hands on a pre-flop, flop, turn or
 * river board. Pure functions with no DOM or Node imports, so the client runs
 * them directly and `src/lib/odds.test.ts` checks them with `node:test`.
 *
 * A card is a number 0–51: `rank * 4 + suit`, rank 0 = deuce … 12 = ace,
 * suit 0–3 = ♠ ♥ ♦ ♣.
 */

export type Card = number;
export type Street = 'preflop' | 'flop' | 'turn' | 'river';

export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];
export const BOARD_SIZE: Record<Street, number> = { preflop: 0, flop: 3, turn: 4, river: 5 };
export const MAX_HANDS = 6;

export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
export const SUITS = ['♠', '♥', '♦', '♣'];

export const rankOf = (c: Card) => c >> 2;
export const suitOf = (c: Card) => c & 3;
export const card = (rank: number, suit: number): Card => rank * 4 + suit;

/** "As", "Td", "2c" → card; for tests and debugging. */
export function parseCard(text: string): Card {
  const rank = RANKS.indexOf(text[0]!.toUpperCase());
  const suit = 'shdc'.indexOf(text[1]!.toLowerCase());
  if (rank < 0 || suit < 0 || text.length !== 2) throw new Error(`Bad card: ${text}`);
  return card(rank, suit);
}

/** Hand categories, weakest first — the index is the category number in a score. */
export const CATEGORIES = [
  'highCard',
  'pair',
  'twoPair',
  'trips',
  'straight',
  'flush',
  'fullHouse',
  'quads',
  'straightFlush',
] as const;
export type Category = (typeof CATEGORIES)[number];

// A score packs the category and up to five tie-break ranks into one number,
// four bits each, so comparing two hands is comparing two numbers.
const NIBBLE = 16;
const CATEGORY_SHIFT = NIBBLE ** 5;

function score(category: number, r1 = 0, r2 = 0, r3 = 0, r4 = 0, r5 = 0): number {
  return category * CATEGORY_SHIFT + r1 * NIBBLE ** 4 + r2 * NIBBLE ** 3 + r3 * NIBBLE ** 2 + r4 * NIBBLE + r5;
}

export const categoryOf = (s: number): Category => CATEGORIES[Math.floor(s / CATEGORY_SHIFT)]!;
/** The highest tie-break rank, e.g. an ace-high straight flush (a royal flush) has 12. */
export const topRankOf = (s: number) => Math.floor(s / NIBBLE ** 4) % NIBBLE;

/** Top card of the best straight in a rank bitmask, or -1. The wheel (A-2-3-4-5) counts with a 5 high. */
function straightHigh(mask: number): number {
  // Shift up one and copy the ace into bit 0 so the wheel is a plain run of five.
  const m = (mask << 1) | ((mask >> 12) & 1);
  for (let top = 13; top >= 4; top--) {
    if (((m >> (top - 4)) & 0x1f) === 0x1f) return top - 1;
  }
  return -1;
}

/** The highest `n` ranks set in a bitmask, best first. */
function topRanks(mask: number, n: number, out: number[]): number[] {
  out.length = 0;
  for (let r = 12; r >= 0 && out.length < n; r--) if (mask & (1 << r)) out.push(r);
  return out;
}

const counts = new Array<number>(13);
const suitMasks = new Array<number>(4);
const suitCounts = new Array<number>(4);
const kick: number[] = [];

/** Score of the best five-card hand among 5–7 cards. Higher is better; equal means a split. */
export function evaluate(cards: readonly Card[]): number {
  counts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let rankMask = 0;
  for (const c of cards) {
    const r = c >> 2;
    const s = c & 3;
    counts[r]!++;
    suitMasks[s]! |= 1 << r;
    suitCounts[s]!++;
    rankMask |= 1 << r;
  }

  let flushMask = 0;
  for (let s = 0; s < 4; s++) {
    if (suitCounts[s]! >= 5) {
      flushMask = suitMasks[s]!;
      const sf = straightHigh(flushMask);
      if (sf >= 0) return score(8, sf);
    }
  }

  let quad = -1;
  let trip1 = -1;
  let trip2 = -1;
  let pair1 = -1;
  let pair2 = -1;
  for (let r = 12; r >= 0; r--) {
    const n = counts[r]!;
    if (n === 4) quad = r;
    else if (n === 3) trip1 < 0 ? (trip1 = r) : trip2 < 0 && (trip2 = r);
    else if (n === 2) pair1 < 0 ? (pair1 = r) : pair2 < 0 && (pair2 = r);
  }

  if (quad >= 0) return score(7, quad, topRanks(rankMask & ~(1 << quad), 1, kick)[0]);
  if (trip1 >= 0 && (trip2 >= 0 || pair1 >= 0)) return score(6, trip1, Math.max(trip2, pair1));
  if (flushMask) return score(5, ...topRanks(flushMask, 5, kick));
  const straight = straightHigh(rankMask);
  if (straight >= 0) return score(4, straight);
  if (trip1 >= 0) return score(3, trip1, ...topRanks(rankMask & ~(1 << trip1), 2, kick));
  if (pair2 >= 0) return score(2, pair1, pair2, topRanks(rankMask & ~(1 << pair1) & ~(1 << pair2), 1, kick)[0]);
  if (pair1 >= 0) return score(1, pair1, ...topRanks(rankMask & ~(1 << pair1), 3, kick));
  return score(0, ...topRanks(rankMask, 5, kick));
}

/** Raw counts, so chunks of a simulation can be added up as they finish. */
export interface OddsTally {
  /** Boards dealt out (every possible one when `exact`). */
  trials: number;
  /** Per hand: boards it won outright. */
  wins: number[];
  /** Per hand: boards it split with at least one other hand. */
  ties: number[];
  /** Per hand: pots won, a split counting as its share (1/2, 1/3…). */
  equity: number[];
  exact: boolean;
}

export const emptyTally = (hands: number, exact = false): OddsTally => ({
  trials: 0,
  wins: new Array(hands).fill(0),
  ties: new Array(hands).fill(0),
  equity: new Array(hands).fill(0),
  exact,
});

export function addTally(a: OddsTally, b: OddsTally): OddsTally {
  return {
    trials: a.trials + b.trials,
    wins: a.wins.map((w, i) => w + b.wins[i]!),
    ties: a.ties.map((t, i) => t + b.ties[i]!),
    equity: a.equity.map((e, i) => e + b.equity[i]!),
    exact: a.exact && b.exact,
  };
}

function remainingDeck(hands: readonly (readonly Card[])[], board: readonly Card[]): Card[] {
  const used = new Set<Card>([...hands.flat(), ...board]);
  if (used.size !== hands.length * 2 + board.length) throw new Error('The same card is used twice');
  const deck: Card[] = [];
  for (let c = 0; c < 52; c++) if (!used.has(c)) deck.push(c);
  return deck;
}

/** Scores every hand on one complete board and records who took the pot. */
function settleBoard(hands: readonly (readonly Card[])[], board: readonly Card[], tally: OddsTally, seven: Card[], scores: number[]): void {
  let best = -1;
  let winners = 0;
  for (let h = 0; h < hands.length; h++) {
    seven[0] = hands[h]![0]!;
    seven[1] = hands[h]![1]!;
    for (let b = 0; b < 5; b++) seven[b + 2] = board[b]!;
    const s = evaluate(seven);
    scores[h] = s;
    if (s > best) {
      best = s;
      winners = 1;
    } else if (s === best) winners++;
  }
  for (let h = 0; h < hands.length; h++) {
    if (scores[h] !== best) continue;
    if (winners === 1) tally.wins[h]!++;
    else tally.ties[h]!++;
    tally.equity[h]! += 1 / winners;
  }
  tally.trials++;
}

/** Every possible way to finish the board. Cheap from the flop on (at most 1,081 boards). */
export function exactOdds(hands: readonly (readonly Card[])[], board: readonly Card[]): OddsTally {
  const deck = remainingDeck(hands, board);
  const tally = emptyTally(hands.length, true);
  const full = [...board, 0, 0, 0, 0, 0].slice(0, 5);
  const seven = new Array<Card>(7);
  const scores = new Array<number>(hands.length);
  const missing = 5 - board.length;

  const deal = (from: number, slot: number) => {
    if (slot === 5) return settleBoard(hands, full, tally, seven, scores);
    for (let i = from; i <= deck.length - (5 - slot); i++) {
      full[slot] = deck[i]!;
      deal(i + 1, slot + 1);
    }
  };
  deal(0, 5 - missing);
  return tally;
}

/** `trials` random finished boards — pre-flop, where every board would be ~1.7 million. */
export function sampleOdds(
  hands: readonly (readonly Card[])[],
  board: readonly Card[],
  trials: number,
  random: () => number = Math.random,
): OddsTally {
  const deck = remainingDeck(hands, board);
  const tally = emptyTally(hands.length);
  const full = [...board, 0, 0, 0, 0, 0].slice(0, 5);
  const seven = new Array<Card>(7);
  const scores = new Array<number>(hands.length);
  for (let t = 0; t < trials; t++) {
    // Partial Fisher–Yates: the deck stays a permutation, so no reset between trials.
    for (let slot = board.length, i = 0; slot < 5; slot++, i++) {
      const j = i + Math.floor(random() * (deck.length - i));
      const c = deck[j]!;
      deck[j] = deck[i]!;
      deck[i] = c;
      full[slot] = c;
    }
    settleBoard(hands, full, tally, seven, scores);
  }
  return tally;
}
