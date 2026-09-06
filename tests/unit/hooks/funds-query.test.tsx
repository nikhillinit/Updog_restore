import { describe, expect, it } from 'vitest';
import { FundSummariesSchema } from '@/lib/funds-query';

const fund = {
  id: 1,
  name: 'Fund I',
  size: 25_000_000,
  deployedCapital: 5_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2024,
  status: 'active',
  engineResults: null,
  createdAt: '2026-09-06T00:00:00.000Z',
  establishmentDate: null,
  isActive: true,
};

describe('fund summaries response', () => {
  it('accepts the canonical client fund shape', () => {
    expect(FundSummariesSchema.parse([fund])).toEqual([fund]);
  });

  it('rejects malformed successful fund payloads', () => {
    expect(() => FundSummariesSchema.parse([{ ...fund, size: '25000000' }])).toThrow();
  });
});
