/**
 * Canonical JSON serialization for stable hashing
 * - Sorts object keys for deterministic ordering
 * - Handles circular references
 * - Ensures consistent hash regardless of key order
 */
function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAbortSignal(value: EventTarget | null): value is AbortSignal {
  return value instanceof AbortSignal;
}

function getAbortReason(signal: AbortSignal): unknown {
  return signal.reason as unknown;
}

export function stableSerialize(input: unknown): string {
  const seen = new WeakSet<Record<string, unknown>>();

  const sortKeys = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(sortKeys);
    }

    if (isObjectRecord(value)) {
      if (seen.has(value)) return null; // break cycles
      seen.add(value);

      // Sort keys for deterministic ordering
      return Object.keys(value)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = sortKeys(value[key]);
          return acc;
        }, {});
    }

    return value;
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
  const active = signals.filter((signal): signal is AbortSignal => signal !== undefined);
  
  // Short-circuit if any signal already aborted
  if (active.some((signal) => signal.aborted)) {
    const reason =
      active.find((signal) => signal.aborted)
        ? getAbortReason(active.find((signal) => signal.aborted) as AbortSignal)
        : new DOMException('Aborted', 'AbortError');
    const c = new AbortController();
    c.abort(reason);
    return c.signal;
  }
  
  const c = new AbortController();
  const onAbort = (event: Event) => {
    c.abort(
      isAbortSignal(event.target)
        ? event.target.reason
        : new DOMException('Aborted', 'AbortError')
    );
  };
  
  // Add listeners with cleanup
  active.forEach((signal) => signal.addEventListener('abort', onAbort, { once: true }));
  
  return c.signal;
}
