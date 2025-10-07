/**
 * Zod Validation Schemas for Modeling Wizard Steps
 *
 * Comprehensive validation for each wizard step with:
 * - Type-safe validation using Zod
 * - LP-credible constraints and business rules
 * - Detailed error messages
 * - Re-usable schema composition
 */

import { z } from 'zod';

// ============================================================================
// SHARED SCHEMAS
// ============================================================================

/**
 * Currency enum schema
 */
export const currencySchema = z.enum(['USD', 'EUR', 'GBP'], {
  errorMap: () => ({ message: 'Currency must be USD, EUR, or GBP' })
});

/**
 * Percentage schema (0-100)
 */
export const percentageSchema = z.number()
  .min(0, 'Percentage must be at least 0%')
  .max(100, 'Percentage cannot exceed 100%');

/**
 * Decimal percentage schema (0-1)
 */
export const decimalPercentageSchema = z.number()
  .min(0, 'Percentage must be at least 0')
  .max(1, 'Percentage cannot exceed 1');

/**
 * Positive number schema
 */
export const positiveNumberSchema = z.number()
  .positive('Value must be positive');

/**
 * Non-negative number schema
 */
export const nonNegativeNumberSchema = z.number()
  .min(0, 'Value cannot be negative');

/**
 * Year schema (reasonable range for VC funds)
 */
export const yearSchema = z.number()
  .int('Year must be a whole number')
  .min(2000, 'Year must be 2000 or later')
  .max(2030, 'Year cannot be later than 2030');

/**
 * ISO date string schema
 */
export const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format');

/**
 * Team composition schema
 * Captures fund team structure
 */
export const teamSchema = z.object({
  partners: z.number()
    .int('Partners must be a whole number')
    .min(0, 'Partners must be non-negative'),

  associates: z.number()
    .int('Associates must be a whole number')
    .min(0, 'Associates must be non-negative')
    .optional(),

  advisors: z.array(z.object({
    name: z.string().min(1, 'Advisor name is required'),
    role: z.string().min(1, 'Advisor role is required')
  })).optional()
});

export type Team = z.infer<typeof teamSchema>;

// ============================================================================
// STEP 1: GENERAL INFO
// ============================================================================

export const generalInfoSchema = z.object({
  fundName: z.string()
    .min(1, 'Fund name is required')
    .max(100, 'Fund name cannot exceed 100 characters')
    .trim(),

  vintageYear: yearSchema,

  fundSize: positiveNumberSchema
    .refine(
      (val) => val >= 1,
      'Fund size must be at least $1M for institutional funds'
    ),

  currency: currencySchema,

  establishmentDate: isoDateSchema,

  isEvergreen: z.boolean().default(false),

  fundLife: z.number()
    .int('Fund life must be a whole number of years')
    .min(1, 'Fund life must be at least 1 year')
    .max(20, 'Fund life cannot exceed 20 years')
    .optional(),

  investmentPeriod: z.number()
    .int('Investment period must be a whole number of years')
    .min(1, 'Investment period must be at least 1 year')
    .max(10, 'Investment period cannot exceed 10 years')
    .optional(),

  team: teamSchema.optional()
}).superRefine((data, ctx) => {
  // Validate evergreen vs fixed-term structure
  if (!data.isEvergreen) {
    if (!data.fundLife) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Fund life is required for fixed-term funds',
        path: ['fundLife']
      });
    }

    if (!data.investmentPeriod) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Investment period is required for fixed-term funds',
        path: ['investmentPeriod']
      });
    }

    // Investment period should not exceed fund life
    if (data.fundLife && data.investmentPeriod && data.investmentPeriod > data.fundLife) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Investment period cannot exceed fund life',
        path: ['investmentPeriod']
      });
    }
  }

  // Warn about unusual fund sizes
  if (data.fundSize > 10000) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Fund size over $10B is unusually large. Please verify.',
      path: ['fundSize']
    });
  }

  // Validate vintage year matches establishment date year
  const establishmentYear = new Date(data.establishmentDate).getFullYear();
  if (data.vintageYear !== establishmentYear) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Vintage year should match establishment date year',
      path: ['vintageYear']
    });
  }
});

export type GeneralInfoInput = z.input<typeof generalInfoSchema>;
export type GeneralInfoOutput = z.output<typeof generalInfoSchema>;

// ============================================================================
// STEP 2: SECTOR/STAGE PROFILES
// ============================================================================

/**
 * Investment stages enum
 */
export const investmentStageEnum = z.enum([
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-d',
  'series-e-plus'
], {
  errorMap: () => ({ message: 'Invalid investment stage' })
});

export type InvestmentStage = z.infer<typeof investmentStageEnum>;

/**
 * Investment stage cohort schema
 * Defines metrics for a specific financing stage
 */
export const investmentStageCohortSchema = z.object({
  id: z.string().min(1, 'Stage ID is required'),

  /** Stage name (Pre-Seed, Seed, Series A, etc.) */
  stage: investmentStageEnum,

  /** Typical capital raised in this round ($M) */
  roundSize: positiveNumberSchema,

  /** Pre- or post-money valuation ($M) */
  valuation: positiveNumberSchema,

  /** Employee stock option pool (%) */
  esopPercentage: percentageSchema
    .refine(
      (val) => val >= 0 && val <= 30,
      'ESOP typically ranges from 0% to 30%'
    ),

  /** Likelihood of graduating to next round (%) */
  graduationRate: percentageSchema,

  /** Likelihood of exit at this stage (%) */
  exitRate: percentageSchema,

  /** Likelihood of failure at this stage (%) - calculated field */
  failureRate: percentageSchema.optional(),

  /** Average exit valuation at this stage ($M) */
  exitValuation: positiveNumberSchema,

  /** Average months to graduate to next stage */
  monthsToGraduate: z.number()
    .int('Months must be a whole number')
    .min(1, 'Must be at least 1 month')
    .max(120, 'Cannot exceed 120 months'),

  /** Average months from stage start to exit */
  monthsToExit: z.number()
    .int('Months must be a whole number')
    .min(1, 'Must be at least 1 month')
    .max(180, 'Cannot exceed 180 months')
}).superRefine((data, ctx) => {
  // Graduation + Exit cannot exceed 100%
  const total = data.graduationRate + data.exitRate;
  if (total > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Graduation rate (${data.graduationRate}%) + Exit rate (${data.exitRate}%) cannot exceed 100%`,
      path: ['graduationRate']
    });
  }

  // Exit valuation should typically be higher than round valuation
  if (data.exitValuation < data.valuation) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Exit valuation is typically higher than round valuation',
      path: ['exitValuation']
    });
  }
});

export type InvestmentStageCohort = z.infer<typeof investmentStageCohortSchema>;

/**
 * Sector profile schema with investment stages
 */
export const sectorProfileSchema = z.object({
  id: z.string().min(1, 'Sector profile ID is required'),

  name: z.string()
    .min(1, 'Sector name is required')
    .max(50, 'Sector name cannot exceed 50 characters'),

  allocation: percentageSchema,

  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),

  /** Investment stage cohorts for this sector */
  stages: z.array(investmentStageCohortSchema)
    .min(1, 'At least one investment stage is required')
    .max(10, 'Cannot exceed 10 investment stages')
}).superRefine((data, ctx) => {
  // The final stage must have 0% graduation rate
  if (data.stages.length > 0) {
    const finalStage = data.stages[data.stages.length - 1];
    if (finalStage && finalStage.graduationRate > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The final stage must have a 0% graduation rate',
        path: ['stages', data.stages.length - 1, 'graduationRate']
      });
    }
  }

  // Warn about incomplete projections (missing later stages)
  const stageNames = data.stages.map(s => s.stage);
  const hasEarlyStages = stageNames.includes('pre-seed') || stageNames.includes('seed');
  const hasLateStages = stageNames.includes('series-c') || stageNames.includes('series-d');

  if (hasEarlyStages && !hasLateStages) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Consider adding later-stage rounds for accurate FMV projections',
      path: ['stages']
    });
  }
});

export type SectorProfile = z.infer<typeof sectorProfileSchema>;

export const sectorProfilesSchema = z.object({
  sectorProfiles: z.array(sectorProfileSchema)
    .min(1, 'At least one sector profile is required')
    .max(10, 'Cannot exceed 10 sector profiles')
}).superRefine((data, ctx) => {
  // Validate sector allocations sum to 100%
  const totalSectorAllocation = data.sectorProfiles.reduce(
    (sum, profile) => sum + profile.allocation,
    0
  );

  if (Math.abs(totalSectorAllocation - 100) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Sector allocations must sum to 100% (currently ${totalSectorAllocation.toFixed(1)}%)`,
      path: ['sectorProfiles']
    });
  }

  // Warn about over-concentration in any single sector
  data.sectorProfiles.forEach((profile, index) => {
    if (profile.allocation > 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${profile.name}: allocation over 60% is unusually concentrated`,
        path: ['sectorProfiles', index, 'allocation']
      });
    }
  });
});

export type SectorProfilesInput = z.input<typeof sectorProfilesSchema>;
export type SectorProfilesOutput = z.output<typeof sectorProfilesSchema>;

// ============================================================================
// STEP 3: CAPITAL ALLOCATION
// ============================================================================

/**
 * Entry strategy for initial investments
 */
export const entryStrategyEnum = z.enum(['amount-based', 'ownership-based'], {
  errorMap: () => ({ message: 'Entry strategy must be amount-based or ownership-based' })
});

export type EntryStrategy = z.infer<typeof entryStrategyEnum>;

/**
 * Per-stage follow-on allocation configuration
 */
export const stageAllocationSchema = z.object({
  /** Stage identifier (matches investment stage from sector profiles) */
  stageId: z.string().min(1, 'Stage ID is required'),

  /** Stage name for display */
  stageName: z.string().min(1, 'Stage name is required'),

  /** Target ownership percentage to maintain after dilution */
  maintainOwnership: percentageSchema
    .refine(
      (val) => val >= 0 && val <= 50,
      'Maintain ownership must be between 0% and 50%'
    ),

  /** Percentage of graduates that will receive follow-on investment */
  participationRate: percentageSchema
});

export type StageAllocation = z.infer<typeof stageAllocationSchema>;

/**
 * Investment pacing period configuration
 */
export const pacingPeriodSchema = z.object({
  id: z.string().min(1, 'Period ID is required'),

  /** Starting month (relative to vintage year, 0-indexed) */
  startMonth: z.number()
    .int('Start month must be a whole number')
    .min(0, 'Start month must be at least 0')
    .max(120, 'Start month cannot exceed 120 (10 years)'),

  /** Ending month (relative to vintage year, 0-indexed) */
  endMonth: z.number()
    .int('End month must be a whole number')
    .min(0, 'End month must be at least 0')
    .max(120, 'End month cannot exceed 120 (10 years)'),

  /** Percentage of total capital to deploy in this period */
  allocationPercent: percentageSchema
}).superRefine((data, ctx) => {
  // End month must be after start month
  if (data.endMonth <= data.startMonth) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'End month must be after start month',
      path: ['endMonth']
    });
  }
});

export type PacingPeriod = z.infer<typeof pacingPeriodSchema>;

/**
 * Capital allocation schema - defines how fund deploys capital
 * Integrates with DeterministicReserveEngine for portfolio modeling
 */
export const capitalAllocationSchema = z.object({
  /** Entry strategy: amount-based (fixed check size) or ownership-based (target %) */
  entryStrategy: entryStrategyEnum.default('amount-based'),

  /** Initial check size for first investment ($M) */
  initialCheckSize: positiveNumberSchema
    .refine(
      (val) => val >= 0.1,
      'Minimum check size is $0.1M'
    )
    .refine(
      (val) => val <= 50,
      'Maximum check size is $50M'
    ),

  /** Target entry ownership percentage (used for ownership-based strategy) */
  targetEntryOwnership: percentageSchema
    .refine(
      (val) => val >= 5 && val <= 30,
      'Target entry ownership typically ranges from 5% to 30%'
    )
    .optional(),

  /** Follow-on investment strategy */
  followOnStrategy: z.object({
    /** Percentage of fund reserved for follow-on investments (decimal 0-1) */
    reserveRatio: decimalPercentageSchema
      .refine(
        (val) => val >= 0.3 && val <= 0.7,
        'Reserve ratio typically ranges from 30% to 70%'
      ),

    /** Per-stage follow-on allocation configurations */
    stageAllocations: z.array(stageAllocationSchema)
      .min(1, 'At least one stage allocation is required')
      .max(10, 'Cannot exceed 10 stage allocations')
  }),

  /** Investment pacing model */
  pacingModel: z.object({
    /** Number of new investments per year during investment period */
    investmentsPerYear: z.number()
      .int('Investments per year must be a whole number')
      .min(1, 'Must make at least 1 investment per year')
      .max(50, 'Cannot exceed 50 investments per year'),

    /** Deployment curve pattern (matches capital call schedule options) */
    deploymentCurve: z.enum(['linear', 'front-loaded', 'back-loaded'], {
      errorMap: () => ({ message: 'Invalid deployment curve type' })
    })
  }),

  /** Investment pacing horizon (time-based capital deployment) */
  pacingHorizon: z.array(pacingPeriodSchema)
    .min(1, 'At least one pacing period is required')
    .max(10, 'Cannot exceed 10 pacing periods')
}).superRefine((data, ctx) => {
  // Ownership-based strategy requires targetEntryOwnership
  if (data.entryStrategy === 'ownership-based' && !data.targetEntryOwnership) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Target entry ownership is required for ownership-based strategy',
      path: ['targetEntryOwnership']
    });
  }

  // Pacing horizon allocations must sum to 100%
  const totalPacingAllocation = data.pacingHorizon.reduce(
    (sum, period) => sum + period.allocationPercent,
    0
  );

  if (Math.abs(totalPacingAllocation - 100) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Pacing allocations must sum to 100% (currently ${totalPacingAllocation.toFixed(1)}%)`,
      path: ['pacingHorizon']
    });
  }

  // Check for overlapping pacing periods
  for (let i = 0; i < data.pacingHorizon.length; i++) {
    for (let j = i + 1; j < data.pacingHorizon.length; j++) {
      const period1 = data.pacingHorizon[i];
      const period2 = data.pacingHorizon[j];

      if (period1 && period2) {
        const overlaps =
          (period1.startMonth <= period2.startMonth && period1.endMonth > period2.startMonth) ||
          (period2.startMonth <= period1.startMonth && period2.endMonth > period1.startMonth);

        if (overlaps) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Pacing periods cannot overlap',
            path: ['pacingHorizon', j]
          });
        }
      }
    }
  }

  // Warn about high participation rates across all stages
  const avgParticipation = data.followOnStrategy.stageAllocations.reduce(
    (sum, stage) => sum + stage.participationRate,
    0
  ) / Math.max(1, data.followOnStrategy.stageAllocations.length);

  if (avgParticipation > 80) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Average participation rate exceeds 80% - may require significant reserves',
      path: ['followOnStrategy', 'stageAllocations']
    });
  }
});

export type CapitalAllocationInput = z.input<typeof capitalAllocationSchema>;
export type CapitalAllocationOutput = z.output<typeof capitalAllocationSchema>;

// ============================================================================
// STEP 4: FEES & EXPENSES
// ============================================================================

export const feeBasisSchema = z.enum(
  ['committed', 'called', 'fmv'],
  { errorMap: () => ({ message: 'Invalid fee basis' }) }
);

export const feesExpensesSchema = z.object({
  managementFee: z.object({
    rate: percentageSchema
      .refine(
        (val) => val >= 0 && val <= 5,
        'Management fee must be between 0% and 5%'
      ),

    basis: feeBasisSchema,

    stepDown: z.object({
      enabled: z.boolean(),
      afterYear: z.number()
        .int('Step-down year must be a whole number')
        .min(1, 'Step-down year must be at least 1')
        .optional(),
      newRate: percentageSchema.optional()
    }).optional()
  }),

  adminExpenses: z.object({
    annualAmount: positiveNumberSchema,

    growthRate: percentageSchema
      .refine(
        (val) => val >= -10 && val <= 20,
        'Growth rate must be between -10% and 20%'
      )
  })
}).superRefine((data, ctx) => {
  // Validate step-down configuration
  if (data.managementFee.stepDown?.enabled) {
    if (!data.managementFee.stepDown.afterYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Step-down year is required when step-down is enabled',
        path: ['managementFee', 'stepDown', 'afterYear']
      });
    }

    if (!data.managementFee.stepDown.newRate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New rate is required when step-down is enabled',
        path: ['managementFee', 'stepDown', 'newRate']
      });
    }

    if (
      data.managementFee.stepDown.newRate &&
      data.managementFee.stepDown.newRate >= data.managementFee.rate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Step-down rate must be lower than initial rate',
        path: ['managementFee', 'stepDown', 'newRate']
      });
    }
  }

  // Warn about high management fees
  if (data.managementFee.rate > 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Management fee over 3% is above market standards',
      path: ['managementFee', 'rate']
    });
  }

  // Warn about low management fees
  if (data.managementFee.rate < 1.5) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Management fee under 1.5% may be unsustainable for fund operations',
      path: ['managementFee', 'rate']
    });
  }
});

export type FeesExpensesInput = z.input<typeof feesExpensesSchema>;
export type FeesExpensesOutput = z.output<typeof feesExpensesSchema>;

// ============================================================================
// STEP 4.5: FUND FINANCIALS
// ============================================================================

/**
 * Individual expense item schema
 */
export const expenseItemSchema = z.object({
  id: z.string().min(1, 'Expense ID is required'),

  name: z.string()
    .min(1, 'Expense name is required')
    .max(100, 'Expense name cannot exceed 100 characters'),

  amount: nonNegativeNumberSchema,

  type: z.enum(['one-time', 'annual'], {
    errorMap: () => ({ message: 'Expense type must be one-time or annual' })
  }).default('one-time'),

  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional(),

  year: z.number()
    .int('Year must be a whole number')
    .min(1, 'Year must be at least 1')
    .max(10, 'Year cannot exceed 10')
    .optional() // Only required for one-time expenses
}).superRefine((data, ctx) => {
  // One-time expenses must specify a year
  if (data.type === 'one-time' && !data.year) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Year is required for one-time expenses',
      path: ['year']
    });
  }
});

export type ExpenseItem = z.infer<typeof expenseItemSchema>;

/**
 * Capital call schedule pattern
 */
export const capitalCallScheduleSchema = z.object({
  type: z.enum(['even', 'front-loaded', 'back-loaded', 'custom'], {
    errorMap: () => ({ message: 'Capital call schedule type is required' })
  }).default('even'),

  customSchedule: z.array(z.object({
    year: z.number().int().min(1).max(10),
    percentage: percentageSchema
  })).optional()
}).superRefine((data, ctx) => {
  // Custom schedule must be provided when type is custom
  if (data.type === 'custom' && !data.customSchedule) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Custom schedule is required when type is custom',
      path: ['customSchedule']
    });
  }

  // Custom schedule percentages must sum to 100%
  if (data.type === 'custom' && data.customSchedule) {
    const total = data.customSchedule.reduce((sum, item) => sum + item.percentage, 0);
    if (Math.abs(total - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Custom schedule percentages must sum to 100% (currently ${total.toFixed(1)}%)`,
        path: ['customSchedule']
      });
    }
  }
});

export type CapitalCallSchedule = z.infer<typeof capitalCallScheduleSchema>;

export const fundFinancialsSchema = z.object({
  fundSize: positiveNumberSchema
    .refine(
      (val) => val >= 1,
      'Fund size must be at least $1M'
    ),

  orgExpenses: nonNegativeNumberSchema,

  // Additional granular expenses
  additionalExpenses: z.array(expenseItemSchema)
    .max(20, 'Cannot exceed 20 additional expenses')
    .optional()
    .default([]),

  investmentPeriod: z.number()
    .int('Investment period must be a whole number of years')
    .min(1, 'Investment period must be at least 1 year')
    .max(10, 'Investment period cannot exceed 10 years'),

  gpCommitment: percentageSchema
    .refine(
      (val) => val >= 0 && val <= 10,
      'GP commitment must be between 0% and 10%'
    ),

  cashlessSplit: percentageSchema,

  managementFee: z.object({
    rate: percentageSchema
      .refine(
        (val) => val >= 0 && val <= 5,
        'Management fee must be between 0% and 5%'
      ),

    stepDown: z.object({
      enabled: z.boolean(),
      afterYear: z.number()
        .int('Step-down year must be a whole number')
        .min(1, 'Step-down year must be at least 1')
        .optional(),
      newRate: percentageSchema.optional()
    }).optional()
  }),

  // Capital call schedule
  capitalCallSchedule: capitalCallScheduleSchema.optional()
}).superRefine((data, ctx) => {
  // Validate step-down configuration
  if (data.managementFee.stepDown?.enabled) {
    if (!data.managementFee.stepDown.afterYear) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Step-down year is required when step-down is enabled',
        path: ['managementFee', 'stepDown', 'afterYear']
      });
    }

    if (!data.managementFee.stepDown.newRate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'New rate is required when step-down is enabled',
        path: ['managementFee', 'stepDown', 'newRate']
      });
    }

    if (
      data.managementFee.stepDown.newRate !== undefined &&
      data.managementFee.stepDown.afterYear !== undefined &&
      data.managementFee.stepDown.newRate >= data.managementFee.rate
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Step-down rate must be lower than initial rate',
        path: ['managementFee', 'stepDown', 'newRate']
      });
    }
  }

  // Warn about high management fees
  if (data.managementFee.rate > 3) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Management fee over 3% is above market standards',
      path: ['managementFee', 'rate']
    });
  }

  // Investment period should not exceed 10 years
  if (data.investmentPeriod > data.fundSize / 10) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Investment period may be too long for fund size',
      path: ['investmentPeriod']
    });
  }
});

export type FundFinancialsInput = z.input<typeof fundFinancialsSchema>;
export type FundFinancialsOutput = z.output<typeof fundFinancialsSchema>;

// ============================================================================
// STEP 5: EXIT RECYCLING (OPTIONAL)
// ============================================================================

export const exitRecyclingSchema = z.object({
  enabled: z.boolean().default(false),

  recyclingCap: percentageSchema.optional(),

  recyclingPeriod: z.number()
    .int('Recycling period must be a whole number of years')
    .min(1, 'Recycling period must be at least 1 year')
    .max(15, 'Recycling period cannot exceed 15 years')
    .optional(),

  exitRecyclingRate: percentageSchema.optional(),

  mgmtFeeRecyclingRate: percentageSchema.optional()
}).superRefine((data, ctx) => {
  // Validate recycling configuration when enabled
  if (data.enabled) {
    if (data.recyclingCap === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Recycling cap is required when recycling is enabled',
        path: ['recyclingCap']
      });
    }

    if (data.recyclingPeriod === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Recycling period is required when recycling is enabled',
        path: ['recyclingPeriod']
      });
    }

    if (data.exitRecyclingRate === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Exit recycling rate is required when recycling is enabled',
        path: ['exitRecyclingRate']
      });
    }
  }
});

export type ExitRecyclingInput = z.input<typeof exitRecyclingSchema>;
export type ExitRecyclingOutput = z.output<typeof exitRecyclingSchema>;

// ============================================================================
// STEP 6: WATERFALL
// ============================================================================

export const waterfallTierSchema = z.object({
  id: z.string().min(1, 'Tier ID is required'),

  name: z.string()
    .min(1, 'Tier name is required')
    .max(50, 'Tier name cannot exceed 50 characters'),

  threshold: percentageSchema,

  gpSplit: percentageSchema,

  lpSplit: percentageSchema
}).refine(
  (tier) => Math.abs((tier.gpSplit + tier.lpSplit) - 100) < 0.01,
  'GP split and LP split must sum to 100%'
);

export const waterfallSchema = z.object({
  type: z.enum(['american', 'european', 'hybrid'], {
    errorMap: () => ({ message: 'Waterfall type must be specified' })
  }),

  preferredReturn: percentageSchema
    .refine(
      (val) => val >= 0 && val <= 20,
      'Preferred return must be between 0% and 20%'
    ),

  catchUp: percentageSchema
    .refine(
      (val) => val >= 0 && val <= 100,
      'Catch-up must be between 0% and 100%'
    ),

  carriedInterest: percentageSchema
    .refine(
      (val) => val >= 0 && val <= 30,
      'Carried interest must be between 0% and 30%'
    ),

  tiers: z.array(waterfallTierSchema).optional()
}).superRefine((data, ctx) => {
  // Warn about high carry
  if (data.carriedInterest > 25) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Carry over 25% is above typical market standards',
      path: ['carriedInterest']
    });
  }

  // Warn about low carry
  if (data.carriedInterest < 15) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Carry under 15% may not provide sufficient GP incentive alignment',
      path: ['carriedInterest']
    });
  }

  // Warn about unusual preferred return
  if (data.preferredReturn > 12) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Preferred return over 12% is unusually high',
      path: ['preferredReturn']
    });
  }
});

export type WaterfallInput = z.input<typeof waterfallSchema>;
export type WaterfallOutput = z.output<typeof waterfallSchema>;

// ============================================================================
// STEP 7: SCENARIOS
// ============================================================================

export const scenarioSchema = z.object({
  id: z.string().min(1, 'Scenario ID is required'),

  name: z.string()
    .min(1, 'Scenario name is required')
    .max(100, 'Scenario name cannot exceed 100 characters'),

  assumptions: z.record(z.any())
});

export const scenariosSchema = z.object({
  scenarioType: z.enum(['construction', 'current_state', 'comparison'], {
    errorMap: () => ({ message: 'Scenario type is required' })
  }),

  baseCase: z.object({
    name: z.string()
      .min(1, 'Base case name is required')
      .max(100, 'Base case name cannot exceed 100 characters'),

    assumptions: z.record(z.any())
  }),

  scenarios: z.array(scenarioSchema)
    .max(10, 'Cannot exceed 10 comparison scenarios')
    .optional()
});

export type ScenariosInput = z.input<typeof scenariosSchema>;
export type ScenariosOutput = z.output<typeof scenariosSchema>;

// ============================================================================
// COMBINED WIZARD SCHEMA
// ============================================================================

/**
 * Complete wizard data schema
 * Combines all step schemas for final validation
 */
export const completeWizardSchema = z.object({
  generalInfo: generalInfoSchema,
  sectorProfiles: sectorProfilesSchema,
  capitalAllocation: capitalAllocationSchema,
  feesExpenses: feesExpensesSchema,
  fundFinancials: fundFinancialsSchema.optional(),
  exitRecycling: exitRecyclingSchema,
  waterfall: waterfallSchema,
  scenarios: scenariosSchema
});

export type CompleteWizardData = z.infer<typeof completeWizardSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Validate a specific wizard step
 */
export function validateWizardStep<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: string[] } {
  const result = schema.safeParse(data);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const errors = result.error.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });

  return { success: false, errors };
}

/**
 * Get validation errors as a flat array of messages
 */
export function getValidationErrors(zodError: z.ZodError): string[] {
  return zodError.errors.map((err) => {
    const path = err.path.join('.');
    return path ? `${path}: ${err.message}` : err.message;
  });
}

/**
 * Check if validation error is a warning (not a critical error)
 */
export function isWarning(error: z.ZodIssue): boolean {
  // Warnings are custom issues with specific message patterns
  return (
    error.code === z.ZodIssueCode.custom &&
    (error.message.includes('unusually') ||
      error.message.includes('Please verify') ||
      error.message.includes('may not provide'))
  );
}

// ============================================================================
// STORAGE SCHEMA
// ============================================================================

/**
 * Schema for wizard data stored in localStorage
 * Combines wizard data with UI state (current step, completed steps, etc.)
 *
 * Used by storage layer to persist progress across sessions
 */
export const storableWizardSchema = completeWizardSchema.deepPartial().extend({
  currentStep: z.enum([
    'generalInfo',
    'sectorProfiles',
    'capitalAllocation',
    'feesExpenses',
    'exitRecycling',
    'waterfall',
    'scenarios'
  ]).optional(),
  completedSteps: z.array(z.string()).optional(),
  visitedSteps: z.array(z.string()).optional(),
  skipOptionalSteps: z.boolean().optional()
});

export type StorableWizard = z.infer<typeof storableWizardSchema>;
