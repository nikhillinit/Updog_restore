import { describe, expect, it } from 'vitest';

import {
  CreateFundScenarioSetV1Schema,
  FundScenariosSectionReasonCodeV1Schema,
  FundScenarioCalculationResponseV1Schema,
  FundScenarioSetDetailV1Schema,
  FundScenarioVariantOverrideV1Schema,
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

  it('rejects non-fee override types in the first slice', () => {
    const result = FundScenarioVariantOverrideV1Schema.safeParse({
      overrideType: 'allocation',
      payload: {
        allocations: [],
      },
    });

    expect(result.success).toBe(false);
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

  it('rejects full economics results in fund-results scenario summaries', () => {
    const result = ScenarioSetResultSummaryV1Schema.safeParse({
      scenarioSetId: '00000000-0000-0000-0000-000000000111',
      name: 'Fee sensitivity',
      sourceConfigId: 12,
      sourceConfigVersion: 4,
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
