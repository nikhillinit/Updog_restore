import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

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
  beforeEach(() => {
    // Clear any existing in-flight requests
    while (cancelCreateFund('dummy-hash')) {
      // Keep canceling until all are cleared
    }
    
    // Reset fetch mock
    (global.fetch as any).mockReset();
  });

  afterEach(() => {
    // Clean up any hanging requests
    vi.clearAllTimers();
  });

  it('should track in-flight requests', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    const hash = computeCreateFundHash(payload);
    
    // Mock successful response
    (global.fetch as any).mockResolvedValue({
      ok: true,
      status: 201,
      headers: new Map(),
      json: async () => ({ id: 1, ...payload })
    });
    
    // Start request (don't await yet)
    const promise = startCreateFund(payload);
    
    // Should be in-flight
    expect(isCreateFundInFlight(hash)).toBe(true);
    
    // Wait for completion
    await promise;
    
    // Should no longer be in-flight
    expect(isCreateFundInFlight(hash)).toBe(false);
  });

  it('should deduplicate concurrent identical requests', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    const hash = computeCreateFundHash(payload);
    
    let fetchCallCount = 0;
    (global.fetch as any).mockImplementation(() => {
      fetchCallCount++;
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            ok: true,
            status: 201,
            headers: new Map(),
            json: async () => ({ id: 1, ...payload })
          });
        }, 100);
      });
    });
    
    // Start multiple identical requests
    const promise1 = startCreateFund(payload);
    const promise2 = startCreateFund(payload);
    const promise3 = startCreateFund(payload);
    
    // All should return the same promise
    expect(promise1).toBe(promise2);
    expect(promise2).toBe(promise3);
    
    // Only one fetch call should be made
    await Promise.all([promise1, promise2, promise3]);
    expect(fetchCallCount).toBe(1);
  });

  it('should allow different requests concurrently', async () => {
    const payload1 = { name: 'Fund 1', size: 1000000 };
    const payload2 = { name: 'Fund 2', size: 2000000 };
    
    const hash1 = computeCreateFundHash(payload1);
    const hash2 = computeCreateFundHash(payload2);
    
    expect(hash1).not.toBe(hash2);
    
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
    
    // Start different requests
    const promise1 = startCreateFund(payload1);
    const promise2 = startCreateFund(payload2);
    
    // Should be different promises
    expect(promise1).not.toBe(promise2);
    
    // Both should be in-flight
    expect(isCreateFundInFlight(hash1)).toBe(true);
    expect(isCreateFundInFlight(hash2)).toBe(true);
    
    await Promise.all([promise1, promise2]);
    
    // Two fetch calls should be made
    expect(fetchCallCount).toBe(2);
  });

  it('should throw when capacity is exceeded', async () => {
    // Mock VITE_IDEMPOTENCY_MAX to a low value for testing
    const originalMax = import.meta.env.VITE_IDEMPOTENCY_MAX;
    import.meta.env.VITE_IDEMPOTENCY_MAX = '3';
    
    // Create promises that don't resolve immediately
    const hangingPromises: Promise<any>[] = [];
    (global.fetch as any).mockImplementation(() => {
      return new Promise(() => {}); // Never resolves
    });
    
    try {
      // Fill up capacity
      for (let i = 0; i < 3; i++) {
        const payload = { name: `Fund ${i}`, size: 1000000 * i };
        hangingPromises.push(
          startCreateFund(payload).catch(() => {}) // Ignore errors
        );
      }
      
      // Next request should throw
      const payload = { name: 'Fund 4', size: 4000000 };
      await expect(startCreateFund(payload)).rejects.toThrow('Too many concurrent requests');
    } finally {
      // Clean up
      import.meta.env.VITE_IDEMPOTENCY_MAX = originalMax;
      
      // Cancel all hanging requests
      for (let i = 0; i < 3; i++) {
        const hash = computeCreateFundHash({ name: `Fund ${i}`, size: 1000000 * i });
        cancelCreateFund(hash);
      }
    }
  });

  it('should support manual cancellation', async () => {
    const payload = { name: 'Test Fund', size: 1000000 };
    const hash = computeCreateFundHash(payload);
    
    // Mock fetch that takes time
    (global.fetch as any).mockImplementation(() => {
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          reject(new Error('Should have been cancelled'));
        }, 1000);
      });
    });
    
    // Start request
    const promise = startCreateFund(payload);
    
    // Should be in-flight
    expect(isCreateFundInFlight(hash)).toBe(true);
    
    // Cancel it
    const cancelled = cancelCreateFund(hash);
    expect(cancelled).toBe(true);
    
    // Should throw abort error
    await expect(promise).rejects.toThrow();
    
    // Should no longer be in-flight
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