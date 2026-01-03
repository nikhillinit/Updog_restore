/**
 * Unified Portfolio Strategy Schema
 * Implements AI consensus approach for type safety and backward compatibility
 *
 * Based on multi-AI analysis:
 * - Technical accuracy (type safety and data integrity)
 * - Best practices (migration strategies and code organization)
 * - Innovation (automated validation and future-proofing)
 */

import { z } from 'zod';

// =============================================================================
// CORE VALIDATION SCHEMAS
// =============================================================================

export const CheckSizeConfigSchema = z.object({
  min: z.number().positive('Minimum check size must be positive'),
  target: z.number().positive('Target check size must be positive'),
  max: z.number().positive('Maximum check size must be positive')
}).refine(
  (data) => data.min <= data.target && data.target <= data.max,
  {
    message: "Check sizes must follow min ≤ target ≤ max",
    path: ["checkSizes"]
  }
);

export const AllocationConfigSchema = z.record(
  z.string(),
  z.number().min(0).max(1, 'Allocation percentages must be between 0 and 1')
);

export const ScenarioConfigSchema = z.object({
  name: z.string().min(1, 'Scenario name is required'),
  type: z.enum(['base_case', 'optimistic', 'pessimistic', 'stress_test']),
  marketEnvironment: z.enum(['bull', 'normal', 'bear', 'recession']),
  dealFlowMultiplier: z.number().positive('Deal flow multiplier must be positive'),
  valuationMultiplier: z.number().positive('Valuation multiplier must be positive'),
  exitMultiplier: z.number().positive('Exit multiplier must be positive')
});

// =============================================================================
// MAIN PORTFOLIO STRATEGY SCHEMA
// =============================================================================

export const PortfolioStrategySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1, 'Strategy name is required'),

  // Fund size properties with backward compatibility
  fundSize: z.number().positive('Fund size must be positive'),
  totalFundSize: z.number().positive('Total fund size must be positive'),

  deploymentPeriodMonths: z.number().int().positive('Deployment period must be positive'),
  targetPortfolioSize: z.number().int().positive('Target portfolio size must be positive'),

  // Nested configuration objects
  checkSizes: CheckSizeConfigSchema,
  sectorAllocation: AllocationConfigSchema,
  stageAllocation: AllocationConfigSchema,
  geographicAllocation: AllocationConfigSchema,

  // Reserve properties with backward compatibility
  reservePercentage: z.number().min(0).max(100, 'Reserve percentage must be 0-100'),
  reserveRatio: z.number().min(0).max(1, 'Reserve ratio must be 0-1'),

  // Optional properties for advanced tracking
  allocatedCapital: z.number().nonnegative().optional(),
  projectedIRR: z.number().optional(),
  targetReturns: z.number().optional(),
  riskScore: z.number().min(0).max(10).optional(),

  scenarios: z.array(ScenarioConfigSchema).min(1, 'At least one scenario is required')
}).refine(
  (data) => {
    // Ensure fund size aliases are consistent
    return Math.abs(data.fundSize - data.totalFundSize) < 0.01;
  },
  {
    message: "fundSize and totalFundSize must be equal",
    path: ["totalFundSize"]
  }
).refine(
  (data) => {
    // Ensure reserve percentage and ratio are consistent
    const expectedRatio = data.reservePercentage / 100;
    return Math.abs(data.reserveRatio - expectedRatio) < 0.001;
  },
  {
    message: "reserveRatio must equal reservePercentage / 100",
    path: ["reserveRatio"]
  }
).refine(
  (data) => {
    // Validate allocations sum to approximately 1.0
    const sectorSum = Object.values(data.sectorAllocation).reduce((sum, val) => sum + val, 0) as number;
    const stageSum = Object.values(data.stageAllocation).reduce((sum, val) => sum + val, 0) as number;
    const geoSum = Object.values(data.geographicAllocation).reduce((sum, val) => sum + val, 0) as number;

    return Math.abs(sectorSum - 1.0) < 0.01 &&
           Math.abs(stageSum - 1.0) < 0.01 &&
           Math.abs(geoSum - 1.0) < 0.01;
  },
  {
    message: "All allocation percentages must sum to approximately 1.0",
    path: ["allocations"]
  }
);

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type CheckSizeConfig = z.infer<typeof CheckSizeConfigSchema>;
export type AllocationConfig = z.infer<typeof AllocationConfigSchema>;
export type ScenarioConfig = z.infer<typeof ScenarioConfigSchema>;
export type PortfolioStrategy = z.infer<typeof PortfolioStrategySchema>;

// Backward compatibility type alias
export type PortfolioState = PortfolioStrategy;

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Create a PortfolioStrategy with consistent field mappings
 * Implements AI consensus: automatic field reconciliation
 */
export const createPortfolioStrategy = (input: Partial<PortfolioStrategy>): PortfolioStrategy => {
  const reconciled = {
    ...input,
    // Auto-reconcile fund size fields
    totalFundSize: input.totalFundSize || input.fundSize || 0,
    fundSize: input.fundSize || input.totalFundSize || 0,

    // Auto-reconcile reserve fields
    reserveRatio: input.reserveRatio ?? (input.reservePercentage ? input.reservePercentage / 100 : 0),
    reservePercentage: input.reservePercentage ?? (input.reserveRatio ? input.reserveRatio * 100 : 0),

    // Set safe defaults for optional fields
    allocatedCapital: input.allocatedCapital ?? 0,
    scenarios: input.scenarios ?? []
  };

  return PortfolioStrategySchema.parse(reconciled);
};

/**
 * Validate PortfolioStrategy with detailed error reporting
 * Implements AI consensus: comprehensive validation with context
 */
export const validatePortfolioStrategy = (input: unknown): {
  success: boolean;
  data?: PortfolioStrategy;
  errors?: string[];
} => {
  try {
    const validated = PortfolioStrategySchema.parse(input);
    return { success: true, data: validated };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err =>
        `${err.path.join('.')}: ${err.message}`
      );
      return { success: false, errors };
    }
    return { success: false, errors: ['Unknown validation error'] };
  }
};

/**
 * Update strategy with automatic field synchronization
 * Implements AI consensus: maintain consistency during updates
 */
export const updatePortfolioStrategy = (
  current: PortfolioStrategy,
  updates: Partial<PortfolioStrategy>
): PortfolioStrategy => {
  const merged = { ...current, ...updates };

  // Maintain field consistency
  if (updates.fundSize !== undefined) {
    merged.totalFundSize = updates.fundSize;
  }
  if (updates.totalFundSize !== undefined) {
    merged.fundSize = updates.totalFundSize;
  }
  if (updates.reservePercentage !== undefined) {
    merged.reserveRatio = updates.reservePercentage / 100;
  }
  if (updates.reserveRatio !== undefined) {
    merged.reservePercentage = updates.reserveRatio * 100;
  }

  return PortfolioStrategySchema.parse(merged);
};

/**
 * Migration helper for legacy portfolio strategy objects
 * Implements AI consensus: graceful migration with error handling
 */
export interface LegacyPortfolioStrategy {
  fundSize?: number;
  reservePercentage?: number;
  [key: string]: unknown;
}

export const migrateLegacyStrategy = (legacy: LegacyPortfolioStrategy): PortfolioStrategy => {
  const migrated: Partial<PortfolioStrategy> = {
    ...legacy,
    id: legacy['id'] || undefined,
    name: legacy['name'] || 'Untitled Strategy',
    fundSize: legacy['fundSize'] || 50000000,
    totalFundSize: legacy['fundSize'] || 50000000,
    deploymentPeriodMonths: legacy['deploymentPeriodMonths'] || 36,
    targetPortfolioSize: legacy['targetPortfolioSize'] || 25,
    checkSizes: legacy['checkSizes'] || {
      min: 500000,
      target: 2000000,
      max: 5000000
    },
    sectorAllocation: legacy['sectorAllocation'] || { 'Technology': 1.0 },
    stageAllocation: legacy['stageAllocation'] || { 'Series A': 1.0 },
    geographicAllocation: legacy['geographicAllocation'] || { 'North America': 1.0 },
    reservePercentage: legacy['reservePercentage'] || 50,
    reserveRatio: legacy['reservePercentage'] ? legacy['reservePercentage'] / 100 : 0.5,
    allocatedCapital: legacy['allocatedCapital'] || 0,
    scenarios: legacy['scenarios'] || []
  };

  return createPortfolioStrategy(migrated);
};