/**
 * Portfolio Optimization Schemas
 * Zod validation schemas for job_outbox, scenario_matrices, and optimization_sessions
 */

import { z } from 'zod';

// =============================================================================
// JOB OUTBOX SCHEMAS
// =============================================================================

/**
 * Valid status values for job outbox entries
 */
export const jobOutboxStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export type JobOutboxStatus = z.infer<typeof jobOutboxStatusSchema>;

/**
 * Schema for creating a new job outbox entry
 */
export const insertJobOutboxSchema = z.object({
  jobType: z.string().min(1, 'Job type is required'),
  payload: z.record(z.unknown()).refine(
    (val) => val !== null && typeof val === 'object',
    'Payload must be a valid object'
  ),
  priority: z.number().int().min(0, 'Priority must be non-negative').default(0),
  maxAttempts: z.number().int().min(1, 'Max attempts must be at least 1').default(3),
  scheduledFor: z.date().optional(),
});

export type InsertJobOutboxInput = z.infer<typeof insertJobOutboxSchema>;

/**
 * Schema for updating a job outbox entry
 */
export const updateJobOutboxSchema = z
  .object({
    status: jobOutboxStatusSchema,
    attemptCount: z.number().int().min(0),
    priority: z.number().int().min(0),
    scheduledFor: z.date().nullable(),
  })
  .partial();

export type UpdateJobOutboxInput = z.infer<typeof updateJobOutboxSchema>;

// =============================================================================
// SCENARIO MATRICES SCHEMAS
// =============================================================================

/**
 * Valid status values for scenario matrices
 */
export const scenarioMatrixStatusSchema = z.enum([
  'pending',
  'processing',
  'complete',
  'failed',
]);

export type ScenarioMatrixStatus = z.infer<typeof scenarioMatrixStatusSchema>;

/**
 * Valid matrix types
 */
export const matrixTypeSchema = z.enum(['moic', 'tvpi', 'dpi', 'irr']);

export type MatrixType = z.infer<typeof matrixTypeSchema>;

/**
 * Schema for scenario states within a matrix
 */
export const scenarioStatesSchema = z.object({
  scenarios: z.array(
    z.object({
      id: z.number().int(),
      params: z.record(z.unknown()),
    })
  ),
});

export type ScenarioStates = z.infer<typeof scenarioStatesSchema>;

/**
 * Schema for bucket parameters
 */
export const bucketParamsSchema = z.object({
  min: z.number(),
  max: z.number(),
  count: z.number().int().positive(),
  distribution: z.string(),
});

export type BucketParams = z.infer<typeof bucketParamsSchema>;

/**
 * Schema for optimization configuration (s_opt)
 */
export const sOptSchema = z.object({
  algorithm: z.string(),
  params: z.record(z.unknown()),
  convergence: z.record(z.unknown()),
});

export type SOpt = z.infer<typeof sOptSchema>;

/**
 * Schema for creating a new scenario matrix
 */
export const insertScenarioMatrixSchema = z.object({
  scenarioId: z.string().uuid('Scenario ID must be a valid UUID'),
  matrixType: matrixTypeSchema,
  moicMatrix: z.string().optional(), // Base64 encoded
  scenarioStates: scenarioStatesSchema.optional(),
  bucketParams: bucketParamsSchema.optional(),
  compressionCodec: z.enum(['zstd', 'lz4', 'none']).optional(),
  matrixLayout: z.enum(['row-major', 'column-major']).optional(),
  bucketCount: z.number().int().positive().optional(),
  sOpt: sOptSchema.optional(),
  status: scenarioMatrixStatusSchema.default('pending'),
});

export type InsertScenarioMatrixInput = z.infer<typeof insertScenarioMatrixSchema>;

/**
 * Schema for a complete scenario matrix (all fields required)
 */
export const completeScenarioMatrixSchema = z.object({
  scenarioId: z.string().uuid(),
  matrixType: matrixTypeSchema,
  moicMatrix: z.string().min(1),
  scenarioStates: scenarioStatesSchema,
  bucketParams: bucketParamsSchema,
  compressionCodec: z.enum(['zstd', 'lz4', 'none']),
  matrixLayout: z.enum(['row-major', 'column-major']),
  bucketCount: z.number().int().positive(),
  sOpt: sOptSchema,
  status: z.literal('complete'),
});

export type CompleteScenarioMatrix = z.infer<typeof completeScenarioMatrixSchema>;

// =============================================================================
// OPTIMIZATION SESSIONS SCHEMAS
// =============================================================================

/**
 * Valid status values for optimization sessions
 */
export const optimizationSessionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'cancelled',
]);

export type OptimizationSessionStatus = z.infer<typeof optimizationSessionStatusSchema>;

/**
 * Valid optimization objectives
 */
export const optimizationObjectiveSchema = z.enum([
  'maximize_return',
  'minimize_risk',
  'risk_adjusted',
]);

export type OptimizationObjective = z.infer<typeof optimizationObjectiveSchema>;

/**
 * Schema for optimization configuration
 */
export const optimizationConfigSchema = z.object({
  objective: optimizationObjectiveSchema,
  constraints: z.record(z.unknown()),
  algorithm: z.string(),
  maxIterations: z.number().int().positive().optional(),
  convergenceTolerance: z.number().positive().optional(),
});

export type OptimizationConfig = z.infer<typeof optimizationConfigSchema>;

/**
 * Schema for optimization result metrics
 */
export const resultMetricsSchema = z.object({
  expectedReturn: z.number(),
  risk: z.number(),
  sharpeRatio: z.number().optional(),
  cvar: z.number().optional(),
});

export type ResultMetrics = z.infer<typeof resultMetricsSchema>;

/**
 * Schema for creating a new optimization session
 */
export const insertOptimizationSessionSchema = z.object({
  matrixId: z.string().uuid('Matrix ID must be a valid UUID'),
  optimizationConfig: optimizationConfigSchema,
  pass1EStar: z.string().optional(), // Decimal as string
  primaryLockEpsilon: z.string().optional(), // Decimal as string
  status: optimizationSessionStatusSchema.default('pending'),
});

export type InsertOptimizationSessionInput = z.infer<typeof insertOptimizationSessionSchema>;

/**
 * Schema for updating an optimization session
 */
export const updateOptimizationSessionSchema = z
  .object({
    status: optimizationSessionStatusSchema,
    pass1EStar: z.string(),
    primaryLockEpsilon: z.string(),
    resultWeights: z.record(z.number()),
    resultMetrics: resultMetricsSchema,
    errorMessage: z.string().nullable(),
    currentIteration: z.number().int().min(0),
    totalIterations: z.number().int().positive(),
    startedAt: z.date(),
    completedAt: z.date(),
  })
  .partial();

export type UpdateOptimizationSessionInput = z.infer<typeof updateOptimizationSessionSchema>;

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validates that a scenario matrix has all required fields when status is 'complete'
 */
export function validateCompleteMatrix(matrix: InsertScenarioMatrixInput): boolean {
  if (matrix.status !== 'complete') {
    return true; // Non-complete matrices don't need all fields
  }

  return (
    matrix.moicMatrix !== undefined &&
    matrix.scenarioStates !== undefined &&
    matrix.bucketParams !== undefined &&
    matrix.compressionCodec !== undefined &&
    matrix.matrixLayout !== undefined &&
    matrix.bucketCount !== undefined &&
    matrix.sOpt !== undefined
  );
}

/**
 * Validates job outbox input and returns parsed data or errors
 */
export function validateJobOutboxInput(raw: unknown) {
  const result = insertJobOutboxSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false as const,
      status: 400,
      issues: result.error.issues.map((i) => ({
        code: i.code,
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  return { ok: true as const, data: result.data };
}

/**
 * Validates scenario matrix input and returns parsed data or errors
 */
export function validateScenarioMatrixInput(raw: unknown) {
  const result = insertScenarioMatrixSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false as const,
      status: 400,
      issues: result.error.issues.map((i) => ({
        code: i.code,
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }

  // Additional validation for complete matrices
  if (!validateCompleteMatrix(result.data)) {
    return {
      ok: false as const,
      status: 422,
      issues: [
        {
          code: 'missing_fields',
          path: '',
          message: 'Complete matrices require all payload fields to be set',
        },
      ],
    };
  }

  return { ok: true as const, data: result.data };
}

/**
 * Validates optimization session input and returns parsed data or errors
 */
export function validateOptimizationSessionInput(raw: unknown) {
  const result = insertOptimizationSessionSchema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false as const,
      status: 400,
      issues: result.error.issues.map((i) => ({
        code: i.code,
        path: i.path.join('.'),
        message: i.message,
      })),
    };
  }
  return { ok: true as const, data: result.data };
}
