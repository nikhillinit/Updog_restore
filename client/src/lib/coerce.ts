// client/src/lib/coerce.ts
export const clampPct = (n: unknown): number => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
};

export const clampInt = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
};

export const toUSD = (n: number, maxDigits = 0): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: maxDigits,
  }).format(n);
