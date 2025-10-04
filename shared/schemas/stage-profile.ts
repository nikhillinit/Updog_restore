/**
 * StageProfile Schema
 * Replaces hard-coded exit buckets with stage-driven valuations
 * Supports deterministic cohort math with fractional company counts
 */

import { z } from 'zod';
import Decimal from 'decimal.js';
import { ZodDecimal, ZodPercentage, ZodPositiveDecimal } from './decimal-zod';

/**
 * Investment stage types
 */
export const StageType = z.enum([
  'pre_seed',
  'seed',
  'series_a',
  'series_b',
  'series_c',
  'growth',
  'late_stage'
]);

export type StageType = z.infer<typeof StageType>;

/**
 * Stage-specific financial and operational assumptions
 */
export const StageDefinitionSchema = z.object({
  /** Stage identifier */
  stage: StageType,

  /** Average funding round size at this stage */
  roundSize: ZodPositiveDecimal,

  /** Average post-money valuation at this stage */
  postMoneyValuation: ZodPositiveDecimal,

  /** ESOP pool percentage allocated in this round */
  esopPercent: ZodPercentage,

  /** Probability of graduating to next stage (0-1) */
  graduationRate: ZodPercentage,

  /** Probability of exiting at this stage (0-1) */
  exitRate: ZodPercentage,

  /** Average months until graduation to next stage */
  monthsToGraduate: z.number().int().positive(),

  /** Average months until exit at this stage */
  monthsToExit: z.number().int().positive(),

  /** Derived failure rate (computed automatically) */
  failureRate: ZodPercentage.optional(),

  /** Exit multiple for successful exits at this stage */
  exitMultiple: ZodPositiveDecimal.default(new Decimal(3)),

  /** Dilution per subsequent round */
  dilutionPerRound: ZodPercentage.default(new Decimal(0.2))
}).refine(
  (data) => {
    // Ensure graduation + exit + failure = 100%
    const sum = data.graduationRate.plus(data.exitRate);
    return sum.lte(1);
  },
  {
    message: 'graduationRate + exitRate cannot exceed 100%',
    path: ['graduationRate']
  }
);

export type StageDefinition = z.infer<typeof StageDefinitionSchema>;

/**
 * Complete stage profile defining company lifecycle
 */
export const StageProfileSchema = z.object({
  /** Profile identifier */
  id: z.string(),

  /** Human-readable profile name */
  name: z.string(),

  /** Ordered array of stages (earliest to latest) */
  stages: z.array(StageDefinitionSchema).min(1),

  /** Initial portfolio size (supports fractional counts for determinism) */
  initialPortfolioSize: ZodPositiveDecimal,

  /** Enable exit proceeds recycling */
  recyclingEnabled: z.boolean().default(false),

  /** Global assumptions */
  assumptions: z.object({
    /** Average dilution per financing round */
    dilutionPerRound: ZodPercentage.default(new Decimal(0.2)),

    /** Follow-on investment multiplier (e.g., 2x initial check) */
    followOnMultiplier: ZodPositiveDecimal.default(new Decimal(2)),

    /** Reserve allocation strategy */
    reserveStrategy: z.enum(['pro_rata', 'winner_picking', 'hybrid']).default('pro_rata')
  }).optional()
}).refine(
  (data) => {
    // Ensure stages are ordered from early to late
    const stageOrder: StageType[] = ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'growth', 'late_stage'];
    for (let i = 1; i < data.stages.length; i++) {
      const prevIdx = stageOrder.indexOf(data.stages[i - 1].stage);
      const currIdx = stageOrder.indexOf(data.stages[i].stage);
      if (currIdx <= prevIdx) {
        return false;
      }
    }
    return true;
  },
  {
    message: 'Stages must be ordered from earliest to latest',
    path: ['stages']
  }
);

export type StageProfile = z.infer<typeof StageProfileSchema>;

/**
 * Helper: Calculate derived failure rate for a stage
 */
export function calculateFailureRate(stage: StageDefinition): Decimal {
  return new Decimal(1)
    .minus(stage.graduationRate)
    .minus(stage.exitRate);
}

/**
 * Helper: Add failure rates to all stages
 */
export function enrichStageProfile(profile: StageProfile): StageProfile & {
  stages: (StageDefinition & { failureRate: Decimal })[];
} {
  return {
    ...profile,
    stages: profile.stages.map(stage => ({
      ...stage,
      failureRate: calculateFailureRate(stage)
    }))
  };
}

/**
 * Cohort progression result
 */
export interface CohortProgression {
  stage: StageType;
  startingCount: Decimal;
  graduatedCount: Decimal;
  exitedCount: Decimal;
  failedCount: Decimal;
  remainingCount: Decimal;
}

/**
 * Calculate deterministic cohort progression through stages
 * Uses fractional counts to avoid rounding errors
 */
export function calculateCohortProgression(
  profile: StageProfile,
  initialCount: Decimal,
  monthsElapsed: number
): CohortProgression[] {
  const enriched = enrichStageProfile(profile);
  const results: CohortProgression[] = [];
  let currentCount = initialCount;

  for (const stage of enriched.stages) {
    const graduated = currentCount.times(stage.graduationRate);
    const exited = currentCount.times(stage.exitRate);
    const failed = currentCount.times(stage.failureRate);
    const remaining = currentCount.minus(graduated).minus(exited).minus(failed);

    results.push({
      stage: stage.stage,
      startingCount: currentCount,
      graduatedCount: graduated,
      exitedCount: exited,
      failedCount: failed,
      remainingCount: remaining
    });

    // Graduated companies flow to next stage
    currentCount = graduated;
  }

  return results;
}
