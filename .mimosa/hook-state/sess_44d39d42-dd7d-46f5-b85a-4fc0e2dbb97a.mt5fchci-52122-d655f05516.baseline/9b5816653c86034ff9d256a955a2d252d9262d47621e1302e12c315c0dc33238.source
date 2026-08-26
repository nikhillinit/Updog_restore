 
 
 
 
 
// client/src/lib/coerce.ts
export const clampPct = (n: unknown): number => {
  const v = Number(n);
  if (Number.isNaN(v)) return 0;
  // Handle infinity by clamping to bounds
  if (v === Infinity) return 100;
  if (v === -Infinity) return 0;
  return Math.min(100, Math.max(0, Math.round(v)));
};

export const clampInt = (n: unknown, min = 0, max = Number.MAX_SAFE_INTEGER): number => {
  const v = Number(n);
  if (Number.isNaN(v)) return min;
  // Handle infinity by clamping to bounds
  if (v === Infinity) return max;
  if (v === -Infinity) return min;
  const rounded = Math.round(v);
  return Math.min(max, Math.max(min, rounded));
};

export const toUSD = (n: number, maxDigits = 0): string =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: maxDigits,
  }).format(n);

