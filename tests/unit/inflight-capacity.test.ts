import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { deferred } from '../helpers/deferred';

// Mock import.meta.env
vi.stubGlobal('import', {
  meta: {
    env: {
      MODE: 'test',
      VITE_IDEMPOTENCY_MAX: '200'
    }
  }
});

// Mock fetch
global.fetch = vi.fn();

describe('In-flight Capacity Management', () => {
  let startCreateFund: any;
  let isCreateFundInFlight: any;
  let cancelCreateFund: any;
  let computeCreateFundHash: any;

  beforeEach(async () => {
    // Clear modules to reset in-flight map
    vi.resetModules();
    
    // Re-import the module to get fresh state
    const fundsModule = await import('../../client/src/services/funds');
    startCreateFund = fundsModule.startCreateFund;
    isCreateFundInFlight = fundsModule.isCreateFundInFlight;
    cancelCreateFund = fundsModule.cancelCreateFund;
    computeCreateFundHash = fundsModule.computeCreateFundHash;
    
    // Wait a tick for any cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  afterEach(async () => {
    // Clean up any hanging requests
    vi.clearAllTimers();
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  it('should track in-flight requests', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    // Need to compute hash on finalized payload to match what startCreateFund uses
    const finalizedPayload = { ...payload, modelVersion: 'reserves-ev1' };
    const hash = computeCreateFundHash(finalizedPayload);
    
    // Create a controlled deferred promise
    const deferredRequest = deferred();
    (global.fetch as any).mockReturnValue(deferredRequest.promise);
    
    // Start request (don't await yet) with longer hold for observability
    const promise = startCreateFund(payload, { holdForMs: 50 });
    
    // Should be in-flight immediately (synchronous registration)
    expect(isCreateFundInFlight(hash)).toBe(true);
    
    // Resolve the fetch
    deferredRequest.resolve({
      ok: true,
      status: 201,
      headers: new Map(),
      json: async () => ({ id: 1, ...payload })
    });
    
    // Wait for completion
    await promise;
    
    // Should still be in-flight due to holdForMs
    expect(isCreateFundInFlight(hash)).toBe(true);
    
    // Wait for cleanup delay
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Should no longer be in-flight
    expect(isCreateFundInFlight(hash)).toBe(false);
  });

  it('should deduplicate concurrent identical requests', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    const finalizedPayload = { ...payload, modelVersion: 'reserves-ev1' };
    const hash = computeCreateFundHash(finalizedPayload);
    
    // Create controlled deferred promise that we control resolution timing
    const deferredRequest = deferred();
    let fetchCallCount = 0;
    (global.fetch as any).mockImplementation(() => {
      fetchCallCount++;
      return deferredRequest.promise;
    });
    
    // Start multiple identical requests simultaneously - use short holdForMs to ensure they overlap
    const promise1 = startCreateFund(payload, { holdForMs: 100 });
    const promise2 = startCreateFund(payload, { holdForMs: 100 });
    const promise3 = startCreateFund(payload, { holdForMs: 100 });
    
    
    // All should return the same promise (reference equality for deduplication)
    expect(promise1).toBe(promise2);
    expect(promise2).toBe(promise3);
    
    // Only one fetch call should be made (deduplication worked)
    expect(fetchCallCount).toBe(1);
    
    // Resolve the deferred request after confirming deduplication
    deferredRequest.resolve({
      ok: true,
      status: 201,
      headers: new Map(),
      json: async () => ({ id: 1, ...payload })
    });
    
    // Wait for all to complete
    const [result1, result2, result3] = await Promise.all([promise1, promise2, promise3]);
    
    // Results should be identical
    expect(result1.hash).toBe(result2.hash);
    expect(result2.hash).toBe(result3.hash);
  });

  it('should allow different requests concurrently', async () => {
    const payload1 = { name: 'Fund 1', size: 1000000 };
    const payload2 = { name: 'Fund 2', size: 2000000 };
    
    const finalizedPayload1 = { ...payload1, modelVersion: 'reserves-ev1' };
    const finalizedPayload2 = { ...payload2, modelVersion: 'reserves-ev1' };
    const hash1 = computeCreateFundHash(finalizedPayload1);
    const hash2 = computeCreateFundHash(finalizedPayload2);
    
    expect(hash1).not.toBe(hash2);
    
    // Create separate deferred promises for each request
    const deferred1 = deferred();
    const deferred2 = deferred();
    let fetchCallCount = 0;
    
    (global.fetch as any).mockImplementation(() => {
      fetchCallCount++;
      return fetchCallCount === 1 ? deferred1.promise : deferred2.promise;
    });
    
    // Start different requests with hold time for observability
    const promise1 = startCreateFund(payload1, { holdForMs: 50 });
    const promise2 = startCreateFund(payload2, { holdForMs: 50 });
    
    // Should be different promises
    expect(promise1).not.toBe(promise2);
    
    // Both should be in-flight immediately
    expect(isCreateFundInFlight(hash1)).toBe(true);
    expect(isCreateFundInFlight(hash2)).toBe(true);
    
    // Resolve both requests
    deferred1.resolve({
      ok: true,
      status: 201,
      headers: new Map(),
      json: async () => ({ id: 1 })
    });
    
    deferred2.resolve({
      ok: true,
      status: 201,
      headers: new Map(),
      json: async () => ({ id: 2 })
    });
    
    await Promise.all([promise1, promise2]);
    
    // Two fetch calls should be made
    expect(fetchCallCount).toBe(2);
  });

  it('should throw when capacity is exceeded', async () => {
    // Use a simpler test approach - create a few hanging promises and test capacity
    const { startInFlight } = await import('../../client/src/lib/inflight');
    
    // The default capacity is 200, so we'll create that many hanging promises
    const promises: Promise<any>[] = [];
    const resolvers: Array<() => void> = [];
    
    try {
      // Fill up to capacity with controlled promises
      for (let i = 0; i < 200; i++) {
        const promise = startInFlight(`test-capacity-${i}`, async () => {
          return new Promise((resolve) => {
            resolvers.push(resolve as () => void);
          });
        });
        promises.push(promise.catch(() => {})); // Ignore errors
      }
      
      // Now try one more request - it should throw because we're at capacity
      expect(() => {
        startInFlight(`test-capacity-overflow`, async () => {
          return Promise.resolve();
        });
      }).toThrow('Too many concurrent requests');
      
    } finally {
      // Clean up by resolving all promises
      resolvers.forEach(r => r());
      await Promise.all(promises);
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  }, 30000); // Give this test more time

  it('should support manual cancellation', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    const finalizedPayload = { ...payload, modelVersion: 'reserves-ev1' };
    const hash = computeCreateFundHash(finalizedPayload);
    
    // Create a controlled deferred promise that will reject when aborted
    const deferredRequest = deferred();
    (global.fetch as any).mockImplementation((url: string, opts: any) => {
      // Listen for abort signal
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          deferredRequest.reject(new DOMException('The operation was aborted', 'AbortError'));
        });
      }
      return deferredRequest.promise;
    });
    
    // Start request with hold time for observability
    const promise = startCreateFund(payload, { holdForMs: 50 });
    
    // Should be in-flight immediately
    expect(isCreateFundInFlight(hash)).toBe(true);
    
    // Cancel it
    const cancelled = cancelCreateFund(hash);
    expect(cancelled).toBe(true);
    
    // Should throw abort error
    await expect(promise).rejects.toThrow('aborted');
    
    // Wait for cleanup
    await new Promise(resolve => setTimeout(resolve, 60));
    
    // Should no longer be in-flight after cancellation
    expect(isCreateFundInFlight(hash)).toBe(false);
    
    // Second cancel should return false
    expect(cancelCreateFund(hash)).toBe(false);
  });

  it('should not deduplicate when dedupe option is false', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    
    let fetchCallCount = 0;
    (global.fetch as any).mockImplementation(() => {
      fetchCallCount++;
      return Promise.resolve({
        ok: true,
        status: 201,
        headers: new Map(),
        json: async () => ({ id: fetchCallCount })
      });
    });
    
    // Start multiple requests with dedupe disabled
    const promise1 = startCreateFund(payload, { dedupe: false });
    const promise2 = startCreateFund(payload, { dedupe: false });
    
    // Should be different promises
    expect(promise1).not.toBe(promise2);
    
    await Promise.all([promise1, promise2]);
    
    // Two fetch calls should be made
    expect(fetchCallCount).toBe(2);
  });

  it('should include environment namespace in hash', () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    
    // Save original
    const originalMode = import.meta.env.MODE;
    
    // Test different environments produce different hashes
    import.meta.env.MODE = 'development';
    const hash1 = computeCreateFundHash(payload);
    
    import.meta.env.MODE = 'production';
    const hash2 = computeCreateFundHash(payload);
    
    import.meta.env.MODE = 'test';
    const hash3 = computeCreateFundHash(payload);
    
    // All hashes should be different
    expect(hash1).not.toBe(hash2);
    expect(hash2).not.toBe(hash3);
    expect(hash1).not.toBe(hash3);
    
    // Restore
    import.meta.env.MODE = originalMode;
  });
});