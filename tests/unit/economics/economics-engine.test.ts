import { describe, expect, it } from 'vitest';
import type { FundDraftWriteV1 } from '@shared/contracts/fund-draft-write-v1.contract';
import {
  assertEconomicsFeeGridSupported,
  EconomicsInputValidationError,
  runEconomicsModel,
} from '@shared/lib/economics/economics-engine';
import { Decimal, roundCurrency, sum } from '@shared/lib/decimal-utils';
import type { EconomicsFeeTierV1 } from '@shared/contracts/economics-v1.contract';

const GP_COMMITMENT_TRUTH_CASE = {
  fundSize: 100_000_000,
  contractualGpCommitment: 10_000_000,
  hurdleRate: 0.1,
  grossMultiple: 2,
  carryPct: 0.2,
  feeRate: 0.1,
} as const;

const GP_COMMITMENT_SCENARIOS = [
  {
    name: 'full-cash',
    fundedFromFeesPct: 0,
    expectedGpReturnOfCapital: 10_000_000,
    expectedGpPreferredReturn: 1_000_000,
    expectedGpResidual: 7_200_000,
    expectedGpInvestmentDistributions: 18_200_000,
  },
  {
    name: 'partial-deemed',
    fundedFromFeesPct: 0.25,
    expectedGpReturnOfCapital: 7_500_000,
    expectedGpPreferredReturn: 750_000,
    expectedGpResidual: 7_020_000,
    expectedGpInvestmentDistributions: 15_270_000,
  },
  {
    name: 'fully-deemed',
    fundedFromFeesPct: 1,
    expectedGpReturnOfCapital: 0,
    expectedGpPreferredReturn: 0,
    expectedGpResidual: 6_480_000,
    expectedGpInvestmentDistributions: 6_480_000,
  },
] as const;

const GP_AGGREGATE_ROUNDING_CASE = {
  fundSize: 1_000,
  contractualGpCommitment: 100.004,
  hurdleRate: 0.01,
  grossMultiple: 1.31,
  carryPct: 0.2,
  feeRate: 0.000001,
} as const;

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

  it('rejects enabled fee catch-up but allows a disabled configuration', () => {
    const feeProfileWithCatchUp = {
      id: 'retroactive-fee-profile',
      name: 'Retroactive fee profile',
      feeTiers: [
        {
          id: 'committed-fee',
          name: 'Committed capital fee',
          percentage: 2,
          feeBasis: 'committed_capital' as const,
          startMonth: 1,
        },
      ],
      retroactiveFeeCatchUp: { enabled: true, accrualStartMonth: 0 },
    };

    expect(() =>
      runEconomicsModel(
        baseDraft({
          feeProfiles: [
            {
              ...feeProfileWithCatchUp,
              retroactiveFeeCatchUp: { enabled: false, accrualStartMonth: 0 },
            },
          ],
        })
      )
    ).not.toThrow();

    expect(() => runEconomicsModel(baseDraft({ feeProfiles: [feeProfileWithCatchUp] }))).toThrow(
      'feeProfiles.0.retroactiveFeeCatchUp: GP economics does not support retroactive management fee catch-up; returning a result would omit the catch-up'
    );
  });

  it('rejects period-flow fee bases on sub-annual economics grids', () => {
    const tiers = [
      {
        id: 'period-flow-fee',
        name: 'Period flow fee',
        rate: 0.02,
        basis: 'called_capital_period',
        startYear: 1,
      },
    ] satisfies EconomicsFeeTierV1[];

    expect(() => assertEconomicsFeeGridSupported({ yearFraction: '0.25' }, tiers)).toThrow(
      'feeModel.tiers.0.basis: Period-flow fee bases require an annual economics grid because this engine prorates every fee basis on sub-annual periods'
    );
    expect(() => assertEconomicsFeeGridSupported({ yearFraction: '1' }, tiers)).not.toThrow();
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

  it('keeps explicit zero cashless GP commitment outputs identical to omission', () => {
    const omitted = runEconomicsModel(baseDraft());
    const explicitZero = runEconomicsModel(baseDraft({ fundedFromFeesPct: 0 }));

    expect(explicitZero).toEqual(omitted);
  });

  it('excludes cashless GP commitment from calls while preserving period reconciliation', () => {
    const result = runEconomicsModel(
      baseDraft({
        fundedFromFeesPct: 0.25,
      })
    );

    expect(result.annual[0]?.lpCapitalCalls).toBe(9_000_000);
    expect(result.annual[0]?.gpCommitmentCalls).toBe(750_000);
    expect(result.annual[9]?.gpCommitmentCalls).toBe(750_000);
    expect(result.summary.totalGpCommitmentCalled).toBe(7_500_000);
    expect(result.checks.passed).toBe(true);
  });

  it.each(GP_COMMITMENT_SCENARIOS)(
    'uses cash-only return-of-capital and preferred-return bases for $name GP commitment',
    ({
      fundedFromFeesPct,
      expectedGpReturnOfCapital,
      expectedGpPreferredReturn,
      expectedGpResidual,
      expectedGpInvestmentDistributions,
    }) => {
      const gpCashContribution =
        GP_COMMITMENT_TRUTH_CASE.contractualGpCommitment * (1 - fundedFromFeesPct);
      const gpDeemedContribution =
        GP_COMMITMENT_TRUTH_CASE.contractualGpCommitment - gpCashContribution;
      const lpCashContribution =
        GP_COMMITMENT_TRUTH_CASE.fundSize - GP_COMMITMENT_TRUTH_CASE.contractualGpCommitment;
      const cashReturnOfCapitalBase = lpCashContribution + gpCashContribution;
      const cashPreferredReturn = cashReturnOfCapitalBase * GP_COMMITMENT_TRUTH_CASE.hurdleRate;
      const grossExitProceeds = cashReturnOfCapitalBase * GP_COMMITMENT_TRUTH_CASE.grossMultiple;
      const profitAfterCashHurdle =
        grossExitProceeds - cashReturnOfCapitalBase - cashPreferredReturn;
      const expectedLpCapitalCalls = roundCurrency(lpCashContribution);
      const expectedGpCommitmentCalls = roundCurrency(gpCashContribution);
      const expectedGrossExitProceeds = roundCurrency(grossExitProceeds);
      const expectedFeesPaidToManager = roundCurrency(
        GP_COMMITMENT_TRUTH_CASE.fundSize * GP_COMMITMENT_TRUTH_CASE.feeRate
      );
      const expectedGpDeemedContribution = roundCurrency(gpDeemedContribution);
      const expectedGpCarryDistributed = roundCurrency(
        profitAfterCashHurdle * GP_COMMITMENT_TRUTH_CASE.carryPct
      );
      // Annual output exposes the three GP waterfall tiers only as this aggregate. These
      // independent fixture constants pin cash-only capital and preferred attribution while
      // retaining full contractual ownership for residual investment profit.
      expect(
        sum([expectedGpReturnOfCapital, expectedGpPreferredReturn, expectedGpResidual]).toNumber()
      ).toBe(expectedGpInvestmentDistributions);

      const result = runEconomicsModel(gpCommitmentTruthCaseDraft(fundedFromFeesPct));
      const row = result.annual[0];

      if (!row) {
        throw new Error('Expected one annual row for the GP commitment truth case');
      }

      expect(row.lpCapitalCalls).toBe(expectedLpCapitalCalls);
      expect(row.gpCommitmentCalls).toBe(expectedGpCommitmentCalls);
      expect(row.grossExitProceeds).toBe(expectedGrossExitProceeds);
      expect(row.feesPaidToManager).toBe(expectedFeesPaidToManager);
      expect(row.gpInvestmentDistributions).toBe(expectedGpInvestmentDistributions);
      expect(row.gpCarryDistributed).toBe(expectedGpCarryDistributed);

      const actualGpDeemedContribution = roundCurrency(
        GP_COMMITMENT_TRUTH_CASE.contractualGpCommitment - row.gpCommitmentCalls
      );
      expect(actualGpDeemedContribution).toBe(expectedGpDeemedContribution);

      if (fundedFromFeesPct === 1) {
        // This fixture deliberately sets one year of actual fee income equal to the full
        // deemed commitment; ADR-070 does not infer this equality for other fee profiles.
        expect(row.feesPaidToManager).toBe(actualGpDeemedContribution);
      } else if (fundedFromFeesPct === 0) {
        expect(actualGpDeemedContribution).toBe(0);
      }

      if (gpDeemedContribution > 0) {
        const carryIfDeemedAccruedReturnOfCapitalAndPref =
          (grossExitProceeds -
            GP_COMMITMENT_TRUTH_CASE.fundSize -
            GP_COMMITMENT_TRUTH_CASE.fundSize * GP_COMMITMENT_TRUTH_CASE.hurdleRate) *
          GP_COMMITMENT_TRUTH_CASE.carryPct;

        expect(row.gpCarryDistributed).toBeGreaterThan(
          roundCurrency(carryIfDeemedAccruedReturnOfCapitalAndPref)
        );
      }

      expect(result.checks.passed).toBe(true);
    }
  );

  it('rounds GP investment distributions once at the public aggregate boundary', () => {
    const fundSize = new Decimal(GP_AGGREGATE_ROUNDING_CASE.fundSize);
    const contractualGpCommitment = new Decimal(GP_AGGREGATE_ROUNDING_CASE.contractualGpCommitment);
    const hurdleRate = new Decimal(GP_AGGREGATE_ROUNDING_CASE.hurdleRate);
    const grossMultiple = new Decimal(GP_AGGREGATE_ROUNDING_CASE.grossMultiple);
    const carryPct = new Decimal(GP_AGGREGATE_ROUNDING_CASE.carryPct);
    const gpCashInvestmentShare = contractualGpCommitment.div(fundSize);
    const rawGpReturnOfCapital = fundSize.times(gpCashInvestmentShare);
    const rawGpPreferredReturn = fundSize.times(hurdleRate).times(gpCashInvestmentShare);
    const profitAfterHurdle = fundSize
      .times(grossMultiple)
      .minus(fundSize)
      .minus(fundSize.times(hurdleRate));
    const rawGpResidual = profitAfterHurdle
      .times(new Decimal(1).minus(carryPct))
      .times(gpCashInvestmentShare);
    const rawGpLeaves = [rawGpReturnOfCapital, rawGpPreferredReturn, rawGpResidual];

    expect(rawGpLeaves.map((value) => value.toString())).toEqual([
      '100.004',
      '1.00004',
      '24.00096',
    ]);
    // Leaf-first rounding would produce 100.00 + 1.00 + 24.00 = 125.00.
    expect(sum(rawGpLeaves.map((value) => roundCurrency(value))).toNumber()).toBe(125);
    const rawGpAggregate = sum(rawGpLeaves);
    expect(rawGpAggregate.toString()).toBe('125.005');
    expect(roundCurrency(rawGpAggregate)).toBe(125.01);

    const result = runEconomicsModel(gpCommitmentTruthCaseDraft(0, GP_AGGREGATE_ROUNDING_CASE));

    expect(result.annual[0]?.gpInvestmentDistributions).toBe(125.01);
    expect(result.checks.passed).toBe(true);
  });

  it('keeps deemed GP commitment in the waterfall capital account', () => {
    const result = runEconomicsModel(
      baseDraft({
        fundLife: 1,
        investmentPeriod: 1,
        fundedFromFeesPct: 1,
        economicsAssumptions: {
          ...baseAssumptions(),
          timeline: {
            fundLifeYears: 1,
            period: 'annual',
            vintageYear: 2026,
          },
          feeModel: {
            source: 'legacy_fee_profiles',
            defaultRate: GP_COMMITMENT_TRUTH_CASE.feeRate,
            defaultBasis: 'committed_capital',
          },
          exitModel: {
            mode: 'cohort',
            cohort: {
              exitDistributionByYear: [1],
              grossMultiple: 2,
              lossRatio: 0,
            },
          },
          waterfallModel: {
            ...baseAssumptions().waterfallModel,
            hurdleRate: 0,
            prefType: 'none',
            prefCatchUp: false,
            clawbackEnabled: false,
          },
        },
      })
    );

    expect(result.annual[0]?.lpCapitalCalls).toBe(90_000_000);
    expect(result.annual[0]?.gpCommitmentCalls).toBe(0);
    expect(result.annual[0]?.gpCarryDistributed).toBe(18_000_000);
    expect(result.checks.passed).toBe(true);
  });

  it('does not use cashless GP contribution to reduce called-capital fee bases', () => {
    const assumptions: NonNullable<FundDraftWriteV1['economicsAssumptions']> = {
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
    };
    const cash = runEconomicsModel(baseDraft({ economicsAssumptions: assumptions }));
    const cashless = runEconomicsModel(
      baseDraft({ economicsAssumptions: assumptions, fundedFromFeesPct: 0.25 })
    );

    expect(cashless.annual.map((row) => row.feesPaidToManager)).toEqual(
      cash.annual.map((row) => row.feesPaidToManager)
    );
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

  it('charges the called-capital-each-period basis on the current period call only', () => {
    const result = runEconomicsModel(
      baseDraft({
        economicsAssumptions: {
          ...baseAssumptions(),
          feeModel: {
            source: 'economics_override',
            tiers: [
              {
                id: 'period-called-fee',
                name: 'Called capital each period fee',
                rate: 0.02,
                basis: 'called_capital_period',
                startYear: 1,
              },
            ],
          },
        },
      })
    );

    // 100M over 10 years calls 10M each year, so the fee is flat at 2% of 10M.
    expect(result.annual[0]?.feesPaidToManager).toBe(200_000);
    expect(result.annual[4]?.feesPaidToManager).toBe(200_000);
    expect(result.annual[9]?.feesPaidToManager).toBe(200_000);
    expect(result.summary.totalManagementFees).toBe(2_000_000);
    expect(result.checks.passed).toBe(true);
  });

  it('accepts the called-capital-each-period basis from a legacy fee profile', () => {
    const result = runEconomicsModel(
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
    );

    expect(result.annual[0]?.feesPaidToManager).toBe(200_000);
    expect(result.summary.totalManagementFees).toBe(2_000_000);
  });

  // Guards the class of gap that #1310 reported: a fee basis that the
  // fund-draft contract offers but the economics engine cannot normalize.
  const draftFeeBases = [
    'committed_capital',
    'called_capital_period',
    'gross_cumulative_called',
    'net_cumulative_called',
    'cumulative_invested',
    'fair_market_value',
    'unrealized_investments',
  ] as const;

  it.each(draftFeeBases)(
    'accepts the %s fee basis offered by the fund-draft contract',
    (feeBasis) => {
      const result = runEconomicsModel(
        baseDraft({
          feeProfiles: [
            {
              id: 'legacy-profile',
              name: 'Legacy profile',
              feeTiers: [
                {
                  id: 'legacy-tier',
                  name: `${feeBasis} fee`,
                  percentage: 2,
                  feeBasis,
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
      );

      expect(result.summary.totalManagementFees).toBeGreaterThanOrEqual(0);
    }
  );

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
                  name: 'Unknown basis fee',
                  percentage: 2,
                  feeBasis: 'net_asset_value' as 'committed_capital',
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

function gpCommitmentTruthCaseDraft(
  fundedFromFeesPct: number,
  fixture: {
    fundSize: number;
    contractualGpCommitment: number;
    hurdleRate: number;
    grossMultiple: number;
    carryPct: number;
    feeRate: number;
  } = GP_COMMITMENT_TRUTH_CASE
): FundDraftWriteV1 {
  const assumptions = baseAssumptions();

  if (!assumptions.waterfallModel) {
    throw new Error('Expected base economics assumptions to include a waterfall model');
  }

  return baseDraft({
    fundSize: fixture.fundSize,
    gpCommitment: fixture.contractualGpCommitment,
    fundedFromFeesPct,
    fundLife: 1,
    investmentPeriod: 1,
    economicsAssumptions: {
      ...assumptions,
      timeline: {
        fundLifeYears: 1,
        period: 'annual',
        vintageYear: 2026,
      },
      feeModel: {
        source: 'legacy_fee_profiles',
        defaultRate: fixture.feeRate,
        defaultBasis: 'committed_capital',
      },
      exitModel: {
        mode: 'cohort',
        cohort: {
          exitDistributionByYear: [1],
          grossMultiple: fixture.grossMultiple,
          lossRatio: 0,
        },
      },
      waterfallModel: {
        ...assumptions.waterfallModel,
        carryPct: fixture.carryPct,
        hurdleRate: fixture.hurdleRate,
        prefType: 'simple',
        prefCatchUp: false,
        clawbackEnabled: false,
      },
      gpCommitmentModel: {
        commitmentAmount: fixture.contractualGpCommitment,
        participatesInInvestmentReturns: true,
      },
    },
  });
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
