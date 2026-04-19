import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeCreateFundHash, startCreateFund } from '@/services/funds';

describe('Wave 2 funds boundary', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('deduplicates concurrent identical create-fund requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'F-1' }), {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Status': 'created',
        },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const payload = {
      basics: { name: 'Idem', size: 1_000_000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [] },
    };

    const [first, second] = await Promise.all([startCreateFund(payload), startCreateFund(payload)]);

    expect(first.hash).toBe(second.hash);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/funds',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          'Idempotency-Key': first.hash,
        }),
      })
    );
  });

  it('produces stable hashes for identical payloads', () => {
    const payload = {
      basics: { name: 'Test Fund', size: 1_000_000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [{ name: 'Seed', graduate: 30, exit: 20, months: 18 }] },
    };

    expect(computeCreateFundHash(payload)).toBe(computeCreateFundHash(payload));
  });

  it('changes the hash when the payload changes', () => {
    const baseline = {
      basics: { name: 'Fund A', size: 1_000_000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [] },
    };
    const variant = {
      basics: { name: 'Fund B', size: 1_000_000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [] },
    };

    expect(computeCreateFundHash(baseline)).not.toBe(computeCreateFundHash(variant));
  });
});
