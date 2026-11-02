import { memo } from 'preact/compat';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PlayerProfile } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { ArrowLeftIcon, ReceiptIcon } from '../icons.js';
import { Avatar, Empty, FxText, Money, SectionLabel, Spinner } from '../ui.js';
import { profileTap } from '../profileNav.js';
import { locale, tr } from '../i18n.js';

interface Props {
  accountId: string;
  myAccountId: string;
  onBack: () => void;
}

const RECENT_GAMES = 8;

const shortDate = (at: number) => new Date(at).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });

/** A player's info and all-time stats, opened by tapping them anywhere in the app. */
export function ProfileScreen({ accountId, myAccountId, onBack }: Props) {
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setProfile(null);
    setError(null);
    setShowAll(false);
    window.scrollTo(0, 0);
    api
      .profile(accountId)
      .then((r) => setProfile(r.profile))
      .catch((err) => setError((err as Error).message));
  }, [accountId]);

  const back = (
    <button class="iconbtn" onClick={onBack} aria-label={tr.common.back}>
      <ArrowLeftIcon />
    </button>
  );

  if (!profile) {
    return (
      <div class="view">
        <div class="pfbar">{back}</div>
        {error ? <p class="error">{error}</p> : <Spinner />}
      </div>
    );
  }

  const p = profile;
  const isMe = p.accountId === myAccountId;
  const s = p.stats;
  const played = p.matches.length;
  const games = showAll ? p.matches : p.matches.slice(0, RECENT_GAMES);

  return (
    <div class="view pf">
      <div class="pfbar">{back}</div>

      <section class="pfhero">
        <Avatar id={p.accountId} name={p.name} size="xl" ring />
        <h1 class="pfhero__name">
          {p.name}
          {isMe && <span class="muted">{tr.common.youParen}</span>}
        </h1>
        <span class="pfhero__since">{tr.profile.memberSince(new Date(p.memberSince).toLocaleDateString(locale(), { month: 'long', year: 'numeric' }))}</span>
        {(p.rank !== null || (s && s.currentStreakCount >= 2)) && (
          <span class="pfhero__pills">
            {p.rank !== null && <span class={`pill ${p.rank <= 3 ? 'pill--gold' : ''}`}>{tr.profile.rank(p.rank, p.rankedPlayers)}</span>}
            {s && s.currentStreakCount >= 2 && (
              <span class={`pill streak streak--${s.currentStreakType}`}>
                {s.currentStreakType === 'win' ? (
                  <FxText kind="fire" text={tr.leaderboard.winsInARow(s.currentStreakCount)} />
                ) : (
                  <FxText kind="ice" text={tr.leaderboard.lossesInARow(s.currentStreakCount)} />
                )}
              </span>
            )}
          </span>
        )}
      </section>

      {!s || played === 0 ? (
        <Empty icon={<ReceiptIcon size={24} />} title={tr.profile.noGames}>
          {tr.profile.noGamesSub(p.name)}
        </Empty>
      ) : (
        <>
          <BalanceChart profile={p} />

          <div class="pfstats">
            <Stat label={tr.profile.games}>{played}</Stat>
            <Stat label={tr.profile.winRate}>
              <bdi dir="ltr">{Math.round((p.wins / played) * 100)}%</bdi>
            </Stat>
            <Stat label={tr.profile.average}>
              <Money cents={Math.round(s.balanceCents / played)} signed />
            </Stat>
            <Stat label={tr.profile.biggestWin}>{s.biggestWinCents > 0 ? <Money cents={s.biggestWinCents} signed /> : '—'}</Stat>
            <Stat label={tr.profile.biggestLoss}>{s.biggestLossCents < 0 ? <Money cents={s.biggestLossCents} signed /> : '—'}</Stat>
            <Stat label={tr.profile.bestStreak}>{tr.profile.inARow(s.longestWinStreak)}</Stat>
          </div>

          <section class="surface surface--pad pfrecord">
            <span class="label">{tr.profile.record}</span>
            <span class="pfrecord__bar" role="img" aria-label={`${tr.profile.won} ${p.wins}, ${tr.profile.even} ${p.breakevens}, ${tr.profile.lost} ${p.losses}`}>
              {p.wins > 0 && <span class="pfrecord__seg pfrecord__seg--won" style={{ flexGrow: p.wins }} />}
              {p.breakevens > 0 && <span class="pfrecord__seg pfrecord__seg--even" style={{ flexGrow: p.breakevens }} />}
              {p.losses > 0 && <span class="pfrecord__seg pfrecord__seg--lost" style={{ flexGrow: p.losses }} />}
            </span>
            <span class="pfrecord__legend">
              <span>
                <i class="pfrecord__dot pfrecord__seg--won" />
                {tr.profile.won} <strong>{p.wins}</strong>
              </span>
              <span>
                <i class="pfrecord__dot pfrecord__seg--even" />
                {tr.profile.even} <strong>{p.breakevens}</strong>
              </span>
              <span>
                <i class="pfrecord__dot pfrecord__seg--lost" />
                {tr.profile.lost} <strong>{p.losses}</strong>
              </span>
            </span>
          </section>

          {p.regulars.length > 0 && (
            <>
              <SectionLabel>{tr.profile.playsWith}</SectionLabel>
              <ul class="surface rows">
                {p.regulars.map((r) => (
                  <li key={r.accountId} class={`row tappable ${r.accountId === myAccountId ? 'row--me' : ''}`} {...profileTap(r.accountId)}>
                    <Avatar id={r.accountId} name={r.name} />
                    <span class="row__main">
                      <span class="row__title">
                        {r.name}
                        {r.accountId === myAccountId && <span class="muted">{tr.common.youSuffix}</span>}
                      </span>
                      <span class="row__sub">{tr.profile.gamesTogether(r.gamesTogether)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          <SectionLabel count={played}>{tr.profile.games}</SectionLabel>
          <ul class="surface rows">
            {games.map((m) => (
              <li key={m.id} class="row">
                <span class="game__date">
                  <span class="game__day">{new Date(m.settledAt).getDate()}</span>
                  <span class="game__month">{new Date(m.settledAt).toLocaleDateString(locale(), { month: 'short' })}</span>
                </span>
                <span class="row__main">
                  <span class="row__title">{m.name}</span>
                  <span class="row__sub">{tr.profile.place(m.place, m.playerCount)}</span>
                </span>
                <Money cents={m.netCents} signed size="lg" />
              </li>
            ))}
          </ul>
          {!showAll && played > RECENT_GAMES && (
            <button class="btn btn--ghost btn--block" onClick={() => setShowAll(true)}>
              {tr.profile.showAll(played)}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, children }: { label: string; children: preact.ComponentChildren }) {
  return (
    <div class="pfstat">
      <span class="pfstat__label">{label}</span>
      <span class="pfstat__value">{children}</span>
    </div>
  );
}

// Chart geometry, in viewBox units. The SVG stretches to the card's width;
// strokes keep their width via `vector-effect`. PAD_Y keeps the highest and
// lowest games (and the dot's halo on them) clear of the plot's edges.
const W = 320;
const H = 120;
const PAD_Y = 16;

/**
 * A smooth curve through the points that never overshoots them (monotone
 * cubic, as d3's curveMonotoneX): between two games the line only ever runs
 * from one balance to the next, so a bump in the curve is always a real game,
 * never a balance nobody had.
 */
function monotonePath(pts: readonly (readonly [number, number])[]): string {
  const n = pts.length;
  const f = (v: number) => v.toFixed(2);
  if (n < 3) return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)},${f(y)}`).join('');
  const sign = (v: number) => (v < 0 ? -1 : v > 0 ? 1 : 0);
  const h = pts.map((p, i) => (i < n - 1 ? pts[i + 1]![0] - p[0] : 0));
  const s = pts.map((p, i) => (i < n - 1 ? (pts[i + 1]![1] - p[1]) / h[i]! : 0));
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const p = (s[i - 1]! * h[i]! + s[i]! * h[i - 1]!) / (h[i - 1]! + h[i]!);
    m[i] = (sign(s[i - 1]!) + sign(s[i]!)) * Math.min(Math.abs(s[i - 1]!), Math.abs(s[i]!), 0.5 * Math.abs(p));
  }
  m[0] = (3 * s[0]! - m[1]!) / 2;
  m[n - 1] = (3 * s[n - 2]! - m[n - 2]!) / 2;
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[i + 1]!;
    const dx = h[i]! / 3;
    d += `C${f(x0 + dx)},${f(y0 + m[i]! * dx)},${f(x1 - dx)},${f(y1 - m[i + 1]! * dx)},${f(x1)},${f(y1)}`;
  }
  return d;
}

/**
 * A light tap of the taptic engine as the scrub crosses into another game.
 * Android has `navigator.vibrate`; iOS Safari (17.4+) has no API, but toggling
 * a hidden `<input switch>` plays the system haptic, so that stands in for it.
 */
let hapticLabel: HTMLLabelElement | null = null;
function haptic() {
  if (typeof navigator.vibrate === 'function') {
    navigator.vibrate(6);
    return;
  }
  if (!hapticLabel) {
    hapticLabel = document.createElement('label');
    hapticLabel.setAttribute('aria-hidden', 'true');
    hapticLabel.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    hapticLabel.appendChild(input);
    document.body.appendChild(hapticLabel);
  }
  hapticLabel.click();
}

/**
 * Balance after every game, starting from ₪0 before the first one. Drag (or
 * hover) across it to read any game: the dot snaps from game to game under
 * the finger (with a haptic tick), the line past it dims, and the headline
 * shows that game's balance.
 */
function BalanceChart({ profile }: { profile: PlayerProfile }) {
  const [active, setActive] = useState<number | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const frame = useRef(0);
  const placed = useRef(-1);

  // Everything that depends only on the data, worked out once per profile —
  // not on every finger movement.
  const chart = useMemo(() => {
    const values = [0, ...profile.balanceHistory.map((h) => h.balanceCents)];
    const chronological = [...profile.matches].reverse();
    // The table's name in a bidi isolate (FSI…PDI), so a Latin name in Hebrew (or the reverse) doesn't swap places with the date.
    const labels = [tr.profile.start, ...chronological.map((m) => `⁨${m.name}⁩ · ${shortDate(m.settledAt)}`)];
    let min = Math.min(0, ...values);
    let max = Math.max(0, ...values);
    // Only breakeven games: nothing to scale by, so ₪0 runs through the middle.
    if (max === min) {
      min -= 1;
      max += 1;
    }
    const x = (i: number) => (i / (values.length - 1)) * W;
    const y = (v: number) => PAD_Y + ((max - v) / (max - min)) * (H - PAD_Y * 2);
    const pts = values.map((v, i) => [x(i), y(v)] as const);
    const line = monotonePath(pts);
    const zero = y(0);
    return {
      values,
      labels,
      line,
      area: `${line}L${W},${zero}L0,${zero}Z`,
      zero,
      top: y(max),
      bottom: y(min),
      // Each point as a fraction of the plot's width/height, for positioning the dot.
      points: pts.map(([px, py]) => [px / W, py / H] as const),
    };
  }, [profile]);

  const plot = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLSpanElement>(null);
  const cross = useRef<HTMLSpanElement>(null);
  const lit = useRef<HTMLDivElement>(null);
  const litArt = useRef<HTMLDivElement>(null);

  const { values, labels, points } = chart;
  const n = values.length;
  const shown = active ?? n - 1;

  /**
   * Puts the dot on game `i`, the crosshair under it, and lights the line up
   * to it. Written straight to the DOM — no re-render per frame — and only
   * transforms, so the CSS transitions between games run on the compositor.
   * The lit line is "clipped" by sliding a window (overflow: hidden) left
   * while sliding the art inside it right by the same amount.
   */
  function place(i: number) {
    placed.current = i;
    const [fx, fy] = points[i]!;
    dot.current!.style.transform = `translate(${fx * 100}%, ${fy * 100}%)`;
    dot.current!.classList.toggle('pfchart__layer--down', values[i]! < 0);
    cross.current!.style.transform = `translateX(${fx * 100}%)`;
    lit.current!.style.transform = `translateX(${(fx - 1) * 100}%)`;
    litArt.current!.style.transform = `translateX(${(1 - fx) * 100}%)`;
  }

  // At rest the dot sits on the latest balance.
  useLayoutEffect(() => place(n - 1), [chart]);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  /** idle → glides home slowly; scrub → snaps quickly from game to game. */
  const setMode = (mode: 'idle' | 'scrub') => (plot.current!.dataset.mode = mode);

  function follow(e: PointerEvent) {
    if (!rect.current) {
      // A new touch: measure once (no layout reads while the finger moves).
      rect.current = plot.current!.getBoundingClientRect();
      placed.current = -1;
      setMode('scrub');
    }
    const clientX = e.clientX;
    const touch = e.pointerType !== 'mouse';
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = rect.current;
      if (!r) return;
      const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      const i = Math.round(t * (n - 1));
      if (i === placed.current) return;
      if (placed.current !== -1 && touch) haptic();
      place(i);
      setActive(i);
    });
  }

  function release() {
    cancelAnimationFrame(frame.current);
    if (!rect.current) return;
    rect.current = null;
    setMode('idle');
    place(n - 1);
    setActive(null);
  }

  const first = profile.balanceHistory[0]!;
  const last = profile.balanceHistory[profile.balanceHistory.length - 1]!;

  return (
    <section class="surface surface--pad pfchart">
      <div class="pfchart__head">
        <span class="label">{active === null ? tr.profile.balance : labels[shown]}</span>
        <Money cents={values[shown]!} signed size="xl" class="pfchart__value" />
      </div>
      <div
        ref={plot}
        class="pfchart__plot"
        data-mode="idle"
        dir="ltr"
        onPointerDown={follow}
        onPointerMove={follow}
        onPointerLeave={release}
        onPointerUp={(e) => e.pointerType !== 'mouse' && release()}
        onPointerCancel={release}
      >
        {/* The line twice: a dim copy underneath, and a lit copy cut off at the finger. */}
        <div class="pfchart__art pfchart__art--dim">
          <ChartArt chart={chart} />
        </div>
        <div ref={lit} class="pfchart__lit">
          <div ref={litArt} class="pfchart__art">
            <ChartArt chart={chart} />
          </div>
        </div>
        {/* Full-size layers moved with transforms (percentages of their own size = the plot's size),
            so following a finger never triggers layout — only compositing. */}
        <span ref={cross} class="pfchart__layer pfchart__cross" />
        <span ref={dot} class="pfchart__layer">
          <span class="pfchart__dot" />
        </span>
      </div>
      {/* Dates under the first and the latest game (the line starts at ₪0, one step before the first game). */}
      <div class="pfchart__axis" dir="ltr">
        {n > 2 && <span style={{ left: `max(0px, calc(${points[1]![0] * 100}% - 22px))` }}>{shortDate(first.at)}</span>}
        <span class="pfchart__axis-end">{shortDate(last.at)}</span>
      </div>
    </section>
  );
}

type ChartGeometry = { line: string; area: string; zero: number; top: number; bottom: number };

/** The static line and fills. Memoized, so scrubbing only ever touches the dot and crosshair. */
const ChartArt = memo(function ChartArt({ chart }: { chart: ChartGeometry }) {
  const { line, area, zero, top, bottom } = chart;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        {/* Fills fade out toward ₪0, from the highest (or lowest) balance. */}
        <linearGradient id="pfUp" gradientUnits="userSpaceOnUse" x1="0" y1={top} x2="0" y2={zero}>
          <stop offset="0" stop-color="var(--gold)" stop-opacity="0.22" />
          <stop offset="1" stop-color="var(--gold)" stop-opacity="0" />
        </linearGradient>
        <linearGradient id="pfDown" gradientUnits="userSpaceOnUse" x1="0" y1={bottom} x2="0" y2={zero}>
          <stop offset="0" stop-color="var(--down)" stop-opacity="0.2" />
          <stop offset="1" stop-color="var(--down)" stop-opacity="0" />
        </linearGradient>
        {/* Above ₪0 is gold, below is red — the same line, split at the zero line. */}
        <clipPath id="pfAbove">
          <rect x="-4" y="-4" width={W + 8} height={zero + 4} />
        </clipPath>
        <clipPath id="pfBelow">
          <rect x="-4" y={zero} width={W + 8} height={H - zero + 4} />
        </clipPath>
      </defs>
      <path d={area} fill="url(#pfUp)" clip-path="url(#pfAbove)" />
      <path d={area} fill="url(#pfDown)" clip-path="url(#pfBelow)" />
      <line class="pfchart__zero" x1="0" x2={W} y1={zero} y2={zero} vector-effect="non-scaling-stroke" />
      <path class="pfchart__line" d={line} clip-path="url(#pfAbove)" vector-effect="non-scaling-stroke" />
      <path class="pfchart__line pfchart__line--down" d={line} clip-path="url(#pfBelow)" vector-effect="non-scaling-stroke" />
    </svg>
  );
});

