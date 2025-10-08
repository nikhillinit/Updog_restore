/**
 * Wizard Zod Validation Schemas
 *
 * Provides type-safe validation for wizard form data with cross-field rules:
 * - Allocation sum = 100%
 * - Graduation + Exit ≤ 100% per stage
 * - Exit value ordering: low ≤ median ≤ high
 * - Weights sum to 1
 *
 * All monetary values in WHOLE DOLLARS (integers, no decimals)
 */

import { z } from 'zod';

/** Helper: Whole dollar USD validation */
export const zUSD = z.number().int().min(0, 'Must be ≥ 0 (whole dollars)');

/** Helper: Percentage validation (0-100 scale) */
export const zPct = z.number().min(0, 'Min 0%').max(100, 'Max 100%');

/**
 * Fund Basics & Fees
 *
 * Captures core fund parameters including fee structure with step-down.
 */
export const fundBasicsSchema = z
  .object({
    fundName: z.string().min(1, 'Fund name is required'),
    establishmentDate: z.string().optional().default(new Date().toISOString().split('T')[0]), // ISO date string, defaults to today
    committedCapitalUSD: zUSD, // Total capital committed by LPs
    gpCommitmentUSD: zUSD.default(0),

    /** Fee basis (committed is most common for preview) */
    managementFeeBasis: z.enum(['committed', 'called', 'nav']).default('committed'),

    /** Management fees (step-down structure) */
    mgmtFeeEarlyPct: zPct, // Years 1..cutover-1
    mgmtFeeLatePct: zPct, // Years cutover..life
    feeCutoverYear: z.number().int().min(1, 'Cutover year must be ≥1'),

    /** Carried interest */
    carriedInterestPct: zPct,

    /** Fund term */
    fundLifeYears: z.number().int().min(5).max(15),
    isEvergreen: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    // Only validate cutover if not evergreen
    if (!v.isEvergreen && v.feeCutoverYear > v.fundLifeYears) {
      ctx.addIssue({
        code: 'custom',
        message: 'Cutover year must be ≤ fund life',
        path: ['feeCutoverYear'],
      });
    }
  });

/**
 * Stage Allocation (must sum to 100% including reserves)
 */
export const stageAllocationSchema = z
  .object({
    preSeed: zPct,
    seed: zPct,
    seriesA: zPct,
    seriesB: zPct,
    seriesC: zPct,
    seriesD: zPct,
    reserves: zPct,
  })
  .superRefine((s, ctx) => {
    const sum = s.preSeed + s.seed + s.seriesA + s.seriesB + s.seriesC + s.seriesD + s.reserves;
    if (Math.abs(sum - 100) > 0.1) {
      // Allow small floating point tolerance
      ctx.addIssue({
        code: 'custom',
        message: `Allocations must sum to 100% (currently ${sum.toFixed(1)}%)`,
        path: ['reserves'], // Point to last field
      });
    }
  });

/**
 * Graduation Rates (with optional exit probability per stage)
 *
 * Validation: graduation + exit ≤ 100% for each stage
 */
export const graduationRatesSchema = z
  .object({
    // Graduation to next stage
    preSeedToSeed: zPct,
    seedToA: zPct,
    aToB: zPct,
    bToC: zPct,
    cToD: zPct,

    // Optional: exit probability at current stage (before graduation)
    preSeedExitPct: zPct.optional(),
    seedExitPct: zPct.optional(),
    aExitPct: zPct.optional(),
    bExitPct: zPct.optional(),
    cExitPct: zPct.optional(),
  })
  .superRefine((g, ctx) => {
    // Enforce graduation + exit ≤ 100 for each stage
    const checks: Array<[keyof typeof g, keyof typeof g]> = [
      ['preSeedToSeed', 'preSeedExitPct'],
      ['seedToA', 'seedExitPct'],
      ['aToB', 'aExitPct'],
      ['bToC', 'bExitPct'],
      ['cToD', 'cExitPct'],
    ];

    checks.forEach(([gradKey, exitKey]) => {
      const grad = g[gradKey];
      const exit = g[exitKey];
      if (typeof exit === 'number' && typeof grad === 'number' && grad + exit > 100) {
        ctx.addIssue({
          code: 'custom',
          message: `Graduation (${grad}%) + Exit (${exit}%) cannot exceed 100%`,
          path: [exitKey],
        });
      }
    });
  });

/**
 * Exit Timing (years from entry by stage)
 */
export const exitTimingSchema = z.object({
  preSeed: z.number().min(1).max(10),
  seed: z.number().min(1).max(10),
  seriesA: z.number().min(1).max(10),
  seriesB: z.number().min(1).max(10),
  seriesC: z.number().min(1).max(10),
  seriesD: z.number().min(1).max(10),
});

/**
 * Exit Value Distribution (low ≤ median ≤ high)
 */
export const stageExitValueSchema = z
  .object({
    low: zUSD.optional(),
    median: zUSD, // Required
    high: zUSD.optional(),
    weights: z
      .object({
        low: z.number().min(0).max(1).optional(),
        median: z.number().min(0).max(1).optional(),
        high: z.number().min(0).max(1).optional(),
      })
      .optional(),
  })
  .superRefine((v, ctx) => {
    // Validate ordering: low ≤ median ≤ high
    if (typeof v.low === 'number' && v.low > v.median) {
      ctx.addIssue({
        code: 'custom',
        message: `Low (${v.low}) must be ≤ Median (${v.median})`,
        path: ['low'],
      });
    }

    if (typeof v.high === 'number' && v.high < v.median) {
      ctx.addIssue({
        code: 'custom',
        message: `High (${v.high}) must be ≥ Median (${v.median})`,
        path: ['high'],
      });
    }

    // Validate weights sum to 1 (if provided)
    if (v.weights) {
      const sum = (v.weights.low ?? 0) + (v.weights.median ?? 0) + (v.weights.high ?? 0);
      if (Math.abs(sum - 1) > 1e-6) {
        ctx.addIssue({
          code: 'custom',
          message: `Outcome weights must sum to 1 (currently ${sum.toFixed(3)})`,
          path: ['weights'],
        });
      }
    }
  });

/**
 * Exit Values by Stage
 */
export const exitValuesByStageSchema = z.object({
  preSeed: stageExitValueSchema,
  seed: stageExitValueSchema,
  seriesA: stageExitValueSchema,
  seriesB: stageExitValueSchema,
  seriesC: stageExitValueSchema,
  seriesD: stageExitValueSchema,
});

/**
 * Reserves Strategy Settings
 *
 * Configures follow-on investment policy with strategy-specific validation.
 */
export const reserveStrategyEnum = z.enum(['proRata', 'selective', 'opportunistic']);

export const reserveSettingsSchema = z
  .object({
    strategy: reserveStrategyEnum,
    reserveRatioPct: zPct, // % of fund earmarked for follow-ons
    proRataParticipationRatePct: zPct, // how often you take pro-rata (0..100)
    followOnMultiple: z
      .number()
      .min(0, 'Must be ≥ 0')
      .max(5, 'Are you sure? Usually ≤ 3×')
      .default(1.0),
    maxFollowOnRounds: z
      .number()
      .int('Whole number')
      .min(1, 'At least 1')
      .max(5, 'Max 5')
      .default(3),

    // Strategy-specific fields
    targetReserveRatio: z
      .number()
      .min(0.5, 'Typical 0.5–3.0×')
      .max(3.0, 'Typical 0.5–3.0×')
      .optional(), // required if proRata

    topPerformersPct: zPct.optional(), // required if selective
  })
  .superRefine((v, ctx) => {
    // Require targetReserveRatio for Pro-Rata strategy
    if (v.strategy === 'proRata' && (v.targetReserveRatio ?? null) === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Target Reserve Ratio is required for Pro-Rata strategy',
        path: ['targetReserveRatio'],
      });
    }

    // Require topPerformersPct for Selective strategy
    if (v.strategy === 'selective' && (v.topPerformersPct ?? null) === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Top Performers % is required for Selective strategy',
        path: ['topPerformersPct'],
      });
    }

    // Optional: warn if fields are irrelevant for chosen strategy
    if (v.strategy !== 'proRata' && v.targetReserveRatio != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Target Reserve Ratio only applies to Pro-Rata strategy',
        path: ['targetReserveRatio'],
      });
    }

    if (v.strategy !== 'selective' && v.topPerformersPct != null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Top Performers % only applies to Selective strategy',
        path: ['topPerformersPct'],
      });
    }
  });

/**
 * Operations & Policies
 */
export const opsPolicySchema = z.object({
  distributionTiming: z.enum(['immediate', 'quarterly', 'annual']).default('quarterly'),
  distributionMinimumUSD: zUSD.default(10_000),
  distributionPreference: z.enum(['cash', 'stock', 'hybrid']).default('cash'),
  navValuationMethod: z
    .enum(['cost', 'lastRound', 'quarterlyMarks', 'conservative'])
    .default('lastRound'),
  extensions: z.object({
    numberOfExtensions: z.number().int().min(0).max(3).default(2),
    extensionLengthYears: z.number().min(0.5).max(2).default(1),
    feeDuringExtensionPct: zPct.default(1.5),
  }),
});
