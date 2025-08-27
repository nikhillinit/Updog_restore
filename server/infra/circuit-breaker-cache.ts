import type { Cache } from './cache';

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

// Factory function to create cache with optional Upstash support
export async function createBreakerCache(
  fallbackStore: Cache,
  config?: Partial<CircuitBreakerConfig>
): Promise<CircuitBreakerCache> {
  let backingStore: Cache = fallbackStore;
  
  // Check for Upstash configuration
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    try {
      // Lazy import Upstash if available
      const { Redis } = await import('@upstash/redis').catch(() => ({ Redis: null }));
      
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
  });
}

export class CircuitBreakerCache implements Cache {
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = Date.now();
  private halfOpenRequests = 0;
  private maxHalfOpenRequests = 1;
  
  constructor(
    private backingStore: Cache,
    private fallbackStore: Cache,
    private config: CircuitBreakerConfig = {
      failureThreshold: 10,
      resetTimeout: 60000,
      monitoringPeriod: 300000
    }
  ) {}
  
  async get<T>(key: string): Promise<T | undefined> {
    if (this.shouldUseBackingStore()) {
      try {
        const result = await this.executeWithCircuitBreaker(() => this.backingStore.get<T>(key));
        return result;
      } catch (error) {
        // Fall back to fallback store
        try {
          return await this.fallbackStore.get<T>(key);
        } catch {
          return undefined;
        }
      }
    } else {
      // Circuit is open, use fallback
      try {
        return await this.fallbackStore.get<T>(key);
      } catch {
        return undefined;
      }
    }
  }
  
  async set<T>(key: string, value: T, options?: { ttl?: number }): Promise<void> {
    if (this.shouldUseBackingStore()) {
      try {
        await this.executeWithCircuitBreaker(() => this.backingStore.set(key, value, options?.ttl));
        // Also update fallback for consistency
        await this.fallbackStore.set(key, value, options?.ttl).catch(() => {});
      } catch (error) {
        // Fall back to fallback store only
        await this.fallbackStore.set(key, value, options?.ttl);
      }
    } else {
      // Circuit is open, use fallback only
      await this.fallbackStore.set(key, value, options?.ttl);
    }
  }
  
  async delete(key: string): Promise<boolean> {
    let deleted = false;
    
    if (this.shouldUseBackingStore()) {
      try {
        deleted = await this.executeWithCircuitBreaker(() => this.backingStore.delete(key));
      } catch {
        // Continue to fallback
      }
    }
    
    // Always try to delete from fallback too
    try {
      const fallbackDeleted = await this.fallbackStore.delete(key);
      deleted = deleted || fallbackDeleted;
    } catch {
      // Ignore fallback errors
    }
    
    return deleted;
  }
  
  async keys(): Promise<string[]> {
    if (this.shouldUseBackingStore()) {
      try {
        return await this.executeWithCircuitBreaker(() => this.backingStore.keys());
      } catch {
        // Fall back to fallback store
        try {
          return await this.fallbackStore.keys();
        } catch {
          return [];
        }
      }
    } else {
      try {
        return await this.fallbackStore.keys();
      } catch {
        return [];
      }
    }
  }
  
  async clear(): Promise<void> {
    // Clear both stores regardless of circuit state
    const promises = [];
    
    if (this.shouldUseBackingStore()) {
      try {
        promises.push(this.executeWithCircuitBreaker(() => this.backingStore.clear()));
      } catch {
        // Ignore errors during clear
      }
    }
    
    promises.push(this.fallbackStore.clear().catch(() => {}));
    
    await Promise.all(promises);
  }
  
  private shouldUseBackingStore(): boolean {
    const now = Date.now();
    
    switch (this.state) {
      case 'closed':
        return true;
        
      case 'open':
        // Check if reset timeout has elapsed
        if (now - this.lastFailureTime > this.config.resetTimeout) {
          this.state = 'half-open';
          this.halfOpenRequests = 0;
          return true;
        }
        return false;
        
      case 'half-open':
        // Limit concurrent requests in half-open state
        return this.halfOpenRequests < this.maxHalfOpenRequests;
        
      default:
        return true;
    }
  }
  
  private async executeWithCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'half-open') {
      this.halfOpenRequests++;
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.state === 'half-open') {
        this.halfOpenRequests--;
      }
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === 'half-open') {
      // After successful requests in half-open, transition back to closed
      this.state = 'closed';
      this.successes = 0;
    }
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }
  
  // Metrics and state methods for monitoring
  getState(): {
    state: string;
    failures: number;
    successes: number;
    requestCount: number;
    successCount: number;
    isHealthy: boolean;
    uptime: number;
  } {
    const now = Date.now();
    
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
    this.halfOpenRequests = 0;
  }
}