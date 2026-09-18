import { describe, expect, it } from 'vitest';
import {
  CAPITAL_PLANNING_VERSION,
  CAPITAL_PREIMAGE_VERSION,
  CAPITAL_SOURCE_INTERPRETATION_VERSION,
  CapitalPlanningDraftV1Schema,
  type CapitalPlanningInputV1,
} from '../../../shared/contracts/capital-planning-v1.contract';
import {
  CAPITAL_BENCHMARK_CATALOG_VERSION,
  resolveCapitalPlanningDraftV1,
} from '../../../shared/lib/capital-planning/benchmark-presets';
import { calculateCapitalPlanningV1 } from '../../../shared/lib/capital-planning/capital-planning-v1';
import { materializeCapitalSource } from '../../../shared/lib/capital-planning/materialize-from-fund-draft';
import {
  makeCapitalDeclarations,
  makeCapitalInput,
  makeCapitalRawConfig,
} from '../../fixtures/capital-planning/fixtures';

import {
  CreateReserveOptimizationScenarioSetV1Schema,
  CreateFundScenarioSetV1Schema,
  FundScenariosSectionReasonCodeV1Schema,
  FundScenarioCalculationResponseV1Schema,
  FundScenarioCalculationStatusV1Schema,
  FundScenarioReserveCalculationQueuedV1Schema,
  FundScenarioSetDetailV1Schema,
  FundScenarioVariantOverrideV1Schema,
  ScenarioReserveSummaryV1Schema,
  ScenarioSetResultSummaryV1Schema,
  ScenariosSectionPayloadV1Schema,
  CreateFundScenarioSetV2Schema,
  CreateFundScenarioSetV3Schema,
  FundScenarioCapitalRequestInputV1Schema,
  FundScenarioCapitalOverrideV1Schema,
  FundScenarioCapitalStoredOverrideV1Schema,
  FundScenarioCapitalSourceResponseV1Schema,
  FundScenarioCapitalArchiveResponseV1Schema,
  FundScenarioCapitalListResponseV1Schema,
  FundScenarioCapitalDetailResponseV1Schema,
  CapitalScenarioLineageV1Schema,
  FundScenarioCapitalCalculationPayloadV1Schema,
  FundScenarioCapitalCreateResponseV1Schema,
  FundScenarioCapitalCalculateResponseV1Schema,
  FundScenarioCapitalResultsResponseV1Schema,
} from '../../../shared/contracts/fund-scenario-sets-v1.contract';

const feeProfileOverride = {
  overrideType: 'fee_profile',
  payload: {
    feeProfiles: [
      {
        id: 'fee-profile-upside',
        name: 'Upside fees',
        feeTiers: [
          {
            id: 'tier-1',
            name: 'Management fee',
            percentage: 2,
            feeBasis: 'committed_capital',
            startMonth: 0,
            endMonth: 120,
            recyclingPercentage: 25,
          },
        ],
      },
    ],
  },
} as const;

describe('FundScenarioSetsV1 contract', () => {
  it('accepts a fee-profile-only scenario set create payload', () => {
    const result = CreateFundScenarioSetV1Schema.safeParse({
      name: 'Fee sensitivity',
      description: 'Compare alternate management fee profile',
      variants: [
        {
          name: 'Lower fee',
          description: '1.5 and 20 profile',
          override: feeProfileOverride,
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.variants[0]?.override.overrideType).toBe('fee_profile');
  });

  it('accepts allocation overrides for strategy and capital-plan allocations', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'allocation',
      payload: {
        allocations: [{ id: 'seed-stage', category: 'Seed', percentage: 60 }],
        capitalPlanAllocations: [
          {
            id: 'seed-plan',
            name: 'Seed plan',
            entryRound: 'Seed',
            capitalAllocationPct: 60,
            initialCheckStrategy: 'amount',
            initialCheckAmount: 1_000_000,
            followOnStrategy: 'amount',
            followOnAmount: 500_000,
            followOnParticipationPct: 25,
            investmentHorizonMonths: 48,
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.overrideType).toBe('allocation');
  });

  it('accepts sector-profile overrides', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'sector_profile',
      payload: {
        sectorProfiles: [
          {
            id: 'ai-infra',
            name: 'AI Infrastructure',
            targetPercentage: 35,
            description: 'Infrastructure software and tooling',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.overrideType).toBe('sector_profile');
  });

  it('accepts reserve-allocation overrides with hard caps lower than planned reserves', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'reserve_allocation',
      payload: {
        allocationVersion: 4,
        items: [
          {
            companyId: 101,
            plannedReservesCents: 10_000_000,
            maxAllocationCents: 7_500_000,
            allocationReason: 'Cap the follow-on reserve for concentration control',
          },
        ],
      },
    });

    expect(result.success).toBe(true);
    expect(result.data?.overrideType).toBe('reserve_allocation');
  });

  it('rejects methodology-changing fields in scenario override payloads', () => {
    const forbiddenPayloads = [
      {
        label: 'fee-profile waterfall override',
        override: {
          overrideType: 'fee_profile',
          payload: {
            ...feeProfileOverride.payload,
            waterfallType: 'hybrid',
          },
        },
      },
      {
        label: 'allocation economics assumptions override',
        override: {
          overrideType: 'allocation',
          payload: {
            allocations: [{ id: 'seed-stage', category: 'Seed', percentage: 60 }],
            economicsAssumptions: {
              feeModel: { source: 'inline_methodology' },
            },
          },
        },
      },
      {
        label: 'sector profile fund size override',
        override: {
          overrideType: 'sector_profile',
          payload: {
            sectorProfiles: [
              {
                id: 'ai-infra',
                name: 'AI Infrastructure',
                targetPercentage: 35,
              },
            ],
            fundSize: 100_000_000,
          },
        },
      },
      {
        label: 'reserve forecast mode override',
        override: {
          overrideType: 'reserve_allocation',
          payload: {
            allocationVersion: 1,
            items: [{ companyId: 101, plannedReservesCents: 10_000_000 }],
            forecastMode: 'actuals',
          },
        },
      },
    ];

    for (const { label, override } of forbiddenPayloads) {
      const result = FundScenarioVariantOverrideV1Schema.safeParse(override);

      expect(result.success, label).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0]?.message).toContain('Unrecognized key');
      }
    }
  });

  it('accepts strict reserve optimization scenario create options', () => {
    const result = CreateReserveOptimizationScenarioSetV1Schema.safeParse({
      name: 'Optimized reserve plan',
      description: 'Created from current reserve recommendations',
      variantName: 'Recommended follow-on allocation',
    });

    expect(result.success).toBe(true);
    expect(result.data?.name).toBe('Optimized reserve plan');
  });

  it('rejects unknown reserve optimization scenario create options', () => {
    const result = CreateReserveOptimizationScenarioSetV1Schema.safeParse({
      name: 'Optimized reserve plan',
      unexpected: true,
    });

    expect(result.success).toBe(false);
  });

  it('continues to reject unknown override types', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'waterfall',
      payload: {
        items: [],
      },
    });

    expect(result.success).toBe(false);
  });

  it('rejects mixed override types in one scenario set', () => {
    const result = CreateFundScenarioSetV1Schema.safeParse({
      name: 'Mixed scenarios',
      variants: [
        {
          name: 'Fee variant',
          override: feeProfileOverride,
        },
        {
          name: 'Reserve variant',
          override: {
            overrideType: 'reserve_allocation',
            payload: {
              items: [{ companyId: 101, plannedReservesCents: 5_000_000 }],
            },
          },
        },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('same overrideType');
  });

  it('caps first-slice scenario sets at five variants', () => {
    const variants = Array.from({ length: 6 }, (_, index) => ({
      name: `Variant ${index + 1}`,
      override: feeProfileOverride,
    }));

    const result = CreateFundScenarioSetV1Schema.safeParse({
      name: 'Too many variants',
      variants,
    });

    expect(result.success).toBe(false);
  });

  it('describes persisted set details with source config and archive attribution', () => {
    const result = FundScenarioSetDetailV1Schema.safeParse({
      id: '00000000-0000-0000-0000-000000000111',
      fundId: 1,
      name: 'Fee sensitivity',
      description: null,
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      variantCount: 1,
      archivedAt: null,
      archivedByUserId: null,
      archivedByLabel: null,
      createdByUserId: 17,
      createdByLabel: 'analyst@example.com',
      updatedByUserId: 17,
      updatedByLabel: 'analyst@example.com',
      createdAt: '2026-05-26T12:00:00.000Z',
      updatedAt: '2026-05-26T12:00:00.000Z',
      variants: [
        {
          id: '00000000-0000-0000-0000-000000000112',
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          name: 'Lower fee',
          description: null,
          sortOrder: 0,
          override: feeProfileOverride,
          createdAt: '2026-05-26T12:00:00.000Z',
          updatedAt: '2026-05-26T12:00:00.000Z',
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it('describes persisted sync fee-profile calculation results', () => {
    const result = FundScenarioCalculationResponseV1Schema.safeParse({
      snapshotId: 42,
      correlationId: '00000000-0000-0000-0000-000000000123',
      source: 'fund_snapshots',
      payload: {
        version: 'fund-scenarios-v1',
        calculationMode: 'sync_fee_profile',
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
        staleness: {
          state: 'CURRENT',
          sourceConfigVersion: 4,
          currentPublishedConfigVersion: 4,
        },
        calculatedAt: '2026-05-26T12:00:00.000Z',
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000112',
            scenarioSetId: '00000000-0000-0000-0000-000000000111',
            name: 'Lower fee',
            overrideType: 'fee_profile',
            economics: {
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
                lpNetIrr: null,
                gpNetIrr: null,
                totalLpPaidIn: 1,
                totalGpCommitmentCalled: 0,
                totalManagementFees: 1,
                totalExpenses: 0,
                totalRecycled: 0,
                totalLpDistributions: 0,
                totalGpInvestmentDistributions: 0,
                totalGpCarryDistributed: 0,
                totalGpFeeIncome: 1,
                finalDpi: 0,
                finalRvpi: 0,
                finalTvpi: 0,
                finalClawbackDue: 0,
                maxEscrowAvailable: 0,
                netGpCarryAfterClawback: 0,
              },
              checks: {
                passed: true,
                tolerance: 0.01,
                errors: [],
              },
            },
          },
        ],
      },
    });

    expect(result.success).toBe(true);
  });

  it('describes async reserve calculation queued and status responses', () => {
    expect(
      FundScenarioReserveCalculationQueuedV1Schema.safeParse({
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        calculationMode: 'async_reserve_allocation',
        status: 'queued',
        jobId: 'reserve-job-1',
        correlationId: '00000000-0000-0000-0000-000000000123',
      }).success
    ).toBe(true);

    expect(
      FundScenarioCalculationStatusV1Schema.safeParse({
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        calculationMode: 'async_reserve_allocation',
        status: 'failed',
        jobId: 'reserve-job-1',
        correlationId: '00000000-0000-0000-0000-000000000123',
        snapshotId: null,
        lastEventAt: '2026-05-26T12:00:00.000Z',
        lastError: 'Reserve scenario calculation failed',
      }).success
    ).toBe(true);
  });

  it('describes reserve scenario summaries in cents with cap evidence', () => {
    const result = ScenarioReserveSummaryV1Schema.safeParse({
      fundId: 1,
      totalBaseAllocationCents: 11_000_000,
      totalScenarioAllocationCents: 9_500_000,
      totalAllocationDeltaCents: -1_500_000,
      avgConfidence: 0.6,
      highConfidenceCount: 1,
      allocations: [
        {
          companyId: 101,
          baseAllocationCents: 6_000_000,
          plannedReservesCents: 10_000_000,
          maxAllocationCents: 7_500_000,
          scenarioAllocationCents: 7_500_000,
          allocationDeltaCents: 1_500_000,
          capApplied: true,
          confidence: 0.7,
          rationale: 'Hard cap applied',
        },
      ],
      warnings: [
        {
          code: 'TOTAL_SCENARIO_ALLOCATION_EXCEEDS_FUND_SIZE',
          message: 'Total scenario reserve allocation exceeds fund size.',
        },
      ],
      generatedAt: '2026-05-26T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
  });

  it('rejects reserve variants without reserve payloads and fee-profile variants without economics', () => {
    const reserveResult = FundScenarioCalculationResponseV1Schema.safeParse({
      snapshotId: 42,
      correlationId: '00000000-0000-0000-0000-000000000123',
      source: 'fund_snapshots',
      payload: {
        version: 'fund-scenarios-v1',
        calculationMode: 'async_reserve_allocation',
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
        staleness: {
          state: 'CURRENT',
          sourceConfigVersion: 4,
          currentPublishedConfigVersion: 4,
        },
        calculatedAt: '2026-05-26T12:00:00.000Z',
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000112',
            scenarioSetId: '00000000-0000-0000-0000-000000000111',
            name: 'Reserve variant',
            overrideType: 'reserve_allocation',
            economics: economicsResult(),
          },
        ],
      },
    });

    const feeResult = FundScenarioCalculationResponseV1Schema.safeParse({
      snapshotId: 42,
      correlationId: '00000000-0000-0000-0000-000000000123',
      source: 'fund_snapshots',
      payload: {
        version: 'fund-scenarios-v1',
        calculationMode: 'sync_fee_profile',
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
        staleness: {
          state: 'CURRENT',
          sourceConfigVersion: 4,
          currentPublishedConfigVersion: 4,
        },
        calculatedAt: '2026-05-26T12:00:00.000Z',
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000112',
            scenarioSetId: '00000000-0000-0000-0000-000000000111',
            name: 'Fee variant',
            overrideType: 'fee_profile',
            reserve: reserveSummary(),
          },
        ],
      },
    });

    expect(reserveResult.success).toBe(false);
    expect(feeResult.success).toBe(false);
  });

  it('requires calculation payload mode to match embedded override results', () => {
    const result = FundScenarioCalculationResponseV1Schema.safeParse({
      snapshotId: 42,
      correlationId: '00000000-0000-0000-0000-000000000123',
      source: 'fund_snapshots',
      payload: {
        version: 'fund-scenarios-v1',
        calculationMode: 'sync_allocation',
        fundId: 1,
        scenarioSetId: '00000000-0000-0000-0000-000000000111',
        sourceConfigId: 12,
        sourceConfigVersion: 4,
        staleness: {
          state: 'CURRENT',
          sourceConfigVersion: 4,
          currentPublishedConfigVersion: 4,
        },
        calculatedAt: '2026-05-26T12:00:00.000Z',
        variants: [
          {
            variantId: '00000000-0000-0000-0000-000000000112',
            scenarioSetId: '00000000-0000-0000-0000-000000000111',
            name: 'Lower fee',
            overrideType: 'fee_profile',
            economics: economicsResult(),
          },
        ],
      },
    });

    expect(result.success).toBe(false);
  });

  it('describes fund-results scenario summaries without full economics results', () => {
    const result = ScenariosSectionPayloadV1Schema.safeParse({
      version: 'fund-scenarios-v1',
      aggregateStaleness: 'CURRENT',
      sets: [
        {
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          name: 'Fee sensitivity',
          calculationMode: 'sync_fee_profile',
          sourceConfigId: 12,
          sourceConfigVersion: 4,
          currentPublishedConfigVersion: 4,
          calculatedAt: '2026-05-26T12:00:00.000Z',
          staleness: 'CURRENT',
          variantCount: 1,
          variants: [
            {
              variantId: '00000000-0000-0000-0000-000000000112',
              name: 'Lower fee',
              overrideType: 'fee_profile',
              economicsSummary: economicsSummary(),
            },
          ],
        },
      ],
    });

    expect(result.success).toBe(true);
    expect(result.data?.sets[0]?.calculationMode).toBe('sync_fee_profile');
  });

  it('requires scenario summary variant counts to match the embedded summaries', () => {
    const result = ScenarioSetResultSummaryV1Schema.safeParse({
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      calculationMode: 'sync_fee_profile',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 4,
      calculatedAt: '2026-05-26T12:00:00.000Z',
      staleness: 'CURRENT',
      variantCount: 2,
      variants: [
        {
          variantId: '00000000-0000-0000-0000-000000000112',
          name: 'Lower fee',
          overrideType: 'fee_profile',
          economicsSummary: economicsSummary(),
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('requires scenario summary calculation mode to match embedded override summaries', () => {
    const result = ScenarioSetResultSummaryV1Schema.safeParse({
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      calculationMode: 'sync_allocation',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 4,
      calculatedAt: '2026-05-26T12:00:00.000Z',
      staleness: 'CURRENT',
      variantCount: 1,
      variants: [
        {
          variantId: '00000000-0000-0000-0000-000000000112',
          name: 'Lower fee',
          overrideType: 'fee_profile',
          economicsSummary: economicsSummary(),
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('rejects full economics results in fund-results scenario summaries', () => {
    const result = ScenarioSetResultSummaryV1Schema.safeParse({
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      calculationMode: 'sync_fee_profile',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
      currentPublishedConfigVersion: 4,
      calculatedAt: '2026-05-26T12:00:00.000Z',
      staleness: 'CURRENT',
      variantCount: 1,
      variants: [
        {
          variantId: '00000000-0000-0000-0000-000000000112',
          name: 'Lower fee',
          overrideType: 'fee_profile',
          economicsSummary: {
            ...economicsSummary(),
            annual: [],
            checks: { passed: true, tolerance: 0.01, errors: [] },
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it('defines dedicated fund-results scenario reason codes', () => {
    expect(FundScenariosSectionReasonCodeV1Schema.options).toEqual([
      'SCENARIOS_NONE_EXIST',
      'SCENARIOS_NONE_CALCULATED',
      'SCENARIOS_LOAD_FAILED',
    ]);
  });

  it('accepts a methodology override with waterfallType only', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'methodology',
      payload: { waterfallType: 'hybrid' },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overrideType).toBe('methodology');
    }
  });

  it('accepts a methodology override specifying managementFeeRate', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'methodology',
      payload: { waterfallType: 'american', managementFeeRate: 0.025 },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a methodology override with no fields set', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'methodology',
      payload: {},
    });
    expect(result.success).toBe(false);
  });

  it('rejects a methodology override with an unknown key', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'methodology',
      payload: { waterfallType: 'hybrid', unknownKey: true },
    });
    expect(result.success).toBe(false);
  });

  it('accepts a full scenario set create payload with a methodology override', () => {
    const result = CreateFundScenarioSetV1Schema.safeParse({
      name: 'Waterfall comparison',
      variants: [
        {
          name: 'Hybrid waterfall',
          override: { overrideType: 'methodology', payload: { waterfallType: 'hybrid' } },
        },
      ],
    });
    expect(result.success).toBe(true);
    expect(result.data?.variants[0]?.override.overrideType).toBe('methodology');
  });
});

function economicsResult() {
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
    summary: economicsSummary(),
    checks: {
      passed: true,
      tolerance: 0.01,
      errors: [],
    },
  };
}

function reserveSummary() {
  return {
    fundId: 1,
    totalBaseAllocationCents: 1_000_000,
    totalScenarioAllocationCents: 2_000_000,
    totalAllocationDeltaCents: 1_000_000,
    avgConfidence: 0.7,
    highConfidenceCount: 1,
    allocations: [
      {
        companyId: 101,
        baseAllocationCents: 1_000_000,
        plannedReservesCents: 2_000_000,
        maxAllocationCents: null,
        scenarioAllocationCents: 2_000_000,
        allocationDeltaCents: 1_000_000,
        capApplied: false,
        confidence: 0.7,
        rationale: 'Scenario reserve allocation',
      },
    ],
    warnings: [],
    generatedAt: '2026-05-26T12:00:00.000Z',
  };
}

function economicsSummary() {
  return {
    grossIrr: null,
    lpNetIrr: null,
    gpNetIrr: null,
    totalLpPaidIn: 1,
    totalGpCommitmentCalled: 0,
    totalManagementFees: 1,
    totalExpenses: 0,
    totalRecycled: 0,
    totalLpDistributions: 0,
    totalGpInvestmentDistributions: 0,
    totalGpCarryDistributed: 0,
    totalGpFeeIncome: 1,
    finalDpi: 0,
    finalRvpi: 0,
    finalTvpi: 0,
    finalClawbackDue: 0,
    maxEscrowAvailable: 0,
    netGpCarryAfterClawback: 0,
  };
}

const capitalWireSetId = '11111111-1111-4111-8111-111111111111';
const capitalWireBaselineId = '22222222-2222-4222-8222-222222222222';
const capitalWireVariantId = '33333333-3333-4333-8333-333333333333';
const capitalWireTime = '2026-09-11T12:00:00.000Z';
const capitalWireReadState = {
  sourceFreshness: 'CURRENT',
  calculationReadiness: { context: 'saved_input', state: 'READY', issues: [] },
  interpretationCompatibility: {
    state: 'CURRENT',
    savedVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
    currentVersion: CAPITAL_SOURCE_INTERPRETATION_VERSION,
  },
} as const;

function makeCapitalWireFixture(selected = false) {
  const originalInput = makeCapitalInput();
  const draft = CapitalPlanningDraftV1Schema.parse({
    input: originalInput,
    benchmarkSelections: [
      {
        target: { allocationId: 'a1', kind: 'entry' },
        selector: { version: CAPITAL_BENCHMARK_CATALOG_VERSION, stage: 'seed' },
        overrides: { totalPrimaryRoundUsd: '5000000.000000' },
      },
    ],
  });
  const materialized = materializeCapitalSource({
    source: {
      fund: { id: 101, size: '100.00', baseCurrency: 'USD' },
      config: {
        id: 11,
        version: 1,
        raw: makeCapitalRawConfig(),
        publishedAt: '2026-09-01T00:00:00.000Z',
      },
    },
    inputs: [selected ? draft : originalInput],
    unitDeclarations: makeCapitalDeclarations(),
  });
  if (!materialized.ok) throw new Error(JSON.stringify(materialized));
  const input = materialized.resolvedInputs?.[0] ?? originalInput;
  const benchmarkSnapshots = materialized.benchmarkSnapshotsByInput?.[0];
  if (selected && !benchmarkSnapshots?.length)
    throw new Error('Actual benchmark snapshots required');
  const sourceBundle = materialized.sourceBundle;
  const result = calculateCapitalPlanningV1({
    input,
    sourceBundle,
    ...(benchmarkSnapshots ? { benchmarkSnapshots } : {}),
  });
  const stored = {
    overrideType: 'capital_plan',
    payload: {
      input,
      sourceBundle,
      sourceBundleHash: sourceBundle.sourceBundleHash,
      ...(benchmarkSnapshots ? { benchmarkSnapshots } : {}),
    },
  };
  const request = {
    contractVersion: 'fund-scenario-set-create/3.0.0',
    name: 'Capital construction',
    variants: [
      {
        variantId: capitalWireBaselineId,
        name: 'Baseline',
        override: { overrideType: 'capital_plan', payload: selected ? draft : originalInput },
      },
    ],
    baselineVariantId: capitalWireBaselineId,
    expectedSourceConfigId: 11,
    expectedSourceConfigVersion: 1,
    expectedSourceBundleHash: sourceBundle.sourceBundleHash,
    expectedInterpretationVersion: sourceBundle.interpretationVersion,
    unitDeclarations: makeCapitalDeclarations(),
  };
  const summary = {
    id: capitalWireSetId,
    fundId: 101,
    name: 'Capital construction',
    description: null,
    sourceConfigId: 11,
    sourceConfigVersion: 1,
    variantCount: 1,
    archivedAt: null,
    archivedByUserId: null,
    archivedByLabel: null,
    createdByUserId: null,
    createdByLabel: null,
    updatedByUserId: null,
    updatedByLabel: null,
    createdAt: capitalWireTime,
    updatedAt: capitalWireTime,
    overrideType: 'capital_plan',
    baselineVariantId: capitalWireBaselineId,
    sourceBundleHash: sourceBundle.sourceBundleHash,
    interpretationVersion: sourceBundle.interpretationVersion,
    readState: capitalWireReadState,
  };
  const detail = {
    ...summary,
    contractVersion: 'fund-scenario-capital-detail/1.0.0',
    representation: 'capital-plan-v1',
    variants: [
      {
        id: capitalWireBaselineId,
        scenarioSetId: capitalWireSetId,
        name: 'Baseline',
        description: null,
        sortOrder: 0,
        override: stored,
        createdAt: capitalWireTime,
        updatedAt: capitalWireTime,
      },
    ],
  };
  const payload = {
    contractVersion: 'fund-scenario-capital-calculation/1.0.0',
    calculationDomain: 'capital_plan',
    calculationMode: 'sync_capital_plan',
    capitalPreimageVersion: CAPITAL_PREIMAGE_VERSION,
    methodVersion: CAPITAL_PLANNING_VERSION,
    interpretationVersion: sourceBundle.interpretationVersion,
    calculationVersion: '1.0.0',
    inputHash: 'a'.repeat(64),
    lineage: {
      hashKind: 'scenario-input-hash-v1',
      modelInputsAsOfDate: null,
      comparisonLineageVersion: null,
    },
    fundId: 101,
    scenarioSetId: capitalWireSetId,
    baselineVariantId: capitalWireBaselineId,
    sourceConfigId: 11,
    sourceConfigVersion: 1,
    sourceBundleHash: sourceBundle.sourceBundleHash,
    calculatedAt: capitalWireTime,
    variants: [
      {
        variantId: capitalWireBaselineId,
        scenarioSetId: capitalWireSetId,
        name: 'Baseline',
        overrideType: 'capital_plan',
        result,
      },
    ],
  };
  return {
    originalInput,
    draft,
    input,
    sourceBundle,
    benchmarkSnapshots,
    result,
    stored,
    request,
    summary,
    detail,
    payload,
  };
}

function withCapitalRequestVariants(input: CapitalPlanningInputV1, count: number, draft: boolean) {
  const fixture = makeCapitalWireFixture();
  return {
    ...fixture.request,
    variants: Array.from({ length: count }, (_, index) => ({
      variantId:
        index === 0
          ? capitalWireBaselineId
          : `44444444-4444-4444-8444-${String(index).padStart(12, '0')}`,
      name: `Capital variant ${index}`,
      override: { overrideType: 'capital_plan', payload: draft ? { input } : input },
    })),
  };
}

function expandedRowInput(): CapitalPlanningInputV1 {
  const base = makeCapitalInput().allocations[0]!;
  return {
    contractVersion: CAPITAL_PLANNING_VERSION,
    allocations: Array.from({ length: 10 }, (_, index) => ({
      ...base,
      allocationId: `allocation-${index}`,
      budgetShareRatio: '0.100000000000',
      deploymentPeriodYears: 10,
      plannedCompanyCount: 1,
      followOnRounds: Array.from({ length: 4 }, (_, round) => ({
        roundId: `round-${round}`,
        stageId: `stage-${round}`,
        roundLabel: `Round ${round}`,
        graduationRatio: '0.500000000000',
        participationRatio: '0.500000000000',
        checkPolicy: { type: 'fixed_check', checkUsd: '1.000000' },
        monthsAfterPreviousRound: 12,
        timeOrigin: 'previous_round',
      })),
    })),
  };
}

describe('B5 strict capital scenario wire contracts', () => {
  it.each([false, true])('preserves normalized or draft request bytes; selected=%s', (selected) => {
    const fixture = makeCapitalWireFixture(selected);
    expect(CreateFundScenarioSetV3Schema.parse(fixture.request)).toEqual(fixture.request);
    expect(JSON.stringify(CreateFundScenarioSetV3Schema.parse(fixture.request))).toBe(
      JSON.stringify(fixture.request)
    );
    const payload = fixture.request.variants[0]!.override.payload;
    expect(FundScenarioCapitalRequestInputV1Schema.parse(payload)).toEqual(payload);
    expect(
      FundScenarioCapitalOverrideV1Schema.parse(fixture.request.variants[0]!.override)
    ).toEqual(fixture.request.variants[0]!.override);
    expect(CreateFundScenarioSetV1Schema.safeParse(fixture.request).success).toBe(false);
    expect(CreateFundScenarioSetV2Schema.safeParse(fixture.request).success).toBe(false);
    expect(
      FundScenarioVariantOverrideV1Schema.safeParse(fixture.request.variants[0]!.override).success
    ).toBe(false);
  });

  it('limits draft widening to capital payloads and rejects client-owned source/provenance snapshots', () => {
    const fixture = makeCapitalWireFixture(true);
    const selection = fixture.draft.benchmarkSelections![0]!;
    const variants: unknown[] = [
      { ...fixture.draft, benchmarkSnapshots: fixture.benchmarkSnapshots },
      { ...fixture.draft, sourceBundle: fixture.sourceBundle },
      { ...fixture.draft, sourceBundleHash: fixture.sourceBundle.sourceBundleHash },
      { ...fixture.draft, input: { ...fixture.input, assumptionProvenance: [] } },
      {
        ...fixture.draft,
        input: { ...fixture.input, benchmarkSnapshots: fixture.benchmarkSnapshots },
      },
      {
        ...fixture.draft,
        benchmarkSelections: [
          { ...selection, baselineFinancing: fixture.benchmarkSnapshots![0]!.baselineFinancing },
        ],
      },
      { ...fixture.draft, benchmarkSelections: [{ ...selection, metadata: {} }] },
      {
        ...fixture.draft,
        benchmarkSelections: [
          { ...selection, selector: { ...selection.selector, sourceUrl: 'client-injected' } },
        ],
      },
      {
        ...fixture.draft,
        benchmarkSelections: [
          {
            ...selection,
            overrides: {
              valuation: {
                valuationUsd: '1.000000',
                valuationBasis: 'pre_money',
                source: 'client',
              },
            },
          },
        ],
      },
    ];
    for (const payload of variants)
      expect(
        FundScenarioCapitalOverrideV1Schema.safeParse({ overrideType: 'capital_plan', payload })
          .success
      ).toBe(false);
    for (const overrideType of [
      'allocation',
      'fee_profile',
      'sector_profile',
      'reserve_allocation',
    ]) {
      expect(
        FundScenarioCapitalOverrideV1Schema.safeParse({ overrideType, payload: fixture.draft })
          .success
      ).toBe(false);
      expect(
        FundScenarioVariantOverrideV1Schema.safeParse({ overrideType, payload: fixture.draft })
          .success
      ).toBe(false);
    }
    expect(
      CreateFundScenarioSetV3Schema.safeParse({
        ...fixture.request,
        benchmarkSelections: fixture.draft.benchmarkSelections,
      }).success
    ).toBe(false);
  });

  it('refuses unknown/duplicate benchmark targets and malformed selectors or overrides', () => {
    const { draft } = makeCapitalWireFixture(true);
    const selection = draft.benchmarkSelections![0]!;
    for (const benchmarkSelections of [
      [selection, selection],
      [{ ...selection, target: { allocationId: 'unknown', kind: 'entry' } }],
      [{ ...selection, target: { allocationId: 'a1', kind: 'follow_on', roundId: 'unknown' } }],
      [{ ...selection, target: { allocationId: 'a1', kind: 'entry', roundId: 'injected' } }],
      [{ ...selection, selector: { ...selection.selector, stage: 'unknown' } }],
      [{ ...selection, selector: { stage: 'seed' } }],
      [{ ...selection, overrides: { totalPrimaryRoundUsd: '0.000000' } }],
      [{ ...selection, overrides: { totalPrimaryRoundUsd: '1e6' } }],
    ]) {
      expect(
        FundScenarioCapitalRequestInputV1Schema.safeParse({ ...draft, benchmarkSelections })
          .success,
        JSON.stringify(benchmarkSelections)
      ).toBe(false);
    }
  });

  it('defers cross-field financing validity to the actual B4 resolver', () => {
    const { draft, sourceBundle } = makeCapitalWireFixture(true);
    const selection = draft.benchmarkSelections![0]!;
    const request = {
      ...draft,
      benchmarkSelections: [
        {
          ...selection,
          overrides: {
            valuation: { valuationUsd: '1.000000', valuationBasis: 'post_money' as const },
            totalPrimaryRoundUsd: '2.000000',
          },
        },
      ],
    };
    expect(FundScenarioCapitalRequestInputV1Schema.parse(request)).toEqual(request);
    expect(() => resolveCapitalPlanningDraftV1({ draft: request, sourceBundle })).toThrow();
  });

  it.each([false, true])(
    'enforces one to five named variants, stable baseline, and strict expected source fields; draft=%s',
    (draft) => {
      const request = withCapitalRequestVariants(makeCapitalInput(), 5, draft);
      expect(CreateFundScenarioSetV3Schema.safeParse(request).success).toBe(true);
      for (const variants of [
        [],
        [...request.variants, { ...request.variants[0]!, variantId: capitalWireVariantId }],
        [request.variants[0]!, request.variants[0]!],
      ]) {
        expect(CreateFundScenarioSetV3Schema.safeParse({ ...request, variants }).success).toBe(
          false
        );
      }
      for (const patch of [
        { baselineVariantId: capitalWireVariantId },
        { expectedSourceConfigId: 0 },
        { expectedSourceConfigVersion: 0 },
        { expectedSourceBundleHash: 'INVALID' },
        { expectedInterpretationVersion: '' },
        { expectedSourceConfigId: undefined },
        { sourceBundle: {} },
      ]) {
        expect(CreateFundScenarioSetV3Schema.safeParse({ ...request, ...patch }).success).toBe(
          false
        );
      }
      for (const length of [120, 121]) {
        expect(
          CreateFundScenarioSetV3Schema.safeParse({ ...request, name: 'x'.repeat(length) }).success
        ).toBe(length === 120);
        expect(
          CreateFundScenarioSetV3Schema.safeParse({
            ...request,
            variants: [{ ...request.variants[0]!, name: 'x'.repeat(length) }],
          }).success
        ).toBe(length === 120);
      }
    }
  );

  it.each([false, true])(
    'admits exactly 60000 expanded rows and rejects a legal input above the aggregate cap; draft=%s',
    (draft) => {
      // 5 variants * 10 allocations * 10 years * 12 months * 5 rounds * 2 count bases.
      const input = expandedRowInput();
      const request = withCapitalRequestVariants(input, 5, draft);
      expect(CreateFundScenarioSetV3Schema.safeParse(request).success).toBe(true);
      const enlarged = structuredClone(input);
      enlarged.allocations[0]!.followOnRounds.push({
        ...enlarged.allocations[0]!.followOnRounds[0]!,
        roundId: 'extra-round',
        stageId: 'extra-stage',
      });
      const variant = {
        ...request.variants[0]!,
        override: { overrideType: 'capital_plan', payload: draft ? { input: enlarged } : enlarged },
      };
      const refused = CreateFundScenarioSetV3Schema.safeParse({
        ...request,
        variants: [variant, ...request.variants.slice(1)],
      });
      expect(refused.success).toBe(false);
      if (!refused.success)
        expect(refused.error.issues).toContainEqual(
          expect.objectContaining({
            path: ['variants'],
            message: 'INPUT_TOO_LARGE: provisional monthly row ceiling exceeded',
          })
        );
    }
  );

  it.each([false, true])(
    'stores only normalized input with optional actual trusted snapshots; selected=%s',
    (selected) => {
      const fixture = makeCapitalWireFixture(selected);
      expect(FundScenarioCapitalStoredOverrideV1Schema.parse(fixture.stored)).toEqual(
        fixture.stored
      );
      expect(JSON.stringify(FundScenarioCapitalStoredOverrideV1Schema.parse(fixture.stored))).toBe(
        JSON.stringify(fixture.stored)
      );
      if (!selected) {
        expect(
          FundScenarioCapitalStoredOverrideV1Schema.parse(fixture.stored).payload
        ).not.toHaveProperty('benchmarkSnapshots');
        expect(
          FundScenarioCapitalStoredOverrideV1Schema.parse(fixture.stored).payload.input
        ).not.toHaveProperty('netInvestableCapitalUsd');
      }
      for (const patch of [
        { input: fixture.draft },
        { benchmarkSelections: fixture.draft.benchmarkSelections },
        { benchmarkSnapshots: null },
        { sourceBundleHash: 'b'.repeat(64) },
        { provenance: [] },
      ]) {
        expect(
          FundScenarioCapitalStoredOverrideV1Schema.safeParse({
            ...fixture.stored,
            payload: { ...fixture.stored.payload, ...patch },
          }).success
        ).toBe(false);
      }
      expect(FundScenarioCapitalOverrideV1Schema.safeParse(fixture.stored).success).toBe(false);
    }
  );

  it('preserves retired saved selector versions without re-resolving the catalog and bounds trusted snapshot arrays', () => {
    const fixture = makeCapitalWireFixture(true);
    const snapshot = fixture.benchmarkSnapshots![0]!;
    const retired = {
      ...snapshot,
      selector: { ...snapshot.selector, version: 'retired-benchmark/0.1.0' },
      metadata: { ...snapshot.metadata, version: 'retired-benchmark/0.1.0' },
    };
    const saved = {
      ...fixture.stored,
      payload: { ...fixture.stored.payload, benchmarkSnapshots: [retired] },
    };
    expect(FundScenarioCapitalStoredOverrideV1Schema.parse(saved)).toEqual(saved);
    for (const count of [70, 71]) {
      expect(
        FundScenarioCapitalStoredOverrideV1Schema.safeParse({
          ...saved,
          payload: {
            ...saved.payload,
            benchmarkSnapshots: Array.from({ length: count }, () => retired),
          },
        }).success
      ).toBe(count === 70);
    }
    for (const malformed of [
      { ...retired, injected: true },
      { ...retired, metadata: { ...retired.metadata, injected: true } },
      { ...retired, observedMetrics: { ...retired.observedMetrics, injected: true } },
    ]) {
      expect(
        FundScenarioCapitalStoredOverrideV1Schema.safeParse({
          ...saved,
          payload: { ...saved.payload, benchmarkSnapshots: [malformed] },
        }).success
      ).toBe(false);
    }
  });

  it('accepts strict detail, list, archive and create representations from actual B4 stored inputs', () => {
    const { detail, summary } = makeCapitalWireFixture(true);
    expect(FundScenarioCapitalDetailResponseV1Schema.parse(detail)).toEqual(detail);
    const list = {
      contractVersion: 'fund-scenario-capital-list/1.0.0',
      representation: 'capital-plan-v1',
      scenarioSets: [summary],
    };
    expect(FundScenarioCapitalListResponseV1Schema.parse(list)).toEqual(list);
    const archive = { ...summary, archivedAt: capitalWireTime };
    expect(FundScenarioCapitalArchiveResponseV1Schema.parse(archive)).toEqual(archive);
    expect(FundScenarioCapitalArchiveResponseV1Schema.safeParse(summary).success).toBe(false);
    for (const length of [120, 121]) {
      expect(
        FundScenarioCapitalArchiveResponseV1Schema.safeParse({
          ...archive,
          name: 'x'.repeat(length),
        }).success
      ).toBe(length === 120);
      expect(
        FundScenarioCapitalListResponseV1Schema.safeParse({
          ...list,
          scenarioSets: [{ ...summary, name: 'x'.repeat(length) }],
        }).success
      ).toBe(length === 120);
    }
    const created = {
      contractVersion: 'fund-scenario-capital-create/1.0.0',
      representation: 'capital-plan-v1',
      scenarioSetId: capitalWireSetId,
    };
    expect(FundScenarioCapitalCreateResponseV1Schema.parse(created)).toEqual(created);
    for (const [schema, value] of [
      [FundScenarioCapitalDetailResponseV1Schema, detail],
      [FundScenarioCapitalListResponseV1Schema, list],
      [FundScenarioCapitalArchiveResponseV1Schema, archive],
      [FundScenarioCapitalCreateResponseV1Schema, created],
    ] as const) {
      expect(schema.safeParse({ ...value, unexpected: true }).success).toBe(false);
    }
    expect(FundScenarioSetDetailV1Schema.safeParse(detail).success).toBe(false);
  });

  it('requires detail source/set/order/baseline consistency and unique variants', () => {
    const { detail } = makeCapitalWireFixture();
    const variant = detail.variants[0]!;
    for (const patch of [
      { fundId: 102 },
      { sourceConfigId: 12 },
      { sourceConfigVersion: 2 },
      { sourceBundleHash: 'b'.repeat(64) },
      { interpretationVersion: 'retired' },
      { variantCount: 2 },
      { baselineVariantId: capitalWireVariantId },
      { name: 'x'.repeat(121) },
    ]) {
      expect(
        FundScenarioCapitalDetailResponseV1Schema.safeParse({ ...detail, ...patch }).success
      ).toBe(false);
    }
    for (const patch of [
      { scenarioSetId: capitalWireVariantId },
      { sortOrder: 1 },
      { id: capitalWireVariantId },
      { name: 'x'.repeat(121) },
    ]) {
      expect(
        FundScenarioCapitalDetailResponseV1Schema.safeParse({
          ...detail,
          variants: [{ ...variant, ...patch }],
        }).success
      ).toBe(false);
    }
    const second = { ...variant, id: capitalWireVariantId, sortOrder: 1 };
    expect(
      FundScenarioCapitalDetailResponseV1Schema.safeParse({
        ...detail,
        variantCount: 2,
        variants: [variant, second],
      }).success
    ).toBe(true);
    expect(
      FundScenarioCapitalDetailResponseV1Schema.safeParse({
        ...detail,
        variantCount: 2,
        variants: [variant, { ...second, id: variant.id }],
      }).success
    ).toBe(false);
    expect(
      FundScenarioCapitalDetailResponseV1Schema.safeParse({
        ...detail,
        name: 'x'.repeat(120),
        variants: [{ ...variant, name: 'x'.repeat(120) }],
      }).success
    ).toBe(true);
  });

  it('checks the full common bundle beyond its claimed hash', () => {
    const { detail, payload } = makeCapitalWireFixture();
    const variant = detail.variants[0]!;
    const changedBundle = structuredClone(variant.override.payload.sourceBundle);
    changedBundle.modelInputsAsOfDate = '2026-09-10';
    const second = {
      ...variant,
      id: capitalWireVariantId,
      sortOrder: 1,
      override: {
        ...variant.override,
        payload: { ...variant.override.payload, sourceBundle: changedBundle },
      },
    };
    expect(
      FundScenarioCapitalDetailResponseV1Schema.safeParse({
        ...detail,
        variantCount: 2,
        variants: [variant, second],
      }).success
    ).toBe(false);
    const calculationVariant = payload.variants[0]!;
    expect(
      FundScenarioCapitalCalculationPayloadV1Schema.safeParse({
        ...payload,
        variants: [
          calculationVariant,
          {
            ...calculationVariant,
            variantId: capitalWireVariantId,
            result: { ...calculationVariant.result, sourceBundle: changedBundle },
          },
        ],
      }).success
    ).toBe(false);
  });

  it.each([false, true])(
    'accepts complete saved calculation results from the admitted B4 producer; selected=%s',
    (selected) => {
      const { payload } = makeCapitalWireFixture(selected);
      expect(FundScenarioCapitalCalculationPayloadV1Schema.parse(payload)).toEqual(payload);
      const saved = {
        snapshotId: 42,
        correlationId: capitalWireVariantId,
        source: 'fund_snapshots',
        payload,
      };
      const calculated = {
        contractVersion: 'fund-scenario-capital-calculate/1.0.0',
        representation: 'capital-plan-v1',
        ...saved,
      };
      expect(FundScenarioCapitalCalculateResponseV1Schema.parse(calculated)).toEqual(calculated);
      const results = {
        contractVersion: 'fund-scenario-capital-results/1.0.0',
        representation: 'capital-plan-v1',
        scenarioSetId: capitalWireSetId,
        savedResult: saved,
        unavailableReason: null,
        readState: capitalWireReadState,
      };
      expect(FundScenarioCapitalResultsResponseV1Schema.parse(results)).toEqual(results);
      for (const patch of [
        { unavailableReason: 'NO_CALCULATED_RESULT' },
        { scenarioSetId: capitalWireVariantId },
        { savedResult: null },
        { unexpected: true },
      ]) {
        expect(
          FundScenarioCapitalResultsResponseV1Schema.safeParse({ ...results, ...patch }).success
        ).toBe(false);
      }
      const absent = { ...results, savedResult: null, unavailableReason: 'NO_CALCULATED_RESULT' };
      expect(FundScenarioCapitalResultsResponseV1Schema.parse(absent)).toEqual(absent);
      for (const patch of [
        { source: 'live_recalculation' },
        { snapshotId: 0 },
        { correlationId: 'invalid' },
        { unexpected: true },
      ]) {
        expect(
          FundScenarioCapitalCalculateResponseV1Schema.safeParse({ ...calculated, ...patch })
            .success
        ).toBe(false);
      }
    }
  );

  it('rejects saved calculation identity, source, method, baseline and duplicate variants', () => {
    const { payload } = makeCapitalWireFixture();
    for (const patch of [
      { fundId: 102 },
      { sourceConfigId: 12 },
      { sourceConfigVersion: 2 },
      { sourceBundleHash: 'b'.repeat(64) },
      { interpretationVersion: 'other' },
      { baselineVariantId: capitalWireVariantId },
      { capitalPreimageVersion: 'other' },
      { methodVersion: 'other' },
      { calculationMode: 'async' },
      { calculationDomain: 'reserve' },
      { inputHash: 'invalid' },
      { variants: [] },
      { unexpected: true },
    ]) {
      expect(
        FundScenarioCapitalCalculationPayloadV1Schema.safeParse({ ...payload, ...patch }).success
      ).toBe(false);
    }
    const variant = payload.variants[0]!;
    for (const patch of [
      { scenarioSetId: capitalWireVariantId },
      { name: 'x'.repeat(121) },
      { overrideType: 'allocation' },
    ]) {
      expect(
        FundScenarioCapitalCalculationPayloadV1Schema.safeParse({
          ...payload,
          variants: [{ ...variant, ...patch }],
        }).success
      ).toBe(false);
    }
    expect(
      FundScenarioCapitalCalculationPayloadV1Schema.safeParse({
        ...payload,
        variants: [variant, variant],
      }).success
    ).toBe(false);
    expect(
      FundScenarioCapitalCalculationPayloadV1Schema.safeParse({
        ...payload,
        variants: [{ ...variant, name: 'x'.repeat(120) }],
      }).success
    ).toBe(true);
  });

  it('preserves explicit lineage version/date contracts without fallback', () => {
    const v1 = {
      hashKind: 'scenario-input-hash-v1',
      modelInputsAsOfDate: null,
      comparisonLineageVersion: null,
    };
    const v2 = {
      hashKind: 'scenario-input-hash-v2',
      modelInputsAsOfDate: '2026-09-10',
      comparisonLineageVersion: 'comparison-lineage-v1',
    };
    expect(CapitalScenarioLineageV1Schema.parse(v1)).toEqual(v1);
    expect(CapitalScenarioLineageV1Schema.parse(v2)).toEqual(v2);
    for (const lineage of [
      { ...v1, modelInputsAsOfDate: '2026-09-10' },
      { ...v2, modelInputsAsOfDate: null },
      { ...v2, comparisonLineageVersion: null },
      { ...v2, modelInputsAsOfDate: '2026-02-30' },
      { ...v1, injected: true },
    ]) {
      expect(CapitalScenarioLineageV1Schema.safeParse(lineage).success).toBe(false);
    }
    const { payload } = makeCapitalWireFixture();
    expect(
      FundScenarioCapitalCalculationPayloadV1Schema.safeParse({ ...payload, lineage: v2 }).success
    ).toBe(false);
  });

  it('requires complete matching current-preview materialization for READY source responses', () => {
    const { sourceBundle } = makeCapitalWireFixture();
    const source = {
      contractVersion: 'fund-scenario-capital-source/1.0.0',
      representation: 'capital-plan-v1',
      projection: sourceBundle.projection,
      sourceBundleHash: sourceBundle.sourceBundleHash,
      publishedAt: '2026-09-01T00:00:00.000Z',
      interpretationVersion: sourceBundle.interpretationVersion,
      remainingDeclarations: [],
      materialized: sourceBundle,
      calculationReadiness: { context: 'current_preview', state: 'READY', issues: [] },
      interpretationCompatibility: capitalWireReadState.interpretationCompatibility,
    };
    expect(FundScenarioCapitalSourceResponseV1Schema.parse(source)).toEqual(source);
    for (const patch of [
      { materialized: null },
      { sourceBundleHash: 'b'.repeat(64) },
      { interpretationVersion: 'other' },
      { projection: { ...sourceBundle.projection, fundId: 102 } },
      { calculationReadiness: { ...source.calculationReadiness, context: 'saved_input' } },
      { remainingDeclarations: [{ path: 'fundSize', allowedUnits: ['usd'] }] },
      { unexpected: true },
    ]) {
      expect(
        FundScenarioCapitalSourceResponseV1Schema.safeParse({ ...source, ...patch }).success
      ).toBe(false);
    }
  });
});
