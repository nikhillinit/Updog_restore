import { describe, expect, it } from 'vitest';
import {
  getResolvedInvestments,
  getUnmappedSectors,
  type ResolutionInput,
} from '@/core/cohorts/resolvers';

function makeInput(amount: string | null): ResolutionInput {
  return {
    fundId: 1,
    taxonomyVersion: 'v1',
    granularity: 'year',
    companies: [{ id: 10, name: 'Acme', sector: 'FinTech' }],
    investments: [
      {
        id: 100,
        companyId: 10,
        investmentDate: new Date('2024-01-15'),
        amount,
        round: 'Seed',
      },
    ],
    sectorTaxonomy: [
      { id: 'sec-fintech', slug: 'fintech', name: 'FinTech', isSystem: false },
      { id: 'sec-unmapped', slug: 'unmapped', name: 'Unmapped', isSystem: true },
    ],
    sectorMappings: [{ rawValueNormalized: 'fintech', canonicalSectorId: 'sec-fintech' }],
    companyOverrides: [],
    investmentOverrides: [],
  };
}

describe('cohort resolvers', () => {
  it('parses numeric investment amounts without parseFloat-style partial parsing', () => {
    const resolved = getResolvedInvestments(makeInput('1000000.25'));

    expect(resolved[0]?.investmentAmount).toBe(1000000.25);
  });

  it('returns null for malformed or blank investment amounts', () => {
    expect(getResolvedInvestments(makeInput(''))[0]?.investmentAmount).toBeNull();
    expect(getResolvedInvestments(makeInput('100abc'))[0]?.investmentAmount).toBeNull();
  });

  it('keeps unmapped-sector aggregation stable when investment amount is invalid', () => {
    const input = makeInput('not-a-number');
    input.companies[0] = { id: 10, name: 'Acme', sector: 'Unknown Sector' };
    input.sectorMappings = [];

    const resolved = getResolvedInvestments(input);
    const unmapped = getUnmappedSectors(resolved);

    expect(unmapped).toEqual([
      {
        rawValue: 'Unknown Sector',
        rawValueNormalized: 'unknown sector',
        companyCount: 1,
        investmentCount: 1,
        totalInvested: 0,
      },
    ]);
  });
});
