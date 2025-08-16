/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
// Deterministic in-flight tracker with de-dup and optional delayed cleanup.
export type InflightEntry<T> = {
  promise: Promise<T>;
  startedAt: number;
  abort?: AbortController;
};

const inflight = new Map<string, InflightEntry<any>>();
const CAPACITY_MAX = Number(import.meta.env?.VITE_IDEMPOTENCY_MAX || 200);

export function isInFlight(key: string) {
  return inflight.has(key);
}

export function cancelInFlight(key: string) {
  const e = inflight.get(key);
  e?.abort?.abort();
  return inflight.delete(key);
}

export function inFlightSize() {
  return inflight.size;
}

/**
 * Start (or join) an in-flight operation.
 * - Registers synchronously (before any await)
 * - Returns existing promise if already in flight
 * - Cleans up in finally; can delay deletion with holdForMs for test observability
 */
export function startInFlight<T>(
  key: string,
  worker: (ctx: { signal: AbortSignal }) => Promise<T>,
  opts: { holdForMs?: number } = {}
): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing.promise;

  // Check capacity before starting
  if (inflight.size >= CAPACITY_MAX) {
    const err = new Error('Too many concurrent requests; please retry shortly.');
    (err as any).code = 'CAPACITY_EXCEEDED';
    throw err;
  }

  const controller = typeof AbortController !== 'undefined' ? new AbortController() : ({} as any);
  
  // Create the promise first so we can register synchronously.
  const p = (async () => {
    try {
      return await worker({ signal: (controller as AbortController).signal });
    } finally {
      const hold = Math.max(0, opts.holdForMs ?? 0);
      if (hold > 0) setTimeout(() => inflight.delete(key), hold);
      else queueMicrotask(() => inflight.delete(key));
    }
  })();

  inflight.set(key, { promise: p, startedAt: Date.now(), abort: controller });
  return p;
}
