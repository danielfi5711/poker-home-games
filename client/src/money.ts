/** "₪1,250" for whole shekels, "₪12.50" otherwise. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  const whole = abs % 100 === 0;
  const n = (abs / 100).toLocaleString('en-US', { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  return `${sign}₪${n}`;
}

/** Cents as an editable amount-box value: "50", "12.50". */
export function centsToInput(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export function parseShekelsToCents(input: string): number {
  const n = Number(input);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}
