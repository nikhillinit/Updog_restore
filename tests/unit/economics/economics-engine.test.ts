import { describe, expect, it } from 'vitest';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  EconomicsInputValidationError,
  runEconomicsModel,
} from '@shared/lib/economics/economics-engine';

describe('GP economics engine', () => {
  it('calculates flat committed-capital management fees', () => {
    const result = runEconomicsModel(baseDraft());

    expect(result.annual[0]?.feesPaidToManager).toBe(2_000_000);
    expect(result.summary.totalManagementFees).toBe(20_000_000);
    expect(result.checks.passed).toBe(true);
  });

  it('calculates fee step-down tiers', () => {
    const result = runEconomicsModel(
      baseDraft({
        economicsAssumptions: {
          ...baseAssumptions(),
          feeModel: {
            source: 'economics_override',
            tiers: [
              {
                id: 'fee-1',
                name: 'Investment period fee',
                rate: 0.025,
                basis: 'committed_capital',
                startYear: 1,
                endYear: 4,
              },
              {
                id: 'fee-2',
                name: 'Step-down fee',
                rate: 0.015,
                basis: 'committed_capital',
                startYear: 5,
              },
            ],
          },
        },
      })
    );

    expect(result.annual[0]?.feesPaidToManager).toBe(2_500_000);
    expect(result.annual[3]?.feesPaidToManager).toBe(2_500_000);
    expect(result.annual[4]?.feesPaidToManager).toBe(1_500_000);
    expect(result.summary.totalManagementFees).toBe(19_000_000);
  });

  it('uses called-capital fee basis instead of fund size', () => {
    const result = runEconomicsModel(
      baseDraft({
        economicsAssumptions: {
          ...baseAssumptions(),
          feeModel: {
            source: 'economics_override',
            tiers: [
              {
                id: 'called-fee',
                name: 'Called capital fee',
                rate: 0.02,
                basis: 'called_capital_cumulative',
                startYear: 1,
              },
            ],
          },
        },
      })
    );

    expect(result.annual[0]?.feesPaidToManager).toBe(200_000);
    expect(result.annual[4]?.feesPaidToManager).toBe(1_000_000);
    expect(result.annual[9]?.feesPaidToManager).toBe(2_000_000);
  });

  it('caps recycled proceeds before waterfall distributions', () => {
    const result = runEconomicsModel(
      baseDraft({
        economicsAssumptions: {
          ...baseAssumptions(),
          recyclingModel: {
            enabled: true,
            sources: ['exit_proceeds'],
            capPctOfCommitments: 0.2,
            exitProceedsRecyclePct: 1,
            timing: 'before_waterfall',
          },
        },
      })
    );

    expect(result.summary.totalRecycled).toBe(20_000_000);
    expect(Math.max(...result.annual.map((row) => row.recycledProceeds))).toBe(20_000_000);
    expect(result.checks.passed).toBe(true);
  });

  it('caps cumulative GP commitment calls under front-loaded schedules', () => {
    const result = runEconomicsModel(
      baseDraft({
        economicsAssumptions: {
          ...baseAssumptions(),
          gpCommitmentModel: {
            commitmentAmount: 10_000_000,
            participatesInInvestmentReturns: true,
            callSchedule: [0.8, 0.2],
          },
        },
      })
    );

    expect(result.annual[0]?.gpCommitmentCalls).toBe(8_000_000);
    expect(result.annual[1]?.gpCommitmentCalls).toBe(2_000_000);
    expect(result.annual[2]?.gpCommitmentCalls).toBe(0);
    expect(result.summary.totalGpCommitmentCalled).toBe(10_000_000);
    expect(result.checks.passed).toBe(true);
  });

  it('rejects legacy hybrid waterfalls for economics P0', () => {
    const assumptionsWithoutWaterfall = {
      ...baseAssumptions(),
      waterfallModel: undefined,
    };

    expect(() =>
      runEconomicsModel(
        baseDraft({
          waterfallType: 'hybrid',
          economicsAssumptions: assumptionsWithoutWaterfall,
        })
      )
    ).toThrow(EconomicsInputValidationError);
  });

  it('rejects whole-fund waterfall policy fields', () => {
    const unsupportedAssumptions = {
      ...baseAssumptions(),
      waterfallModel: {
        ...baseAssumptions().waterfallModel,
        hybridPolicy: {
          returnCapitalScope: 'whole_fund',
          prefScope: 'whole_fund',
          catchUpScope: 'whole_fund',
          carryScope: 'whole_fund',
        },
      },
    } as unknown as NonNullable<FundDraftWriteV1['economicsAssumptions']>;

    expect(() =>
      runEconomicsModel(
        baseDraft({
          economicsAssumptions: unsupportedAssumptions,
        })
      )
    ).toThrow(EconomicsInputValidationError);
  });

  it('rejects unsupported legacy fee basis aliases', () => {
    expect(() =>
      runEconomicsModel(
        baseDraft({
          feeProfiles: [
            {
              id: 'legacy-profile',
              name: 'Legacy profile',
              feeTiers: [
                {
                  id: 'legacy-tier',
                  name: 'Period called fee',
                  percentage: 2,
                  feeBasis: 'called_capital_period',
                  startMonth: 1,
                },
              ],
            },
          ],
          economicsAssumptions: {
            ...baseAssumptions(),
            feeModel: { source: 'legacy_fee_profiles' },
          },
        })
      )
    ).toThrow(EconomicsInputValidationError);
  });
});

function baseDraft(overrides: Partial<FundDraftWriteV1> = {}): FundDraftWriteV1 {
  return {
    fundName: 'Economics Test Fund',
    fundSize: 100_000_000,
    managementFeeRate: 2,
    carriedInterest: 20,
    vintageYear: 2026,
    fundLife: 10,
    investmentPeriod: 5,
    gpCommitment: 10_000_000,
    economicsAssumptions: baseAssumptions(),
    ...overrides,
  };
}

function baseAssumptions(): NonNullable<FundDraftWriteV1['economicsAssumptions']> {
  return {
    version: 'v1',
    timeline: {
      fundLifeYears: 10,
      period: 'annual',
      vintageYear: 2026,
    },
    feeModel: {
      source: 'legacy_fee_profiles',
      defaultRate: 0.02,
      defaultBasis: 'committed_capital',
    },
    exitModel: {
      mode: 'cohort',
      cohort: {
        exitDistributionByYear: [0, 0, 0, 0, 0.2, 0.2, 0.2, 0.2, 0.1, 0.1],
        grossMultiple: 2.5,
        lossRatio: 0,
      },
    },
    recyclingModel: {
      enabled: false,
      sources: ['exit_proceeds'],
      capPctOfCommitments: 0,
      timing: 'before_waterfall',
    },
    waterfallModel: {
      type: 'american',
      carryPct: 0.2,
      hurdleRate: 0.08,
      prefType: 'compounded',
      prefCompounding: 'annual',
      prefCatchUp: true,
      catchUpRate: 1,
      catchUpTargetCarryPct: 0.2,
      clawbackEnabled: true,
      clawbackTrigger: 'final_liquidation',
      escrowPct: 0,
      feeOffsetTreatment: 'none',
    },
    gpCommitmentModel: {
      commitmentAmount: 10_000_000,
      participatesInInvestmentReturns: true,
    },
  };
}
