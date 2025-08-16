// tests/unit/singleflight.test.ts
// Test suite for singleflight deduplication pattern

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createSingleFlight } from '../../shared/singleflight';

describe('SingleFlight Pattern', () => {
  let sf: ReturnType<typeof createSingleFlight>;

  beforeEach(() => {
    sf = createSingleFlight({ capacity: 10, holdForMs: 0 });
  });

  it('should deduplicate concurrent calls with same key', async () => {
    let callCount = 0;
    const worker = vi.fn(async () => {
      callCount++;
      await new Promise(resolve => setTimeout(resolve, 10));
      return `result-${callCount}`;
    });

    // Start 5 concurrent calls with same key
    const promises = Array(5).fill(null).map(() => 
      sf.do('test-key', worker)
    );

    // All should return the same result
    const results = await Promise.all(promises);
    expect(worker).toHaveBeenCalledTimes(1);
    expect(results).toEqual(['result-1', 'result-1', 'result-1', 'result-1', 'result-1']);
    
    // All promises should be the same reference
    const firstPromise = promises[0];
    promises.forEach(p => expect(p).toBe(firstPromise));
  });

  it('should allow different keys to execute independently', async () => {
    let counter = 0;
    const worker = async () => {
      const value = ++counter;
      await new Promise(resolve => setTimeout(resolve, 10));
      return value;
    };

    // Start calls with different keys
    const [r1, r2, r3] = await Promise.all([
      sf.do('key-1', worker),
      sf.do('key-2', worker),
      sf.do('key-3', worker),
    ]);

    expect(r1).toBe(1);
    expect(r2).toBe(2);
    expect(r3).toBe(3);
  });

  it('should clean up after completion', async () => {
    const worker = async () => 'result';

    expect(sf.size()).toBe(0);
    
    const promise = sf.do('test-key', worker);
    expect(sf.has('test-key')).toBe(true);
    expect(sf.size()).toBe(1);

    await promise;
    
    // Should be cleaned up after microtask
    await new Promise(resolve => queueMicrotask(resolve));
    expect(sf.has('test-key')).toBe(false);
    expect(sf.size()).toBe(0);
  });

  it('should respect capacity limit', async () => {
    const sf = createSingleFlight({ capacity: 3 });
    const worker = () => new Promise(resolve => setTimeout(resolve, 100));

    // Fill up capacity
    sf.do('key-1', worker);
    sf.do('key-2', worker);
    sf.do('key-3', worker);

    // Next call should throw
    expect(() => sf.do('key-4', worker)).toThrow('Too many concurrent requests');
  });

  it('should support cancellation', async () => {
    const worker = vi.fn(async (signal: AbortSignal) => {
      return new Promise((resolve, reject) => {
        signal.addEventListener('abort', () => {
          reject(new DOMException('Aborted', 'AbortError'));
        });
        setTimeout(() => resolve('completed'), 100);
      });
    });

    const promise = sf.do('test-key', worker);
    
    // Cancel after 10ms
    setTimeout(() => sf.cancel('test-key'), 10);

    await expect(promise).rejects.toThrow('Aborted');
    expect(sf.has('test-key')).toBe(false);
  });

  it('should handle errors properly', async () => {
    const error = new Error('Test error');
    const worker = async () => {
      throw error;
    };

    await expect(sf.do('test-key', worker)).rejects.toThrow('Test error');
    
    // Should be cleaned up even on error
    await new Promise(resolve => queueMicrotask(resolve));
    expect(sf.has('test-key')).toBe(false);
  });

  it('should respect holdForMs option', async () => {
    const sf = createSingleFlight({ holdForMs: 50 });
    const worker = async () => 'result';

    await sf.do('test-key', worker);
    
    // Should still be held
    expect(sf.has('test-key')).toBe(true);
    
    // Wait for hold time
    await new Promise(resolve => setTimeout(resolve, 60));
    expect(sf.has('test-key')).toBe(false);
  });

  it('should allow rejoining during hold period', async () => {
    const sf = createSingleFlight({ holdForMs: 100 });
    let callCount = 0;
    const worker = async () => {
      callCount++;
      return `result-${callCount}`;
    };

    // First call
    const result1 = await sf.do('test-key', worker);
    expect(result1).toBe('result-1');
    expect(callCount).toBe(1);

    // Second call during hold period - should get same result
    const result2 = await sf.do('test-key', worker);
    expect(result2).toBe('result-1');
    expect(callCount).toBe(1); // Worker not called again

    // Wait for hold to expire
    await new Promise(resolve => setTimeout(resolve, 110));

    // Third call after hold - should execute again
    const result3 = await sf.do('test-key', worker);
    expect(result3).toBe('result-2');
    expect(callCount).toBe(2);
  });
});