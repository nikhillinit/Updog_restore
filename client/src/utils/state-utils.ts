// State utility functions for consistent normalization and comparison

export const sortById = <T extends { id?: string | number }>(a: T, b: T) => {
  const aId = a.id ?? '';
  const bId = b.id ?? '';
  if (aId === bId) return 0;
  return aId > bId ? 1 : -1;
};

export function normalizeNumber(v: any): number {
  // Return NaN for non-numeric values to maintain consistency
  if (v === '' || v === null || v === undefined) return NaN;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// NaN-safe equality using Object.is
// Object.is(NaN, NaN) === true, while NaN === NaN === false
export const eq = Object.is;

// For small payloads this is fine. For larger payloads,
// swap to a stable-stringify + fast hash if needed.
export function stableHash(value: unknown): string {
  try {
    return JSON.stringify(value, objectKeySorter);
  } catch {
    return String(value);
  }
}

function objectKeySorter(_key: string, value: unknown) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const sorted: Record<string, unknown> = {};
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[k] = (value as any)[k];
    }
    return sorted;
  }
  return value;
}