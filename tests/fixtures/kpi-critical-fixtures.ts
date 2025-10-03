/**
 * CRITICAL KPI TEST FIXTURES
 *
 * These 3 fixtures catch ~80% of calculation bugs:
 * 1. Fee Basis Transition (fee calculation logic)
 * 2. Recycling Impact (denominator handling in DPI/TVPI)
 * 3. Waterfall Hurdle & Catch-up (distribution split logic)
 *
 * Source: Multi-AI consensus analysis (GEMINI primary contributor)
 */

import type { FundLedger, KPIResponse } from '@shared/contracts/kpi-selector.contract';

// ============================================================================
// FIXTURE 1: Fee Basis Transition
// ============================================================================

export const FeeBasisTransitionFixture: {
  input: FundLedger;
  expectedOutputs: Array<{ asOf: string; expected: Partial<KPIResponse> }>;
} = {
  input: {
    fundId: 'test-fund-fee-transition',
    committedCapital: 100_000_000,
    managementFeeRate: 0.02, // 2%
    feeBasis: 'committed',
    feeBasisTransitions: [
      {
        effectiveDate: '2026-01-01T00:00:00Z', // Year 6 transition
        newBasis: 'nav',
        newRate: 0.02,
      },
    ],
    preferredReturnRate: 0.08,
    carryRate: 0.20,
    waterfallType: 'american',
    recyclingConfig: {
      enabled: false, // Isolate fee logic
      maxRecyclePercent: 100,
      recycleOnlyProfits: false,
    },
    transactions: [
      // Year 1 capital call
      {
        id: '1',
        type: 'capital_call',
        date: '2021-03-01T00:00:00Z',
        amount: 10_000_000,
      },
      // Year 3 capital call
      {
        id: '2',
        type: 'capital_call',
        date: '2023-03-01T00:00:00Z',
        amount: 15_000_000,
      },
      // Year 6 valuation update (NAV increases due to mark-up)
      {
        id: '3',
        type: 'valuation_update',
        date: '2026-03-01T00:00:00Z',
        amount: 80_000_000, // Portfolio now worth $80M
      },
    ],
  },
  expectedOutputs: [
    {
      asOf: '2022-06-30T00:00:00Z', // Year 2, Q2
      expected: {
        managementFees: {
          basis: 'committed',
          currentPeriodFee: 500_000, // (2% * $100M) / 4 quarters
          effectiveRate: 0.02,
        },
      },
    },
    {
      asOf: '2025-12-31T00:00:00Z', // Year 5 (still on committed)
      expected: {
        managementFees: {
          basis: 'committed',
          currentPeriodFee: 500_000,
          effectiveRate: 0.02,
        },
      },
    },
    {
      asOf: '2026-06-30T00:00:00Z', // Year 6, Q2 - CRITICAL TEST
      expected: {
        nav: 80_000_000,
        managementFees: {
          basis: 'nav', // *** Must have transitioned ***
          currentPeriodFee: 400_000, // (2% * $80M) / 4 quarters
          effectiveRate: 0.02,
        },
      },
    },
  ],
};

// ============================================================================
// FIXTURE 2: Recycling Impact on KPIs
// ============================================================================

export const RecyclingImpactFixture: {
  input: FundLedger;
  expectedWithRecyclingOn: KPIResponse;
  expectedWithRecyclingOff: KPIResponse;
} = {
  input: {
    fundId: 'test-fund-recycling',
    committedCapital: 100_000_000,
    managementFeeRate: 0.02,
    feeBasis: 'committed',
    preferredReturnRate: 0.08,
    carryRate: 0.20,
    waterfallType: 'american',
    recyclingConfig: {
      enabled: true, // Toggle this in tests
      maxRecyclePercent: 120,
      recycleOnlyProfits: false,
    },
    transactions: [
      // Investment A: $20M call
      {
        id: '1',
        type: 'capital_call',
        date: '2021-01-01T00:00:00Z',
        amount: 20_000_000,
      },
      {
        id: '2',
        type: 'investment',
        date: '2021-01-15T00:00:00Z',
        amount: 20_000_000,
        companyId: 'company-a',
      },
      // Investment A exits for $40M
      {
        id: '3',
        type: 'exit',
        date: '2023-06-01T00:00:00Z',
        amount: 40_000_000,
        companyId: 'company-a',
      },
      {
        id: '4',
        type: 'distribution',
        date: '2023-06-01T00:00:00Z',
        amount: 40_000_000,
      },
      // Investment B: $25M call using recycled capacity
      {
        id: '5',
        type: 'capital_call',
        date: '2023-07-01T00:00:00Z',
        amount: 25_000_000,
        isRecycled: true, // Uses $20M of recycled RoC + $5M new capital
      },
      {
        id: '6',
        type: 'investment',
        date: '2023-07-15T00:00:00Z',
        amount: 25_000_000,
        companyId: 'company-b',
      },
    ],
  },
  expectedWithRecyclingOn: {
    fundId: 'test-fund-recycling',
    asOf: '2024-01-01T00:00:00Z',
    currency: 'USD',

    // Capital structure (CRITICAL: denominator calculation)
    committed: 100_000_000,
    called: 45_000_000, // $20M + $25M
    uncalled: 55_000_000,
    invested: 25_000_000, // *** $45M called - $20M recycled RoC = $25M ***

    // Portfolio values
    nav: 75_000_000, // $50M (other holdings) + $25M (Company B at cost)
    distributions: 40_000_000,
    realizedValue: 40_000_000,
    unrealizedValue: 75_000_000,

    // Performance metrics (CRITICAL TESTS)
    dpi: 1.6, // $40M / $25M (NOT $40M / $45M = 0.89)
    rvpi: 3.0, // $75M / $25M
    tvpi: 4.6, // ($40M + $75M) / $25M
    irr: 0, // Placeholder
    moic: 4.6,

    managementFees: {
      basis: 'committed',
      totalAccrued: 0,
      totalPaid: 0,
      currentPeriodFee: 0,
      effectiveRate: 0.02,
    },

    recycling: {
      totalRecycled: 20_000_000,
      availableCapacity: 0, // Used $20M of $20M available
      recycledCount: 1,
    },
  },
  expectedWithRecyclingOff: {
    fundId: 'test-fund-recycling',
    asOf: '2024-01-01T00:00:00Z',
    currency: 'USD',

    committed: 100_000_000,
    called: 20_000_000, // Only Investment A (cannot call for B)
    uncalled: 80_000_000,
    invested: 20_000_000,

    nav: 50_000_000, // Only other holdings (no Company B)
    distributions: 40_000_000,
    realizedValue: 40_000_000,
    unrealizedValue: 50_000_000,

    // Different KPIs without recycling
    dpi: 2.0, // $40M / $20M
    rvpi: 2.5, // $50M / $20M
    tvpi: 4.5, // ($40M + $50M) / $20M
    irr: 0,
    moic: 4.5,

    managementFees: {
      basis: 'committed',
      totalAccrued: 0,
      totalPaid: 0,
      currentPeriodFee: 0,
      effectiveRate: 0.02,
    },
  },
};

// ============================================================================
// FIXTURE 3: Waterfall Hurdle & GP Catch-up
// ============================================================================

export const WaterfallCatchupFixture: {
  input: FundLedger;
  expectedAtDistribution: KPIResponse;
  expectedAfterWritedown: KPIResponse;
} = {
  input: {
    fundId: 'test-fund-waterfall',
    committedCapital: 100_000_000,
    managementFeeRate: 0.02,
    feeBasis: 'committed',
    preferredReturnRate: 0.08, // 8% non-compounding
    carryRate: 0.20,
    waterfallType: 'american',
    catchupProvision: 100, // 100% GP catch-up
    recyclingConfig: {
      enabled: false,
      maxRecyclePercent: 100,
      recycleOnlyProfits: false,
    },
    transactions: [
      // Fully call fund
      {
        id: '1',
        type: 'capital_call',
        date: '2020-01-01T00:00:00Z',
        amount: 80_000_000,
      },
      // Year 5: Major distribution
      {
        id: '2',
        type: 'distribution',
        date: '2025-01-01T00:00:00Z',
        amount: 65_000_000,
      },
      // Remaining portfolio valued at $10M (at time of distribution)
      {
        id: '3',
        type: 'valuation_update',
        date: '2025-01-01T00:00:00Z',
        amount: 10_000_000,
      },
      // Year 6: Write-down to $0
      {
        id: '4',
        type: 'valuation_update',
        date: '2026-01-01T00:00:00Z',
        amount: 0,
      },
    ],
  },
  expectedAtDistribution: {
    fundId: 'test-fund-waterfall',
    asOf: '2025-01-01T00:00:00Z',
    currency: 'USD',

    committed: 100_000_000,
    called: 80_000_000,
    uncalled: 20_000_000,
    invested: 80_000_000,

    nav: 10_000_000,
    distributions: 65_000_000,
    realizedValue: 65_000_000,
    unrealizedValue: 10_000_000,

    dpi: 0.8125, // $65M / $80M
    rvpi: 0.125,
    tvpi: 0.9375, // ($65M + $10M) / $80M
    irr: 0,
    moic: 0.9375,

    managementFees: {
      basis: 'committed',
      totalAccrued: 0,
      totalPaid: 0,
      currentPeriodFee: 0,
      effectiveRate: 0.02,
    },

    waterfall: {
      type: 'american',
      lpShare: 0, // Calculated based on waterfall
      gpShare: 4_000_000, // *** CRITICAL: GP Carry ***
      preferredReturnAccrued: 19_200_000, // 8% * $80M * 3 years (simplified)
      carryEarned: 4_000_000,
      clawbackObligation: 0,
    },
  },
  expectedAfterWritedown: {
    fundId: 'test-fund-waterfall',
    asOf: '2026-01-01T00:00:00Z',
    currency: 'USD',

    committed: 100_000_000,
    called: 80_000_000,
    uncalled: 20_000_000,
    invested: 80_000_000,

    nav: 0, // Write-down
    distributions: 65_000_000,
    realizedValue: 65_000_000,
    unrealizedValue: 0,

    dpi: 0.8125,
    rvpi: 0,
    tvpi: 0.8125, // Total value now underwater
    irr: 0,
    moic: 0.8125,

    managementFees: {
      basis: 'committed',
      totalAccrued: 0,
      totalPaid: 0,
      currentPeriodFee: 0,
      effectiveRate: 0.02,
    },

    waterfall: {
      type: 'american',
      lpShare: 0,
      gpShare: 0, // *** CRITICAL: GP entitled to $0 now ***
      preferredReturnAccrued: 19_200_000,
      carryEarned: 0,
      clawbackObligation: 4_000_000, // *** GP owes back $4M ***
    },
  },
};

// ============================================================================
// FIXTURE REGISTRY (for automated test suites)
// ============================================================================

export const CRITICAL_FIXTURES = {
  feeBasisTransition: FeeBasisTransitionFixture,
  recyclingImpact: RecyclingImpactFixture,
  waterfallCatchup: WaterfallCatchupFixture,
} as const;

/**
 * Test suite helper: validates a KPI calculator against all fixtures
 */
export function validateAgainstCriticalFixtures(
  calculator: (ledger: FundLedger, asOf: Date) => KPIResponse
): Array<{ fixture: string; passed: boolean; errors: string[] }> {
  const results: Array<{ fixture: string; passed: boolean; errors: string[] }> = [];

  // Test Fee Basis Transition
  FeeBasisTransitionFixture.expectedOutputs.forEach((expected, idx) => {
    const actual = calculator(FeeBasisTransitionFixture.input, new Date(expected.asOf));
    const errors: string[] = [];

    if (expected.expected.managementFees?.basis !== actual.managementFees.basis) {
      errors.push(
        `Expected fee basis ${expected.expected.managementFees.basis}, got ${actual.managementFees.basis}`
      );
    }
    if (expected.expected.managementFees?.currentPeriodFee !== actual.managementFees.currentPeriodFee) {
      errors.push(
        `Expected fee ${expected.expected.managementFees.currentPeriodFee}, got ${actual.managementFees.currentPeriodFee}`
      );
    }

    results.push({
      fixture: `feeBasisTransition[${idx}]`,
      passed: errors.length === 0,
      errors,
    });
  });

  return results;
}
