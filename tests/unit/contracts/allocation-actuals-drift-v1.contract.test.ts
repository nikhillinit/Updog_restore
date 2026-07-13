import { describe, expect, it } from 'vitest';

import {
  AllocationCompanyActualsDriftV1Schema,
  AllocationDriftComparisonV1Schema,
} from '../../../shared/contracts/allocations/allocation-actuals-drift-v1.contract';

const SHA_256 = 'a'.repeat(64);

function comparison() {
  return {
    basis: 'deployed_reserves_vs_observed_follow_on' as const,
    state: 'exact' as const,
    planCents: '100000',
    actualCents: '100000',
    deltaCents: '0',
    relativeDelta: '0',
    material: false,
    subCentRemainder: null,
    unavailableReason: null,
  };
}

function drift() {
  return {
    contractVersion: 'allocation-actuals-drift-v1' as const,
    companyId: 11,
    asOfDate: '2026-07-11',
    allocationVersion: 4,
    lastAllocationAt: null,
    factsInputHash: SHA_256,
    trustState: 'LIVE' as const,
    planningFmvStatus: 'active' as const,
    currencyStatus: 'base_currency' as const,
    activeRoundIds: [101],
    supersedeLineage: [{ roundId: 101, supersedesRoundId: null }],
    comparisons: [
      comparison(),
      {
        ...comparison(),
        basis: 'legacy_invested_vs_observed_total' as const,
      },
    ],
    warnings: [],
  };
}

describe('AllocationDriftComparisonV1Schema', () => {
  it('accepts every comparison enum value', () => {
    for (const basis of [
      'deployed_reserves_vs_observed_follow_on',
      'legacy_invested_vs_observed_total',
    ] as const) {
      expect(AllocationDriftComparisonV1Schema.safeParse({ ...comparison(), basis }).success).toBe(
        true
      );
    }

    for (const state of ['exact', 'drifted', 'unavailable'] as const) {
      expect(AllocationDriftComparisonV1Schema.safeParse({ ...comparison(), state }).success).toBe(
        true
      );
    }

    for (const unavailableReason of [
      'currency_blocked',
      'facts_failed',
      'facts_missing',
    ] as const) {
      expect(
        AllocationDriftComparisonV1Schema.safeParse({ ...comparison(), unavailableReason }).success
      ).toBe(true);
    }
  });

  it('rejects unknown comparison fields', () => {
    expect(
      AllocationDriftComparisonV1Schema.safeParse({ ...comparison(), unexpected: true }).success
    ).toBe(false);
  });
});

describe('AllocationCompanyActualsDriftV1Schema', () => {
  it('accepts every company-level enum value', () => {
    for (const trustState of ['LIVE', 'PARTIAL', 'UNAVAILABLE', 'FAILED'] as const) {
      expect(
        AllocationCompanyActualsDriftV1Schema.safeParse({ ...drift(), trustState }).success
      ).toBe(true);
    }

    for (const planningFmvStatus of ['none', 'active', 'superseded', 'stale', 'blocked'] as const) {
      expect(
        AllocationCompanyActualsDriftV1Schema.safeParse({ ...drift(), planningFmvStatus }).success
      ).toBe(true);
    }

    for (const currencyStatus of ['base_currency', 'mismatch_blocked', 'unknown'] as const) {
      expect(
        AllocationCompanyActualsDriftV1Schema.safeParse({ ...drift(), currencyStatus }).success
      ).toBe(true);
    }
  });

  it('rejects unknown company fields and comparison counts other than two', () => {
    expect(
      AllocationCompanyActualsDriftV1Schema.safeParse({ ...drift(), unexpected: true }).success
    ).toBe(false);
    expect(
      AllocationCompanyActualsDriftV1Schema.safeParse({
        ...drift(),
        comparisons: [comparison()],
      }).success
    ).toBe(false);
  });
});
