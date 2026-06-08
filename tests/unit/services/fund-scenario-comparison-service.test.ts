import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transactionMock, queryMock } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  queryMock: vi.fn(),
}));

vi.mock('../../../server/db/pg-circuit.js', () => ({
  transaction: transactionMock,
}));

import { getFundScenarioComparison } from '../../../server/services/fund-scenario-comparison-service';
import type { EconomicsResultV1 } from '../../../shared/contracts/economics-v1.contract';
import type { FundScenarioCalculationPayloadV1 } from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const scenarioSetId = '00000000-0000-0000-0000-000000000111';
const variantId = '00000000-0000-0000-0000-000000000112';

describe('fund scenario comparison service', () => {
  beforeEach(() => {
    queryMock.mockReset();
    transactionMock.mockImplementation(
      async (callback: (client: { query: typeof queryMock }) => unknown) =>
        callback({ query: queryMock })
    );
  });

  it('returns no_scenario_results when no SCENARIOS snapshot exists', async () => {
    mockScenarioSet('fee_profile');
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('no_scenario_results');
    expect(result.variants).toEqual([]);
  });

  it('returns baseline_unavailable when authoritative ECONOMICS is missing', async () => {
    mockScenarioSet('fee_profile');
    queryMock.mockResolvedValueOnce({ rows: [scenarioSnapshotRow()] });
    queryMock.mockResolvedValueOnce({ rows: [] });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('baseline_unavailable');
    expect(result.unavailableReason).toBe('BASELINE_ECONOMICS_SNAPSHOT_MISSING');
    expect(result.baseline).toBeNull();
  });

  it('returns unsupported_override_type for reserve-allocation scenario sets', async () => {
    mockScenarioSet('reserve_allocation');

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('unsupported_override_type');
    expect(result.unavailableReason).toBe('UNSUPPORTED_OVERRIDE_TYPE');
    expect(result.baseline).toBeNull();
    expect(result.variants).toEqual([]);
  });

  it('returns comparable for allocation scenario sets', async () => {
    mockScenarioSet('allocation');
    queryMock.mockResolvedValueOnce({ rows: [scenarioSnapshotRow('allocation')] });
    queryMock.mockResolvedValueOnce({ rows: [economicsSnapshotRow(baselineEconomics())] });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]?.overrideType).toBe('allocation');
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
  });

  it('returns comparable for sector_profile scenario sets', async () => {
    mockScenarioSet('sector_profile');
    queryMock.mockResolvedValueOnce({ rows: [scenarioSnapshotRow('sector_profile')] });
    queryMock.mockResolvedValueOnce({ rows: [economicsSnapshotRow(baselineEconomics())] });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]?.overrideType).toBe('sector_profile');
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
  });

  it('returns comparable for methodology scenario sets', async () => {
    mockScenarioSet('methodology');
    queryMock.mockResolvedValueOnce({ rows: [scenarioSnapshotRow('methodology')] });
    queryMock.mockResolvedValueOnce({ rows: [economicsSnapshotRow(baselineEconomics())] });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]?.overrideType).toBe('methodology');
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
    expect(result.variants[0]?.metricDeltas.find((d) => d.metric === 'finalTvpi')).toEqual(
      expect.objectContaining({
        baselineValue: 1.8,
        scenarioValue: 2.1,
        driftCapable: true,
        driftReason: 'stable',
      })
    );
  });

  it('returns unsupported_override_type when the snapshot payload contains reserve variants despite set being economics-typed', async () => {
    mockScenarioSet('methodology');
    // Snapshot payload claims reserve_allocation (corrupt/mismatched data)
    const corruptPayload: FundScenarioCalculationPayloadV1 = {
      version: 'fund-scenarios-v1',
      calculationMode: 'async_reserve_allocation',
      fundId: 123,
      scenarioSetId,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      staleness: { state: 'CURRENT', sourceConfigVersion: 4, currentPublishedConfigVersion: 4 },
      calculatedAt: '2026-05-26T12:30:00.000Z',
      variants: [
        {
          variantId,
          scenarioSetId,
          name: 'Follow-on cap',
          overrideType: 'reserve_allocation',
          reserve: {
            fundId: 123,
            totalBaseAllocationCents: 10_000_000,
            totalScenarioAllocationCents: 7_500_000,
            totalAllocationDeltaCents: -2_500_000,
            avgConfidence: 0.62,
            highConfidenceCount: 1,
            allocations: [],
            warnings: [],
            generatedAt: '2026-05-26T12:30:00.000Z',
          },
        },
      ],
    };
    queryMock.mockResolvedValueOnce({
      rows: [
        { id: 42, payload: corruptPayload, created_at: new Date(), snapshot_time: new Date() },
      ],
    });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('unsupported_override_type');
    expect(result.unavailableReason).toBe('UNSUPPORTED_OVERRIDE_TYPE');
  });

  it('builds comparable fee-profile variants against the authoritative economics baseline', async () => {
    mockScenarioSet('fee_profile');
    queryMock.mockResolvedValueOnce({ rows: [scenarioSnapshotRow()] });
    queryMock.mockResolvedValueOnce({ rows: [economicsSnapshotRow(baselineEconomics())] });

    const result = await getFundScenarioComparison(123, scenarioSetId);

    expect(result.comparisonStatus).toBe('comparable');
    expect(sqlForQueryContaining("type = 'SCENARIOS'")).toContain(
      'ORDER BY created_at DESC, id DESC'
    );
    const baselineSql = sqlForQueryContaining("type = 'ECONOMICS'");
    expect(baselineSql).toContain('scenario_set_id IS NULL');
    expect(baselineSql).toContain('ORDER BY created_at DESC, id DESC');
    expect(result.baseline?.metrics.finalTvpi).toBe(1.8);
    expect(result.variants[0]?.metrics.finalTvpi).toBe(2.1);
    expect(result.variants[0]?.metricDeltas.find((delta) => delta.metric === 'finalTvpi')).toEqual(
      expect.objectContaining({
        baselineValue: 1.8,
        scenarioValue: 2.1,
        absoluteDelta: 0.30000000000000004,
        driftCapable: true,
        driftReason: 'stable',
      })
    );
    expect(result.variants[0]?.metricDeltas.find((delta) => delta.metric === 'lpNetIrr')).toEqual(
      expect.objectContaining({
        baselineValue: 0,
        scenarioValue: 0.17,
        percentageDelta: null,
        driftCapable: false,
        driftReason: 'zero_baseline',
      })
    );
  });
});

function sqlForQueryContaining(fragment: string) {
  const call = queryMock.mock.calls.find(([sql]) => String(sql).includes(fragment));
  expect(call, `expected query containing ${fragment}`).toBeDefined();
  return String(call?.[0]);
}

function mockScenarioSet(
  overrideType:
    | 'fee_profile'
    | 'reserve_allocation'
    | 'allocation'
    | 'sector_profile'
    | 'methodology'
) {
  queryMock.mockResolvedValueOnce({ rows: [{ id: 123 }] });
  queryMock.mockResolvedValueOnce({
    rows: [
      {
        id: scenarioSetId,
        fund_id: 123,
        name: overrideType === 'fee_profile' ? 'Fee sensitivity' : `${overrideType} sensitivity`,
        description: null,
        source_config_id: 12,
        source_config_version: 4,
        created_by_user_id: 17,
        created_by_label: 'analyst@example.com',
        updated_by_user_id: 17,
        updated_by_label: 'analyst@example.com',
        archived_at: null,
        archived_by_user_id: null,
        archived_by_label: null,
        created_at: new Date('2026-05-26T12:00:00.000Z'),
        updated_at: new Date('2026-05-26T12:00:00.000Z'),
        variant_count: '1',
      },
    ],
  });
  queryMock.mockResolvedValueOnce({
    rows: [
      {
        id: variantId,
        scenario_set_id: scenarioSetId,
        name: overrideType === 'fee_profile' ? 'Lower fee' : `${overrideType} variant`,
        description: null,
        sort_order: 0,
        override_type: overrideType,
        override_payload: overridePayloadFor(overrideType),
        created_at: new Date('2026-05-26T12:00:00.000Z'),
        updated_at: new Date('2026-05-26T12:00:00.000Z'),
      },
    ],
  });
}

function overridePayloadFor(
  overrideType:
    | 'fee_profile'
    | 'reserve_allocation'
    | 'allocation'
    | 'sector_profile'
    | 'methodology'
) {
  if (overrideType === 'fee_profile') {
    return {
      feeProfiles: [
        {
          id: 'fee-profile-lower',
          name: 'Lower fee',
          feeTiers: [
            {
              id: 'tier-1',
              name: 'Management fee',
              percentage: 2,
              feeBasis: 'committed_capital',
              startMonth: 0,
            },
          ],
        },
      ],
    };
  }
  if (overrideType === 'reserve_allocation') {
    return { items: [{ companyId: 101, plannedReservesCents: 1_000_000 }] };
  }
  if (overrideType === 'allocation') {
    return { allocations: [{ id: 'seed', category: 'Seed', percentage: 60 }] };
  }
  if (overrideType === 'methodology') {
    return { waterfallType: 'hybrid' };
  }
  return { sectorProfiles: [{ id: 'ai', name: 'AI Infrastructure', targetPercentage: 35 }] };
}

function scenarioSnapshotRow(
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology' = 'fee_profile'
) {
  return {
    id: 42,
    payload: scenarioPayload(overrideType),
    created_at: new Date('2026-05-26T12:30:00.000Z'),
    snapshot_time: new Date('2026-05-26T12:30:00.000Z'),
  };
}

function economicsSnapshotRow(payload: EconomicsResultV1) {
  return {
    id: 24,
    payload,
    created_at: new Date('2026-05-26T12:10:00.000Z'),
    snapshot_time: new Date('2026-05-26T12:10:00.000Z'),
  };
}

function scenarioPayload(
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology' = 'fee_profile'
): FundScenarioCalculationPayloadV1 {
  return {
    version: 'fund-scenarios-v1',
    calculationMode: calculationModeFor(overrideType),
    fundId: 123,
    scenarioSetId,
    sourceConfigId: 12,
    sourceConfigVersion: 4,
    staleness: {
      state: 'CURRENT',
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 4,
    },
    calculatedAt: '2026-05-26T12:30:00.000Z',
    variants: [
      {
        variantId,
        scenarioSetId,
        name: overrideType === 'fee_profile' ? 'Lower fee' : `${overrideType} variant`,
        overrideType,
        economics: scenarioEconomics(),
      },
    ],
  };
}

function baselineEconomics(): EconomicsResultV1 {
  return economicsResult({
    lpNetIrr: 0,
    gpNetIrr: null,
    totalManagementFees: 2_000_000,
    totalGpCarryDistributed: 500_000,
    totalGpFeeIncome: 2_000_000,
    finalDpi: 0.6,
    finalTvpi: 1.8,
    finalClawbackDue: 0,
  });
}

function scenarioEconomics(): EconomicsResultV1 {
  return economicsResult({
    lpNetIrr: 0.17,
    gpNetIrr: null,
    totalManagementFees: 1_500_000,
    totalGpCarryDistributed: 500_000,
    totalGpFeeIncome: 1_500_000,
    finalDpi: 0.7,
    finalTvpi: 2.1,
    finalClawbackDue: 0,
  });
}

function economicsResult(summary: {
  lpNetIrr: number | null;
  gpNetIrr: number | null;
  totalManagementFees: number;
  totalGpCarryDistributed: number;
  totalGpFeeIncome: number;
  finalDpi: number;
  finalTvpi: number;
  finalClawbackDue: number;
}): EconomicsResultV1 {
  return {
    version: 'v1',
    annual: [
      {
        year: 1,
        lpCapitalCalls: 1,
        gpCommitmentCalls: 0,
        grossExitProceeds: 0,
        beginningCash: 0,
        investments: 0,
        feesPaidToManager: 1,
        expensesPaid: 0,
        recycledProceeds: 0,
        endingCash: 0,
        lpDistributions: 0,
        gpInvestmentDistributions: 0,
        gpCarryDistributed: 0,
        gpCarryEscrowed: 0,
        gpCarryReleasedFromEscrow: 0,
        clawbackPaid: 0,
        grossNav: 0,
        lpNetNav: 0,
        dpi: 0,
        rvpi: 0,
        tvpi: 0,
        conservationDelta: 0,
      },
    ],
    summary: {
      grossIrr: null,
      lpNetIrr: summary.lpNetIrr,
      gpNetIrr: summary.gpNetIrr,
      totalLpPaidIn: 1,
      totalGpCommitmentCalled: 0,
      totalManagementFees: summary.totalManagementFees,
      totalExpenses: 0,
      totalRecycled: 0,
      totalLpDistributions: 0,
      totalGpInvestmentDistributions: 0,
      totalGpCarryDistributed: summary.totalGpCarryDistributed,
      totalGpFeeIncome: summary.totalGpFeeIncome,
      finalDpi: summary.finalDpi,
      finalRvpi: 0,
      finalTvpi: summary.finalTvpi,
      finalClawbackDue: summary.finalClawbackDue,
      maxEscrowAvailable: 0,
      netGpCarryAfterClawback: 0,
    },
    checks: {
      passed: true,
      tolerance: 0.01,
      errors: [],
    },
  };
}

function calculationModeFor(
  overrideType: 'fee_profile' | 'allocation' | 'sector_profile' | 'methodology'
): 'sync_fee_profile' | 'sync_allocation' | 'sync_sector_profile' | 'sync_methodology' {
  switch (overrideType) {
    case 'fee_profile':
      return 'sync_fee_profile';
    case 'allocation':
      return 'sync_allocation';
    case 'sector_profile':
      return 'sync_sector_profile';
    case 'methodology':
      return 'sync_methodology';
  }
}
