import { useEffect, useRef, useState } from 'preact/hooks';
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

/**
 * Opening screen shown while the app boots: a drawn poker-table scene, the
 * app name, and a loading line with a percentage. Booting has no measurable
 * progress (it's one `/api/auth/me` round trip, plus fonts), so the bar eases
 * toward 90% while waiting and runs to 100% once `done` — then the screen
 * lifts away and calls `onFinished`.
 */
export function Splash({ done, onFinished }: { done: boolean; onFinished: () => void }) {
  const [pct, setPct] = useState(0);
  const [slow, setSlow] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [fontsReady, setFontsReady] = useState(false);
  const doneRef = useRef(done && fontsReady);
  doneRef.current = done && fontsReady;
  const finishedRef = useRef(onFinished);
  finishedRef.current = onFinished;

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
    const start = performance.now();
    let finishFrom: number | null = null;
    let finishAt = 0;
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function frame(now: number) {
      const t = now - start;
      if (finishFrom === null && doneRef.current && t >= MIN_MS) {
        finishFrom = 90 * (1 - Math.exp(-t / 650));
        finishAt = now;
      }
      if (finishFrom === null) {
        setPct(90 * (1 - Math.exp(-t / 650)));
        setSlow(t > SLOW_MS);
        raf = requestAnimationFrame(frame);
        return;
      }
      const k = Math.min(1, (now - finishAt) / FINISH_MS);
      const eased = 1 - (1 - k) ** 3;
      setPct(finishFrom + (100 - finishFrom) * eased);
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
    };
  }, []);

  const shown = Math.floor(pct);
  const label =
    shown >= 100
      ? tr.splash.ready
      : slow
        ? tr.splash.waking
        : shown < 34
          ? tr.splash.shuffling
          : shown < 68
            ? tr.splash.stacking
            : tr.splash.dealing;

  return createPortal(
    <div class={`splash ${leaving ? 'splash--out' : ''}`} role="status" aria-label={`${label} ${shown}%`}>
      <SplashScene />
      <div class={`splash__head ${fontsReady ? 'is-in' : ''}`}>
        <span class="splash__kicker">♠ ♥ ♣ ♦</span>
        <h1 class="splash__title">{tr.appName}</h1>
        <span class="splash__tagline">{tr.splash.tagline}</span>
      </div>
      <div class="splash__foot">
        <div class="splash__meta">
          <span class="splash__label">{label}</span>
          <span class="splash__pct">{shown}%</span>
        </div>
        <div class="splash__track">
          <div class="splash__fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>,
    document.body,
  );
}

const RANKS = ['10', 'J', 'Q', 'K', 'A'];
const FAN = [-26, -13, 0, 13, 26];

/** The background picture: a royal flush fanned over a felt table, chip stacks, gold bokeh and a spotlight. */
function SplashScene() {
  return (
    <svg class="splash__scene" viewBox="0 0 390 844" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
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
        <radialGradient id="sp-vignette" cx="50%" cy="48%" r="70%">
          <stop offset="0.55" stop-color="#000" stop-opacity="0" />
          <stop offset="1" stop-color="#000" stop-opacity="0.7" />
        </radialGradient>
        <linearGradient id="sp-shade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#040913" stop-opacity="0.75" />
          <stop offset="0.3" stop-color="#040913" stop-opacity="0" />
          <stop offset="0.72" stop-color="#040913" stop-opacity="0" />
          <stop offset="1" stop-color="#040913" stop-opacity="0.9" />
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

      <rect width="390" height="844" fill="url(#sp-bg)" />

      {/* table: felt with a gold-trimmed rail, seen from above at an angle */}
      <ellipse cx="195" cy="905" rx="430" ry="330" fill="#2a1a0c" />
      <ellipse cx="195" cy="905" rx="430" ry="330" fill="none" stroke="url(#sp-gold)" stroke-width="2" opacity="0.6" />
      <ellipse cx="195" cy="912" rx="398" ry="300" fill="url(#sp-felt)" />
      <ellipse cx="195" cy="912" rx="350" ry="258" fill="none" stroke="#e9c068" stroke-opacity="0.16" stroke-width="1.5" stroke-dasharray="2 7" />

      {/* spotlight from above */}
      <path d="M150 -10 L240 -10 L420 700 L-30 700 Z" fill="url(#sp-light)" filter="url(#sp-blur-lg)" />

      {/* background bokeh */}
      <g class="splash__bokeh" filter="url(#sp-blur)">
        <circle cx="52" cy="210" r="16" fill="#e9c068" opacity="0.22" />
        <circle cx="338" cy="168" r="22" fill="#e9c068" opacity="0.16" />
        <circle cx="300" cy="300" r="10" fill="#fbe3a1" opacity="0.28" />
        <circle cx="86" cy="340" r="9" fill="#6fa0ff" opacity="0.25" />
        <circle cx="362" cy="420" r="14" fill="#6fa0ff" opacity="0.18" />
        <circle cx="24" cy="470" r="20" fill="#e9c068" opacity="0.14" />
      </g>

      {/* chip stacks, out of focus at the edges */}
      <g class="splash__chips splash__chips--l" filter="url(#sp-blur-sm)">
        <ChipStack x={58} y={640} color="#c8423f" count={6} />
        <ChipStack x={104} y={668} color="#e9c068" count={4} />
      </g>
      <g class="splash__chips splash__chips--r" filter="url(#sp-blur-sm)">
        <ChipStack x={330} y={616} color="#2f6fd6" count={7} />
        <ChipStack x={288} y={660} color="#f1f4fa" count={3} />
      </g>
      <g filter="url(#sp-blur)" opacity="0.8">
        <ChipStack x={30} y={772} color="#2f6fd6" count={2} />
        <ChipStack x={366} y={760} color="#c8423f" count={3} />
      </g>

      {/* royal flush, fanning open from the pivot under it */}
      <g filter="url(#sp-shadow)">
        {RANKS.map((rank, i) => (
          <g key={rank} class="splash__card" style={{ '--a': `${FAN[i]}deg`, '--d': `${i * 70}ms` }}>
            <Card rank={rank} />
          </g>
        ))}
      </g>

      <rect width="390" height="844" fill="url(#sp-vignette)" />
      <rect width="390" height="844" fill="url(#sp-shade)" />
    </svg>
  );
}

/** A spade card standing on the fan's pivot (195, 580), 116×164. */
function Card({ rank }: { rank: string }) {
  const x = 137;
  const y = 386;
  return (
    <g>
      <rect x={x} y={y} width="116" height="164" rx="10" fill="url(#sp-card)" />
      <rect x={x + 4} y={y + 4} width="108" height="156" rx="7" fill="none" stroke="#bf8a2e" stroke-opacity="0.55" stroke-width="1" />
      <text x={x + 11} y={y + 29} class="splash__rank">
        {rank}
      </text>
      <text x={x + 12} y={y + 48} class="splash__suit-sm">
        ♠
      </text>
      <text x={x + 58} y={y + 106} text-anchor="middle" class={rank === 'A' ? 'splash__suit-ace' : 'splash__suit'}>
        ♠
      </text>
    </g>
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
