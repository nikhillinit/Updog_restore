import { TypedCircuitBreaker, type BreakerLike } from './typed-breaker';
import { envCircuit } from '../../../shared/config/env.circuit';
import type { Cache } from '../../cache/index';
import { BoundedMemoryCache } from '../../cache/memory';

/**
 * Circuit breaker wrapper for cache operations
 * Protects against Redis failures and provides memory fallback
 */
export class CacheBreakerService implements BreakerLike {
  private breaker: TypedCircuitBreaker<string | null>;
  private fallbackCache: Cache;
  
  constructor(private primaryCache: Cache) {
    this.fallbackCache = new BoundedMemoryCache();
    
    this.breaker = new TypedCircuitBreaker({
      failureThreshold: envCircuit.CB_CACHE_FAILURE_THRESHOLD,
      resetTimeout: envCircuit.CB_CACHE_RESET_TIMEOUT_MS,
      operationTimeout: envCircuit.CB_CACHE_OP_TIMEOUT_MS,
      successesToClose: envCircuit.CB_CACHE_SUCCESS_TO_CLOSE,
      maxHalfOpenRequests: envCircuit.CB_CACHE_HALF_OPEN_MAX_CONC,
      halfOpenRateLimit: { capacity: 5, refillPerSecond: 1 }
    });
  }

  async run<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    return this.breaker.run(operation, fallback || (async () => { throw new Error('No fallback provided'); }));
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.breaker.run(
        // Primary operation
        () => this.primaryCache['get'](key),
        // Fallback operation
        () => this.fallbackCache['get'](key)
      );
    } catch (error) {
      console.warn(`[cache-breaker] Failed to get key ${key}:`, error);
      // Last resort: return null if everything fails
      return null;
    }
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    try {
      await this.breaker.run(
        () => this.primaryCache['set'](key, value, ttlSeconds),
        // Fallback: always store in memory cache for reads
        () => this.fallbackCache['set'](key, value, ttlSeconds)
      );
    } catch (error) {
      console.warn(`[cache-breaker] Failed to set key ${key}:`, error);
      // Always try to store in fallback for future reads
      await this.fallbackCache['set'](key, value, ttlSeconds);
    }
  }

  async del(key: string): Promise<void> {
    try {
      await this.breaker.run(
        () => this.primaryCache['del'](key),
        () => this.fallbackCache['del'](key)
      );
    } catch (error) {
      console.warn(`[cache-breaker] Failed to delete key ${key}:`, error);
      // Ensure it's deleted from fallback at least
      await this.fallbackCache['del'](key);
    }
  }

  async close(): Promise<void> {
    await Promise.all([
      this.primaryCache.close(),
      this.fallbackCache.close()
    ]);
  }

  getState() {
    return this.breaker.getState();
  }

  getMetrics() {
    return this.breaker.getMetrics();
  }
}