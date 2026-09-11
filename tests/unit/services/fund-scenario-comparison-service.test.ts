import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import historicalCapital from '../../fixtures/capital-planning/completed-interpretation-1.0.0.json';
import * as capitalComparisonContract from '../../../shared/contracts/fund-scenario-comparison-v1.contract';
import * as capitalCalculator from '../../../shared/lib/capital-planning/capital-planning-v1';
import * as capitalMaterializer from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';
import { CAPITAL_BENCHMARK_CATALOG_VERSION } from '../../../shared/lib/capital-planning/benchmark-presets';
import { CapitalPlanningDraftV1Schema } from '../../../shared/contracts/capital-planning-v1.contract';

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
    'fee_profile' | 'reserve_allocation' | 'allocation' | 'sector_profile' | 'methodology'
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
    'fee_profile' | 'reserve_allocation' | 'allocation' | 'sector_profile' | 'methodology'
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

describe('B7 persisted capital comparison reader', () => {
  let saved: typeof historicalCapital;
  let liveSource: typeof historicalCapital.rawSource | null;

  beforeEach(() => {
    saved = structuredClone(historicalCapital);
    liveSource = structuredClone(saved.rawSource);
    queryMock.mockReset();
    transactionMock.mockImplementation(
      async (run: (client: { query: typeof queryMock }) => unknown) => run({ query: queryMock })
    );
    queryMock.mockImplementation(async (sqlValue: unknown) => {
      const sql = String(sqlValue);
      if (/\b(INSERT|UPDATE|DELETE|TRUNCATE)\b/.test(sql))
        throw new Error('Capital read attempted a write');
      if (/type\s*=\s*'ECONOMICS'/.test(sql))
        throw new Error('Capital read attempted authoritative baseline selection');
      if (sql.includes('FROM funds f'))
        return {
          rows: liveSource
            ? [
                {
                  fund_id: 101,
                  size: liveSource.fund.size,
                  base_currency: liveSource.fund.baseCurrency,
                  id: liveSource.config.id,
                  version: liveSource.config.version,
                  config: liveSource.config.raw,
                  published_at: liveSource.config.publishedAt,
                },
              ]
            : [],
        };
      if (sql.includes('FROM funds')) return { rows: [{ id: 101 }] };
      if (sql.includes('FROM fund_scenario_sets')) return { rows: [saved.scenarioSet] };
      if (sql.includes('FROM fund_scenario_variants')) return { rows: saved.variants };
      if (sql.includes('FROM fund_snapshots')) return { rows: [saved.snapshot] };
      throw new Error(`Unexpected capital comparison query: ${sql}`);
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports exact simultaneous saved input changes with immutable historical memos and no financial producer', async () => {
    const calculate = vi.spyOn(capitalCalculator, 'calculateCapitalPlanningV1');
    const materialize = vi.spyOn(capitalMaterializer, 'materializeCapitalSource');
    const verify = vi.spyOn(capitalMaterializer, 'verifyPinnedCapitalSourceBundle');
    const before = JSON.stringify(saved);
    const result = await getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1');
    expect(
      capitalComparisonContract.FundScenarioCapitalComparisonV1Schema.safeParse(result).success
    ).toBe(true);
    expect(result.comparisonStatus).toBe('comparable');
    expect(result.variants[0]!.changedInputs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'input.allocations[0].initialCheckUsd',
          baseline: '1.000000',
          variant: '2.000000',
        }),
        expect.objectContaining({
          path: 'input.allocations[0].deploymentPeriodYears',
          baseline: 1,
          variant: 2,
        }),
        expect.objectContaining({
          path: 'input.allocations[0].plannedCompanyCount',
          baseline: null,
          variant: 30,
        }),
        expect.objectContaining({
          path: 'input.netInvestableCapitalUsd',
          baseline: null,
          variant: '80.000000',
          group: 'budget_gp_deemed',
        }),
      ])
    );
    expect(JSON.stringify(result.baseline!.result)).toBe(
      JSON.stringify(saved.snapshot.payload.variants[0]!.result)
    );
    expect(JSON.stringify(result.variants[0]!.memo.result)).toBe(
      JSON.stringify(saved.snapshot.payload.variants[1]!.result)
    );
    expect(JSON.stringify(saved)).toBe(before);
    expect(JSON.stringify(result.variants[0]!.changedInputs)).not.toMatch(/causal|attribution/);
    expect(calculate).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(queryMock.mock.calls.some(([sql]) => String(sql).includes("type = 'ECONOMICS'"))).toBe(
      false
    );
  });

  it('preserves bracketed benchmark and provenance change paths from actual saved current snapshots', async () => {
    const raw = makeCapitalRawConfig();
    raw.investmentPeriod = 2;
    const rawSource = { fund: saved.rawSource.fund, config: { ...saved.rawSource.config, raw } };
    const drafts = ['5000000.000000', '6000000.000000'].map((totalPrimaryRoundUsd) =>
      CapitalPlanningDraftV1Schema.parse({
        input: makeCapitalInput(),
        benchmarkSelections: [
          {
            target: { allocationId: 'a1', kind: 'entry' },
            selector: { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' },
            overrides: { totalPrimaryRoundUsd },
          },
        ],
      })
    );
    const materialized = capitalMaterializer.materializeCapitalSource({
      source: rawSource,
      inputs: drafts,
      unitDeclarations: makeCapitalDeclarations(),
    });
    if (!materialized.ok) throw new Error(JSON.stringify(materialized));
    const results = drafts.map((_, index) =>
      capitalCalculator.calculateCapitalPlanningV1({
        input: materialized.resolvedInputs![index]!,
        sourceBundle: materialized.sourceBundle,
        benchmarkSnapshots: materialized.benchmarkSnapshotsByInput![index]!,
      })
    );
    saved.variants.forEach((variant, index) => {
      variant.override_payload = {
        input: materialized.resolvedInputs![index]!,
        sourceBundle: materialized.sourceBundle,
        sourceBundleHash: materialized.sourceBundle.sourceBundleHash,
        benchmarkSnapshots: materialized.benchmarkSnapshotsByInput![index]!,
      } as unknown as typeof variant.override_payload;
    });
    saved.snapshot.payload = {
      ...saved.snapshot.payload,
      interpretationVersion: materialized.sourceBundle.interpretationVersion,
      sourceBundleHash: materialized.sourceBundle.sourceBundleHash,
      variants: saved.snapshot.payload.variants.map((variant, index) => ({
        ...variant,
        result: results[index]!,
      })),
    } as unknown as typeof saved.snapshot.payload;
    liveSource = rawSource as typeof saved.rawSource;
    const calculate = vi.spyOn(capitalCalculator, 'calculateCapitalPlanningV1');
    const materialize = vi.spyOn(capitalMaterializer, 'materializeCapitalSource');
    const result = await getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1');
    expect(
      capitalComparisonContract.FundScenarioCapitalComparisonV1Schema.safeParse(result).success
    ).toBe(true);
    const changes = result.variants[0]!.changedInputs;
    expect(changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: 'input.allocations[0].entryFinancing.totalPrimaryRoundUsd',
          baseline: '5000000.000000',
          variant: '6000000.000000',
          group: 'valuation_round_size',
        }),
        expect.objectContaining({
          path: 'benchmarkSnapshots[0].overrides.totalPrimaryRoundUsd',
          baseline: '5000000.000000',
          variant: '6000000.000000',
          group: 'provenance',
        }),
      ])
    );
    expect(
      changes.some(
        (change) => /^provenance\[\d+\]/.test(change.path) && change.group === 'provenance'
      )
    ).toBe(true);
    expect(changes.every((change) => !/\.\d+(?:\.|$)/.test(change.path))).toBe(true);
    expect(calculate).not.toHaveBeenCalled();
    expect(materialize).not.toHaveBeenCalled();
  });

  it('routes every present numeric comparison delta through the actual B5 exact helper', async () => {
    const exact = vi.spyOn(capitalComparisonContract, 'calculateCapitalComparisonDeltaV1');
    const result = await getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1');
    const present = result.variants[0]!.metricDeltas.filter(
      (d) => d.baselineValue !== null && d.variantValue !== null
    );
    expect(present.length).toBeGreaterThan(0);
    expect(exact).toHaveBeenCalledTimes(present.length);
    for (const metric of present)
      expect(exact).toHaveBeenCalledWith({
        baselineValue: metric.baselineValue,
        variantValue: metric.variantValue,
        scale: metric.metric.endsWith('Usd') ? 6 : 12,
      });
  });

  it.each([
    ['0.000001', '0.000002', '0.000001', '100.000000000000'],
    ['0.000002', '0.000001', '-0.000001', '-50.000000000000'],
    ['-0.000001', '0.000001', '0.000002', '200.000000000000'],
    ['0.000001', '0.000001', '0.000000', '0.000000000000'],
    ['0.000000', '0.000001', '0.000001', null],
    ['0.000001', '1000000.000000', '999999.999999', '99999999999900.000000000000'],
  ] as const)(
    'preserves saved signed values %s -> %s with independent exact delta %s',
    async (baseline, variant, absoluteDelta, percentageDelta) => {
      // Admitted persisted numeric strings, not a request to recompute historical economics.
      saved.snapshot.payload.variants[0]!.result.construction.reconciliation[0]!.signedLifetimeHeadroomUsd =
        baseline;
      saved.snapshot.payload.variants[1]!.result.construction.reconciliation[0]!.signedLifetimeHeadroomUsd =
        variant;
      const result = await getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1');
      const metric = result.variants[0]!.metricDeltas.find(
        (d) => d.metric === 'signedLifetimeHeadroomUsd' && d.countBasis === 'expected'
      );
      expect(metric).toMatchObject({
        baselineValue: baseline,
        variantValue: variant,
        absoluteDelta,
        percentageDelta,
        unavailableReason: percentageDelta === null ? 'ZERO_BASELINE' : null,
      });
    }
  );

  it('preserves unavailable entered and omitted companion operands instead of substituting expected counts or zero', async () => {
    const result = await getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1');
    const metrics = result.variants[0]!.metricDeltas;
    expect(
      metrics.find((d) => d.metric === 'initialDemandUsd' && d.countBasis === 'entered')
    ).toMatchObject({
      baselineValue: null,
      variantValue: '60.000000',
      absoluteDelta: null,
      percentageDelta: null,
      unavailableReason: 'NOT_ENTERED',
    });
    expect(
      metrics.find((d) => d.metric === 'initialDemandUsd' && d.countBasis === 'expected')
    ).toMatchObject({
      baselineValue: '90.000000',
      variantValue: '80.000000',
      absoluteDelta: '-10.000000',
      percentageDelta: '-11.111111111111',
    });
    expect(
      metrics
        .filter((d) => d.group === 'companion')
        .every(
          (d) =>
            d.baselineValue === null &&
            d.variantValue === null &&
            d.absoluteDelta === null &&
            d.unavailableReason === 'COMPANION_OMITTED'
        )
    ).toBe(true);
  });

  it('keeps historical comparison readable without a current source', async () => {
    liveSource = null;
    const result = await getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1');
    expect(result.baseline!.readState.sourceFreshness).toBe('STALE_SOURCE_UNAVAILABLE');
    expect(result.baseline!.readState.interpretationCompatibility.state).toBe(
      'UNSUPPORTED_SAVED_VERSION'
    );
  });

  it('refuses comparison for mismatched saved snapshot identity', async () => {
    saved.snapshot.state_hash = '0'.repeat(64);
    await expect(
      getFundScenarioComparison(101, saved.scenarioSet.id, 'capital-plan-v1')
    ).rejects.toMatchObject({ statusCode: 500, code: 'scenario_saved_data_invalid' });
  });
});
