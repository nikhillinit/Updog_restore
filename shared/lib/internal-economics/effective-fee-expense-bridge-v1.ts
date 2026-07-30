import type { CurrentForecastV2 } from '../../contracts/current-forecast-v2.contract';
import type { CurrentPlanVersionV1 } from '../../contracts/current-plan-version-v1.contract';
import type { FundDraftWriteV1 } from '../../contracts/fund-draft-write-v1.contract';
import {
  EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
  type EffectiveFeeExpenseBridgeResultV1,
  type EffectiveFeeExpenseBridgeV1,
  type EffectiveFeeExpenseQuarterV1,
} from '../../contracts/internal-economics/effective-fee-expense-bridge-v1.contract';
import { canonicalSha256 } from '../canonical-hash';
import { Decimal } from '../decimal-config';
import { canonicalizeDecimalLeaves } from '../decimal-string';
import { FEE_DRAG_COMPILER_VERSION } from '../economics/fee-drag-compiler';

const ZERO_MONEY = '0.000000' as const;
const INCOMPATIBLE_CODE = 'FORECAST_FEE_BASIS_INCOMPATIBLE' as const;

function isZero(value: Decimal.Value): boolean {
  return new Decimal(value).eq(0);
}

function addRequiredZero(
  reasons: Set<string>,
  path: string,
  value: Decimal.Value | undefined
): void {
  if (value === undefined || !isZero(value)) {
    reasons.add(path);
  }
}

function collectConfigReasons(config: FundDraftWriteV1, reasons: Set<string>): void {
  addRequiredZero(reasons, 'managementFeeRate', config.managementFeeRate);

  if (config.lpClasses === undefined || config.lpClasses.length === 0) {
    reasons.add('lpClasses');
  } else {
    config.lpClasses.forEach((lpClass, index) => {
      addRequiredZero(reasons, `lpClasses[${index}].managementFeeRate`, lpClass.managementFeeRate);
    });
  }

  if (config.feeProfiles === undefined || config.feeProfiles.length === 0) {
    reasons.add('feeProfiles');
  } else {
    config.feeProfiles.forEach((profile, profileIndex) => {
      if (profile.feeTiers.length === 0) {
        reasons.add(`feeProfiles[${profileIndex}].feeTiers`);
      } else {
        profile.feeTiers.forEach((tier, tierIndex) => {
          addRequiredZero(
            reasons,
            `feeProfiles[${profileIndex}].feeTiers[${tierIndex}].percentage`,
            tier.percentage
          );
        });
      }
    });
  }

  if (config.fundExpenses === undefined || config.fundExpenses.length === 0) {
    reasons.add('fundExpenses');
  } else {
    config.fundExpenses.forEach((expense, index) => {
      addRequiredZero(reasons, `fundExpenses[${index}].monthlyAmount`, expense.monthlyAmount);
    });
  }

  const feeModel = config.economicsAssumptions?.feeModel;
  if (feeModel === undefined) {
    reasons.add('economicsAssumptions.feeModel');
  } else {
    if (feeModel.tiers === undefined || feeModel.tiers.length === 0) {
      reasons.add('economicsAssumptions.feeModel.tiers');
    } else {
      feeModel.tiers.forEach((tier, index) => {
        addRequiredZero(reasons, `economicsAssumptions.feeModel.tiers[${index}].rate`, tier.rate);
      });
    }
    addRequiredZero(reasons, 'economicsAssumptions.feeModel.defaultRate', feeModel.defaultRate);
  }

  const expenseModel = config.economicsAssumptions?.expenseModel;
  if (expenseModel === undefined) {
    reasons.add('economicsAssumptions.expenseModel');
  } else {
    if (expenseModel.annualExpenses === undefined || expenseModel.annualExpenses.length === 0) {
      reasons.add('economicsAssumptions.expenseModel.annualExpenses');
    } else {
      expenseModel.annualExpenses.forEach((expense, index) => {
        addRequiredZero(
          reasons,
          `economicsAssumptions.expenseModel.annualExpenses[${index}].amount`,
          expense.amount
        );
      });
    }
    addRequiredZero(
      reasons,
      'economicsAssumptions.expenseModel.orgExpenseCap',
      expenseModel.orgExpenseCap
    );
  }
}

function projectedPeriods(
  forecast: CurrentForecastV2,
  reasons: Set<string>
): Array<Pick<CurrentForecastV2['series'][number], 'periodStart' | 'periodEnd'>> {
  const projected = forecast.series
    .filter((period) => period.source === 'projected')
    .map(({ periodStart, periodEnd }) => ({ periodStart, periodEnd }))
    .sort(
      (left, right) =>
        left.periodStart.localeCompare(right.periodStart) ||
        left.periodEnd.localeCompare(right.periodEnd)
    );

  for (let index = 1; index < projected.length; index += 1) {
    const previous = projected[index - 1]!;
    const current = projected[index]!;
    if (previous.periodStart === current.periodStart && previous.periodEnd === current.periodEnd) {
      reasons.add('forecast.series.projectedPeriods.duplicate');
    }
  }

  return projected;
}

function allZeroEntry(period: {
  periodStart: string;
  periodEnd: string;
}): EffectiveFeeExpenseQuarterV1 {
  return {
    periodStart: period.periodStart,
    periodEnd: period.periodEnd,
    scheduledManagementFeeUsd: ZERO_MONEY,
    scheduledFundExpenseUsd: ZERO_MONEY,
    planUpfrontFeeReserveUsd: ZERO_MONEY,
    forecastNavEmbeddedFeeUsd: ZERO_MONEY,
    economicsFeeCashDebitUsd: ZERO_MONEY,
    economicsExpenseCashDebitUsd: ZERO_MONEY,
  };
}

export function buildEffectiveFeeExpenseBridgeV1(input: {
  config: FundDraftWriteV1;
  currentPlan: CurrentPlanVersionV1;
  forecast: CurrentForecastV2;
  totalCommitmentUsd: string;
}): EffectiveFeeExpenseBridgeResultV1 {
  const reasons = new Set<string>();

  collectConfigReasons(input.config, reasons);
  addRequiredZero(
    reasons,
    'currentPlan.pacingAssumptions.annualFeeDragPct',
    input.currentPlan.pacingAssumptions.annualFeeDragPct
  );

  if (!new Decimal(input.currentPlan.deployableCapitalUsd).eq(input.totalCommitmentUsd)) {
    reasons.add('currentPlan.deployableCapitalUsd');
  }
  if (!new Decimal(input.forecast.committedCapitalUsd).eq(input.totalCommitmentUsd)) {
    reasons.add('forecast.committedCapitalUsd');
  }
  addRequiredZero(
    reasons,
    'forecast.projectedFeesRemainingUsd',
    input.forecast.projectedFeesRemainingUsd
  );

  const periods = projectedPeriods(input.forecast, reasons);
  if (reasons.size > 0) {
    return {
      ok: false,
      code: INCOMPATIBLE_CODE,
      reasons: [...reasons].sort(),
    };
  }

  const hashPreimage = {
    contractVersion: EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
    applicationMode: 'zero_fee_zero_expense' as const,
    compilerVersion: FEE_DRAG_COMPILER_VERSION,
    capitalBaseUsd: input.totalCommitmentUsd,
    quarterlyVector: periods.map(allZeroEntry),
  };
  const bridge: EffectiveFeeExpenseBridgeV1 = {
    ...hashPreimage,
    effectiveFeeExpenseHash: canonicalSha256(canonicalizeDecimalLeaves(hashPreimage)),
  };

  return { ok: true, bridge };
}
