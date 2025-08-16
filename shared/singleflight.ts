// shared/singleflight.ts
// Generic, framework-agnostic single-flight deduplication utility
// Based on Go's singleflight pattern: deduplicate concurrent calls per key

export type SingleFlightOptions = {
  capacity?: number;       // max concurrent in-flight keys (default: 200)
  holdForMs?: number;      // delay cleanup after settle to catch stragglers (default: 0)
};

type Entry<T> = {
  promise: Promise<T>;
  abort?: AbortController;
  startedAt: number;
};

export function createSingleFlight(opts: SingleFlightOptions = {}) {
  const capacity = opts.capacity ?? 200;
  const holdForMs = Math.max(0, opts.holdForMs ?? 0);
  const inflight = new Map<string, Entry<any>>();

  function size(): number {
    return inflight.size;
  }

  function has(key: string): boolean {
    return inflight.has(key);
  }

  function cancel(key: string): boolean {
    const entry = inflight.get(key);
    entry?.abort?.abort();
    return inflight.delete(key);
  }

  /**
   * Execute a function once per key, deduplicating concurrent calls.
   * Returns the same promise for all callers with the same key.
   */
  function execute<T>(
    key: string,
    worker: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    // Return existing promise if already in-flight
    const existing = inflight.get(key);
    if (existing) {
      return existing.promise as Promise<T>;
    }

    // Check capacity limit
    if (inflight.size >= capacity) {
      const err = new Error('Too many concurrent requests; please retry shortly.');
      (err as any).code = 'CAPACITY_EXCEEDED';
      throw err;
    }

    // Create abort controller if available
    const controller = typeof AbortController !== 'undefined' 
      ? new AbortController() 
      : undefined;

    // Create promise with cleanup in finally block
    const promise = (async (): Promise<T> => {
      try {
        return await worker(controller?.signal as AbortSignal);
      } finally {
        // Clean up after completion with optional hold time
        if (holdForMs > 0) {
          setTimeout(() => inflight.delete(key), holdForMs);
        } else {
          queueMicrotask(() => inflight.delete(key));
        }
      }
    })();

    // Register synchronously before any await
    inflight.set(key, {
      promise,
      startedAt: Date.now(),
      abort: controller
    });

    return promise;
  }

  // Return public API
  return {
    do: execute,  // Using 'do' to match Go convention
    cancel,
    has,
    size,
  };
}

// Default instance for convenience
export const defaultSingleFlight = createSingleFlight();