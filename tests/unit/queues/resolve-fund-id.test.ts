import { describe, it, expect } from 'vitest';

import { resolveFundId } from '../../../server/queues/resolve-fund-id';
import type { LPReportData } from '../../../server/services/pdf-generation/types';

function lpDataWithFunds(fundIds: number[]): LPReportData {
  return {
    lp: { id: 1, name: 'Acme LP', email: 'lp@example.com' },
    commitments: fundIds.map((fundId, index) => ({
      commitmentId: index + 1,
      fundId,
      fundName: `Fund ${fundId}`,
      commitmentAmount: 1000,
      ownershipPercentage: 10,
    })),
    transactions: [],
  };
}

describe('resolveFundId', () => {
  it('returns the first job fundId when it is a held commitment', () => {
    expect(resolveFundId([2], lpDataWithFunds([1, 2]))).toBe(2);
  });

  it('falls back to the first commitment when no job fundIds are provided', () => {
    expect(resolveFundId(undefined, lpDataWithFunds([3, 4]))).toBe(3);
  });

  it('throws when a requested fund is not one of the LP commitments', () => {
    expect(() => resolveFundId([9], lpDataWithFunds([1, 2]))).toThrow(
      /outside the LP's commitments/
    );
  });

  it('throws when any requested fund is unauthorized, even if another is held', () => {
    expect(() => resolveFundId([1, 9], lpDataWithFunds([1, 2]))).toThrow(
      /outside the LP's commitments/
    );
  });

  it('throws when there is no fund available at all', () => {
    expect(() => resolveFundId(undefined, lpDataWithFunds([]))).toThrow(/No fund ID available/);
  });
});
