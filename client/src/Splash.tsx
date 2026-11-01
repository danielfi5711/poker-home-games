import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { tr } from './i18n.js';

/** Shortest time the opening screen is up, so the deal-in plays out even on an instant boot. */
const MIN_MS = 1100;
/** Fill time from wherever the bar is to 100% once loading is done. */
const FINISH_MS = 380;
/** Pause on 100% before the screen lifts away. */
const HOLD_MS = 220;
/** Matches `.splash--out`'s animation. */
const EXIT_MS = 480;
/** Loading this long means the server is waking from sleep — say so. */
const SLOW_MS = 5000;
/** The waiting curve is baked into a bar animation this long (it's at 90% well before). */
const CURVE_MS = 8000;
/** The scene is drawn on a 390×844 stage, scaled to cover the screen. */
const STAGE_W = 390;
const STAGE_H = 844;

/** Where the bar sits `t` ms into waiting: eases toward 90%. */
const waiting = (t: number) => 90 * (1 - Math.exp(-t / 650));
/** easeOutCubic, the same curve as `FINISH_EASING`. */
const finishEase = (k: number) => 1 - (1 - k) ** 3;
const FINISH_EASING = 'cubic-bezier(0.33, 1, 0.68, 1)';

/**
 * Opening screen shown while the app boots: a drawn poker-table scene, the
 * app name, and a loading line with a percentage. Booting has no measurable
 * progress (it's one `/api/auth/me` round trip, plus fonts), so the bar eases
 * toward 90% while waiting and runs to 100% once `done` — then the screen
 * lifts away and calls `onFinished`.
 *
 * Everything that moves is animated with `transform`/`opacity` only (CSS or
 * Web Animations), which the browser runs on the GPU compositor: it stays at
 * the screen's frame rate even while the main thread is busy booting the app.
 * Only the percentage text is updated from JS.
 */
export function Splash({ done, onFinished }: { done: boolean; onFinished: () => void }) {
  const [stage, setStage] = useState<Stage>('shuffling');
  const [leaving, setLeaving] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const doneRef = useRef(done && fontsReady);
  doneRef.current = done && fontsReady;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;
  const scene = useMemo(() => <SplashScene />, []);

  // Scale the stage to cover the screen (like the old `preserveAspectRatio="xMidYMid slice"`).
  useLayoutEffect(() => {
    const fit = () => {
      const el = rootRef.current;
      if (!el) return;
      const s = Math.max(el.clientWidth / STAGE_W, el.clientHeight / STAGE_H);
      el.style.setProperty('--stage-scale', String(s));
    };
    fit();
    addEventListener('resize', fit);
    return () => removeEventListener('resize', fit);
  }, []);

  // Hold the title until its display font is in, so it never swaps mid-animation.
  useEffect(() => {
    let alive = true;
    const ready = () => alive && setFontsReady(true);
    const timeout = setTimeout(ready, 1500);
    document.fonts?.ready.then(ready, ready) ?? ready();
    return () => {
      alive = false;
      clearTimeout(timeout);
    };
  }, []);

  useEffect(() => {
    const fill = fillRef.current!;
    const start = performance.now();
    // The waiting curve, sampled into keyframes so the compositor runs it.
    const steps = 40;
    const grow = fill.animate(
      Array.from({ length: steps + 1 }, (_, i) => ({ transform: `scaleX(${waiting((i / steps) * CURVE_MS) / 100})` })),
      { duration: CURVE_MS, fill: 'forwards' },
    );
    let finish: Animation | undefined;
    let finishFrom: number | null = null;
    let finishAt = 0;
    let shown = -1;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function show(pct: number, slow: boolean) {
      const whole = Math.floor(pct);
      if (whole === shown) return;
      shown = whole;
      if (pctRef.current) pctRef.current.textContent = `${whole}%`;
      setStage(stageFor(whole, slow));
    }

    function frame(now: number) {
      const t = now - start;
      if (finishFrom === null && doneRef.current && t >= MIN_MS) {
        finishFrom = waiting(t);
        finishAt = now;
        grow.cancel();
        finish = fill.animate([{ transform: `scaleX(${finishFrom / 100})` }, { transform: 'scaleX(1)' }], {
          duration: FINISH_MS,
          easing: FINISH_EASING,
          fill: 'forwards',
        });
      }
      if (finishFrom === null) {
        show(waiting(t), t > SLOW_MS);
        raf = requestAnimationFrame(frame);
        return;
      }
      const k = Math.min(1, (now - finishAt) / FINISH_MS);
      show(finishFrom + (100 - finishFrom) * finishEase(k), false);
      if (k < 1) {
        raf = requestAnimationFrame(frame);
        return;
      }
      timer = setTimeout(() => {
        setLeaving(true);
        timer = setTimeout(() => finishedRef.current(), EXIT_MS);
      }, HOLD_MS);
    }

    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timer);
      grow.cancel();
      finish?.cancel();
    };
  }, []);

  const label = tr.splash[stage];

  return createPortal(
    <div ref={rootRef} class={`splash ${leaving ? 'splash--out' : ''}`} role="status" aria-label={label}>
      {scene}
      <div class={`splash__head ${fontsReady ? 'is-in' : ''}`}>
        <span class="splash__kicker">♠ ♥ ♣ ♦</span>
        <div class="splash__titlebox">
          <h1 class="splash__title">{tr.appName}</h1>
          {/* the shine: a bright copy of the title seen through a sliding window */}
          <span class="splash__shine" aria-hidden="true">
            <span class="splash__title splash__title--shine">{tr.appName}</span>
          </span>
        </div>
        <span class="splash__tagline">{tr.splash.tagline}</span>
      </div>
      <div class="splash__foot">
        <div class="splash__meta">
          <span class="splash__label">{label}</span>
          <span class="splash__pct" ref={pctRef}>
            0%
          </span>
        </div>
        <div class="splash__track">
          <div class="splash__fill" ref={fillRef}>
            <span class="splash__glint" />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

type Stage = 'shuffling' | 'stacking' | 'dealing' | 'waking' | 'ready';

function stageFor(pct: number, slow: boolean): Stage {
  if (pct >= 100) return 'ready';
  if (slow) return 'waking';
  return pct < 34 ? 'shuffling' : pct < 68 ? 'stacking' : 'dealing';
}

const RANKS = ['10', 'J', 'Q', 'K', 'A'];
const FAN = [-26, -13, 0, 13, 26];

/**
 * The background picture: a royal flush fanned over a felt table, chip stacks,
 * gold bokeh and a spotlight, on a 390×844 stage. Each moving part (bokeh,
 * chips, every card) is its own element animated as a whole, so its blur and
 * shadow are drawn once and the GPU only moves it — animating anything inside
 * an SVG redraws that SVG every frame.
 */
function SplashScene() {
  return (
    <div class="splash__scene" aria-hidden="true">
      <div class="splash__stage">
        <svg class="splash__layer" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <defs>
            <radialGradient id="sp-bg" cx="50%" cy="38%" r="75%">
              <stop offset="0" stop-color="#1a3c78" />
              <stop offset="0.45" stop-color="#0b1a36" />
              <stop offset="1" stop-color="#040913" />
            </radialGradient>
            <radialGradient id="sp-felt" cx="50%" cy="20%" r="80%">
              <stop offset="0" stop-color="#1b4a8e" />
              <stop offset="0.6" stop-color="#0e2a58" />
              <stop offset="1" stop-color="#071633" />
            </radialGradient>
            <linearGradient id="sp-light" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stop-color="#fff3d1" stop-opacity="0.22" />
              <stop offset="1" stop-color="#fff3d1" stop-opacity="0" />
            </linearGradient>
            <linearGradient id="sp-card" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#fffdf7" />
              <stop offset="1" stop-color="#e8dfcb" />
            </linearGradient>
            <linearGradient id="sp-gold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="#fbe3a1" />
              <stop offset="0.5" stop-color="#e9c068" />
              <stop offset="1" stop-color="#bf8a2e" />
            </linearGradient>
            <filter id="sp-blur-sm" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="2.2" />
            </filter>
            <filter id="sp-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="6" />
            </filter>
            <filter id="sp-blur-lg" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="18" />
            </filter>
            <filter id="sp-shadow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="8" stdDeviation="9" flood-color="#000" flood-opacity="0.55" />
            </filter>
          </defs>

          <rect width={STAGE_W} height={STAGE_H} fill="url(#sp-bg)" />

          {/* table: felt with a gold-trimmed rail, seen from above at an angle */}
          <ellipse cx="195" cy="905" rx="430" ry="330" fill="#2a1a0c" />
          <ellipse cx="195" cy="905" rx="430" ry="330" fill="none" stroke="url(#sp-gold)" stroke-width="2" opacity="0.6" />
          <ellipse cx="195" cy="912" rx="398" ry="300" fill="url(#sp-felt)" />
          <ellipse cx="195" cy="912" rx="350" ry="258" fill="none" stroke="#e9c068" stroke-opacity="0.16" stroke-width="1.5" stroke-dasharray="2 7" />

          {/* spotlight from above */}
          <path d="M150 -10 L240 -10 L420 700 L-30 700 Z" fill="url(#sp-light)" filter="url(#sp-blur-lg)" />

          {/* far chip stacks, well out of focus */}
          <g filter="url(#sp-blur)" opacity="0.8">
            <ChipStack x={30} y={772} color="#2f6fd6" count={2} />
            <ChipStack x={366} y={760} color="#c8423f" count={3} />
          </g>
        </svg>

        {/* background bokeh */}
        <svg class="splash__layer splash__bokeh" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <g filter="url(#sp-blur)">
            <circle cx="52" cy="210" r="16" fill="#e9c068" opacity="0.22" />
            <circle cx="338" cy="168" r="22" fill="#e9c068" opacity="0.16" />
            <circle cx="300" cy="300" r="10" fill="#fbe3a1" opacity="0.28" />
            <circle cx="86" cy="340" r="9" fill="#6fa0ff" opacity="0.25" />
            <circle cx="362" cy="420" r="14" fill="#6fa0ff" opacity="0.18" />
            <circle cx="24" cy="470" r="20" fill="#e9c068" opacity="0.14" />
          </g>
        </svg>

        {/* chip stacks, out of focus at the edges */}
        <svg class="splash__layer splash__chips" viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}>
          <g filter="url(#sp-blur-sm)">
            <ChipStack x={58} y={640} color="#c8423f" count={6} />
            <ChipStack x={104} y={668} color="#e9c068" count={4} />
            <ChipStack x={330} y={616} color="#2f6fd6" count={7} />
            <ChipStack x={288} y={660} color="#f1f4fa" count={3} />
          </g>
        </svg>

        {/* royal flush, fanning open from the pivot under it */}
        {RANKS.map((rank, i) => (
          <div key={rank} class="splash__card" style={{ '--a': `${FAN[i]}deg`, '--d': `${i * 70}ms` }}>
            <Card rank={rank} />
          </div>
        ))}
      </div>

      {/* vignette and top/bottom shade, so the title and bar read */}
      <div class="splash__shade" />
    </div>
  );
}

/**
 * A spade card, 116×164, in its own small SVG with room around it for the
 * shadow. `.splash__card` places it on the stage at (137, 386), standing on the
 * fan's pivot (195, 580).
 */
function Card({ rank }: { rank: string }) {
  return (
    <svg viewBox="-30 -22 176 232" width="176" height="232">
      <g filter="url(#sp-shadow)">
        <rect width="116" height="164" rx="10" fill="url(#sp-card)" />
        <rect x="4" y="4" width="108" height="156" rx="7" fill="none" stroke="#bf8a2e" stroke-opacity="0.55" stroke-width="1" />
        <text x="11" y="29" class="splash__rank">
          {rank}
        </text>
        <text x="12" y="48" class="splash__suit-sm">
          ♠
        </text>
        <text x="58" y="106" text-anchor="middle" class={rank === 'A' ? 'splash__suit-ace' : 'splash__suit'}>
          ♠
        </text>
      </g>
    </svg>
  );
}

/** A stack of `count` chips seen at an angle, top chip centered on (x, y). */
function ChipStack({ x, y, color, count }: { x: number; y: number; color: string; count: number }) {
  const step = 6;
  const layers = Array.from({ length: count }, (_, i) => count - 1 - i);
  return (
    <g>
      {layers.map((i) => {
        const cy = y + i * step;
        return (
          <g key={i}>
            <ellipse cx={x} cy={cy + 4} rx="26" ry="10" fill="#000" opacity="0.35" />
            <ellipse cx={x} cy={cy} rx="26" ry="10" fill={color} />
            <ellipse cx={x} cy={cy} rx="26" ry="10" fill="none" stroke="#fff" stroke-opacity="0.75" stroke-width="2.4" stroke-dasharray="6 9" />
          </g>
        );
      })}
      <ellipse cx={x} cy={y} rx="17" ry="6.4" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="1" />
      <ellipse cx={x - 6} cy={y - 3} rx="9" ry="2.6" fill="#fff" opacity="0.18" />
    </g>
  );
}
