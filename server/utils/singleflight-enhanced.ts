// server/utils/singleflight-enhanced.ts
// Production-grade single-flight with metrics and retry

export interface SingleFlightEntry<T> {
  promise: Promise<T>;
  startedAt: number;
  abort?: AbortController;
  attempts: number;
  lastError?: Error;
}

export interface SingleFlightOptions {
  capacity?: number;
  holdForMs?: number;
  defaultTimeout?: number;
  maxRetries?: number;
  onEvict?: (key: string, reason: 'capacity' | 'timeout' | 'error') => void;
}

export interface SingleFlightStats {
  size: number;
  totalRequests: number;
  dedupedRequests: number;
  errors: number;
  evictions: number;
  avgDuration: number;
}

export function createEnhancedSingleFlight(opts: SingleFlightOptions = {}) {
  const {
    capacity = 200,
    holdForMs = 0,
    defaultTimeout = 30000,
    maxRetries = 0,
    onEvict,
  } = opts;

  const inflight = new Map<string, SingleFlightEntry<any>>();
  const durations: number[] = [];
  const stats: SingleFlightStats = {
    size: 0,
    totalRequests: 0,
    dedupedRequests: 0,
    errors: 0,
    evictions: 0,
    avgDuration: 0,
  };

  // Cleanup expired entries periodically
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of inflight.entries()) {
      if (now - entry.startedAt > defaultTimeout) {
        entry.abort?.abort();
        inflight.delete(key);
        stats.evictions++;
        onEvict?.(key, 'timeout');
      }
    }
  }, 5000);

  function size(): number { 
    return inflight.size; 
  }
  
  function has(key: string): boolean { 
    return inflight.has(key); 
  }
  
  function getStats(): SingleFlightStats { 
    return { 
      ...stats,
      avgDuration: durations.length > 0 
        ? durations.reduce((a, b) => a + b, 0) / durations.length 
        : 0
    }; 
  }

  function cancel(key: string): boolean {
    const entry = inflight.get(key);
    if (entry) {
      entry.abort?.abort();
      inflight.delete(key);
      return true;
    }
    return false;
  }

  function execute<T>(
    key: string,
    worker: (signal: AbortSignal) => Promise<T>,
    options: { timeout?: number; retries?: number } = {}
  ): Promise<T> {
    stats.totalRequests++;

    const existing = inflight.get(key);
    if (existing) {
      stats.dedupedRequests++;
      return existing.promise;
    }

    // Capacity management with LRU eviction
    if (inflight.size >= capacity) {
      // Evict oldest entry
      const oldestKey = inflight.keys().next().value;
      if (oldestKey) {
        const entry = inflight.get(oldestKey)!;
        entry.abort?.abort();
        inflight.delete(oldestKey);
        stats.evictions++;
        onEvict?.(oldestKey, 'capacity');
      }
    }

    const controller = new AbortController();
    const timeout = options.timeout ?? defaultTimeout;
    const retries = options.retries ?? maxRetries;
    const startTime = Date.now();

    // Setup timeout
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    const executeWithRetries = async (attempts = 0): Promise<T> => {
      try {
        const result = await worker(controller.signal);
        
        // Record successful duration
        const duration = Date.now() - startTime;
        durations.push(duration);
        if (durations.length > 100) {
          durations.shift(); // Keep last 100 for moving average
        }
        
        return result;
      } catch (error) {
        if (attempts < retries && !controller.signal.aborted) {
          // Exponential backoff with jitter
          const backoffMs = Math.min(1000 * Math.pow(2, attempts), 5000);
          const jitter = Math.random() * 1000;
          await new Promise(resolve => setTimeout(resolve, backoffMs + jitter));
          return executeWithRetries(attempts + 1);
        }
        throw error;
      }
    };

    const promise = executeWithRetries()
      .finally(() => {
        clearTimeout(timeoutId);
        if (holdForMs > 0) {
          setTimeout(() => inflight.delete(key), holdForMs);
        } else {
          queueMicrotask(() => inflight.delete(key));
        }
      })
      .catch(error => {
        stats.errors++;
        const entry = inflight.get(key);
        if (entry) {
          entry.lastError = error;
        }
        throw error;
      });

    const entry: SingleFlightEntry<T> = {
      promise,
      startedAt: Date.now(),
      abort: controller,
      attempts: 0,
    };

    inflight.set(key, entry);
    stats.size = inflight.size;

    return promise;
  }

  function shutdown(): void {
    clearInterval(cleanupInterval);
    for (const entry of inflight.values()) {
      entry.abort?.abort();
    }
    inflight.clear();
  }

  function clear(): void {
    for (const entry of inflight.values()) {
      entry.abort?.abort();
    }
    inflight.clear();
    stats.size = 0;
  }

  return { 
    do: execute, 
    cancel, 
    has, 
    size, 
    getStats, 
    shutdown,
    clear
  };
}