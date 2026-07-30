import { z } from 'zod';

import { CurrentForecastV2Schema } from '../current-forecast-v2.contract';
import { CurrentPlanVersionV1Schema } from '../current-plan-version-v1.contract';
import { FundDraftWriteV1Schema } from '../fund-draft-write-v1.contract';
import { Decimal } from '../../lib/decimal-config';
import { MoneyDecimalStringSchema } from '../../lib/decimal-string';
import { FEE_DRAG_COMPILER_VERSION } from '../../lib/economics/fee-drag-compiler';

export const EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION = 'effective-fee-expense-bridge/1.0.0' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ZeroMoneyDecimalStringSchema = z.literal('0.000000');
const NonnegativeMoneyDecimalStringSchema = MoneyDecimalStringSchema.pipe(
  z
    .string()
    .refine(
      (value) => !value.startsWith('-') && new Decimal(value).gte(0),
      'Money must be a canonical nonnegative decimal string.'
    )
);

const CALENDAR_QUARTER_BOUNDS = [
  ['01-01', '03-31'],
  ['04-01', '06-30'],
  ['07-01', '09-30'],
  ['10-01', '12-31'],
] as const;

export function isExactCalendarQuarterV1(periodStart: string, periodEnd: string): boolean {
  const year = periodStart.slice(0, 4);
  return CALENDAR_QUARTER_BOUNDS.some(
    ([start, end]) => periodStart === `${year}-${start}` && periodEnd === `${year}-${end}`
  );
}

export function nextCalendarQuarterStartV1(periodStart: string): string | null {
  const year = Number(periodStart.slice(0, 4));
  const monthDay = periodStart.slice(5);
  const quarterIndex = CALENDAR_QUARTER_BOUNDS.findIndex(([start]) => start === monthDay);
  if (!Number.isInteger(year) || quarterIndex < 0) return null;
  if (quarterIndex === CALENDAR_QUARTER_BOUNDS.length - 1) {
    return `${String(year + 1).padStart(4, '0')}-01-01`;
  }
  return `${String(year).padStart(4, '0')}-${CALENDAR_QUARTER_BOUNDS[quarterIndex + 1]![0]}`;
}

export const EffectiveFeeExpenseBridgeInputV1Schema = z
  .object({
    config: FundDraftWriteV1Schema,
    currentPlan: CurrentPlanVersionV1Schema,
    forecast: CurrentForecastV2Schema,
    totalCommitmentUsd: NonnegativeMoneyDecimalStringSchema,
  })
  .strict();

export const EffectiveFeeExpenseQuarterV1Schema = z
  .object({
    periodStart: z.string().date(),
    periodEnd: z.string().date(),
    scheduledManagementFeeUsd: ZeroMoneyDecimalStringSchema,
    scheduledFundExpenseUsd: ZeroMoneyDecimalStringSchema,
    planUpfrontFeeReserveUsd: ZeroMoneyDecimalStringSchema,
    forecastNavEmbeddedFeeUsd: ZeroMoneyDecimalStringSchema,
    economicsFeeCashDebitUsd: ZeroMoneyDecimalStringSchema,
    economicsExpenseCashDebitUsd: ZeroMoneyDecimalStringSchema,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.periodStart > value.periodEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'periodStart must not be after periodEnd.',
        path: ['periodEnd'],
      });
    }
    if (!isExactCalendarQuarterV1(value.periodStart, value.periodEnd)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Period must use exact calendar-quarter bounds.',
        path: ['periodStart'],
      });
    }
  });

export const EffectiveFeeExpenseBridgeV1Schema = z
  .object({
    contractVersion: z.literal(EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION),
    applicationMode: z.literal('zero_fee_zero_expense'),
    compilerVersion: z.literal(FEE_DRAG_COMPILER_VERSION),
    capitalBaseUsd: NonnegativeMoneyDecimalStringSchema,
    quarterlyVector: z.array(EffectiveFeeExpenseQuarterV1Schema),
    effectiveFeeExpenseHash: Sha256Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    const seenPeriods = new Set<string>();
    value.quarterlyVector.forEach((period, index) => {
      const periodKey = `${period.periodStart}/${period.periodEnd}`;
      if (seenPeriods.has(periodKey)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'quarterlyVector periods must be unique.',
          path: ['quarterlyVector', index],
        });
      }
      seenPeriods.add(periodKey);
    });

    for (let index = 1; index < value.quarterlyVector.length; index += 1) {
      const previous = value.quarterlyVector[index - 1]!;
      const current = value.quarterlyVector[index]!;
      if (
        previous.periodStart === current.periodStart &&
        previous.periodEnd === current.periodEnd
      ) {
        continue;
      }
      if (current.periodStart < previous.periodStart) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'quarterlyVector periods must be chronological.',
          path: ['quarterlyVector', index],
        });
        continue;
      }
      if (current.periodStart <= previous.periodEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'quarterlyVector periods must not overlap.',
          path: ['quarterlyVector', index],
        });
        continue;
      }
      if (
        isExactCalendarQuarterV1(previous.periodStart, previous.periodEnd) &&
        isExactCalendarQuarterV1(current.periodStart, current.periodEnd) &&
        nextCalendarQuarterStartV1(previous.periodStart) !== current.periodStart
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'quarterlyVector periods must be continuous.',
          path: ['quarterlyVector', index],
        });
      }
    }
  });

export type EffectiveFeeExpenseBridgeInputV1 = z.infer<
  typeof EffectiveFeeExpenseBridgeInputV1Schema
>;
export type EffectiveFeeExpenseQuarterV1 = z.infer<typeof EffectiveFeeExpenseQuarterV1Schema>;
export type EffectiveFeeExpenseBridgeV1 = z.infer<typeof EffectiveFeeExpenseBridgeV1Schema>;

export type EffectiveFeeExpenseBridgeResultV1 =
  | { ok: true; bridge: EffectiveFeeExpenseBridgeV1 }
  | {
      ok: false;
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE';
      reasons: string[];
    };
