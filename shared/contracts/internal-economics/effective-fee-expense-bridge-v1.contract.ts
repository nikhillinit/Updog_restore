import { z } from 'zod';

import { MoneyDecimalStringSchema } from '../../lib/decimal-string';
import { FEE_DRAG_COMPILER_VERSION } from '../../lib/economics/fee-drag-compiler';

export const EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION = 'effective-fee-expense-bridge/1.0.0' as const;

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const ZeroMoneyDecimalStringSchema = z.literal('0.000000');

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
  .refine((value) => value.periodStart <= value.periodEnd, {
    message: 'periodStart must not be after periodEnd.',
    path: ['periodEnd'],
  });

export const EffectiveFeeExpenseBridgeV1Schema = z
  .object({
    contractVersion: z.literal(EFFECTIVE_FEE_EXPENSE_BRIDGE_VERSION),
    applicationMode: z.literal('zero_fee_zero_expense'),
    compilerVersion: z.literal(FEE_DRAG_COMPILER_VERSION),
    capitalBaseUsd: MoneyDecimalStringSchema,
    quarterlyVector: z.array(EffectiveFeeExpenseQuarterV1Schema),
    effectiveFeeExpenseHash: Sha256Schema,
  })
  .strict()
  .superRefine((value, ctx) => {
    for (let index = 1; index < value.quarterlyVector.length; index += 1) {
      const previous = value.quarterlyVector[index - 1]!;
      const current = value.quarterlyVector[index]!;
      if (
        previous.periodStart > current.periodStart ||
        (previous.periodStart === current.periodStart && previous.periodEnd >= current.periodEnd)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'quarterlyVector periods must be unique and chronological.',
          path: ['quarterlyVector', index],
        });
      }
    }
  });

export type EffectiveFeeExpenseQuarterV1 = z.infer<typeof EffectiveFeeExpenseQuarterV1Schema>;
export type EffectiveFeeExpenseBridgeV1 = z.infer<typeof EffectiveFeeExpenseBridgeV1Schema>;

export type EffectiveFeeExpenseBridgeResultV1 =
  | { ok: true; bridge: EffectiveFeeExpenseBridgeV1 }
  | {
      ok: false;
      code: 'FORECAST_FEE_BASIS_INCOMPATIBLE';
      reasons: string[];
    };
