import type { FundDraftWriteV1 } from '../../contracts/fund-draft-write-v1.contract';
import {
  EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
  EffectiveFeeExpenseBridgeInputV1Schema,
  EffectiveFeeExpenseBridgeV1Schema,
  type EffectiveFeeExpenseBridgeResultV1,
  type EffectiveFeeExpenseBridgeInputV1,
  type EffectiveFeeExpenseQuarterV1,
  isExactCalendarQuarterV1,
  nextCalendarQuarterStartV1,
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

  if (config.lpClasses === undefined) {
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

  if (config.fundExpenses === undefined) {
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
    if (expenseModel.annualExpenses === undefined) {
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
  forecast: EffectiveFeeExpenseBridgeInputV1['forecast'],
  reasons: Set<string>
): Array<
  Pick<EffectiveFeeExpenseBridgeInputV1['forecast']['series'][number], 'periodStart' | 'periodEnd'>
> {
  const projected = forecast.series
    .filter((period) => period.source === 'projected')
    .map(({ periodStart, periodEnd }) => ({ periodStart, periodEnd }));

  projected.forEach((period) => {
    if (period.periodStart > period.periodEnd) {
      reasons.add('forecast.series.projectedPeriods.reversed');
    }
    if (!isExactCalendarQuarterV1(period.periodStart, period.periodEnd)) {
      reasons.add('forecast.series.projectedPeriods.calendarQuarter');
    }
  });

  const seenPeriods = new Set<string>();
  projected.forEach((period) => {
    const periodKey = `${period.periodStart}/${period.periodEnd}`;
    if (seenPeriods.has(periodKey)) {
      reasons.add('forecast.series.projectedPeriods.duplicate');
    }
    seenPeriods.add(periodKey);
  });

  for (let index = 1; index < projected.length; index += 1) {
    const previous = projected[index - 1]!;
    const current = projected[index]!;
    if (previous.periodStart === current.periodStart && previous.periodEnd === current.periodEnd) {
      continue;
    }
    if (current.periodStart < previous.periodStart) {
      reasons.add('forecast.series.projectedPeriods.order');
      continue;
    }
    if (current.periodStart <= previous.periodEnd) {
      reasons.add('forecast.series.projectedPeriods.overlap');
      continue;
    }
    if (
      isExactCalendarQuarterV1(previous.periodStart, previous.periodEnd) &&
      isExactCalendarQuarterV1(current.periodStart, current.periodEnd) &&
      nextCalendarQuarterStartV1(previous.periodStart) !== current.periodStart
    ) {
      reasons.add('forecast.series.projectedPeriods.gap');
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

function formatIssuePath(path: PropertyKey[]): string {
  return path.reduce<string>((formatted, segment) => {
    if (typeof segment === 'number') return `${formatted}[${segment}]`;
    const text = String(segment);
    return formatted.length === 0 ? text : `${formatted}.${text}`;
  }, '');
}

function collectSchemaReasons(
  issues: readonly {
    code: string;
    path: PropertyKey[];
    keys?: readonly string[];
  }[],
  reasons: Set<string>,
  root?: string
): void {
  issues.forEach((issue) => {
    if (issue.code === 'unrecognized_keys' && issue.keys !== undefined) {
      issue.keys.forEach((key) => {
        reasons.add(formatIssuePath(root ? [root, ...issue.path, key] : [...issue.path, key]));
      });
      return;
    }
    const reason = formatIssuePath(root ? [root, ...issue.path] : issue.path);
    reasons.add(reason || root || 'input');
  });
}

function incompatible(reasons: Set<string>): EffectiveFeeExpenseBridgeResultV1 {
  return {
    ok: false,
    code: INCOMPATIBLE_CODE,
    reasons: [...reasons].sort(),
  };
}

export function buildEffectiveFeeExpenseBridgeV1(
  input: EffectiveFeeExpenseBridgeInputV1
): EffectiveFeeExpenseBridgeResultV1 {
  const reasons = new Set<string>();
  const parsedInput = EffectiveFeeExpenseBridgeInputV1Schema.safeParse(input);
  if (!parsedInput.success) {
    collectSchemaReasons(parsedInput.error.issues, reasons);
    return incompatible(reasons);
  }
  const admitted = parsedInput.data;

  collectConfigReasons(admitted.config, reasons);
  addRequiredZero(
    reasons,
    'currentPlan.pacingAssumptions.annualFeeDragPct',
    admitted.currentPlan.pacingAssumptions.annualFeeDragPct
  );

  if (!new Decimal(admitted.currentPlan.deployableCapitalUsd).eq(admitted.totalCommitmentUsd)) {
    reasons.add('currentPlan.deployableCapitalUsd');
  }
  if (!new Decimal(admitted.forecast.committedCapitalUsd).eq(admitted.totalCommitmentUsd)) {
    reasons.add('forecast.committedCapitalUsd');
  }
  addRequiredZero(
    reasons,
    'forecast.projectedFeesRemainingUsd',
    admitted.forecast.projectedFeesRemainingUsd
  );

  const periods = projectedPeriods(admitted.forecast, reasons);
  if (reasons.size > 0) {
    return incompatible(reasons);
  }

  const hashPreimage = {
    contractVersion: EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION,
    applicationMode: 'zero_fee_zero_expense' as const,
    compilerVersion: FEE_DRAG_COMPILER_VERSION,
    capitalBaseUsd: admitted.totalCommitmentUsd,
    quarterlyVector: periods.map(allZeroEntry),
  };
  const bridgeCandidate = {
    ...hashPreimage,
    effectiveFeeExpenseHash: canonicalSha256(canonicalizeDecimalLeaves(hashPreimage)),
  };
  const parsedBridge = EffectiveFeeExpenseBridgeV1Schema.safeParse(bridgeCandidate);
  if (!parsedBridge.success) {
    collectSchemaReasons(parsedBridge.error.issues, reasons, 'bridge');
    return incompatible(reasons);
  }

  return { ok: true, bridge: parsedBridge.data };
}
