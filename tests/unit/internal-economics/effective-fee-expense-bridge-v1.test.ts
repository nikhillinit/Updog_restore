import { describe, expect, it } from 'vitest';

import type { CurrentForecastV2 } from '../../../shared/contracts/current-forecast-v2.contract';
import type { CurrentPlanVersionV1 } from '../../../shared/contracts/current-plan-version-v1.contract';
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
  EffectiveFeeExpenseBridgeV1Schema,
} from '../../../shared/contracts/internal-economics/effective-fee-expense-bridge-v1.contract';
import { FEE_DRAG_COMPILER_VERSION } from '../../../shared/lib/economics/fee-drag-compiler';
import { buildEffectiveFeeExpenseBridgeV1 } from '../../../shared/lib/internal-economics/effective-fee-expense-bridge-v1';

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';
const TOTAL_COMMITMENT_USD = '1000000.000000';
const HASH = 'a'.repeat(64);

function zeroCostConfig(): FundDraftWriteV1 {
  return {
    fundName: 'Zero Cost Fund',
    managementFeeRate: 0,
    lpClasses: [
      {
        id: 'class-a',
        name: 'Class A',
        targetAllocation: 100,
        managementFeeRate: 0,
      },
    ],
    feeProfiles: [
      {
        id: 'legacy-fees',
        name: 'Legacy Fees',
        feeTiers: [
          {
            id: 'legacy-tier',
            name: 'Legacy Tier',
            percentage: 0,
            feeBasis: 'committed_capital',
            startMonth: 1,
          },
        ],
      },
    ],
    fundExpenses: [
      {
        id: 'legacy-expense',
        category: 'Administration',
        monthlyAmount: 0,
        startMonth: 1,
      },
    ],
    economicsAssumptions: {
      version: 'v1',
      feeModel: {
        source: 'economics_override',
        tiers: [
          {
            id: 'economics-tier',
            name: 'Economics Tier',
            rate: 0,
            basis: 'committed_capital',
            startYear: 1,
          },
        ],
        defaultRate: 0,
        defaultBasis: 'committed_capital',
      },
      expenseModel: {
        source: 'economics_override',
        annualExpenses: [
          {
            id: 'economics-expense',
            category: 'Administration',
            amount: 0,
            startYear: 1,
          },
        ],
        orgExpenseCap: 0,
        orgExpenseCapType: 'absolute',
      },
    },
  };
}

function zeroCostPlan(): CurrentPlanVersionV1 {
  return {
    contractVersion: 'current-plan-version-v1',
    id: 'plan-1',
    fundId: 1,
    version: 1,
    sourceConfigId: 1,
    sourceConfigVersion: 1,
    sourceFactsSnapshotId: 'facts-1',
    deployableCapitalUsd: TOTAL_COMMITMENT_USD,
    planTransformationVersion: 'fund-config-to-current-plan/1.0.0',
    allocations: [],
    pacingAssumptions: {
      contractVersion: 'current-plan-pacing-v1',
      deploymentQuarters: 2,
      quarterlyDeploymentPcts: ['0.500000000000', '0.500000000000'],
      followOnReservePct: ZERO_RATIO,
      annualFeeDragPct: ZERO_RATIO,
    },
    cohortAssumptions: {
      contractVersion: 'current-plan-cohort-v1',
      averageInitialCheckUsd: ZERO_MONEY,
      stageDistribution: [],
      graduationMatrix: [],
      exitAssumptions: [],
    },
    reservePolicyVersion: 'reserve-policy/1.0.0',
    assumptionsHash: HASH,
    supersedesVersionId: null,
    supersededByVersionId: null,
    createdAt: '2026-07-30T00:00:00.000Z',
  };
}

function forecastPoint(
  periodStart: string,
  periodEnd: string,
  source: 'actual' | 'projected'
): CurrentForecastV2['series'][number] {
  return {
    periodStart,
    periodEnd,
    source,
    deployedUsd: ZERO_MONEY,
    contributionsUsd: ZERO_MONEY,
    distributionsUsd: ZERO_MONEY,
    navUsd: ZERO_MONEY,
    tvpi: ZERO_RATIO,
    dpi: ZERO_RATIO,
    activeCompanyCount: 0,
    projectedCohortCount: 0,
  };
}

function zeroCostForecast(): CurrentForecastV2 {
  return {
    contractVersion: 'current-forecast-v2',
    fundId: 1,
    financialFactsSnapshotId: 'facts-1',
    currentPlanVersionId: 'plan-1',
    asOfDate: '2026-06-30',
    status: 'available',
    series: [
      forecastPoint('2026-07-01', '2026-09-30', 'projected'),
      forecastPoint('2026-04-01', '2026-06-30', 'actual'),
      forecastPoint('2026-10-01', '2026-12-31', 'projected'),
    ],
    remainingDeployableCapitalUsd: TOTAL_COMMITMENT_USD,
    committedCapitalUsd: TOTAL_COMMITMENT_USD,
    calledToDateUsd: ZERO_MONEY,
    projectedFeesRemainingUsd: ZERO_MONEY,
    recallableDistributionsUsd: ZERO_MONEY,
    uncalledCapitalUsd: TOTAL_COMMITMENT_USD,
    netIrr: null,
    inputHash: HASH,
    assumptionsHash: HASH,
    resultHash: HASH,
    engineVersion: 'current-forecast-v2-engine/1.0.0',
    methodologyVersion: 'cohort-projection-v2/1.0.0',
    unavailableReasons: [],
    warnings: [],
  };
}

function compatibleInput() {
  return {
    config: zeroCostConfig(),
    currentPlan: zeroCostPlan(),
    forecast: zeroCostForecast(),
    totalCommitmentUsd: TOTAL_COMMITMENT_USD,
  };
}

function expectIncompatible(
  input: ReturnType<typeof compatibleInput>,
  expectedReason: string
): void {
  const result = buildEffectiveFeeExpenseBridgeV1(input);

  expect(result).toEqual({
    ok: false,
    code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
    reasons: [expectedReason],
  });
}

describe('buildEffectiveFeeExpenseBridgeV1', () => {
  it('builds canonical all-zero entries for projected quarters only', () => {
    const result = buildEffectiveFeeExpenseBridgeV1(compatibleInput());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(EffectiveFeeExpenseBridgeV1Schema.parse(result.bridge)).toEqual(result.bridge);
    expect(result.bridge).toEqual({
      contractVersion: EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
      applicationMode: 'zero_fee_zero_expense',
      compilerVersion: FEE_DRAG_COMPILER_VERSION,
      capitalBaseUsd: TOTAL_COMMITMENT_USD,
      quarterlyVector: [
        {
          periodStart: '2026-07-01',
          periodEnd: '2026-09-30',
          scheduledManagementFeeUsd: ZERO_MONEY,
          scheduledFundExpenseUsd: ZERO_MONEY,
          planUpfrontFeeReserveUsd: ZERO_MONEY,
          forecastNavEmbeddedFeeUsd: ZERO_MONEY,
          economicsFeeCashDebitUsd: ZERO_MONEY,
          economicsExpenseCashDebitUsd: ZERO_MONEY,
        },
        {
          periodStart: '2026-10-01',
          periodEnd: '2026-12-31',
          scheduledManagementFeeUsd: ZERO_MONEY,
          scheduledFundExpenseUsd: ZERO_MONEY,
          planUpfrontFeeReserveUsd: ZERO_MONEY,
          forecastNavEmbeddedFeeUsd: ZERO_MONEY,
          economicsFeeCashDebitUsd: ZERO_MONEY,
          economicsExpenseCashDebitUsd: ZERO_MONEY,
        },
      ],
      effectiveFeeExpenseHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
  });

  it('sorts projected periods before hashing and returns a stable hash', () => {
    const ordered = compatibleInput();
    const reversed = compatibleInput();
    reversed.forecast.series.reverse();

    const orderedResult = buildEffectiveFeeExpenseBridgeV1(ordered);
    const reversedResult = buildEffectiveFeeExpenseBridgeV1(reversed);

    expect(orderedResult).toEqual(reversedResult);
  });

  it('pins the compiler version in the bridge contract', () => {
    const result = buildEffectiveFeeExpenseBridgeV1(compatibleInput());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(
      EffectiveFeeExpenseBridgeV1Schema.safeParse({
        ...result.bridge,
        compilerVersion: 'different-compiler/1.0.0',
      }).success
    ).toBe(false);
  });

  it('supports an empty projected horizon with an empty canonical vector', () => {
    const input = compatibleInput();
    input.forecast.series = input.forecast.series.filter((period) => period.source === 'actual');

    const result = buildEffectiveFeeExpenseBridgeV1(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bridge.quarterlyVector).toEqual([]);
  });

  it.each([
    [
      'managementFeeRate',
      (input: ReturnType<typeof compatibleInput>) => {
        delete input.config.managementFeeRate;
      },
    ],
    [
      'lpClasses',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.lpClasses = [];
      },
    ],
    [
      'feeProfiles',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.feeProfiles = [];
      },
    ],
    [
      'fundExpenses',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.fundExpenses = [];
      },
    ],
    [
      'economicsAssumptions.feeModel.tiers',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.economicsAssumptions!.feeModel!.tiers = [];
      },
    ],
    [
      'economicsAssumptions.feeModel.defaultRate',
      (input: ReturnType<typeof compatibleInput>) => {
        delete input.config.economicsAssumptions!.feeModel!.defaultRate;
      },
    ],
    [
      'economicsAssumptions.expenseModel.annualExpenses',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.economicsAssumptions!.expenseModel!.annualExpenses = [];
      },
    ],
    [
      'economicsAssumptions.expenseModel.orgExpenseCap',
      (input: ReturnType<typeof compatibleInput>) => {
        delete input.config.economicsAssumptions!.expenseModel!.orgExpenseCap;
      },
    ],
  ])('rejects absent or empty source channel %s', (reason, mutate) => {
    const input = compatibleInput();
    mutate(input);
    expectIncompatible(input, reason);
  });

  it.each([
    [
      'managementFeeRate',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.managementFeeRate = 0.01;
      },
    ],
    [
      'lpClasses[0].managementFeeRate',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.lpClasses![0]!.managementFeeRate = 0.01;
      },
    ],
    [
      'feeProfiles[0].feeTiers[0].percentage',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.feeProfiles![0]!.feeTiers[0]!.percentage = 0.01;
      },
    ],
    [
      'fundExpenses[0].monthlyAmount',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.fundExpenses![0]!.monthlyAmount = 1;
      },
    ],
    [
      'economicsAssumptions.feeModel.tiers[0].rate',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.01;
      },
    ],
    [
      'economicsAssumptions.feeModel.defaultRate',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.economicsAssumptions!.feeModel!.defaultRate = 0.01;
      },
    ],
    [
      'economicsAssumptions.expenseModel.annualExpenses[0].amount',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = 1;
      },
    ],
    [
      'economicsAssumptions.expenseModel.orgExpenseCap',
      (input: ReturnType<typeof compatibleInput>) => {
        input.config.economicsAssumptions!.expenseModel!.orgExpenseCap = 1;
      },
    ],
  ])('rejects nonzero source field %s', (reason, mutate) => {
    const input = compatibleInput();
    mutate(input);
    expectIncompatible(input, reason);
  });

  it('rejects a nonzero tier outside the forecast horizon even when flat drag compiles to zero', () => {
    const input = compatibleInput();
    input.config.economicsAssumptions!.feeModel!.tiers![0] = {
      ...input.config.economicsAssumptions!.feeModel!.tiers![0]!,
      rate: 0.01,
      startYear: 99,
    };

    expectIncompatible(input, 'economicsAssumptions.feeModel.tiers[0].rate');
  });

  it.each([
    [
      'currentPlan.pacingAssumptions.annualFeeDragPct',
      (input: ReturnType<typeof compatibleInput>) => {
        input.currentPlan.pacingAssumptions.annualFeeDragPct = '0.010000000000';
      },
    ],
    [
      'currentPlan.deployableCapitalUsd',
      (input: ReturnType<typeof compatibleInput>) => {
        input.currentPlan.deployableCapitalUsd = '999999.000000';
      },
    ],
    [
      'forecast.committedCapitalUsd',
      (input: ReturnType<typeof compatibleInput>) => {
        input.forecast.committedCapitalUsd = '999999.000000';
      },
    ],
    [
      'forecast.projectedFeesRemainingUsd',
      (input: ReturnType<typeof compatibleInput>) => {
        input.forecast.projectedFeesRemainingUsd = '1.000000';
      },
    ],
  ])('rejects reconciliation mismatch %s', (reason, mutate) => {
    const input = compatibleInput();
    mutate(input);
    expectIncompatible(input, reason);
  });

  it('sorts and deduplicates incompatibility reasons', () => {
    const input = compatibleInput();
    input.config.managementFeeRate = 0.01;
    input.config.lpClasses = [
      input.config.lpClasses![0]!,
      {
        ...input.config.lpClasses![0]!,
        id: 'class-b',
        managementFeeRate: 0.01,
      },
    ];
    input.currentPlan.pacingAssumptions.annualFeeDragPct = '0.010000000000';
    input.forecast.series.push(input.forecast.series[0]!, input.forecast.series[0]!);

    const result = buildEffectiveFeeExpenseBridgeV1(input);

    expect(result).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: [
        'currentPlan.pacingAssumptions.annualFeeDragPct',
        'forecast.series.projectedPeriods.duplicate',
        'lpClasses[1].managementFeeRate',
        'managementFeeRate',
      ],
    });
  });

  it('rejects duplicate projected forecast periods', () => {
    const input = compatibleInput();
    input.forecast.series.push(input.forecast.series[0]!);

    expectIncompatible(input, 'forecast.series.projectedPeriods.duplicate');
  });
});
