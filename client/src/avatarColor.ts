/** Deterministic, good-looking hue per account so every avatar isn't the same muted gray. */
function hueFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

export function avatarStyle(seed: string): { background: string; color: string; borderColor: string } {
  const hue = hueFor(seed);
  return {
    background: `linear-gradient(155deg, hsl(${hue} 70% 62%), hsl(${hue} 65% 38%))`,
    color: 'rgba(10, 10, 8, 0.82)',
    borderColor: `hsla(${hue}, 70%, 75%, 0.55)`,
  };
}
