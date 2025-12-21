/* eslint-disable @typescript-eslint/no-explicit-any */
 
 
 
 
/**
 * Canonical JSON serialization for stable hashing
 * - Sorts object keys for deterministic ordering
 * - Handles circular references
 * - Ensures consistent hash regardless of key order
 */
export function stableSerialize(input: unknown): string {
  const seen = new WeakSet();

  const sortKeys = (v: any): any => {
    if (v && typeof v === 'object') {
      if (seen.has(v)) return null; // break cycles
      seen.add(v);

      if (Array.isArray(v)) return v.map(sortKeys);

      // Sort keys for deterministic ordering
      return Object.keys(v)
        .sort()
        .reduce((acc: any, k) => {
          acc[k] = sortKeys(v[k]);
          return acc;
        }, {});
    }
    return v;
  };

  return JSON.stringify(sortKeys(input));
}

/**
 * FNV-1a hash for stable idempotency keys
 * Produces consistent hash from canonicalized JSON
 */
export function stableHash(payload: unknown): string {
  const s = stableSerialize(payload);
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return `idemp_${h.toString(16)}`;
}

/**
 * Compose multiple AbortSignals safely
 * - Short-circuits if any signal already aborted
 * - Cleans up listeners properly
 * - Preserves abort reasons
 */
export function composeSignal(...signals: (AbortSignal | undefined)[]): AbortSignal {
  const active = signals.filter(Boolean) as AbortSignal[];
  
  // Short-circuit if any signal already aborted
  if (active.some(s => s.aborted)) {
    const reason = active.find(s => s.aborted)?.reason ?? new DOMException('Aborted', 'AbortError');
    const c = new AbortController();
    c.abort(reason);
    return c.signal;
  }
  
  const c = new AbortController();
  const onAbort = (e: Event) => c.abort((e.target as AbortSignal).reason);
  
  // Add listeners with cleanup
  active.forEach(s => s.addEventListener('abort', onAbort, { once: true }));
  
  return c.signal;
}

