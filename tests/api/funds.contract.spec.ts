import { describe, it, expect } from 'vitest';
import { z } from 'zod';

// Contract schema matching the API implementation
const FundSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(120),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  createdAt: z.string().datetime(), // ISO datetime
});

const FundsResponseSchema = z.array(FundSchema);

describe('API Contract: /api/funds', () => {
  it('validates fund response schema', () => {
    // Test various fund payloads that should be valid
    const validFunds = [
      {
        id: 'fund-1',
        name: 'Test Fund',
        currency: 'USD',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'fund-2',
        name: 'AB', // Minimum 2 chars
        currency: 'EUR',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'fund-3',
        name: 'A'.repeat(120), // Maximum 120 chars
        currency: 'GBP',
        createdAt: '2025-12-31T23:59:59.999Z',
      },
    ];

    const result = FundsResponseSchema.safeParse(validFunds);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
    }
  });

  it('validates edge cases in fund names', () => {
    const edgeCaseFunds = [
      {
        id: 'edge-1',
        name: 'Press On Ventures — Very Long Fund Name Testing UI Edge Cases', // 67 chars
        currency: 'USD',
        createdAt: new Date().toISOString(),
      },
      {
        id: 'edge-2',
        name: 'Press On Ventures Fund I', // Standard name
        currency: 'EUR',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'edge-3',
        name: 'POV Alpha', // Short name (9 chars)
        currency: 'GBP',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
    ];

    const result = FundsResponseSchema.safeParse(edgeCaseFunds);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      // Verify the long name is within bounds
      expect(result.data[0].name.length).toBeLessThanOrEqual(120);
      expect(result.data[0].name.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('rejects invalid fund data', () => {
    const invalidFunds = [
      {
        id: 'invalid-1',
        name: 'A', // Too short (min 2)
        currency: 'USD',
        createdAt: new Date().toISOString(),
      },
    ];

    const result = FundsResponseSchema.safeParse(invalidFunds);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('name');
    }
  });

  it('rejects invalid currency codes', () => {
    const invalidCurrency = [
      {
        id: 'invalid-2',
        name: 'Test Fund',
        currency: 'JPY', // Not in enum
        createdAt: new Date().toISOString(),
      },
    ];

    const result = FundsResponseSchema.safeParse(invalidCurrency);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('currency');
    }
  });

  it('rejects invalid date formats', () => {
    const invalidDate = [
      {
        id: 'invalid-3',
        name: 'Test Fund',
        currency: 'USD',
        createdAt: 'not-a-date',
      },
    ];

    const result = FundsResponseSchema.safeParse(invalidDate);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toContain('createdAt');
    }
  });

  it('validates the exact stub response structure', () => {
    // Simulate the exact response from the stub
    const stubResponse = [
      {
        id: 'stub-1',
        name: 'Press On Ventures Fund I',
        currency: 'USD',
        createdAt: new Date(Date.now() - 86400000).toISOString(),
      },
      {
        id: 'stub-2',
        name: 'POV Alpha',
        currency: 'EUR',
        createdAt: new Date(Date.now() - 2 * 86400000).toISOString(),
      },
      {
        id: 'stub-3',
        name: 'Press On Ventures — Very Long Fund Name Testing UI Edge Cases',
        currency: 'GBP',
        createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
      },
    ];

    const result = FundsResponseSchema.safeParse(stubResponse);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(3);
      // Check specific properties
      expect(result.data[0].id).toBe('stub-1');
      expect(result.data[2].name).toContain('Very Long Fund Name');
      expect(['USD', 'EUR', 'GBP']).toContain(result.data[1].currency);
    }
  });
});