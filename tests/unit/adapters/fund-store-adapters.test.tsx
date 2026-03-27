/**
 * Tests for fund-store-adapters
 *
 * Validates:
 * - Warning-fields-blank scenario (defaults applied)
 * - Overlap invariant: overlapping defined fields match after unit conversion
 * - Schema round-trip: adapter output parses through contract schemas
 * - Server draft hydration maps back into routed wizard state deterministically
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  fundDraftWriteV1ToStoreHydrationPatch,
  fundStoreToCreateV1,
  fundStoreToDraftWriteV1,
} from '@/adapters/fund-store-adapters';
import { FundCreateV1Schema } from '@shared/contracts/fund-create-v1.contract';
import { FundDraftWriteV1Schema } from '@shared/contracts/fund-draft-write-v1.contract';

afterEach(() => {
  vi.restoreAllMocks();
});

// Minimal state slice with all required array fields
const baseState: Parameters<typeof fundStoreToCreateV1>[0] = {
  fundName: 'Test Fund',
  fundSize: 50_000_000,
  managementFeeRate: 2.0,
  carriedInterest: 20.0,
  vintageYear: 2026,
  establishmentDate: '2026-01-15',
  isEvergreen: false,
  fundLife: 10,
  investmentPeriod: 5,
  gpCommitment: 2_500_000,
  lpClasses: [],
  lps: [],
  stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
  sectorProfiles: [],
  allocations: [],
  followOnChecks: { A: 1, B: 2, C: 3 },
  capitalStageAllocations: [],
  capitalPlanAllocations: [],
  pipelineProfiles: [],
  waterfallType: 'american',
  waterfallTiers: [],
  recyclingEnabled: false,
  recyclingType: undefined,
  recyclingCap: undefined,
  recyclingPeriod: undefined,
  exitRecyclingRate: undefined,
  mgmtFeeRecyclingRate: undefined,
  allowFutureRecycling: undefined,
  feeProfiles: [],
  fundExpenses: [],
};

const hydrationDefaults = {
  isEvergreen: false,
  lpClasses: [],
  lps: [],
  stages: [{ id: 'default-stage', name: 'Seed', graduate: 25, exit: 10, months: 18 }],
  sectorProfiles: [{ id: 'default-sector', name: 'FinTech', targetPercentage: 100 }],
  allocations: [{ id: 'default-alloc', category: 'New Investments', percentage: 100 }],
  followOnChecks: { A: 10, B: 20, C: 30 },
  capitalStageAllocations: [{ id: 'default-cap-stage', label: 'Reserved', pct: 100 }],
  capitalPlanAllocations: [
    {
      id: 'default-plan',
      name: 'Reserved Capital',
      entryRound: 'Seed',
      capitalAllocationPct: 100,
      initialCheckStrategy: 'amount' as const,
      initialCheckAmount: 250000,
      followOnStrategy: 'maintain_ownership' as const,
      followOnParticipationPct: 100,
      investmentHorizonMonths: 24,
    },
  ],
  pipelineProfiles: [],
  waterfallType: 'american' as const,
  waterfallTiers: [{ id: 'default-tier', name: 'Standard', gpSplit: 20, lpSplit: 80 }],
  recyclingEnabled: false,
  recyclingType: 'exits' as const,
  exitRecyclingRate: 100,
  mgmtFeeRecyclingRate: 0,
  allowFutureRecycling: false,
  feeProfiles: [],
  fundExpenses: [],
};

describe('fundStoreToCreateV1', () => {
  it('maps store state to FundCreateV1 with correct unit conversion', () => {
    const result = fundStoreToCreateV1(baseState);

    expect(result.name).toBe('Test Fund');
    expect(result.size).toBe(50_000_000);
    expect(result.managementFee).toBe(0.02); // 2.0% -> 0.02
    expect(result.carryPercentage).toBe(0.2); // 20.0% -> 0.20
    expect(result.vintageYear).toBe(2026);
  });

  it('applies defaults for blank/missing fields and logs warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = fundStoreToCreateV1({
      ...baseState,
      fundName: undefined,
      fundSize: undefined,
      managementFeeRate: undefined,
      carriedInterest: undefined,
      vintageYear: undefined,
    });

    expect(result.name).toBe('Untitled Fund');
    expect(result.size).toBe(0);
    expect(result.managementFee).toBe(0);
    expect(result.carryPercentage).toBe(0);
    expect(result.vintageYear).toBeGreaterThanOrEqual(2020);
    expect(warnSpy).toHaveBeenCalledWith('create-defaults-applied', expect.any(Object));
  });

  it('output parses through FundCreateV1Schema', () => {
    const result = fundStoreToCreateV1(baseState);
    const parsed = FundCreateV1Schema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('fundStoreToDraftWriteV1', () => {
  it('includes all non-empty fields from store', () => {
    const result = fundStoreToDraftWriteV1(baseState);

    expect(result.fundName).toBe('Test Fund');
    expect(result.fundSize).toBe(50_000_000);
    expect(result.stages).toHaveLength(1);
    expect(result.followOnChecks).toEqual({ A: 1, B: 2, C: 3 });
    expect(result.waterfallType).toBe('american');
    // Empty arrays should NOT be included
    expect(result.lpClasses).toBeUndefined();
    expect(result.lps).toBeUndefined();
  });

  it('returns minimal payload for minimal state', () => {
    const result = fundStoreToDraftWriteV1({
      ...baseState,
      fundName: 'Minimal',
      fundSize: undefined,
      managementFeeRate: undefined,
      carriedInterest: undefined,
      vintageYear: undefined,
      establishmentDate: undefined,
      isEvergreen: undefined,
      fundLife: undefined,
      investmentPeriod: undefined,
      gpCommitment: undefined,
      stages: [],
      waterfallType: undefined,
      recyclingEnabled: undefined,
      followOnChecks: { A: 0, B: 0, C: 0 },
    });

    expect(result.fundName).toBe('Minimal');
    expect(result.fundSize).toBeUndefined();
  });

  it('output parses through FundDraftWriteV1Schema', () => {
    const result = fundStoreToDraftWriteV1(baseState);
    const parsed = FundDraftWriteV1Schema.safeParse(result);
    expect(parsed.success).toBe(true);
  });
});

describe('fundDraftWriteV1ToStoreHydrationPatch', () => {
  it('maps a server draft back into routed wizard state using explicit defaults', () => {
    const patch = fundDraftWriteV1ToStoreHydrationPatch(
      {
        fundName: 'Recovered Fund',
        fundSize: 75_000_000,
        managementFeeRate: 2,
        carriedInterest: 20,
        stages: [{ id: 'srv-stage', name: 'Series A', graduate: 40, exit: 15, months: 24 }],
        followOnChecks: { A: 100, B: 200, C: 300 },
      },
      hydrationDefaults
    );

    expect(patch.fundName).toBe('Recovered Fund');
    expect(patch.fundSize).toBe(75_000_000);
    expect(patch.stages).toEqual([
      { id: 'srv-stage', name: 'Series A', graduate: 40, exit: 15, months: 24 },
    ]);
    expect(patch.sectorProfiles).toEqual(hydrationDefaults.sectorProfiles);
    expect(patch.followOnChecks).toEqual({ A: 100, B: 200, C: 300 });
    expect(patch.waterfallType).toBe('american');
  });
});

describe('overlap invariant', () => {
  it('create and draft defined fields match after unit conversion', () => {
    const create = fundStoreToCreateV1(baseState);
    const draft = fundStoreToDraftWriteV1(baseState);

    // name <-> fundName
    expect(create.name).toBe(draft.fundName);
    // size <-> fundSize (both dollars)
    expect(create.size).toBe(draft.fundSize);
    // managementFee (decimal) <-> managementFeeRate (percent) / 100
    expect(create.managementFee).toBeCloseTo((draft.managementFeeRate ?? 0) / 100, 10);
    // carryPercentage (decimal) <-> carriedInterest (percent) / 100
    expect(create.carryPercentage).toBeCloseTo((draft.carriedInterest ?? 0) / 100, 10);
    // vintageYear matches
    expect(create.vintageYear).toBe(draft.vintageYear);
  });
});
