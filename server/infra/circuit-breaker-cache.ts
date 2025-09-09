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
  if (process.env.NODE_ENV !== 'test' && 
      process.env.UPSTASH_REDIS_REST_URL && 
      process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      // Lazy import Upstash if available
      const { Redis } = await import('@upstash/redis');
      
      if (Redis) {
        const redis = new Redis({
          url: process.env.UPSTASH_REDIS_REST_URL,
          token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
        
        // Create Upstash-backed cache
        backingStore = {
          async get<T>(key: string): Promise<T | undefined> {
            const raw = await redis.get(`cb:${key}`);
            return raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw as T) : undefined;
          },
          async set<T>(key: string, value: T, ttl?: number): Promise<void> {
            const ttlSeconds = ttl ? Math.ceil(ttl / 1000) : 300; // Default 5 min
            await redis.set(`cb:${key}`, JSON.stringify(value), { ex: ttlSeconds });
          },
          async delete(key: string): Promise<boolean> {
            const result = await redis.del(`cb:${key}`);
            return result > 0;
          },
          async keys(): Promise<string[]> {
            const keys = await redis.keys('cb:*');
            return keys.map(k => k.replace('cb:', ''));
          },
          async clear(): Promise<void> {
            const keys = await redis.keys('cb:*');
            if (keys.length > 0) {
              await redis.del(...keys);
            }
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
    return this.config.halfOpenMaxConcurrent ?? 1;
  }
  private get halfOpenSuccessTarget(): number {
    return this.config.successThreshold ?? 1;
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
      if (now - this.openedAt >= this.config.resetTimeout) {
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
      } catch {
        // Probe failed -> go back to OPEN and serve fallback
        this.failures++;
        this.toOpen(now);
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
    } catch {
      this.failures++;
      this.lastFailureTime = now;
      if (this.failures >= this.config.failureThreshold) this.toOpen(now);
      return this.fallbackStore.get<T>(key);
    }
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    // Always try to write to both stores to maintain consistency
    const promises = [];
    
    if (this.state === 'closed') {
      promises.push(this.backingStore.set(key, value, ttl).catch(() => {}));
    }
    promises.push(this.fallbackStore.set(key, value, ttl).catch(() => {}));
    
    await Promise.all(promises);
  }
  
  async delete(key: string): Promise<boolean> {
    let deleted = false;
    
    // Try both stores
    if (this.state === 'closed') {
      try {
        deleted = await this.backingStore.delete(key);
      } catch {
        // Continue to fallback
      }
    }
    
    try {
      const fallbackDeleted = await this.fallbackStore.delete(key);
      deleted = deleted || fallbackDeleted;
    } catch {
      // Ignore fallback errors
    }
    
    return deleted;
  }
  
  async keys(): Promise<string[]> {
    if (this.state === 'closed') {
      try {
        return await this.backingStore.keys();
      } catch {
        // Fall back to fallback store
      }
    }
    
    try {
      return await this.fallbackStore.keys();
    } catch {
      return [];
    }
  }
  
  async clear(): Promise<void> {
    // Clear both stores regardless of circuit state
    const promises = [];
    
    promises.push(this.backingStore.clear().catch(() => {}));
    promises.push(this.fallbackStore.clear().catch(() => {}));
    
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