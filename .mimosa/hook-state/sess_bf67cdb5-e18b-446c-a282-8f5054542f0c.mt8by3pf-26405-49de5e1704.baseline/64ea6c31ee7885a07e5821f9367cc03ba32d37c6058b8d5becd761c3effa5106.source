import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildAllocationActualsDrift,
  type AllocationPlanRow,
} from '../../../../server/services/allocations/allocation-actuals-drift-service';
import type { FundCompanyActualsFact } from '../../../../shared/contracts/fund-actuals/fund-company-actuals-fact.contract';

const INPUT_HASH = 'a'.repeat(64);
const ASSUMPTIONS_HASH = 'b'.repeat(64);

function allocation(overrides: Partial<AllocationPlanRow> = {}): AllocationPlanRow {
  return {
    companyId: 11,
    deployedReservesCents: 600_000,
    investmentAmount: '10000.00',
    allocationVersion: 4,
    lastAllocationAt: null,
    ...overrides,
  };
}

function fact(overrides: Partial<FundCompanyActualsFact> = {}): FundCompanyActualsFact {
  return {
    fundId: 1,
    companyId: 11,
    companyName: 'Alpha AI',
    investmentIds: [21],
    activeRoundIds: [31],
    approvedPlanningFmvMarkId: 41,
    planningFmvStatus: 'active',
    initialInvestmentAmount: '4000.000000',
    followOnInvestmentAmount: '6000.000000',
    amountOnlyNonEquityAmount: '0.000000',
    latestRoundDate: '2026-07-01',
    latestRoundValuation: '20000000.000000',
    latestPlanningFmvDate: '2026-07-01',
    latestPlanningFmvValue: '21000000.000000',
    currency: 'USD',
    currencyStatus: 'base_currency',
    supersedeLineage: [{ roundId: 31, supersedesRoundId: null }],
    warnings: [],
    provenance: {
      trustState: 'LIVE',
      core: {
        sourceKind: 'computed',
        actionability: 'actionable',
        sourceEngine: 'rounds-to-model',
        engineVersion: 'rounds-to-model-v1',
        inputHash: INPUT_HASH,
        assumptionsHash: ASSUMPTIONS_HASH,
        generatedAt: '2026-07-11T00:00:00.000Z',
        isFinanciallyActionable: true,
        warnings: [],
      },
      structuredWarnings: [],
    },
    inputHash: INPUT_HASH,
    ...overrides,
  };
}

function build(
  allocationOverrides: Partial<AllocationPlanRow> = {},
  factOverrides: Partial<FundCompanyActualsFact> = {}
) {
  return buildAllocationActualsDrift({
    allocation: allocation(allocationOverrides),
    fact: fact(factOverrides),
    asOfDate: '2026-07-11',
  });
}

describe('buildAllocationActualsDrift', () => {
  it('emits exact comparisons when both actual totals match the plan cents', () => {
    const result = build();

    expect(result.comparisons).toEqual([
      {
        basis: 'deployed_reserves_vs_observed_follow_on',
        state: 'exact',
        planCents: '600000',
        actualCents: '600000',
        deltaCents: '0',
        relativeDelta: '0',
        material: false,
        subCentRemainder: null,
        unavailableReason: null,
      },
      {
        basis: 'legacy_invested_vs_observed_total',
        state: 'exact',
        planCents: '1000000',
        actualCents: '1000000',
        deltaCents: '0',
        relativeDelta: '0',
        material: false,
        subCentRemainder: null,
        unavailableReason: null,
      },
    ]);
  });

  it('truncates actuals to cents and discloses the fractional-cent remainder', () => {
    const result = build(
      { deployedReservesCents: 100_000, investmentAmount: '1000.00' },
      {
        initialInvestmentAmount: '0.000000',
        followOnInvestmentAmount: '1000.001234',
      }
    );

    expect(result.comparisons[0]).toMatchObject({
      actualCents: '100000',
      deltaCents: '0',
      state: 'exact',
      subCentRemainder: '0.1234',
    });
    expect(result.comparisons[1]).toMatchObject({
      actualCents: '100000',
      subCentRemainder: '0.1234',
    });
  });

  it('returns null relative delta when the plan side is zero', () => {
    const result = build(
      { deployedReservesCents: 0, investmentAmount: '0' },
      {
        initialInvestmentAmount: '0.000000',
        followOnInvestmentAmount: '1.000000',
      }
    );

    expect(result.comparisons[0]).toMatchObject({
      deltaCents: '100',
      relativeDelta: null,
      state: 'drifted',
    });
  });

  it('treats exactly 100,000 cents as material and 99,999 cents as immaterial', () => {
    const atBoundary = build(
      { deployedReservesCents: 10_000_000 },
      { followOnInvestmentAmount: '101000.00' }
    );
    const belowBoundary = build(
      { deployedReservesCents: 10_000_000 },
      { followOnInvestmentAmount: '100999.99' }
    );

    expect(atBoundary.comparisons[0]).toMatchObject({ deltaCents: '100000', material: true });
    expect(belowBoundary.comparisons[0]).toMatchObject({ deltaCents: '99999', material: false });
  });

  it('uses the greater of the absolute floor and one percent of plan value', () => {
    const atRelativeBoundary = build(
      { deployedReservesCents: 20_000_000 },
      { followOnInvestmentAmount: '202000.00' }
    );
    const belowRelativeBoundary = build(
      { deployedReservesCents: 20_000_000 },
      { followOnInvestmentAmount: '201999.99' }
    );
    const belowAbsoluteFloor = build(
      { deployedReservesCents: 5_000_000 },
      { followOnInvestmentAmount: '50500.00' }
    );

    expect(atRelativeBoundary.comparisons[0]).toMatchObject({
      deltaCents: '200000',
      material: true,
    });
    expect(belowRelativeBoundary.comparisons[0]).toMatchObject({
      deltaCents: '199999',
      material: false,
    });
    expect(belowAbsoluteFloor.comparisons[0]).toMatchObject({
      deltaCents: '50000',
      material: false,
    });
  });

  it('marks currency-blocked money unavailable rather than zero', () => {
    const baseFact = fact();
    const result = buildAllocationActualsDrift({
      allocation: allocation(),
      fact: {
        ...baseFact,
        currencyStatus: 'mismatch_blocked',
        provenance: { ...baseFact.provenance, trustState: 'UNAVAILABLE' },
      },
      asOfDate: '2026-07-11',
    });

    expect(result.trustState).toBe('UNAVAILABLE');
    for (const comparison of result.comparisons) {
      expect(comparison).toMatchObject({
        state: 'unavailable',
        actualCents: null,
        deltaCents: null,
        relativeDelta: null,
        material: false,
        subCentRemainder: null,
        unavailableReason: 'currency_blocked',
      });
    }
  });

  it('marks a missing fact unavailable', () => {
    const result = buildAllocationActualsDrift({
      allocation: allocation(),
      fact: null,
      asOfDate: '2026-07-11',
    });

    expect(result).toMatchObject({
      factsInputHash: null,
      trustState: 'UNAVAILABLE',
      planningFmvStatus: 'none',
      currencyStatus: 'unknown',
      activeRoundIds: [],
      supersedeLineage: [],
      warnings: [],
    });
    expect(result.comparisons.every((item) => item.unavailableReason === 'facts_missing')).toBe(
      true
    );
  });

  it('passes the accepted plan truth case', () => {
    expect(
      buildAllocationActualsDrift({
        allocation: {
          companyId: 11,
          deployedReservesCents: 1_000_000,
          investmentAmount: '15000.00',
          allocationVersion: 4,
          lastAllocationAt: null,
        },
        fact: fact({
          initialInvestmentAmount: '10000.00',
          followOnInvestmentAmount: '12000.00',
        }),
        asOfDate: '2026-07-11',
      })
    ).toMatchObject({
      comparisons: [
        {
          basis: 'deployed_reserves_vs_observed_follow_on',
          planCents: '1000000',
          actualCents: '1200000',
          deltaCents: '200000',
          material: true,
        },
        {
          basis: 'legacy_invested_vs_observed_total',
          planCents: '1500000',
          actualCents: '2200000',
          deltaCents: '700000',
          material: true,
        },
      ],
    });
  });

  it('uses Decimal.js without route, database, React, or raw facts-table imports', async () => {
    const { readFileSync } = await vi.importActual<typeof import('node:fs')>('node:fs');
    const source = readFileSync(
      join(process.cwd(), 'server/services/allocations/allocation-actuals-drift-service.ts'),
      'utf8'
    );

    expect(source).toContain('decimal-config');
    expect(source).not.toContain("from 'decimal.js'");
    expect(source).not.toMatch(/parseFloat|Math\./);
    expect(source).not.toMatch(/server\/db|express|react/i);
    expect(source).not.toMatch(/investmentRounds|valuationMarks|investment_rounds|valuation_marks/);
  });
});
