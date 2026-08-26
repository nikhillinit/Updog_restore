import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  computeCreateFundHash,
  computeFinalizeFundHash,
  finalizeFund,
  startCreateFund,
} from '@/services/funds';

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
      expect.stringContaining('/api/funds'),
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

describe('finalizeFund idempotency', () => {
  it('produces stable finalize hashes for equivalent payloads', () => {
    const payload = {
      draftFundId: 77,
      name: 'Test Fund',
      size: 50_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };
    const reorderedPayload = {
      vintageYear: 2026,
      carryPercentage: 0.2,
      managementFee: 0.02,
      size: 50_000_000,
      name: 'Test Fund',
      draftFundId: 77,
    };

    expect(computeFinalizeFundHash(payload)).toBe(computeFinalizeFundHash(reorderedPayload));
  });

  it('includes draft identity in finalize hash scope', () => {
    const payload = {
      draftFundId: 77,
      name: 'Test Fund',
      size: 50_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };

    expect(computeFinalizeFundHash(payload)).not.toBe(
      computeFinalizeFundHash({ ...payload, draftFundId: 78 })
    );
  });

  it('sends an idempotency key on finalize', async () => {
    const payload = {
      draftFundId: 77,
      name: 'Test Fund',
      size: 50_000_000,
      managementFee: 0.02,
      carryPercentage: 0.2,
      vintageYear: 2026,
    };
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            fundId: 77,
            configVersion: 1,
            correlationId: '550e8400-e29b-41d4-a716-446655440000',
            published: true,
          },
        }),
        {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await finalizeFund(payload);

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds/finalize'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          'Idempotency-Key': computeFinalizeFundHash(payload),
        }),
      })
    );
  });
});
