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

export const sectorProfileSchema = z.object({
  id: z.string().min(1, 'Sector profile ID is required'),

  name: z.string()
    .min(1, 'Sector name is required')
    .max(50, 'Sector name cannot exceed 50 characters'),

  allocation: percentageSchema,

  description: z.string()
    .max(500, 'Description cannot exceed 500 characters')
    .optional()
});

export const stageAllocationSchema = z.object({
  stage: z.enum(['seed', 'series-a', 'series-b', 'series-c', 'growth'], {
    errorMap: () => ({ message: 'Invalid investment stage' })
  }),

  allocation: percentageSchema
});

export const sectorProfilesSchema = z.object({
  sectorProfiles: z.array(sectorProfileSchema)
    .min(1, 'At least one sector profile is required')
    .max(10, 'Cannot exceed 10 sector profiles'),

  stageAllocations: z.array(stageAllocationSchema)
    .min(1, 'At least one stage allocation is required')
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

  // Validate stage allocations sum to 100%
  const totalStageAllocation = data.stageAllocations.reduce(
    (sum, stage) => sum + stage.allocation,
    0
  );

  if (Math.abs(totalStageAllocation - 100) > 0.01) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Stage allocations must sum to 100% (currently ${totalStageAllocation.toFixed(1)}%)`,
      path: ['stageAllocations']
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

export const capitalAllocationSchema = z.object({
  initialCheckSize: positiveNumberSchema,

  followOnStrategy: z.object({
    reserveRatio: decimalPercentageSchema
      .refine(
        (val) => val >= 0.3 && val <= 0.7,
        'Reserve ratio typically ranges from 30% to 70%'
      ),

    followOnChecks: z.object({
      A: positiveNumberSchema,
      B: positiveNumberSchema,
      C: positiveNumberSchema
    }).refine(
      (checks) => checks.A <= checks.B && checks.B <= checks.C,
      'Follow-on check sizes should increase: A ≤ B ≤ C'
    )
  }),

  pacingModel: z.object({
    investmentsPerYear: z.number()
      .int('Investments per year must be a whole number')
      .min(1, 'Must make at least 1 investment per year')
      .max(50, 'Cannot exceed 50 investments per year'),

    deploymentCurve: z.enum(['linear', 'front-loaded', 'back-loaded'], {
      errorMap: () => ({ message: 'Invalid deployment curve type' })
    })
  })
}).superRefine((data, ctx) => {
  // Warn if initial check is unusually large relative to follow-on checks
  const avgFollowOn = (data.followOnStrategy.followOnChecks.A +
    data.followOnStrategy.followOnChecks.B +
    data.followOnStrategy.followOnChecks.C) / 3;

  if (data.initialCheckSize > avgFollowOn * 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Initial check size is unusually large compared to follow-on checks',
      path: ['initialCheckSize']
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
