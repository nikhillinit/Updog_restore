import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CircuitBreakerCache } from '../../server/infra/circuit-breaker-cache';
import type { Cache } from '../../server/infra/cache';

// Mock cache implementation for testing
class MockCache implements Cache {
  private data = new Map<string, any>();
  private shouldFail = false;
  private failureCount = 0;

  setFailureMode(fail: boolean) {
    this.shouldFail = fail;
    this.failureCount = 0;
  }

  async get<T>(key: string): Promise<T | undefined> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(`Mock failure ${this.failureCount}`);
    }
    return this.data.get(key);
  }

  async set<T>(key: string, value: T, ttlSec?: number): Promise<void> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(`Mock failure ${this.failureCount}`);
    }
    this.data.set(key, value);
  }

  async has(key: string): Promise<boolean> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(`Mock failure ${this.failureCount}`);
    }
    return this.data.has(key);
  }

  async delete(key: string): Promise<boolean> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(`Mock failure ${this.failureCount}`);
    }
    return this.data.delete(key);
  }

  async ping(): Promise<boolean> {
    if (this.shouldFail) {
      return false;
    }
    return true;
  }

  async keys(): Promise<string[]> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(`Mock failure ${this.failureCount}`);
    }
    return Array.from(this.data.keys());
  }

  async clear(): Promise<void> {
    if (this.shouldFail) {
      this.failureCount++;
      throw new Error(`Mock failure ${this.failureCount}`);
    }
    this.data.clear();
  }
}

describe('CircuitBreakerCache', () => {
  let mockBackingStore: MockCache;
  let mockFallbackStore: MockCache;
  let circuitBreaker: CircuitBreakerCache;

  beforeEach(() => {
    vi.useFakeTimers();
    mockBackingStore = new MockCache();
    mockFallbackStore = new MockCache();
    circuitBreaker = new CircuitBreakerCache(
      mockBackingStore,
      mockFallbackStore,
      {
        failureThreshold: 3,
        resetTimeout: 1000,
        monitoringPeriod: 5000
      }
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should forward get requests to backing store when healthy', async () => {
      await mockBackingStore.set('test', 'value');
      const result = await circuitBreaker.get<string>('test');
      expect(result).toBe('value');
    });

    it('should forward set requests to backing store when healthy', async () => {
      await circuitBreaker.set('test', 'value');
      const result = await mockBackingStore.get<string>('test');
      expect(result).toBe('value');
    });
  });

  describe('circuit breaker behavior', () => {
    it('should open circuit after threshold failures', async () => {
      mockBackingStore.setFailureMode(true);
      await mockFallbackStore.set('fallback', 'fallback-value');

      // First 3 failures should trigger circuit opening
      await circuitBreaker.get('test1');
      await circuitBreaker.get('test2');
      await circuitBreaker.get('test3');

      const state = circuitBreaker.getCircuitState();
      expect(state.state).toBe('open');
      expect(state.failures).toBe(3);
    });

    it('should use fallback when circuit is open', async () => {
      mockBackingStore.setFailureMode(true);
      await mockFallbackStore.set('test', 'fallback-value');

      // Trigger circuit opening
      await circuitBreaker.get('test');
      await circuitBreaker.get('test');
      await circuitBreaker.get('test');

      // Next request should use fallback
      const result = await circuitBreaker.get<string>('test');
      expect(result).toBe('fallback-value');
    });

    it('should transition to half-open after reset timeout', async () => {
      mockBackingStore.setFailureMode(true);
      await mockFallbackStore.set('test', 'fallback-value');

      // Open the circuit
      await circuitBreaker.get('test');
      await circuitBreaker.get('test');
      await circuitBreaker.get('test');

      expect(circuitBreaker.getCircuitState().state).toBe('open');

      // Fast-forward time
      vi.advanceTimersByTime(1100);

      // Fix the backing store and set value directly
      mockBackingStore.setFailureMode(false);
      await mockBackingStore.set('test', 'recovered-value');

      // Next request should transition to half-open and succeed
      const result = await circuitBreaker.get<string>('test');
      expect(result).toBe('recovered-value');
      expect(circuitBreaker.getCircuitState().state).toBe('closed');
    });

    it('should reset failure count on success in closed state', async () => {
      mockBackingStore.setFailureMode(true);

      // Two failures
      await circuitBreaker.get('test1');
      await circuitBreaker.get('test2');

      expect(circuitBreaker.getCircuitState().failures).toBe(2);

      // Success should reset failure count
      mockBackingStore.setFailureMode(false);
      await circuitBreaker.get('test3');

      expect(circuitBreaker.getCircuitState().failures).toBe(0);
    });

    it('should limit concurrent half-open requests', async () => {
      mockBackingStore.setFailureMode(true);
      await mockFallbackStore.set('test', 'fallback-value');

      // Open the circuit
      await circuitBreaker.get('test');
      await circuitBreaker.get('test');
      await circuitBreaker.get('test');

      // Fast-forward time to enable half-open
      vi.advanceTimersByTime(1100);

      // Fix backing store but make it slow
      mockBackingStore.setFailureMode(false);
      let resolvePromise: ((value: any) => void) | null = null;
      const slowPromise = new Promise(resolve => {
        resolvePromise = resolve;
      });

      vi.spyOn(mockBackingStore, 'get').mockImplementation(async () => {
        await slowPromise;
        return 'slow-value';
      });

      // Start multiple concurrent requests
      const promises = [
        circuitBreaker.get('test'),
        circuitBreaker.get('test'),
        circuitBreaker.get('test'),
        circuitBreaker.get('test')
      ];

      // The first request should be in-flight, others should use fallback
      await vi.advanceTimersByTimeAsync(10);

      // Resolve the slow operation
      if (resolvePromise) {
        resolvePromise('slow-value');
      }

      const results = await Promise.all(promises);

      // First request should succeed, others should use fallback
      expect(results[0]).toBe('slow-value');
      expect(results.slice(1).every(r => r === 'fallback-value')).toBe(true);
    }, 15000);
  });

  describe('metrics and state', () => {
    it('should track request counts', async () => {
      await circuitBreaker.get('test1');
      await circuitBreaker.get('test2');
      await circuitBreaker.set('test3', 'value');

      const state = circuitBreaker.getCircuitState();
      expect(state.requestCount).toBe(3);
      expect(state.successCount).toBe(3);
    });

    it('should track error metrics', async () => {
      mockBackingStore.setFailureMode(true);

      await circuitBreaker.get('test1');
      await circuitBreaker.get('test2');

      const state = circuitBreaker.getCircuitState();
      expect(state.failures).toBe(2);
      expect(state.requestCount).toBe(2);
      expect(state.successCount).toBe(0);
    });
  });
});