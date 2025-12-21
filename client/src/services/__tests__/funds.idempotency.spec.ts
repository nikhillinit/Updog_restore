 
 
 
 
 
import { describe, it, expect, vi } from 'vitest';
import { startCreateFund, computeCreateFundHash } from '../funds';

describe('startCreateFund idempotency', () => {
  it('deduplicates concurrent identical requests', async () => {
    const mockFetch = vi.fn().mockResolvedValue({ 
      ok: true, 
      json: async () => ({ id: 'F-1' }),
      status: 201,
      statusText: 'Created'
    });
    // Override fetch for testing
    globalThis.fetch = mockFetch;

    const basics = { name: 'Idem', size: 1_000_000, modelVersion: 'reserves-ev1' };
    const strategy = { stages: [] };

    const a = startCreateFund({ basics, strategy });
    const b = startCreateFund({ basics, strategy });

    const [ra, rb] = await Promise.all([a, b]);
    expect(ra.hash).toEqual(rb.hash);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    
    // Verify idempotency header is sent
    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Idempotency-Key': expect.any(String)
        })
      })
    );
  });

  it('produces stable hashes for identical payloads', () => {
    const payload1 = { 
      basics: { name: 'Test Fund', size: 1000000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [{ name: 'Seed', graduate: 30, exit: 20, months: 18 }] }
    };
    
    const payload2 = { 
      basics: { name: 'Test Fund', size: 1000000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [{ name: 'Seed', graduate: 30, exit: 20, months: 18 }] }
    };
    
    const hash1 = computeCreateFundHash(payload1);
    const hash2 = computeCreateFundHash(payload2);
    
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]+$/); // hex string
  });

  it('differentiates different payloads', () => {
    const payload1 = { 
      basics: { name: 'Fund A', size: 1000000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [] }
    };
    
    const payload2 = { 
      basics: { name: 'Fund B', size: 1000000, modelVersion: 'reserves-ev1' },
      strategy: { stages: [] }
    };
    
    const hash1 = computeCreateFundHash(payload1);
    const hash2 = computeCreateFundHash(payload2);
    
    expect(hash1).not.toBe(hash2);
  });
});
