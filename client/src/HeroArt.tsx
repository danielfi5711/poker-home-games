/**
 * The Tables tab's "New game" picture: pocket aces fanned under a warm light,
 * with chip stacks in front, drawn as one static inline SVG (crisp at any
 * pixel density, no image request). The only motion is the light breathing
 * and a few gold glints twinkling — HTML layers animating `opacity`/`transform`
 * on the compositor; nothing inside the SVG ever moves.
 */
export function HeroArt() {
  return (
    <div class="hero__art" aria-hidden="true">
      <span class="hero__light" />
      <svg class="hero__scene" viewBox="0 0 164 140" width="164" height="140">
        <defs>
          <linearGradient id="ha-card" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fffdf6" />
            <stop offset="1" stop-color="#ece2cc" />
          </linearGradient>
          <linearGradient id="ha-sheen" x1="0" y1="0" x2="1" y2="0.6">
            <stop offset="0.3" stop-color="#fff" stop-opacity="0" />
            <stop offset="0.5" stop-color="#fff" stop-opacity="0.55" />
            <stop offset="0.62" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <linearGradient id="ha-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#fbe3a1" />
            <stop offset="0.5" stop-color="#e9c068" />
            <stop offset="1" stop-color="#bf8a2e" />
          </linearGradient>
          {/* cylinder shading laid over every chip's side band */}
          <linearGradient id="ha-cyl" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stop-color="#000" stop-opacity="0.45" />
            <stop offset="0.3" stop-color="#fff" stop-opacity="0.12" />
            <stop offset="0.55" stop-color="#000" stop-opacity="0" />
            <stop offset="1" stop-color="#000" stop-opacity="0.5" />
          </linearGradient>
          <linearGradient id="ha-face" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0" stop-color="#fff" stop-opacity="0.3" />
            <stop offset="0.6" stop-color="#fff" stop-opacity="0" />
          </linearGradient>
          <radialGradient id="ha-pool">
            <stop offset="0" stop-color="#fbe3a1" stop-opacity="0.2" />
            <stop offset="1" stop-color="#fbe3a1" stop-opacity="0" />
          </radialGradient>
          <radialGradient id="ha-contact">
            <stop offset="0" stop-color="#000" stop-opacity="0.55" />
            <stop offset="1" stop-color="#000" stop-opacity="0" />
          </radialGradient>
          <filter id="ha-shadow" x="-40%" y="-30%" width="180%" height="170%">
            <feDropShadow dx="0" dy="5" stdDeviation="4.5" flood-color="#020814" flood-opacity="0.55" />
          </filter>
          <path id="ha-spade" d="M12 1.5C14.6 5.3 22 9.6 22 14.4c0 3-2.3 5.1-4.9 5.1-1.6 0-3.1-.8-4-2.1.3 2 1.2 3.6 2.6 4.6H8.3c1.4-1 2.3-2.6 2.6-4.6-.9 1.3-2.4 2.1-4 2.1C4.3 19.5 2 17.4 2 14.4 2 9.6 9.4 5.3 12 1.5Z" />
          <path id="ha-heart" d="M12 21.2C5.3 16.2 1.6 12.6 1.6 8.3c0-3 2.4-5.4 5.4-5.4 2 0 3.9 1.1 5 2.9 1.1-1.8 3-2.9 5-2.9 3 0 5.4 2.4 5.4 5.4 0 4.3-3.7 7.9-10.4 12.9Z" />
        </defs>

        {/* soft shadows where things touch the table */}
        {/* pool of lamplight on the felt */}
        <ellipse cx="96" cy="118" rx="74" ry="20" fill="url(#ha-pool)" />
        {/* soft shadows where things touch the table */}
        <ellipse cx="100" cy="114" rx="50" ry="9" fill="url(#ha-contact)" />
        <ellipse cx="44" cy="128" rx="28" ry="7.5" fill="url(#ha-contact)" />
        <ellipse cx="138" cy="131" rx="25" ry="6.5" fill="url(#ha-contact)" />

        <Card x={84} y={112} angle={-17} suit="spade" />
        <Card x={112} y={110} angle={11} suit="heart" />

        <Stack cx={44} base={127} chips={['#b8343a', '#b8343a', '#b8343a', '#b8343a', '#b8343a']} offset={[10, 40, 25, 55, 0]} />
        <Stack cx={138} base={130} chips={['#1f4fa8', '#1f4fa8', '#d9a548']} offset={[30, 5, 20]} />
      </svg>
      <span class="hero__glint hero__glint--1" />
      <span class="hero__glint hero__glint--2" />
      <span class="hero__glint hero__glint--3" />
    </div>
  );
}

/** A 56×80 playing card standing on (x, y), tilted `angle` degrees about that point. */
function Card({ x, y, angle, suit }: { x: number; y: number; angle: number; suit: 'spade' | 'heart' }) {
  const ink = suit === 'spade' ? '#141a2b' : '#c62f3a';
  const glyph = `#ha-${suit}`;
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} filter="url(#ha-shadow)">
      <g transform="translate(-28 -88)">
        <rect width="56" height="80" rx="6" fill="url(#ha-card)" />
        <rect x="3" y="3" width="50" height="74" rx="4" fill="none" stroke="url(#ha-gold)" stroke-width="0.8" />
        <Corner ink={ink} glyph={glyph} />
        <g transform="rotate(180 28 40)">
          <Corner ink={ink} glyph={glyph} />
        </g>
        {suit === 'spade' && <circle cx="28" cy="40" r="15" fill="none" stroke="url(#ha-gold)" stroke-width="1" />}
        <use href={glyph} transform={suit === 'spade' ? 'translate(18.5 30.5) scale(0.8)' : 'translate(17 29.5) scale(0.92)'} fill={ink} />
        <rect width="56" height="80" rx="6" fill="url(#ha-sheen)" />
      </g>
    </g>
  );
}

function Corner({ ink, glyph }: { ink: string; glyph: string }) {
  return (
    <g fill={ink}>
      <text x="9.5" y="16" class="hero__rank">
        A
      </text>
      <use href={glyph} transform="translate(5.6 18.5) scale(0.33)" />
    </g>
  );
}

const RX = 19;
const RY = 7;
const H = 5;

/** Chips stacked upward from `base` (bottom chip's lower edge), bottom chip first. */
function Stack({ cx, base, chips, offset }: { cx: number; base: number; chips: string[]; offset: number[] }) {
  return (
    <g>
      {chips.map((color, i) => (
        <Chip key={i} cx={cx} y={base - H - i * H - RY} color={color} turn={offset[i] ?? 0} top={i === chips.length - 1} />
      ))}
    </g>
  );
}

/** One chip whose top face is centered on (cx, y): a shaded side band with edge inserts, and (if on top) its face. */
function Chip({ cx, y, color, turn, top }: { cx: number; y: number; color: string; turn: number; top: boolean }) {
  const side = `M${cx - RX} ${y}v${H}a${RX} ${RY} 0 0 0 ${2 * RX} 0v${-H}a${RX} ${RY} 0 0 1 ${-2 * RX} 0Z`;
  // six white inserts around the edge; draw the ones facing us
  // (angle 0 = left edge, 90° = nearest point, 180° = right edge; each insert spans 20°)
  const at = (deg: number, dy = 0) => {
    const t = (Math.min(180, Math.max(0, deg)) * Math.PI) / 180;
    return `${(cx - RX * Math.cos(t)).toFixed(2)} ${(y + dy + RY * Math.sin(t)).toFixed(2)}`;
  };
  const inserts = [];
  for (let k = 0; k < 6; k++) {
    const mid = (turn + k * 60) % 360;
    if (mid < 4 || mid > 176) continue;
    const d = `M${at(mid - 10)}A${RX} ${RY} 0 0 0 ${at(mid + 10)}L${at(mid + 10, H)}A${RX} ${RY} 0 0 1 ${at(mid - 10, H)}Z`;
    inserts.push(<path key={k} d={d} fill="#f6f1e6" />);
  }
  return (
    <g>
      <path d={side} fill={color} />
      {inserts}
      <path d={side} fill="url(#ha-cyl)" />
      <path d={`M${cx - RX} ${y + H}a${RX} ${RY} 0 0 0 ${2 * RX} 0`} fill="none" stroke="#000" stroke-opacity="0.35" stroke-width="0.6" />
      <ellipse cx={cx} cy={y} rx={RX} ry={RY} fill={color} />
      {top && (
        <>
          <ellipse cx={cx} cy={y} rx={RX - 1.7} ry={RY - 0.65} fill="none" stroke="#f6f1e6" stroke-width="2.4" pathLength={60} stroke-dasharray="5 5" stroke-dashoffset={turn / 6} />
          <ellipse cx={cx} cy={y} rx={RX * 0.6} ry={RY * 0.6} fill="#fff" fill-opacity="0.1" stroke="#f6f1e6" stroke-opacity="0.55" stroke-width="0.7" />
          <ellipse cx={cx} cy={y} rx={RX} ry={RY} fill="url(#ha-face)" />
        </>
      )}
      <ellipse cx={cx} cy={y} rx={RX} ry={RY} fill="none" stroke="#000" stroke-opacity="0.22" stroke-width="0.5" />
    </g>
  );
}
