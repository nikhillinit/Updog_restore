import { describe, expect, it } from 'vitest';

import type { CurrentForecastV2 } from '../../../shared/contracts/current-forecast-v2.contract';
import type { CurrentPlanVersionV1 } from '../../../shared/contracts/current-plan-version-v1.contract';
import type { FundDraftWriteV1 } from '../../../shared/contracts/fund-draft-write-v1.contract';
import {
  EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
  EffectiveFeeExpenseBridgeV1Schema,
} from '../../../shared/contracts/internal-economics/effective-fee-expense-bridge-v1.contract';
import { canonicalSha256 } from '../../../shared/lib/canonical-hash';
import { canonicalizeDecimalLeaves } from '../../../shared/lib/decimal-string';
import { FEE_DRAG_COMPILER_VERSION } from '../../../shared/lib/economics/fee-drag-compiler';
import { buildEffectiveFeeExpenseBridgeV1 } from '../../../shared/lib/internal-economics/effective-fee-expense-bridge-v1';

const ZERO_MONEY = '0.000000';
const ZERO_RATIO = '0.000000000000';
const TOTAL_COMMITMENT_USD = '1000000.000000';
const HASH = 'a'.repeat(64);
const GOLDEN_EFFECTIVE_FEE_EXPENSE_HASH =
  '369f040dbdd0570f4084ef22c08276406f903d326b1a332f6b3924fc62cdeb31';

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
      stageDistribution: [{ stage: 'Seed', pct: '1.000000000000' }],
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

type CompatibleInput = ReturnType<typeof compatibleInput>;
type MutationCase = {
  name: string;
  reason: string;
  mutate: (input: CompatibleInput) => void;
};

function buildFromRuntimeInput(input: unknown) {
  return buildEffectiveFeeExpenseBridgeV1(input as CompatibleInput);
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
      effectiveFeeExpenseHash: GOLDEN_EFFECTIVE_FEE_EXPENSE_HASH,
    });
  });

  it('rejects projected periods that are not in chronological input order', () => {
    const reversed = compatibleInput();
    reversed.forecast.series.reverse();

    expectIncompatible(reversed, 'forecast.series.projectedPeriods.order');
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

  for (const invalidCapitalBaseUsd of ['-1.000000', '-0.000000']) {
    it(`rejects capitalBaseUsd ${invalidCapitalBaseUsd}`, () => {
      const result = buildEffectiveFeeExpenseBridgeV1(compatibleInput());
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(
        EffectiveFeeExpenseBridgeV1Schema.safeParse({
          ...result.bridge,
          capitalBaseUsd: invalidCapitalBaseUsd,
        }).success
      ).toBe(false);
    });
  }

  it('supports an empty projected horizon with an empty canonical vector', () => {
    const input = compatibleInput();
    input.forecast.series = input.forecast.series.filter((period) => period.source === 'actual');

    const result = buildEffectiveFeeExpenseBridgeV1(input);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bridge.quarterlyVector).toEqual([]);
  });

  it('accepts explicit empty non-schedule arrays as known zero', () => {
    const input = compatibleInput();
    input.config.lpClasses = [];
    input.config.fundExpenses = [];
    input.config.economicsAssumptions!.expenseModel!.annualExpenses = [];

    expect(buildEffectiveFeeExpenseBridgeV1(input).ok).toBe(true);
  });

  const absentCases: MutationCase[] = [
    {
      name: 'managementFeeRate',
      reason: 'managementFeeRate',
      mutate: (input) => {
        delete input.config.managementFeeRate;
      },
    },
    {
      name: 'lpClasses',
      reason: 'lpClasses',
      mutate: (input) => {
        delete input.config.lpClasses;
      },
    },
    {
      name: 'feeProfiles',
      reason: 'feeProfiles',
      mutate: (input) => {
        input.config.feeProfiles = [];
      },
    },
    {
      name: 'fundExpenses',
      reason: 'fundExpenses',
      mutate: (input) => {
        delete input.config.fundExpenses;
      },
    },
    {
      name: 'economics fee tiers',
      reason: 'economicsAssumptions.feeModel.tiers',
      mutate: (input) => {
        input.config.economicsAssumptions!.feeModel!.tiers = [];
      },
    },
    {
      name: 'economics default rate',
      reason: 'economicsAssumptions.feeModel.defaultRate',
      mutate: (input) => {
        delete input.config.economicsAssumptions!.feeModel!.defaultRate;
      },
    },
    {
      name: 'economics annual expenses',
      reason: 'economicsAssumptions.expenseModel.annualExpenses',
      mutate: (input) => {
        delete input.config.economicsAssumptions!.expenseModel!.annualExpenses;
      },
    },
    {
      name: 'economics organization expense cap',
      reason: 'economicsAssumptions.expenseModel.orgExpenseCap',
      mutate: (input) => {
        delete input.config.economicsAssumptions!.expenseModel!.orgExpenseCap;
      },
    },
  ];

  for (const testCase of absentCases) {
    it(`rejects absent or ambiguous source channel ${testCase.name}`, () => {
      const input = compatibleInput();
      testCase.mutate(input);
      expectIncompatible(input, testCase.reason);
    });
  }

  const nonzeroCases: MutationCase[] = [
    {
      name: 'managementFeeRate',
      reason: 'managementFeeRate',
      mutate: (input) => {
        input.config.managementFeeRate = 0.01;
      },
    },
    {
      name: 'LP-class managementFeeRate',
      reason: 'lpClasses[0].managementFeeRate',
      mutate: (input) => {
        input.config.lpClasses![0]!.managementFeeRate = 0.01;
      },
    },
    {
      name: 'legacy fee tier percentage',
      reason: 'feeProfiles[0].feeTiers[0].percentage',
      mutate: (input) => {
        input.config.feeProfiles![0]!.feeTiers[0]!.percentage = 0.01;
      },
    },
    {
      name: 'legacy fund expense',
      reason: 'fundExpenses[0].monthlyAmount',
      mutate: (input) => {
        input.config.fundExpenses![0]!.monthlyAmount = 1;
      },
    },
    {
      name: 'economics fee tier rate',
      reason: 'economicsAssumptions.feeModel.tiers[0].rate',
      mutate: (input) => {
        input.config.economicsAssumptions!.feeModel!.tiers![0]!.rate = 0.01;
      },
    },
    {
      name: 'economics default rate',
      reason: 'economicsAssumptions.feeModel.defaultRate',
      mutate: (input) => {
        input.config.economicsAssumptions!.feeModel!.defaultRate = 0.01;
      },
    },
    {
      name: 'economics annual expense',
      reason: 'economicsAssumptions.expenseModel.annualExpenses[0].amount',
      mutate: (input) => {
        input.config.economicsAssumptions!.expenseModel!.annualExpenses![0]!.amount = 1;
      },
    },
    {
      name: 'economics organization expense cap',
      reason: 'economicsAssumptions.expenseModel.orgExpenseCap',
      mutate: (input) => {
        input.config.economicsAssumptions!.expenseModel!.orgExpenseCap = 1;
      },
    },
  ];

  for (const testCase of nonzeroCases) {
    it(`rejects nonzero source field ${testCase.name}`, () => {
      const input = compatibleInput();
      testCase.mutate(input);
      expectIncompatible(input, testCase.reason);
    });
  }

  it('rejects a nonzero tier outside the forecast horizon even when flat drag compiles to zero', () => {
    const input = compatibleInput();
    input.config.economicsAssumptions!.feeModel!.tiers![0] = {
      ...input.config.economicsAssumptions!.feeModel!.tiers![0]!,
      rate: 0.01,
      startYear: 99,
    };

    expectIncompatible(input, 'economicsAssumptions.feeModel.tiers[0].rate');
  });

  const reconciliationCases: MutationCase[] = [
    {
      name: 'plan fee drag',
      reason: 'currentPlan.pacingAssumptions.annualFeeDragPct',
      mutate: (input) => {
        input.currentPlan.pacingAssumptions.annualFeeDragPct = '0.010000000000';
      },
    },
    {
      name: 'plan deployable capital',
      reason: 'currentPlan.deployableCapitalUsd',
      mutate: (input) => {
        input.currentPlan.deployableCapitalUsd = '999999.000000';
      },
    },
    {
      name: 'forecast committed capital',
      reason: 'forecast.committedCapitalUsd',
      mutate: (input) => {
        input.forecast.committedCapitalUsd = '999999.000000';
      },
    },
    {
      name: 'forecast projected fees',
      reason: 'forecast.projectedFeesRemainingUsd',
      mutate: (input) => {
        input.forecast.projectedFeesRemainingUsd = '1.000000';
      },
    },
  ];

  for (const testCase of reconciliationCases) {
    it(`rejects reconciliation mismatch ${testCase.name}`, () => {
      const input = compatibleInput();
      testCase.mutate(input);
      expectIncompatible(input, testCase.reason);
    });
  }

  it('returns typed sorted reasons for malformed and coercible runtime values', () => {
    const input = compatibleInput();
    const malformed = {
      ...input,
      totalCommitmentUsd: -1,
      config: {
        ...input.config,
        managementFeeRate: '0',
      },
    };

    expect(buildFromRuntimeInput(malformed)).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: ['config.managementFeeRate', 'totalCommitmentUsd'],
    });
  });

  it('returns typed incompatibility for missing required nested arrays and extra input keys', () => {
    const input = compatibleInput();
    const currentPlan = { ...input.currentPlan } as Record<string, unknown>;
    delete currentPlan['allocations'];

    expect(buildFromRuntimeInput({ ...input, currentPlan, unexpected: true })).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: ['currentPlan.allocations', 'unexpected'],
    });
  });

  it('parses the forecast contract and rejects a missing forecast series', () => {
    const input = compatibleInput();
    const forecast = { ...input.forecast } as Record<string, unknown>;
    delete forecast['series'];

    expect(buildFromRuntimeInput({ ...input, forecast })).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: ['forecast.series'],
    });
  });

  for (const invalidTotalCommitment of ['-1.000000', '-0.000000']) {
    it(`rejects nonnegative-money violation ${invalidTotalCommitment}`, () => {
      expect(
        buildFromRuntimeInput({
          ...compatibleInput(),
          totalCommitmentUsd: invalidTotalCommitment,
        })
      ).toEqual({
        ok: false,
        code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
        reasons: ['totalCommitmentUsd'],
      });
    });
  }

  it('returns typed incompatibility rather than throwing for malformed decimal strings', () => {
    const input = compatibleInput();

    expect(() =>
      buildFromRuntimeInput({
        ...input,
        totalCommitmentUsd: 'not-money',
      })
    ).not.toThrow();
    expect(
      buildFromRuntimeInput({
        ...input,
        totalCommitmentUsd: 'not-money',
      })
    ).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: ['totalCommitmentUsd'],
    });
  });

  it('rejects projected periods with non-calendar-quarter bounds', () => {
    const input = compatibleInput();
    input.forecast.series[0] = forecastPoint('2026-07-02', '2026-09-30', 'projected');

    expectIncompatible(input, 'forecast.series.projectedPeriods.calendarQuarter');
  });

  it('rejects gaps between projected calendar quarters', () => {
    const input = compatibleInput();
    input.forecast.series[2] = forecastPoint('2027-01-01', '2027-03-31', 'projected');

    expectIncompatible(input, 'forecast.series.projectedPeriods.gap');
  });

  it('rejects overlapping projected calendar quarters', () => {
    const input = compatibleInput();
    input.forecast.series[2] = forecastPoint('2026-09-01', '2026-11-30', 'projected');

    const result = buildEffectiveFeeExpenseBridgeV1(input);
    expect(result).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: [
        'forecast.series.projectedPeriods.calendarQuarter',
        'forecast.series.projectedPeriods.overlap',
      ],
    });
  });

  it('rejects reversed projected period bounds', () => {
    const input = compatibleInput();
    input.forecast.series[0] = forecastPoint('2026-09-30', '2026-07-01', 'projected');

    const result = buildEffectiveFeeExpenseBridgeV1(input);
    expect(result).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: [
        'forecast.series.projectedPeriods.calendarQuarter',
        'forecast.series.projectedPeriods.reversed',
      ],
    });
  });

  it('changes canonical hash with capital base, horizon, and compiler representation', () => {
    const baseline = buildEffectiveFeeExpenseBridgeV1(compatibleInput());
    expect(baseline.ok).toBe(true);
    if (!baseline.ok) return;

    const changedCapital = compatibleInput();
    changedCapital.totalCommitmentUsd = '2000000.000000';
    changedCapital.currentPlan.deployableCapitalUsd = '2000000.000000';
    changedCapital.forecast.committedCapitalUsd = '2000000.000000';
    const changedCapitalResult = buildEffectiveFeeExpenseBridgeV1(changedCapital);
    expect(changedCapitalResult.ok).toBe(true);
    if (!changedCapitalResult.ok) return;

    const changedHorizon = compatibleInput();
    changedHorizon.forecast.series = changedHorizon.forecast.series.filter(
      (period) => period.periodStart !== '2026-10-01'
    );
    const changedHorizonResult = buildEffectiveFeeExpenseBridgeV1(changedHorizon);
    expect(changedHorizonResult.ok).toBe(true);
    if (!changedHorizonResult.ok) return;

    const { effectiveFeeExpenseHash: _hash, ...preimage } = baseline.bridge;
    const changedCompilerHash = canonicalSha256(
      canonicalizeDecimalLeaves({
        ...preimage,
        compilerVersion: `${FEE_DRAG_COMPILER_VERSION} `,
      })
    );

    expect(changedCapitalResult.bridge.effectiveFeeExpenseHash).not.toBe(
      baseline.bridge.effectiveFeeExpenseHash
    );
    expect(changedHorizonResult.bridge.effectiveFeeExpenseHash).not.toBe(
      baseline.bridge.effectiveFeeExpenseHash
    );
    expect(changedCompilerHash).not.toBe(baseline.bridge.effectiveFeeExpenseHash);
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
    const firstProjected = input.forecast.series[0]!;
    input.forecast.series = [
      firstProjected,
      firstProjected,
      firstProjected,
      input.forecast.series[1]!,
      input.forecast.series[2]!,
    ];

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
    input.forecast.series.splice(1, 0, input.forecast.series[0]!);

    expectIncompatible(input, 'forecast.series.projectedPeriods.duplicate');
  });

  it('identifies a duplicate projected quarter even when it is non-adjacent', () => {
    const input = compatibleInput();
    input.forecast.series.push(input.forecast.series[0]!);

    const result = buildEffectiveFeeExpenseBridgeV1(input);
    expect(result).toEqual({
      ok: false,
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE',
      reasons: [
        'forecast.series.projectedPeriods.duplicate',
        'forecast.series.projectedPeriods.order',
      ],
    });
  });
});
