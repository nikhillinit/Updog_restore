/**
 * RESERVE ENGINE API CONTRACT (FROZEN v1.0)
 *
 * Deterministic reserve allocation engine with auditability.
 * Addresses executive feedback: "Centralized, Deterministic Reserve Engine"
 * with rationale for stakeholder trust.
 *
 * Design Principles:
 * - Deterministic: Same inputs → same outputs (reproducible seed)
 * - Auditable: Every allocation includes human-readable rationale
 * - Explainable: Returns constraints and trade-offs made
 */

import { z } from 'zod';

// ============================================================================
// PORTFOLIO COMPANY INPUT
// ============================================================================

export const CompanyStageSchema = z.enum([
  'pre-seed',
  'seed',
  'series-a',
  'series-b',
  'series-c',
  'series-d-plus',
  'late-stage',
]);

export type CompanyStage = z.infer<typeof CompanyStageSchema>;

export const CompanyInputSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  currentStage: CompanyStageSchema,
  currentValuation: z.number().positive(),
  currentOwnership: z.number().min(0).max(100), // Percentage
  initialInvestment: z.number().positive(),

  // Performance signals
  revenueGrowthRate: z.number().optional(), // % annual growth
  burnRate: z.number().optional(), // Monthly burn
  monthsToNextRound: z.number().int().positive().optional(),

  // Strategic flags
  isStrategic: z.boolean().default(false), // High conviction
  hasFollowOnRights: z.boolean().default(true),
  maxDilutionTolerance: z.number().min(0).max(100).default(50), // Max ownership dilution %
});

export type CompanyInput = z.infer<typeof CompanyInputSchema>;

// ============================================================================
// GRADUATION & STAGE STRATEGIES
// ============================================================================

export const GraduationMatrixSchema = z.object({
  // Graduation % by stage (e.g., 30% of seed companies graduate to Series A)
  'pre-seed': z.number().min(0).max(100),
  seed: z.number().min(0).max(100),
  'series-a': z.number().min(0).max(100),
  'series-b': z.number().min(0).max(100),
  'series-c': z.number().min(0).max(100),
  'series-d-plus': z.number().min(0).max(100),
  'late-stage': z.number().min(0).max(100).default(0), // Final stage
});

export type GraduationMatrix = z.infer<typeof GraduationMatrixSchema>;

export const StageStrategySchema = z.object({
  stage: CompanyStageSchema,

  // Reserve allocation targets
  targetReserveMultiple: z.number().positive(), // e.g., 2.0 = reserve 2x initial check
  minReserveAmount: z.number().nonnegative(),
  maxReserveAmount: z.number().positive(),

  // Ownership targets
  targetOwnershipAtExit: z.number().min(0).max(100), // Desired final ownership %
  proRataParticipation: z.number().min(0).max(100).default(100), // % of pro-rata to take
});

export type StageStrategy = z.infer<typeof StageStrategySchema>;

// ============================================================================
// RESERVE OPTIMIZATION REQUEST
// ============================================================================

export const ReserveOptimizationRequestSchema = z.object({
  fundId: z.string().uuid(),
  optimizationId: z.string().uuid().optional(), // For idempotency

  // Portfolio snapshot
  portfolio: z.array(CompanyInputSchema).min(1),

  // Strategy inputs
  graduationMatrix: GraduationMatrixSchema,
  stageStrategies: z.array(StageStrategySchema),

  // Constraints
  availableReserves: z.number().positive(),
  minAllocationPerCompany: z.number().nonnegative().default(0),
  maxAllocationPerCompany: z.number().positive().optional(),

  // Optimization preferences
  optimizationGoal: z.enum(['maximize-ownership', 'minimize-dilution', 'balanced']).default('balanced'),
  prioritizeStrategic: z.boolean().default(true),

  // Reproducibility
  randomSeed: z.number().int().optional(), // For deterministic Monte Carlo if needed
});

export type ReserveOptimizationRequest = z.infer<typeof ReserveOptimizationRequestSchema>;

// ============================================================================
// RESERVE ALLOCATION OUTPUT
// ============================================================================

export const CompanyAllocationSchema = z.object({
  companyId: z.string().uuid(),
  companyName: z.string(),
  currentStage: CompanyStageSchema,

  // Allocation decision
  allocatedReserve: z.number().nonnegative(),
  allocationPriority: z.number().int().min(1), // 1 = highest priority

  // Projected outcomes
  projectedOwnershipAtExit: z.number().min(0).max(100),
  expectedDilution: z.number().min(0).max(100),
  projectedMultiple: z.number().nonnegative(), // Expected MOIC on this allocation

  // Rationale (CRITICAL for stakeholder trust)
  rationale: z.string(), // Human-readable explanation
  constraints: z.array(z.string()), // Any constraints that limited allocation

  // Risk factors
  graduationProbability: z.number().min(0).max(100),
  capitalEfficiencyScore: z.number().min(0).max(100), // Higher = better use of capital
});

export type CompanyAllocation = z.infer<typeof CompanyAllocationSchema>;

export const ReserveOptimizationResponseSchema = z.object({
  optimizationId: z.string().uuid(),
  fundId: z.string().uuid(),
  timestamp: z.string().datetime(),

  // Allocation results
  companyAllocations: z.array(CompanyAllocationSchema),
  totalAllocated: z.number().nonnegative(),
  totalAvailable: z.number().nonnegative(),
  unallocatedReserves: z.number().nonnegative(),

  // Portfolio-level metrics
  portfolioMetrics: z.object({
    averageOwnershipAtExit: z.number().min(0).max(100),
    totalProjectedValue: z.number().nonnegative(),
    weightedAverageMultiple: z.number().nonnegative(),
    capitalEfficiency: z.number().min(0).max(100), // Overall efficiency score
  }),

  // Optimization metadata
  constraints: z.array(z.string()), // Global constraints applied
  warnings: z.array(z.string()).optional(), // Non-fatal issues
  alternativeScenarios: z.array(z.object({
    scenarioName: z.string(),
    description: z.string(),
    totalAllocated: z.number(),
    projectedValue: z.number(),
  })).optional(), // For scenario comparison

  // Determinism proof
  seedUsed: z.number().int().optional(),
  algorithmVersion: z.string(), // e.g., "v1.0-binary-search"
});

export type ReserveOptimizationResponse = z.infer<typeof ReserveOptimizationResponseSchema>;

// ============================================================================
// API ENDPOINT CONTRACT
// ============================================================================

/**
 * API Endpoint: POST /api/reserve-optimization
 * Request: ReserveOptimizationRequest
 * Response: ReserveOptimizationResponse (200) | ErrorResponse (4xx/5xx)
 *
 * Idempotency: Providing the same optimizationId returns cached results
 * Processing: Async for large portfolios (>50 companies), polling via GET /api/reserve-optimization/:id/status
 */
export const RESERVE_ENDPOINT = '/api/reserve-optimization' as const;

// ============================================================================
// ENGINE INTERFACE (for implementation)
// ============================================================================

export interface ReserveEngine {
  /**
   * Master optimization function - deterministic and auditable
   */
  optimize(request: ReserveOptimizationRequest): Promise<ReserveOptimizationResponse>;

  /**
   * Validate inputs before optimization
   */
  validateRequest(request: ReserveOptimizationRequest): { valid: boolean; errors: string[] };

  /**
   * Explain allocation for a specific company (debugging)
   */
  explainAllocation(
    company: CompanyInput,
    allocation: CompanyAllocation,
    context: Pick<ReserveOptimizationRequest, 'graduationMatrix' | 'stageStrategies'>
  ): string;
}

// ============================================================================
// ERROR CODES
// ============================================================================

export const ReserveErrorSchema = z.object({
  code: z.enum([
    'INVALID_PORTFOLIO',
    'INSUFFICIENT_RESERVES',
    'STRATEGY_CONFLICT',
    'OPTIMIZATION_TIMEOUT',
    'INVALID_CONSTRAINTS',
    'GRADUATION_MATRIX_INVALID',
  ]),
  message: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type ReserveError = z.infer<typeof ReserveErrorSchema>;

// ============================================================================
// EXAMPLE RATIONALE TEMPLATES (for implementation guidance)
// ============================================================================

export const RATIONALE_TEMPLATES = {
  highPriority: (company: string, stage: string, multiple: number) =>
    `${company} (${stage}) allocated maximum reserves due to strong performance signals and ${multiple.toFixed(1)}x projected return. Strategic priority with high graduation probability.`,

  constrainedByCapital: (company: string, requested: number, allocated: number) =>
    `${company} requested $${(requested / 1e6).toFixed(1)}M but allocated $${(allocated / 1e6).toFixed(1)}M due to total reserve constraints. Prioritized based on capital efficiency score.`,

  lowGraduation: (company: string, probability: number) =>
    `${company} allocated minimal reserves due to ${probability.toFixed(0)}% graduation probability. Reserves reallocated to higher-conviction opportunities.`,

  proRataOnly: (company: string, ownership: number) =>
    `${company} allocated pro-rata reserves to maintain ${ownership.toFixed(1)}% ownership. No super pro-rata due to balanced portfolio strategy.`,
} as const;
