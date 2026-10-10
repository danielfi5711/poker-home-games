/** "₪1,250" for whole shekels, "₪12.50" otherwise. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = abs % 100 === 0;
  const n = (abs / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${sign}₪${n}`;
}

export function parseShekelsToCents(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
