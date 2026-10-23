import { memo } from 'preact/compat';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { PlayerProfile } from '../../../src/shared/types.js';
import { api } from '../api.js';
import { ArrowLeftIcon, ReceiptIcon } from '../icons.js';
import { Avatar, Empty, Money, SectionLabel, Spinner } from '../ui.js';
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
              <span class={`pill ${s.currentStreakType === 'win' ? 'pill--up' : 'pill--info'}`}>
                {s.currentStreakType === 'win' ? `🔥 ${tr.leaderboard.winsInARow(s.currentStreakCount)}` : `🧊 ${tr.leaderboard.lossesInARow(s.currentStreakCount)}`}
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
// strokes keep their width via `vector-effect`.
const W = 320;
const H = 120;
const PAD = 12;

/**
 * Balance after every game, starting from ₪0 before the first one. Drag (or
 * hover) across it to read any game; the headline number follows the finger.
 */
function BalanceChart({ profile }: { profile: PlayerProfile }) {
  const [active, setActive] = useState<number | null>(null);
  const rect = useRef<DOMRect | null>(null);
  const frame = useRef(0);

  // Everything that depends only on the data, worked out once per profile —
  // not on every finger movement.
  const chart = useMemo(() => {
    const values = [0, ...profile.balanceHistory.map((h) => h.balanceCents)];
    const chronological = [...profile.matches].reverse();
    const labels = [tr.profile.start, ...chronological.map((m) => `${m.name} · ${shortDate(m.settledAt)}`)];
    const min = Math.min(0, ...values);
    const max = Math.max(0, ...values);
    const span = max - min || 1;
    const x = (i: number) => (i / (values.length - 1)) * W;
    const y = (v: number) => PAD + ((max - v) / span) * (H - PAD * 2);
    const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
    return {
      values,
      labels,
      line,
      area: `${line}L${W},${y(0)}L0,${y(0)}Z`,
      zero: y(0),
      // Each point as a fraction of the plot's width/height, for positioning the dot.
      points: values.map((v, i) => [x(i) / W, y(v) / H] as const),
    };
  }, [profile]);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const { values, labels, points } = chart;
  const shown = active ?? values.length - 1;
  const [fx, fy] = points[shown]!;

  // Measure once per touch (not per move), and update at most once per frame.
  // setActive with the same index doesn't re-render, so sliding within one
  // game's slot costs nothing.
  function scrub(e: PointerEvent) {
    if (e.type === 'pointerdown' || !rect.current) rect.current = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const clientX = e.clientX;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      const r = rect.current!;
      const t = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
      setActive(Math.round(t * (values.length - 1)));
    });
  }

  function release() {
    cancelAnimationFrame(frame.current);
    rect.current = null;
    setActive(null);
  }

  return (
    <section class="surface surface--pad pfchart">
      <div class="pfchart__head">
        <span class="label">{active === null ? tr.profile.balance : labels[shown]}</span>
        <Money cents={values[shown]!} signed size="xl" />
      </div>
      <div
        class={`pfchart__plot ${active !== null ? 'pfchart__plot--active' : ''}`}
        dir="ltr"
        onPointerEnter={() => (rect.current = null)}
        onPointerDown={scrub}
        onPointerMove={scrub}
        onPointerLeave={release}
        onPointerUp={(e) => e.pointerType !== 'mouse' && release()}
        onPointerCancel={release}
      >
        <ChartArt chart={chart} />
        {/* Full-size layers moved with transforms (percentages of their own size = the plot's size),
            so following a finger never triggers layout — only compositing. */}
        <span class="pfchart__layer pfchart__cross" style={{ transform: `translateX(${fx * 100}%)` }} />
        <span class="pfchart__layer" style={{ transform: `translate(${fx * 100}%, ${fy * 100}%)` }}>
          <span class={`pfchart__dot ${values[shown]! < 0 ? 'pfchart__dot--down' : ''}`} />
        </span>
      </div>
      <div class="pfchart__axis" dir="ltr">
        <span>{shortDate(profile.balanceHistory[0]!.at)}</span>
        <span>{shortDate(profile.balanceHistory[profile.balanceHistory.length - 1]!.at)}</span>
      </div>
    </section>
  );
}

type ChartGeometry = { line: string; area: string; zero: number };

/** The static line and fills. Memoized, so scrubbing only ever touches the dot and crosshair. */
const ChartArt = memo(function ChartArt({ chart }: { chart: ChartGeometry }) {
  const { line, area, zero } = chart;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="pfUp" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="var(--gold)" stop-opacity="0.3" />
          <stop offset="1" stop-color="var(--gold)" stop-opacity="0.02" />
        </linearGradient>
        <linearGradient id="pfDown" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stop-color="var(--down)" stop-opacity="0.26" />
          <stop offset="1" stop-color="var(--down)" stop-opacity="0.02" />
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
