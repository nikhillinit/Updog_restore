/**
 * Database Row Types for Portfolio Optimization Tables
 *
 * Types inferred from Drizzle ORM schemas in shared/schema.ts
 * See: docs/plans/2026-01-04-phase1-implementation-plan.md (Task 9)
 *
 * Tables:
 * - job_outbox: Transactional outbox pattern for exactly-once job semantics
 * - scenario_matrices: Monte Carlo MOIC matrix storage with metadata
 * - optimization_sessions: MILP optimization sessions with two-pass tie-break
 */

import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import type { jobOutbox, scenarioMatrices, optimizationSessions } from '../schema';

// ============================================================================
// Job Outbox Types
// ============================================================================

/**
 * Job Outbox row type (SELECT)
 * Represents a complete job_outbox record from the database
 */
export type JobOutboxRow = InferSelectModel<typeof jobOutbox>;

/**
 * Job Outbox insert type (INSERT)
 * Fields required/optional for creating a new job_outbox record
 */
export type JobOutboxInsert = InferInsertModel<typeof jobOutbox>;

/**
 * Job Outbox status enum
 */
export type JobOutboxStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Job Outbox update payload (partial)
 */
export interface JobOutboxUpdate {
  status?: JobOutboxStatus;
  attemptCount?: number;
  processingAt?: Date | null;
  nextRunAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
}

// ============================================================================
// Scenario Matrices Types
// ============================================================================

/**
 * Scenario Matrix row type (SELECT)
 * Represents a complete scenario_matrices record from the database
 */
export type ScenarioMatrixRow = InferSelectModel<typeof scenarioMatrices>;

/**
 * Scenario Matrix insert type (INSERT)
 * Fields required/optional for creating a new scenario_matrices record
 */
export type ScenarioMatrixInsert = InferInsertModel<typeof scenarioMatrices>;

/**
 * Matrix type enum (MOIC, TVPI, DPI, IRR)
 */
export type MatrixType = 'moic' | 'tvpi' | 'dpi' | 'irr';

/**
 * Scenario Matrix status enum
 */
export type ScenarioMatrixStatus = 'pending' | 'processing' | 'complete' | 'failed';

/**
 * Compression codec for matrix storage
 */
export type CompressionCodec = 'zstd' | 'lz4' | 'none';

/**
 * Matrix layout (row-major vs column-major)
 */
export type MatrixLayout = 'row-major' | 'column-major';

/**
 * Scenario states metadata structure
 */
export interface ScenarioStates {
  scenarios: Array<{
    id: number;
    params: Record<string, unknown>;
  }>;
}

/**
 * Bucket params metadata structure
 */
export interface BucketParams {
  min: number;
  max: number;
  count: number;
  distribution: string;
  buckets?: Array<{
    name: string;
    median: number;
    p90: number;
  }>;
}

/**
 * S_opt (optimization state) metadata structure
 */
export interface SOpt {
  algorithm: string;
  params: Record<string, unknown>;
  convergence: Record<string, unknown>;
}

/**
 * Scenario Matrix update payload (partial)
 */
export interface ScenarioMatrixUpdate {
  status?: ScenarioMatrixStatus;
  moicMatrix?: Buffer | null;
  scenarioStates?: ScenarioStates | null;
  bucketParams?: BucketParams | null;
  compressionCodec?: CompressionCodec | null;
  matrixLayout?: MatrixLayout | null;
  bucketCount?: number | null;
  sOpt?: SOpt | null;
  errorMessage?: string | null;
}

// ============================================================================
// Optimization Sessions Types
// ============================================================================

/**
 * Optimization Session row type (SELECT)
 * Represents a complete optimization_sessions record from the database
 */
export type OptimizationSessionRow = InferSelectModel<typeof optimizationSessions>;

/**
 * Optimization Session insert type (INSERT)
 * Fields required/optional for creating a new optimization_sessions record
 */
export type OptimizationSessionInsert = InferInsertModel<typeof optimizationSessions>;

/**
 * Optimization Session status enum
 */
export type OptimizationSessionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Optimization objective types
 */
export type OptimizationObjective = 'maximize_return' | 'minimize_risk' | 'risk_adjusted';

/**
 * Optimization config structure
 */
export interface OptimizationConfig {
  objective: OptimizationObjective;
  constraints: Record<string, unknown>;
  algorithm: string;
  maxIterations?: number;
  convergenceTolerance?: number;
}

/**
 * Result metrics structure
 */
export interface ResultMetrics {
  expectedReturn: number;
  risk: number;
  sharpeRatio?: number;
  cvar?: number;
}

/**
 * Optimization Session update payload (partial)
 */
export interface OptimizationSessionUpdate {
  status?: OptimizationSessionStatus;
  pass1EStar?: number | null;
  primaryLockEpsilon?: number | null;
  resultWeights?: Record<string, number> | null;
  resultMetrics?: ResultMetrics | null;
  currentIteration?: number;
  totalIterations?: number | null;
  startedAt?: Date | null;
  completedAt?: Date | null;
  errorMessage?: string | null;
}

// ============================================================================
// Re-exports for convenience
// ============================================================================

// Row types (aliases for backward compatibility)
export type { JobOutboxRow as JobOutbox };
export type { ScenarioMatrixRow as ScenarioMatrix };
export type { OptimizationSessionRow as OptimizationSession };

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard for JobOutboxStatus
 */
export function isJobOutboxStatus(value: unknown): value is JobOutboxStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'processing', 'completed', 'failed', 'cancelled'].includes(value)
  );
}

/**
 * Type guard for ScenarioMatrixStatus
 */
export function isScenarioMatrixStatus(value: unknown): value is ScenarioMatrixStatus {
  return (
    typeof value === 'string' && ['pending', 'processing', 'complete', 'failed'].includes(value)
  );
}

/**
 * Type guard for OptimizationSessionStatus
 */
export function isOptimizationSessionStatus(value: unknown): value is OptimizationSessionStatus {
  return (
    typeof value === 'string' &&
    ['pending', 'running', 'completed', 'failed', 'cancelled'].includes(value)
  );
}

/**
 * Type guard for MatrixType
 */
export function isMatrixType(value: unknown): value is MatrixType {
  return typeof value === 'string' && ['moic', 'tvpi', 'dpi', 'irr'].includes(value);
}
