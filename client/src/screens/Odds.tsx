import { useEffect, useState } from 'preact/hooks';
import type { Card, OddsTally, Street } from '../../../src/shared/odds.js';
import {
  BOARD_SIZE,
  MAX_HANDS,
  RANKS,
  STREETS,
  SUITS,
  addTally,
  card,
  categoryOf,
  evaluate,
  exactOdds,
  rankOf,
  sampleOdds,
  suitOf,
  topRankOf,
} from '../../../src/shared/odds.js';
import { PlusIcon, XIcon } from '../icons.js';
import { ScreenHead, Sheet } from '../ui.js';
import { locale, tr } from '../i18n.js';

type Slot = Card | null;
type Hand = [Slot, Slot];

interface Setup {
  street: Street;
  hands: Hand[];
  board: Slot[];
}

type Target = { kind: 'hand'; hand: number; index: number } | { kind: 'board'; index: number };

const STORAGE_KEY = 'poker.odds';
const EMPTY: Setup = { street: 'preflop', hands: [[null, null], [null, null]], board: [null, null, null, null, null] };

// Pre-flop has ~1.7 million boards per matchup, too many to count on a phone,
// so it samples in small chunks: the numbers show right away and settle as
// more boards come in, and the screen never freezes.
const SAMPLE_TRIALS = 60_000;
const SAMPLE_CHUNK = 3_000;

function loadSetup(): Setup {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Setup | null;
    if (saved && STREETS.includes(saved.street) && saved.hands?.length >= 2 && saved.board?.length === 5) return saved;
  } catch {
    /* storage blocked or old shape — start fresh */
  }
  return EMPTY;
}

function saveSetup(setup: Setup): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(setup));
  } catch {
    /* only remembered for this visit */
  }
}

const sameSlot = (a: Target, b: Target) =>
  a.kind === b.kind && a.index === b.index && (a.kind === 'board' || a.hand === (b as { hand: number }).hand);
const cardLabel =(c: Card) => `${RANKS[rankOf(c)]}${SUITS[suitOf(c)]}`;
const isRed = (c: Card) => suitOf(c) === 1 || suitOf(c) === 2;
const pct = (n: number) => (n > 0.9995 ? '100%' : `${(n * 100).toFixed(1)}%`);

/** Win and tie percentages for up to six hands on any street. */
export function OddsScreen() {
  const [setup, setSetupState] = useState<Setup>(loadSetup);
  const [target, setTarget] = useState<Target | null>(null);
  const { street, hands, board } = setup;
  const boardSize = BOARD_SIZE[street];
  const liveBoard = board.slice(0, boardSize);

  function setSetup(next: Setup) {
    setSetupState(next);
    saveSetup(next);
  }

  const handsReady = hands.every(([a, b]) => a !== null && b !== null);
  const boardReady = liveBoard.every((c) => c !== null);
  const tally = useOdds(handsReady && boardReady ? (hands as Card[][]) : null, liveBoard as Card[]);

  // Every slot in the order a dealer fills them: hands, then the board for this street.
  const slots: Target[] = [
    ...hands.flatMap((_, hand) => [0, 1].map((index): Target => ({ kind: 'hand', hand, index }))),
    ...liveBoard.map((_, index): Target => ({ kind: 'board', index })),
  ];
  const valueAt = (t: Target): Slot => (t.kind === 'hand' ? hands[t.hand]![t.index]! : board[t.index]!);

  function put(t: Target, value: Slot): Setup {
    if (t.kind === 'hand') {
      const next = hands.map((h) => [...h] as Hand);
      next[t.hand]![t.index] = value;
      return { ...setup, hands: next };
    }
    const next = [...board];
    next[t.index] = value;
    return { ...setup, board: next };
  }

  function pick(c: Card) {
    if (!target) return;
    const next = put(target, c);
    // A board card hidden by going back a street mustn't reappear as a duplicate.
    next.board = next.board.map((b, i) => (b === c && !(target.kind === 'board' && target.index === i) ? null : b));
    setSetup(next);
    // Hop to the next empty slot so a whole table can be dealt in one go.
    const at = slots.findIndex((s) => sameSlot(s, target));
    const after = [...slots.slice(at + 1), ...slots.slice(0, at)];
    const empty = after.find((s) => (s.kind === 'hand' ? next.hands[s.hand]![s.index] : next.board[s.index]) === null);
    setTarget(empty ?? null);
  }

  const used = new Set<Card>([...hands.flat(), ...liveBoard].filter((c): c is Card => c !== null));
  const current = target ? valueAt(target) : null;

  // On a finished board, name what each hand made.
  const madeHands = handsReady && boardSize >= 3 && boardReady ? hands.map((h) => evaluate([...(h as Card[]), ...(liveBoard as Card[])])) : null;
  const best = tally ? Math.max(...tally.equity) : 0;

  return (
    <div class="view odds">
      <ScreenHead title={tr.odds.title} sub={tr.odds.sub} />

      <div class="streetseg" role="group" style={{ '--i': STREETS.indexOf(street) }}>
        <span class="streetseg__thumb" />
        {STREETS.map((s) => (
          <button key={s} type="button" aria-pressed={s === street} onClick={() => setSetup({ ...setup, street: s })}>
            {tr.odds.streets[s]}
          </button>
        ))}
      </div>

      {boardSize > 0 && (
        <section class="surface surface--pad oddsboard">
          <span class="label">{tr.odds.board}</span>
          <div class="oddsboard__cards">
            {board.map((c, index) => (
              <CardSlot
                key={index}
                card={c}
                size="lg"
                hidden={index >= boardSize}
                active={target?.kind === 'board' && target.index === index}
                onClick={() => setTarget({ kind: 'board', index })}
              />
            ))}
          </div>
        </section>
      )}

      <div class="stack">
        {hands.map((hand, h) => {
          const equity = tally ? tally.equity[h]! / tally.trials : null;
          const ties = tally ? tally.ties[h]! / tally.trials : 0;
          const lead = tally && tally.trials > 0 && tally.equity[h] === best && best > 0;
          const settled = tally?.exact && tally.trials === 1;
          const made = madeHands?.[h];
          return (
            <article key={h} class={`surface oddshand ${lead ? 'oddshand--lead' : equity === 0 ? 'oddshand--out' : ''}`}>
              <div class="oddshand__cards">
                {hand.map((c, index) => (
                  <CardSlot
                    key={index}
                    card={c}
                    active={target?.kind === 'hand' && target.hand === h && target.index === index}
                    onClick={() => setTarget({ kind: 'hand', hand: h, index })}
                  />
                ))}
              </div>
              <div class="oddshand__main">
                <span class="oddshand__name">
                  {tr.odds.hand(h + 1)}
                </span>
                <span class="oddshand__bar">
                  <span style={{ transform: `scaleX(${equity ?? 0})` }} />
                </span>
                {(made !== undefined || ties > 0) && (
                  <span class="oddshand__meta">
                    {made !== undefined && <strong>{categoryName(made)}</strong>}
                    {made !== undefined && ties > 0 && ' · '}
                    {ties > 0 && tr.odds.tie(pct(ties))}
                  </span>
                )}
              </div>
              <div class="oddshand__pct">
                {settled && equity! > 0 ? (
                  <span class={`pill ${ties > 0 ? 'pill--info' : 'pill--up'}`}>{ties > 0 ? tr.odds.splits : tr.odds.wins}</span>
                ) : (
                  <bdi dir="ltr">{equity === null ? '–' : pct(equity)}</bdi>
                )}
              </div>
              {hands.length > 2 && (
                <button
                  class="oddshand__remove"
                  aria-label={tr.odds.removeHand}
                  onClick={() => {
                    setTarget(null);
                    setSetup({ ...setup, hands: hands.filter((_, i) => i !== h) });
                  }}
                >
                  <XIcon size={14} />
                </button>
              )}
            </article>
          );
        })}
      </div>

      <p class="oddsnote">
        {!handsReady
          ? tr.odds.needHands
          : !boardReady
            ? tr.odds.needBoard(boardSize)
            : tally && (tally.exact ? tr.odds.exact(tally.trials.toLocaleString(locale())) : tr.odds.sampled(tally.trials.toLocaleString(locale())))}
      </p>

      <div class="btnrow">
        <button
          class="btn"
          disabled={hands.length >= MAX_HANDS}
          onClick={() => {
            const next = { ...setup, hands: [...hands, [null, null] as Hand] };
            setSetup(next);
            setTarget({ kind: 'hand', hand: hands.length, index: 0 });
          }}
        >
          <PlusIcon size={16} />
          {tr.odds.addHand}
          <span class="label__count">
            {hands.length}/{MAX_HANDS}
          </span>
        </button>
        <button
          class="btn btn--ghost"
          onClick={() => {
            setTarget(null);
            setSetup({ ...EMPTY, street });
          }}
        >
          {tr.odds.clear}
        </button>
      </div>

      {target && (
        <Sheet onClose={() => setTarget(null)}>
          <h2 class="modal__title">{tr.odds.pickCard}</h2>
          <div class="cardpicker" dir="ltr">
            {[0, 1, 2, 3].map((suit) =>
              RANKS.map((_, i) => {
                const c = card(12 - i, suit);
                const taken = used.has(c) && c !== current;
                return (
                  <button
                    key={c}
                    type="button"
                    class={`pcard pcard--pick ${isRed(c) ? 'pcard--red' : ''} ${c === current ? 'pcard--current' : ''}`}
                    disabled={taken}
                    aria-label={cardLabel(c)}
                    onClick={() => pick(c)}
                  >
                    <span class="pcard__rank">{RANKS[rankOf(c)]}</span>
                    <span class="pcard__suit">{SUITS[suit]}</span>
                  </button>
                );
              }),
            )}
          </div>
          <div class="btnrow">
            {current !== null && (
              <button class="btn btn--danger" onClick={() => setSetup(put(target, null))}>
                {tr.odds.removeCard}
              </button>
            )}
            <button class="btn btn--primary" onClick={() => setTarget(null)}>
              {tr.odds.done}
            </button>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function categoryName(score: number): string {
  const category = categoryOf(score);
  return category === 'straightFlush' && topRankOf(score) === 12 ? tr.odds.categories.royalFlush : tr.odds.categories[category];
}

function CardSlot({ card: c, active, hidden, size, onClick }: { card: Slot; active?: boolean; hidden?: boolean; size?: 'lg'; onClick: () => void }) {
  if (hidden) return <span class={`pcard pcard--ghost ${size ? `pcard--${size}` : ''}`} />;
  return (
    <button
      type="button"
      class={`pcard ${size ? `pcard--${size}` : ''} ${c === null ? 'pcard--empty' : isRed(c) ? 'pcard--red' : ''} ${active ? 'pcard--active' : ''}`}
      aria-label={c === null ? tr.odds.pickCard : cardLabel(c)}
      onClick={onClick}
    >
      {c === null ? (
        <PlusIcon size={16} />
      ) : (
        <>
          <span class="pcard__rank">{RANKS[rankOf(c)]}</span>
          <span class="pcard__suit">{SUITS[suitOf(c)]}</span>
        </>
      )}
    </button>
  );
}

/**
 * The tally for a complete setup, or null while cards are missing. From the
 * flop on every remaining board is counted at once; pre-flop is sampled in
 * chunks so the percentages appear immediately and firm up over ~a second.
 */
function useOdds(hands: Card[][] | null, board: Card[]): OddsTally | null {
  const [tally, setTally] = useState<OddsTally | null>(null);
  const key = hands ? JSON.stringify([hands, board]) : '';

  useEffect(() => {
    setTally(null);
    if (!hands) return;
    if (board.length >= 3) {
      try {
        setTally(exactOdds(hands, board));
      } catch {
        /* a duplicated card from an old saved setup — wait for it to be fixed */
      }
      return;
    }
    let total: OddsTally | null = null;
    let timer = 0;
    const step = () => {
      let chunk: OddsTally;
      try {
        chunk = sampleOdds(hands, board, SAMPLE_CHUNK);
      } catch {
        return;
      }
      total = total ? addTally(total, chunk) : chunk;
      setTally(total);
      if (total.trials < SAMPLE_TRIALS) timer = window.setTimeout(step, 0);
    };
    step();
    return () => clearTimeout(timer);
  }, [key]);

  return tally;
}
