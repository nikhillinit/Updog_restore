import { describe, it, expect } from 'vitest';

describe('In-flight Request Tracking', () => {
  // Simple in-memory implementation for testing
  class InflightRegistry {
    private inflight = new Map<string, Promise<any>>();
    private maxCapacity: number;
    
    constructor(maxCapacity = 200) {
      this.maxCapacity = maxCapacity;
    }
    
    isInFlight(hash: string): boolean {
      return this.inflight.has(hash);
    }
    
    add(hash: string, promise: Promise<any>): void {
      if (this.inflight.size >= this.maxCapacity) {
        throw new Error('Too many concurrent requests; please retry shortly.');
      }
      this.inflight.set(hash, promise);
      
      // Auto-remove when done
      promise.finally(() => {
        this.inflight.delete(hash);
      });
    }
    
    get(hash: string): Promise<any> | undefined {
      return this.inflight.get(hash);
    }
    
    cancel(hash: string): boolean {
      return this.inflight.delete(hash);
    }
    
    clear(): void {
      this.inflight.clear();
    }
    
    size(): number {
      return this.inflight.size;
    }
  }

  it('should track requests while in-flight', async () => {
    const registry = new InflightRegistry();
    const hash = 'test-hash-123';
    
    // Create a promise that resolves after being added to registry
    let resolvePromise: any;
    const promise = new Promise(resolve => {
      resolvePromise = resolve;
    });
    
    registry.add(hash, promise);
    
    // Should be in-flight
    expect(registry.isInFlight(hash)).toBe(true);
    
    // Resolve the promise
    resolvePromise('done');
    
    // Wait for promise to complete and cleanup to happen
    await promise;
    // Use setImmediate/queueMicrotask equivalent to ensure .finally() callback executes
    await new Promise(resolve => queueMicrotask(() => resolve(undefined)));
    
    // Should no longer be in-flight
    expect(registry.isInFlight(hash)).toBe(false);
  });

  it('should deduplicate identical requests', () => {
    const registry = new InflightRegistry();
    const hash = 'test-hash-456';
    
    const promise1 = Promise.resolve('result');
    registry.add(hash, promise1);
    
    // Get existing promise
    const promise2 = registry.get(hash);
    
    expect(promise2).toBe(promise1);
    expect(registry.size()).toBe(1);
  });

  it('should allow different requests concurrently', () => {
    const registry = new InflightRegistry();
    
    const promise1 = Promise.resolve('result1');
    const promise2 = Promise.resolve('result2');
    
    registry.add('hash1', promise1);
    registry.add('hash2', promise2);
    
    expect(registry.isInFlight('hash1')).toBe(true);
    expect(registry.isInFlight('hash2')).toBe(true);
    expect(registry.size()).toBe(2);
  });

  it('should enforce capacity limit', () => {
    const registry = new InflightRegistry(3); // Small capacity for testing
    
    // Fill up capacity
    registry.add('hash1', Promise.resolve(1));
    registry.add('hash2', Promise.resolve(2));
    registry.add('hash3', Promise.resolve(3));
    
    // Next request should throw
    expect(() => {
      registry.add('hash4', Promise.resolve(4));
    }).toThrow('Too many concurrent requests');
    
    expect(registry.size()).toBe(3);
  });

  it('should support manual cancellation', () => {
    const registry = new InflightRegistry();
    const hash = 'cancel-hash';
    
    registry.add(hash, new Promise(() => {})); // Never resolves
    
    expect(registry.isInFlight(hash)).toBe(true);
    
    // Cancel it
    const cancelled = registry.cancel(hash);
    expect(cancelled).toBe(true);
    
    expect(registry.isInFlight(hash)).toBe(false);
    
    // Second cancel should return false
    const cancelled2 = registry.cancel(hash);
    expect(cancelled2).toBe(false);
  });

  it('should compute consistent hashes', () => {
    // Simple FNV-1a hash implementation
    function fnv1a(input: string): string {
      let hash = 0x811c9dc5;
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return (hash >>> 0).toString(16);
    }
    
    const payload = JSON.stringify({ name: 'Test', size: 1000 });
    const hash1 = fnv1a(`test|${  payload}`);
    const hash2 = fnv1a(`test|${  payload}`);
    
    expect(hash1).toBe(hash2);
    
    // Different payloads should produce different hashes
    const payload2 = JSON.stringify({ name: 'Test2', size: 2000 });
    const hash3 = fnv1a(`test|${  payload2}`);
    
    expect(hash3).not.toBe(hash1);
  });

  it('should namespace hashes by environment', () => {
    function computeHash(env: string, payload: any): string {
      let hash = 0x811c9dc5;
      const input = `${env  }|fund-create|${  JSON.stringify(payload)}`;
      for (let i = 0; i < input.length; i++) {
        hash ^= input.charCodeAt(i);
        hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
      }
      return (hash >>> 0).toString(16);
    }
    
    const payload = { name: 'Test Fund', size: 1000000 };
    
    const devHash = computeHash('development', payload);
    const prodHash = computeHash('production', payload);
    const testHash = computeHash('test', payload);
    
    // All hashes should be different
    expect(devHash).not.toBe(prodHash);
    expect(prodHash).not.toBe(testHash);
    expect(devHash).not.toBe(testHash);
  });
});