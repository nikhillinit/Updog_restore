interface Cache<T = string> {
  get<K = T>(key: string): Promise<K | null>;
  set<K = T>(key: string, value: K, ttl?: number): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(pattern?: string): Promise<string[]>;
  clear(): Promise<void>;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;       // e.g., 3
  resetTimeout: number;           // ms until OPEN => HALF-OPEN (e.g., 1000)
  monitoringPeriod: number;
  successThreshold?: number;      // successes required in HALF-OPEN to close (default 1)
  halfOpenMaxConcurrent?: number; // concurrent probes allowed in HALF-OPEN (default 1)
}

// Factory function to create cache with optional Upstash support
export async function createBreakerCache(
  fallbackStore: Cache,
  config?: Partial<CircuitBreakerConfig>
): Promise<CircuitBreakerCache> {
  let backingStore: Cache = fallbackStore;
  
  // Check for Upstash configuration (skip in test environment)
  if (process.env['NODE_ENV'] !== 'test' && 
      process.env['UPSTASH_REDIS_REST_URL'] && 
      process.env['UPSTASH_REDIS_REST_TOKEN']) {
    try {
      // Lazy import Upstash if available
      const { Redis } = await import('@upstash/redis');
      
      if (Redis) {
        const redis = new Redis({
          url: process.env['UPSTASH_REDIS_REST_URL'],
          token: process.env['UPSTASH_REDIS_REST_TOKEN'],
        });
        
        // Create Upstash-backed cache
        backingStore = {
          async get<T>(key: string): Promise<T | undefined> {
            const raw = await redis['get'](`cb:${key}`);
            return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw as T) : undefined;
          },
          async set<T>(key: string, value: T, ttl?: number): Promise<void> {
            const ttlSeconds = ttl ? Math.ceil(ttl / 1000) : 300; // Default 5 min
            await redis['set'](`cb:${key}`, JSON.stringify(value), { ex: ttlSeconds });
          },
          async delete(key: string): Promise<boolean> {
            const result = await redis['del'](`cb:${key}`);
            return result > 0;
          },
          async keys(): Promise<string[]> {
            // Upstash doesn't have a keys method, return empty for now
            // This would require using scan or maintaining a separate index
            return [];
          },
          async clear(): Promise<void> {
            // Upstash doesn't have a simple clear for pattern
            // Would need to implement with scan or maintain index
            return;
          }
        };
        
        console.log('Circuit breaker using Upstash Redis cache');
      }
    } catch (error) {
      console.warn('Failed to initialize Upstash cache, falling back to memory:', error);
    }
  }
  
  return new CircuitBreakerCache(backingStore, fallbackStore, {
    failureThreshold: 10,
    resetTimeout: 60000,
    monitoringPeriod: 300000,
    ...config
  }, Date.now);
}

export class CircuitBreakerCache implements Cache {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime: number;
  private halfOpenInFlight = 0;
  private openedAt = 0;
  
  constructor(
    private backingStore: Cache,
    private fallbackStore: Cache,
    private config: CircuitBreakerConfig = {
      failureThreshold: 10,
      resetTimeout: 60000,
      monitoringPeriod: 300000
    },
    private getCurrentTime: () => number = Date.now
  ) {
    this.lastSuccessTime = this.getCurrentTime();
  }

  private get maxHalfOpen(): number {
    return this.config['halfOpenMaxConcurrent'] ?? 1;
  }
  private get halfOpenSuccessTarget(): number {
    return this.config['successThreshold'] ?? 1;
  }

  private toOpen(now: number) {
    this.state = 'open';
    this.openedAt = now;
    this.halfOpenInFlight = 0;
    this.lastFailureTime = now;
  }

  private toHalfOpen() {
    this.state = 'half-open';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenInFlight = 0;
  }
  
  async get<T>(key: string): Promise<T | undefined> {
    const now = this.getCurrentTime();

    // If OPEN, see if the window has elapsed; if yes, move to HALF-OPEN before any early return.
    if (this.state === 'open') {
      if (now - this.openedAt >= this.config['resetTimeout']) {
        this.toHalfOpen();
      }
    }

    // HALF-OPEN: allow exactly `maxHalfOpen` probes to the primary; others get fallback.
    if (this.state === 'half-open') {
      if (this.halfOpenInFlight >= this.maxHalfOpen) {
        return this.fallbackStore.get<T>(key);
      }
      this.halfOpenInFlight++;
      try {
        const v = await this.backingStore.get<T>(key);
        // Treat undefined as a valid value; success means "primary responded without throwing"
        this.successes++;
        this.lastSuccessTime = now;
        if (this.successes >= this.halfOpenSuccessTarget) {
          // Primary looks healthy again
          this.state = 'closed';
          this.failures = 0;
          this.successes = 0;
        }
        return v;
      } catch (error) {
        // Probe failed -> go back to OPEN and serve fallback
        this.failures++;
        this.toOpen(now);
        console.debug('[circuit-breaker-cache] Half-open probe failed, returning to OPEN state:', error instanceof Error ? error.message : String(error));
        return this.fallbackStore.get<T>(key);
      } finally {
        this.halfOpenInFlight = Math.max(0, this.halfOpenInFlight - 1);
      }
    }

    // Still OPEN and within the window? Serve fallback (no probing here).
    if (this.state === 'open') {
      return this.fallbackStore.get<T>(key);
    }

    // CLOSED: primary first, fallback on error
    try {
      const v = await this.backingStore.get<T>(key);
      this.failures = 0;
      this.successes++;
      this.lastSuccessTime = now;
      return v;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = now;
      if (this.failures >= this.config['failureThreshold']) {
        console.warn('[circuit-breaker-cache] Failure threshold reached, opening circuit:', error instanceof Error ? error.message : String(error));
        this.toOpen(now);
      }
      return this.fallbackStore.get<T>(key);
    }
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Always try to write to both stores to maintain consistency
    const promises = [];

    if (this.state === 'closed') {
      promises.push(this.backingStore['set'](key, value, ttl).catch((err) => {
        console.debug('[circuit-breaker-cache] Primary store set failed (non-blocking):', err instanceof Error ? err.message : String(err));
      }));
    }
    promises.push(this.fallbackStore['set'](key, value, ttl).catch((err) => {
      console.debug('[circuit-breaker-cache] Fallback store set failed (non-blocking):', err instanceof Error ? err.message : String(err));
    }));

    await Promise.all(promises);
  }
  
  async delete(key: string): Promise<boolean> {
    let deleted = false;

    // Try both stores
    if (this.state === 'closed') {
      try {
        deleted = await this.backingStore['delete'](key);
      } catch (error) {
        // Continue to fallback, log for observability
        console.debug('[circuit-breaker-cache] Primary store delete failed, trying fallback:', error instanceof Error ? error.message : String(error));
      }
    }

    try {
      const fallbackDeleted = await this.fallbackStore['delete'](key);
      deleted = deleted || fallbackDeleted;
    } catch (error) {
      // Fallback delete failed - log but don't fail
      console.debug('[circuit-breaker-cache] Fallback store delete failed:', error instanceof Error ? error.message : String(error));
    }

    return deleted;
  }
  
  async keys(): Promise<string[]> {
    if (this.state === 'closed') {
      try {
        return await this.backingStore['keys']();
      } catch (error) {
        // Fall back to fallback store
        console.debug('[circuit-breaker-cache] Primary store keys() failed, trying fallback:', error instanceof Error ? error.message : String(error));
      }
    }

    try {
      return await this.fallbackStore['keys']();
    } catch (error) {
      // Both stores failed - log and return empty
      console.warn('[circuit-breaker-cache] All stores failed for keys():', error instanceof Error ? error.message : String(error));
      return [];
    }
  }
  
  async clear(): Promise<void> {
    // Clear both stores regardless of circuit state
    const promises = [];

    promises.push(this.backingStore.clear().catch((err) => {
      console.debug('[circuit-breaker-cache] Primary store clear failed (non-blocking):', err instanceof Error ? err.message : String(err));
    }));
    promises.push(this.fallbackStore.clear().catch((err) => {
      console.debug('[circuit-breaker-cache] Fallback store clear failed (non-blocking):', err instanceof Error ? err.message : String(err));
    }));

    await Promise.all(promises);
  }
  
  getState(): {
    state: string;
    failures: number;
    successes: number;
    requestCount: number;
    successCount: number;
    isHealthy: boolean;
    uptime: number;
  } {
    const now = this.getCurrentTime();
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requestCount: this.failures + this.successes,
      successCount: this.successes,
      isHealthy: this.state !== 'open',
      uptime: this.lastSuccessTime > 0 ? now - this.lastSuccessTime : 0
    };
  }
  
  // Alias for test compatibility
  getCircuitState() {
    return this.getState();
  }
  
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.halfOpenInFlight = 0;
  }
}