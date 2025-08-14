// client/src/services/__tests__/funds.idempotency.spec.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { startCreateFund, cancelAllFundSaves, getInflightCount } from '../funds';

describe('createFund idempotency', () => {
  beforeEach(() => {
    // Clear any in-flight requests
    cancelAllFundSaves();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the same in-flight promise for identical payload', async () => {
    // Mock global fetch
    const response = new Response(JSON.stringify({ id: 'F-1' }), { status: 200 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const payload = { 
      name: 'Fund A', 
      basics: {},
      stages: [{ name: 'Seed', graduate: 35, exit: 35, months: 18 }],
      modelVersion: 'reserves-ev1'
    };

    // Start two identical requests
    const p1 = startCreateFund(payload);
    const p2 = startCreateFund(payload);

    // Should return same promise instance
    expect(p1).toBe(p2);
    
    // Should only make one network call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    
    // Both should resolve to same result
    const [res1, res2] = await Promise.all([p1, p2]);
    const [data1, data2] = await Promise.all([res1.json(), res2.json()]);
    expect(data1).toEqual({ id: 'F-1' });
    expect(data2).toEqual({ id: 'F-1' });

    fetchSpy.mockRestore();
  });

  it('cancels via provided AbortSignal without cancelling other callers', async () => {
    // Create a deferred promise to control when fetch resolves
    const deferred = (() => {
      let resolve!: (v: any) => void;
      const promise = new Promise<any>(r => (resolve = r));
      return { promise, resolve };
    })();

    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => deferred.promise);

    const ctrlA = new AbortController();
    const ctrlB = new AbortController();

    const payload = { 
      name: 'Fund B', 
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    // Start two requests with different abort controllers
    const pA = startCreateFund(payload, { signal: ctrlA.signal });
    const pB = startCreateFund(payload, { signal: ctrlB.signal });

    // Abort only A
    ctrlA.abort(new DOMException('Aborted A', 'AbortError'));
    
    // A should reject with AbortError
    await expect(pA).rejects.toMatchObject({ name: 'AbortError' });

    // Complete the request
    deferred.resolve(new Response(JSON.stringify({ id: 'F-2' }), { status: 200 }));
    
    // B should still resolve successfully
    const resB = await pB;
    const dataB = await resB.json();
    expect(dataB).toEqual({ id: 'F-2' });

    // Only one network call overall
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('handles takeLatest mode by cancelling previous request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => 
      new Promise(resolve => setTimeout(() => 
        resolve(new Response(JSON.stringify({ id: 'F-3' }), { status: 200 })), 100
      ))
    );

    const payload = { 
      name: 'Fund C', 
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    // Start first request
    const p1 = startCreateFund(payload, { mode: 'reuse' });
    
    // Start second request with takeLatest mode
    const p2 = startCreateFund(payload, { mode: 'takeLatest' });

    // First should be cancelled (though the abort may not propagate to our mock)
    // Second should complete
    const res2 = await p2;
    const data2 = await res2.json();
    expect(data2).toEqual({ id: 'F-3' });

    // Should have made 2 network calls (first was cancelled, second completed)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    fetchSpy.mockRestore();
  });

  it('tracks in-flight count correctly', async () => {
    const deferred = (() => {
      let resolve!: (v: any) => void;
      const promise = new Promise<any>(r => (resolve = r));
      return { promise, resolve };
    })();

    vi.spyOn(globalThis, 'fetch').mockImplementation(() => deferred.promise);

    expect(getInflightCount()).toBe(0);

    const payload1 = { 
      name: 'Fund D', 
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };
    
    const payload2 = { 
      name: 'Fund E', // Different name = different hash
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    // Start two different requests
    const p1 = startCreateFund(payload1);
    const p2 = startCreateFund(payload2);

    expect(getInflightCount()).toBe(2);

    // Complete all requests
    deferred.resolve(new Response(JSON.stringify({ id: 'F-4' }), { status: 200 }));
    await Promise.all([p1, p2]);

    expect(getInflightCount()).toBe(0);
  });

  it('preserves idempotency key in telemetry', async () => {
    const telemetrySpy = vi.fn();
    vi.doMock('../lib/telemetry', () => ({
      emitTelemetry: telemetrySpy
    }));

    const response = new Response(JSON.stringify({ id: 'F-5' }), { status: 200 });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(response);

    const payload = { 
      name: 'Fund F', 
      basics: {},
      stages: [{ name: 'A', graduate: 50, exit: 50, months: 12 }],
      modelVersion: 'reserves-ev1'
    };

    await startCreateFund(payload);

    // Check telemetry includes idempotency key
    expect(telemetrySpy).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'fund',
        event: 'created',
        ok: true,
        meta: expect.objectContaining({
          idempKey: expect.stringMatching(/^idemp_[a-f0-9]+$/)
        })
      })
    );
  });

  it('sends Idempotency-Key header to server', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'F-6' }), { status: 200 })
    );

    const payload = { 
      name: 'Fund G', 
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    await startCreateFund(payload);

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/funds',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': expect.stringMatching(/^idemp_[a-f0-9]+$/)
        })
      })
    );
  });

  it('handles network errors gracefully', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

    const payload = { 
      name: 'Fund H', 
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    await expect(startCreateFund(payload)).rejects.toThrow('Network error');
    
    // Should clean up in-flight registry
    expect(getInflightCount()).toBe(0);
  });

  it('handles HTTP error responses', async () => {
    const errorResponse = new Response('Bad Request', { 
      status: 400, 
      statusText: 'Bad Request' 
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(errorResponse);

    const payload = { 
      name: 'Fund I', 
      basics: {},
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    await expect(startCreateFund(payload)).rejects.toThrow('Create fund failed: 400 Bad Request');
    
    // Should clean up in-flight registry
    expect(getInflightCount()).toBe(0);
  });

  it('generates different keys for different payloads even with same structure', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ id: 'F-7' }), { status: 200 })
    );

    const payload1 = { 
      name: 'Fund J', 
      basics: { a: 1, b: 2 }, // Specific order
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    const payload2 = { 
      name: 'Fund J', 
      basics: { b: 2, a: 1 }, // Different order, but should hash the same
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    const payload3 = { 
      name: 'Fund K', // Different name
      basics: { a: 1, b: 2 },
      stages: [],
      modelVersion: 'reserves-ev1'
    };

    const p1 = startCreateFund(payload1);
    const p2 = startCreateFund(payload2);
    const p3 = startCreateFund(payload3);

    // First two should share promise (canonical ordering)
    expect(p1).toBe(p2);
    // Third should be different
    expect(p1).not.toBe(p3);

    await Promise.all([p1, p2, p3]);

    // Should have made 2 network calls (payload1/2 shared, payload3 separate)
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
