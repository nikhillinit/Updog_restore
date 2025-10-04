/**
 * CapitalCallPolicy Schema
 * Flexible capital call timing and scheduling
 */

import { z } from 'zod';
import Decimal from 'decimal.js';
import { ZodDecimal, ZodPercentage, ZodPositiveDecimal } from './decimal-zod';

/**
 * Capital call modes
 */
export const CapitalCallMode = z.enum([
  'upfront',      // All capital called at fund inception
  'quarterly',    // Regular quarterly calls
  'semi_annual',  // Every 6 months
  'annual',       // Yearly calls
  'as_needed',    // Called when investment opportunities arise
  'custom'        // User-defined schedule
]);

export type CapitalCallMode = z.infer<typeof CapitalCallMode>;

/**
 * Custom capital call schedule entry
 */
export const CustomCallScheduleSchema = z.object({
  /** Month from fund inception */
  month: z.number().int().min(0),

  /** Amount to call (as % of committed capital) */
  percentage: ZodPercentage,

  /** Optional description */
  description: z.string().optional()
});

export type CustomCallSchedule = z.infer<typeof CustomCallScheduleSchema>;

/**
 * Base capital call policy
 */
const BaseCapitalCallPolicySchema = z.object({
  /** Policy identifier */
  id: z.string(),

  /** Human-readable name */
  name: z.string(),

  /** Notice period for capital calls (days) */
  noticePeriodDays: z.number().int().min(0).default(30),

  /** Funding period (days from notice to payment due) */
  fundingPeriodDays: z.number().int().min(0).default(60)
});

/**
 * Upfront capital call policy
 */
const UpfrontPolicySchema = BaseCapitalCallPolicySchema.extend({
  mode: z.literal('upfront'),

  /** Percentage of committed capital to call upfront */
  percentage: ZodPercentage.default(new Decimal(1))
});

/**
 * Periodic capital call policy (quarterly, semi-annual, annual)
 */
const PeriodicPolicySchema = BaseCapitalCallPolicySchema.extend({
  mode: z.enum(['quarterly', 'semi_annual', 'annual']),

  /** Percentage to call each period */
  percentagePerPeriod: ZodPercentage,

  /** Start year */
  startYear: z.number().int().positive().default(1),

  /** End year */
  endYear: z.number().int().positive()
}).refine(
  (data) => data.endYear >= data.startYear,
  {
    message: 'endYear must be >= startYear',
    path: ['endYear']
  }
);

/**
 * As-needed capital call policy
 */
const AsNeededPolicySchema = BaseCapitalCallPolicySchema.extend({
  mode: z.literal('as_needed'),

  /** Minimum notice period (days) */
  minimumNoticeDays: z.number().int().min(0).default(15),

  /** Maximum call size as % of committed capital */
  maxCallSizePercent: ZodPercentage.default(new Decimal(0.25))
});

/**
 * Custom schedule capital call policy
 */
const CustomPolicySchema = BaseCapitalCallPolicySchema.extend({
  mode: z.literal('custom'),

  /** Custom call schedule */
  schedule: z.array(CustomCallScheduleSchema).min(1)
}).refine(
  (data) => {
    // Validate total percentage <= 100%
    const totalPercent = data.schedule.reduce(
      (sum, entry) => sum.plus(entry.percentage),
      new Decimal(0)
    );
    return totalPercent.lte(1);
  },
  {
    message: 'Total custom schedule calls cannot exceed 100%',
    path: ['schedule']
  }
).refine(
  (data) => {
    // Validate schedule is sorted by month
    for (let i = 1; i < data.schedule.length; i++) {
      if (data.schedule[i].month <= data.schedule[i - 1].month) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'Custom schedule must be sorted by month',
    path: ['schedule']
  }
);

/**
 * Discriminated union of all capital call policies
 */
export const CapitalCallPolicySchema = z.discriminatedUnion('mode', [
  UpfrontPolicySchema,
  PeriodicPolicySchema,
  AsNeededPolicySchema,
  CustomPolicySchema
]);

export type CapitalCallPolicy = z.infer<typeof CapitalCallPolicySchema>;

/**
 * Calculate capital calls for a given month
 */
export function calculateCapitalCall(
  policy: CapitalCallPolicy,
  committedCapital: Decimal,
  currentMonth: number,
  uncalledCapital: Decimal
): Decimal {
  switch (policy.mode) {
    case 'upfront':
      return currentMonth === 0 ? committedCapital.times(policy.percentage) : new Decimal(0);

    case 'quarterly': {
      if (currentMonth % 3 !== 0) return new Decimal(0);
      const currentYear = Math.floor(currentMonth / 12) + 1;
      if (currentYear < policy.startYear || currentYear > policy.endYear) {
        return new Decimal(0);
      }
      return committedCapital.times(policy.percentagePerPeriod);
    }

    case 'semi_annual': {
      if (currentMonth % 6 !== 0) return new Decimal(0);
      const currentYear = Math.floor(currentMonth / 12) + 1;
      if (currentYear < policy.startYear || currentYear > policy.endYear) {
        return new Decimal(0);
      }
      return committedCapital.times(policy.percentagePerPeriod);
    }

    case 'annual': {
      if (currentMonth % 12 !== 0) return new Decimal(0);
      const currentYear = Math.floor(currentMonth / 12) + 1;
      if (currentYear < policy.startYear || currentYear > policy.endYear) {
        return new Decimal(0);
      }
      return committedCapital.times(policy.percentagePerPeriod);
    }

    case 'as_needed':
      // As-needed calls are triggered by investment opportunities
      // This function doesn't have access to that context
      return new Decimal(0);

    case 'custom': {
      const entry = policy.schedule.find(s => s.month === currentMonth);
      return entry ? committedCapital.times(entry.percentage) : new Decimal(0);
    }
  }
}
