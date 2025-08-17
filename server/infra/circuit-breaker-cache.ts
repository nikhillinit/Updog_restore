// server/infra/circuit-breaker-cache.ts
// Circuit breaker pattern for cache resilience

import { CacheStore, BaseCacheStore } from './cache-store';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
}

export interface CircuitState {
  state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  failures: number;
  lastFailureTime: number;
  successCount: number;
  requestCount: number;
}

export class CircuitBreakerCache extends BaseCacheStore {
  private failures = 0;
  private successCount = 0;
  private requestCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private halfOpenRequests = 0;
  private readonly maxHalfOpenRequests = 3;

  constructor(
    private backingStore: CacheStore,
    private fallbackStore: CacheStore,
    private options: CircuitBreakerOptions = {
      failureThreshold: 5,
      resetTimeout: 60000, // 1 minute
      monitoringPeriod: 10000, // 10 seconds
    }
  ) {
    super();
  }

  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    this.requestCount++;

    // Check if circuit should transition from OPEN to HALF_OPEN
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.options.resetTimeout) {
        this.state = 'HALF_OPEN';
        this.halfOpenRequests = 0;
        console.log('[CircuitBreaker] Transitioning to HALF_OPEN');
      } else {
        // Circuit is OPEN, use fallback
        return fallback();
      }
    }

    // Limit concurrent probes in HALF_OPEN
    const wasHalfOpen = this.state === 'HALF_OPEN';
    if (wasHalfOpen) {
      if (this.halfOpenRequests >= this.maxHalfOpenRequests) {
        return fallback();
      }
      this.halfOpenRequests++;
    }

    try {
      const result = await operation();
      
      // Record success
      this.successCount++;
      
      if (this.state === 'HALF_OPEN') {
        // First successful probe closes the circuit
        this.state = 'CLOSED';
        this.failures = 0;
        console.log('[CircuitBreaker] Circuit restored to CLOSED');
      } else if (this.state === 'CLOSED') {
        // In CLOSED, success resets consecutive failures
        this.failures = 0;
      }
      
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailureTime = Date.now();
      this.recordError();

      // Check if we should open the circuit
      if (this.failures >= this.options.failureThreshold) {
        const currentState = this.state as 'CLOSED' | 'HALF_OPEN' | 'OPEN';
        switch (currentState) {
          case 'CLOSED':
          case 'HALF_OPEN':
            this.state = 'OPEN';
            console.error('[CircuitBreaker] Circuit OPENED due to failures:', this.failures);
            break;
          case 'OPEN':
            // Already open, do nothing
            break;
        }
      }

      return fallback();
    } finally {
      if (wasHalfOpen) this.halfOpenRequests--;
    }
  }

  async get<T>(key: string): Promise<T | undefined> {
    return this.executeWithCircuitBreaker(
      () => this.backingStore.get<T>(key),
      () => this.fallbackStore.get<T>(key)
    );
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    return this.executeWithCircuitBreaker(
      () => this.backingStore.set(key, value, ttlSec),
      () => this.fallbackStore.set(key, value, ttlSec)
    );
  }

  async del(key: string): Promise<void> {
    return this.executeWithCircuitBreaker(
      () => this.backingStore.del(key),
      () => this.fallbackStore.del(key)
    );
  }

  async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    return this.executeWithCircuitBreaker(
      () => this.backingStore.mget<T>(keys),
      () => this.fallbackStore.mget<T>(keys)
    );
  }

  async mset<T>(entries: Array<[string, T, number?]>): Promise<void> {
    return this.executeWithCircuitBreaker(
      () => this.backingStore.mset(entries),
      () => this.fallbackStore.mset(entries)
    );
  }

  async ping(): Promise<boolean> {
    try {
      const backingPing = await this.backingStore.ping?.() ?? false;
      if (backingPing) {
        // Backing store is healthy, consider transitioning if circuit is open
        if (this.state === 'OPEN') {
          this.state = 'HALF_OPEN';
        }
      }
      return backingPing;
    } catch {
      return false;
    }
  }

  getCircuitState(): CircuitState {
    const successRate = this.requestCount > 0 
      ? this.successCount / this.requestCount 
      : 0;

    return {
      state: this.state,
      failures: this.failures,
      lastFailureTime: this.lastFailureTime,
      successCount: this.successCount,
      requestCount: this.requestCount,
    };
  }

  resetCircuit(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successCount = 0;
    this.requestCount = 0;
    this.halfOpenRequests = 0;
    console.log('[CircuitBreaker] Circuit manually reset');
  }
}