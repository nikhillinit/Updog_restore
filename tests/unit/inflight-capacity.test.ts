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

// Now import after mocking
const { 
  startCreateFund, 
  isCreateFundInFlight, 
  cancelCreateFund,
  computeCreateFundHash 
} = await import('../../client/src/services/funds');

describe('In-flight Capacity Management', () => {
  beforeEach(async () => {
    vi.clearAllTimers();
    vi.useFakeTimers();
    
    // Clear any existing in-flight requests by canceling all possible hashes
    // This is a brute force approach but works for tests
    const testHashes = ['test-hash-1', 'test-hash-2', 'test-hash-3'];
    testHashes.forEach(hash => {
      try {
        cancelCreateFund(hash);
      } catch (e) {
        // Ignore errors from canceling non-existent requests
      }
    });
    
    // Wait a tick for any cleanup to complete
    await vi.runOnlyPendingTimersAsync();
    
    // Reset fetch mock
    (global.fetch as any).mockReset();
  }, 15000);

  afterEach(() => {
    // Clean up any hanging requests
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('should track in-flight requests', async () => {
    vi.useRealTimers(); // Use real timers for this test
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
  }, 15000);

  it('should deduplicate concurrent identical requests', async () => {
    vi.useRealTimers(); // Use real timers for this test
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
    
    // Start multiple identical requests simultaneously - don't pass any options
    const promise1 = startCreateFund(payload);
    const promise2 = startCreateFund(payload);
    const promise3 = startCreateFund(payload);
    
    
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
    // Mock VITE_IDEMPOTENCY_MAX to a low value for testing
    const originalMax = import.meta.env.VITE_IDEMPOTENCY_MAX;
    import.meta.env.VITE_IDEMPOTENCY_MAX = '3';
    
    // Create deferred promises for controlled resolution
    const deferredRequests = [deferred(), deferred(), deferred()];
    let fetchCallIndex = 0;
    
    (global.fetch as any).mockImplementation(() => {
      const currentDeferred = deferredRequests[fetchCallIndex++];
      return currentDeferred ? currentDeferred.promise : Promise.resolve({
        ok: true,
        status: 201,
        headers: new Map(),
        json: async () => ({ id: 999 })
      });
    });
    
    try {
      // Fill up capacity with controlled promises
      const hangingPromises: Promise<any>[] = [];
      for (let i = 0; i < 3; i++) {
        const payload = { name: `Fund ${i}`, size: 1000000 * i };
        hangingPromises.push(
          startCreateFund(payload).catch(() => {}) // Ignore errors
        );
      }
      
      // Wait a tick to ensure all requests are registered
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Next request should throw synchronously due to capacity limit
      const payload = { name: 'Fund 4', size: 4000000 };
      expect(() => startCreateFund(payload)).toThrow('Too many concurrent requests');
      
    } finally {
      // Clean up by resolving all deferred promises
      deferredRequests.forEach((d, i) => {
        if (d) {
          d.resolve({
            ok: true,
            status: 201,
            headers: new Map(),
            json: async () => ({ id: i })
          });
        }
      });
      
      // Restore original value
      import.meta.env.VITE_IDEMPOTENCY_MAX = originalMax;
    }
  });

  it('should support manual cancellation', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    const finalizedPayload = { ...payload, modelVersion: 'reserves-ev1' };
    const hash = computeCreateFundHash(finalizedPayload);
    
    // Create a controlled deferred promise that won't resolve
    const deferredRequest = deferred();
    (global.fetch as any).mockReturnValue(deferredRequest.promise);
    
    // Start request with hold time for observability
    const promise = startCreateFund(payload, { holdForMs: 50 });
    
    // Should be in-flight immediately
    expect(isCreateFundInFlight(hash)).toBe(true);
    
    // Cancel it
    const cancelled = cancelCreateFund(hash);
    expect(cancelled).toBe(true);
    
    // Should throw abort error
    await expect(promise).rejects.toThrow();
    
    // Should no longer be in-flight after cancellation
    expect(isCreateFundInFlight(hash)).toBe(false);
    
    // Second cancel should return false
    expect(cancelCreateFund(hash)).toBe(false);
  }, 15000);

  it('should not deduplicate when dedupe option is false', async () => {
    vi.useRealTimers(); // Use real timers for this test
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
  }, 15000);

  it('should include environment namespace in hash', () => {
    vi.useRealTimers(); // Use real timers for this test
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
  }, 15000);
});