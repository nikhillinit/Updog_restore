import { z } from 'zod';

/**
 * economics-period-v1.contract.ts
 *
 * Canonical period representation for fund economics.
 *
 * Authority
 * ---------
 * ADR-069 fixes MONTHLY as the authoritative accrual grain for economics.
 * Quarterly and annual are aggregation (presentation) grains only: every
 * quarter is exactly 3 canonical months and every year is exactly 12
 * canonical months, so aggregation is a pure regrouping of accrued amounts
 * and cannot change a calculated amount.
 *
 * All rate application uses the effective-rate convention
 * (`(1 + r)^t - 1` for compounded, `r * t` for simple), which makes accrual
 * grain-invariant: accruing 12 canonical months gives the same amount as
 * accruing 1 annual period.
 */

export const ECONOMICS_PERIOD_MODEL_VERSION = 'economics-period-model/1.0.0' as const;

/** Authoritative accrual grain. Do not change without a new ADR. */
export const CANONICAL_ECONOMICS_ACCRUAL_GRAIN = 'monthly' as const;

export const EconomicsPeriodGrainV1Schema = z.enum(['monthly', 'quarterly', 'annual']);
export type EconomicsPeriodGrainV1 = z.infer<typeof EconomicsPeriodGrainV1Schema>;

/** Whole months covered by one complete period of each grain. */
export const ECONOMICS_MONTHS_PER_PERIOD_V1 = {
  monthly: 1,
  quarterly: 3,
  annual: 12,
} as const satisfies Record<EconomicsPeriodGrainV1, number>;

/**
 * How a served field behaves when periods are regrouped to a coarser grain.
 *
 *   flow          - additive over time (fees, calls, distributions): sum.
 *   stock_end     - a balance measured at period end (NAV, cash): last value.
 *   stock_start   - a balance measured at period start (beginning cash): first value.
 *   ratio_derived - DPI/RVPI/TVPI/IRR: never aggregated, always recomputed.
 */
export const EconomicsAggregationKindV1Schema = z.enum([
  'flow',
  'stock_end',
  'stock_start',
  'ratio_derived',
]);
export type EconomicsAggregationKindV1 = z.infer<typeof EconomicsAggregationKindV1Schema>;

export const EconomicsRateCompoundingV1Schema = z.enum(['simple', 'compounded']);
export type EconomicsRateCompoundingV1 = z.infer<typeof EconomicsRateCompoundingV1Schema>;

const CalendarDateSchema = z.string().date();
const NonNegativeDecimalStringSchema = z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d+)?$/);

/**
 * One canonical period.
 *
 * Dating rule: periods are anniversary-based on the series anchor date.
 * Period `index` (1-based) starts on `anchorDate` plus
 * `(index - 1) * monthsPerPeriod` months and ends on the day before the next
 * period start, so periods are contiguous and never overlap.
 *
 * Partial-period rule: a trailing period that covers fewer than
 * `monthsPerPeriod` months is emitted with `partial: true`. Proration is
 * measured in canonical months, not in days, because the canonical accrual
 * grain is monthly: `prorationFactor` is `monthsCovered / monthsPerPeriod`
 * and `yearFraction` is `monthsCovered / 12`. Day counts are carried as
 * reporting metadata only. Measuring proration in days would break grain
 * invariance: a six-month stub of a leap year is 182/366 of a year by day
 * count but 6/12 by month count, and the monthly grid answers 6/12.
 */
export const EconomicsCanonicalPeriodV1Schema = z
  .object({
    grain: EconomicsPeriodGrainV1Schema,
    index: z.number().int().positive(),
    periodStart: CalendarDateSchema,
    periodEnd: CalendarDateSchema,
    /** Whole canonical months covered. Drives proration and the year fraction. */
    monthsCovered: z.number().int().positive(),
    /** Reporting metadata only; never used to prorate. */
    dayCount: z.number().int().positive(),
    fullPeriodDayCount: z.number().int().positive(),
    prorationFactor: NonNegativeDecimalStringSchema,
    yearFraction: NonNegativeDecimalStringSchema,
    partial: z.boolean(),
  })
  .strict()
  .superRefine((period, ctx) => {
    if (period.periodStart > period.periodEnd) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['periodEnd'],
        message: 'periodEnd must not precede periodStart.',
      });
    }
    if (period.dayCount > period.fullPeriodDayCount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['dayCount'],
        message: 'dayCount must not exceed fullPeriodDayCount.',
      });
    }
    if (period.monthsCovered > ECONOMICS_MONTHS_PER_PERIOD_V1[period.grain]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['monthsCovered'],
        message: 'monthsCovered must not exceed the months in one period of the grain.',
      });
    }
    if (period.partial !== period.monthsCovered < ECONOMICS_MONTHS_PER_PERIOD_V1[period.grain]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['partial'],
        message:
          'partial must be true if and only if the period covers fewer months than its grain.',
      });
    }
  });
export type EconomicsCanonicalPeriodV1 = z.infer<typeof EconomicsCanonicalPeriodV1Schema>;

export const EconomicsPeriodSeriesV1Schema = z
  .object({
    version: z.literal(ECONOMICS_PERIOD_MODEL_VERSION),
    grain: EconomicsPeriodGrainV1Schema,
    anchorDate: CalendarDateSchema,
    horizonMonths: z.number().int().positive(),
    periods: z.array(EconomicsCanonicalPeriodV1Schema).min(1),
  })
  .strict()
  .superRefine((series, ctx) => {
    series.periods.forEach((period, offset) => {
      if (period.grain !== series.grain) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['periods', offset, 'grain'],
          message: 'Every period must carry the series grain.',
        });
      }
      if (period.index !== offset + 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['periods', offset, 'index'],
          message: 'Period index must be 1-based and contiguous.',
        });
      }
    });

    for (let offset = 1; offset < series.periods.length; offset += 1) {
      const previous = series.periods[offset - 1]!;
      const current = series.periods[offset]!;
      if (current.periodStart <= previous.periodEnd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['periods', offset, 'periodStart'],
          message: 'Periods must not overlap.',
        });
      }
    }
  });
export type EconomicsPeriodSeriesV1 = z.infer<typeof EconomicsPeriodSeriesV1Schema>;

export type EconomicsPeriodModelV1ErrorCode =
  | 'INVALID_ANCHOR_DATE'
  | 'INVALID_HORIZON_MONTHS'
  | 'GRAIN_DOWNSCALE_FORBIDDEN'
  | 'PERIOD_ROW_COUNT_MISMATCH'
  | 'RATIO_AGGREGATION_FORBIDDEN'
  | 'UNKNOWN_AGGREGATION_FIELD';

export class EconomicsPeriodModelV1Error extends Error {
  constructor(
    readonly code: EconomicsPeriodModelV1ErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'EconomicsPeriodModelV1Error';
  }
}
