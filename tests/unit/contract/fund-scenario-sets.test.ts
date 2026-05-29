import { describe, expect, it } from 'vitest';

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

  it('describes fund-results scenario summaries without full economics results', () => {
    const result = ScenariosSectionPayloadV1Schema.safeParse({
      version: 'fund-scenarios-v1',
      aggregateStaleness: 'CURRENT',
      sets: [
        {
          scenarioSetId: '00000000-0000-0000-0000-000000000111',
          name: 'Fee sensitivity',
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
  });

  it('requires scenario summary variant counts to match the embedded summaries', () => {
    const result = ScenarioSetResultSummaryV1Schema.safeParse({
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
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

  it('rejects full economics results in fund-results scenario summaries', () => {
    const result = ScenarioSetResultSummaryV1Schema.safeParse({
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
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
