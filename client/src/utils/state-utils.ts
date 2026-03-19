// State utility functions for consistent normalization and comparison

// Sort comparator for id-bearing records
export const sortById = <T extends { id?: string | number }>(a: T, b: T) => {
  const aId = a.id ?? '';
  const bId = b.id ?? '';
  if (aId === bId) return 0;
  return aId > bId ? 1 : -1;
};

// Normalize to number; return NaN for non-finite
export function normalizeNumber(v: unknown): number {
  if (v === '' || v === null || v === undefined) return NaN;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Circular-safe, stable key order serialization
export function stableSerialize(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, function (_k, rawValue) {
    const currentValue = rawValue as unknown;

    if (currentValue && typeof currentValue === 'object') {
      if (seen.has(currentValue)) return '[Circular]';
      seen.add(currentValue);
      if (!Array.isArray(currentValue)) {
        const record = currentValue as Record<string, unknown>;
        const sorted: Record<string, unknown> = {};

        for (const key of Object.keys(record).sort()) {
          sorted[key] = record[key];
        }

        return sorted;
      }
    }
    return currentValue;
  });
}

// Fast FNV-1a 32-bit hash for small/medium strings
export function fnv1a32(str: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// Robust stable hash with circular reference handling
export function stableHash(value: unknown): string {
  try {
    return fnv1a32(stableSerialize(value));
  } catch {
    return fnv1a32(String(value));
  }
}

// NaN-safe equality using Object.is
// Object.is(NaN, NaN) === true, while NaN === NaN === false
export const eq = Object.is;
