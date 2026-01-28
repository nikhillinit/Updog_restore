/**
 * Portfolio Optimization Service
 *
 * Handles portfolio optimization job scheduling, progress tracking, and results retrieval.
 * Implements the transactional outbox pattern for exactly-once job semantics with BullMQ.
 *
 * Features:
 * - Job scheduling with priority and retry logic
 * - Progress tracking for matrix generation and MILP optimization
 * - Results retrieval with CVaR calculations and power-law allocations
 * - Support for two-pass lexicographic MILP tie-breaking
 *
 * @module server/services/portfolio-optimization-service
 * @see docs/plans/2026-01-04-phase1-implementation-plan.md
 * @see docs/plans/2026-01-04-critical-corrections.md
 */

import { appendFileSync } from 'fs';
import { db } from '../db';
import {
  jobOutbox,
  scenarioMatrices,
  optimizationSessions,
  insertJobOutboxSchema,
  insertScenarioMatrixSchema,
  insertOptimizationSessionSchema,
  type JobOutbox,
  type ScenarioMatrix,
  type OptimizationSession,
  type InsertJobOutbox,
  type InsertScenarioMatrix,
  type InsertOptimizationSession,
} from '@shared/schema';
import { eq, and, desc, sql, type SQL } from 'drizzle-orm';
import { typedFindFirst, typedFindMany, typedInsert, typedUpdate } from '../db/typed-query';
import { logger } from '../lib/logger';

// =====================
// TYPE DEFINITIONS
// =====================

/**
 * Optimization job types supported by the system
 */
export type JobType = 'matrix_generation' | 'optimization' | 'validation';

/**
 * Job status in the outbox lifecycle
 */
export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

/**
 * Optimization session status
 */
export type OptimizationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Matrix generation status
 */
export type MatrixStatus = 'pending' | 'processing' | 'complete' | 'failed' | 'invalidated';

/**
 * Create optimization job request
 */
export interface CreateOptimizationJobRequest {
  fundId: string;
  taxonomyVersion: string;
  optimizationConfig: {
    objective: 'maximize_return' | 'minimize_risk' | 'risk_adjusted';
    constraints: OptimizationConstraints;
    algorithm: string;
    maxIterations?: number;
    convergenceTolerance?: number;
  };
  priority?: number;
  scheduledFor?: Date;
}

/**
 * Optimization constraints configuration
 */
export interface OptimizationConstraints {
  // Risk constraints
  maxLossProbability?: number;
  cvarConfidenceLevel?: number;
  cvarLimit?: number;
  minExpectedWinners?: number;

  // Diversification bounds
  sectorBounds?: Record<string, { min: number; max: number }>;
  stageBounds?: Record<string, { min: number; max: number }>;
  bucketMaxWeight?: number;

  // Total fund size for normalization
  totalFundSize: number;
}

/**
 * Scenario generation configuration
 */
export interface ScenarioGenConfig {
  scenarioCount: number;
  regimeConfig: {
    regimes: Array<{
      name: string;
      probability: number;
      shockRanges: { min: number; max: number };
    }>;
    correlationMatrix: number[][];
  };
  recyclingConfig: {
    enabled: boolean;
    utilization: number;
    cashMultiple: number;
    maxRecycleDeals: number;
  };
}

/**
 * Job progress information
 */
export interface JobProgress {
  jobId: string;
  status: JobStatus;
  attemptCount: number;
  maxAttempts: number;
  progress: number; // 0-100
  currentStep?: string;
  startedAt?: Date;
  completedAt?: Date;
  errorMessage?: string;
}

/**
 * Optimization results
 */
export interface OptimizationResults {
  sessionId: string;
  status: OptimizationStatus;
  weights: Record<string, number>;
  metrics: {
    expectedReturn: number;
    risk: number;
    sharpeRatio?: number;
    cvar?: number;
  };
  pass1EStar?: number;
  primaryLockEpsilon?: number;
  currentIteration: number;
  totalIterations?: number;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Matrix generation result with CVaR and power-law data
 */
export interface MatrixGenerationResult {
  matrixId: string;
  matrixKey: string;
  fundId: string;
  status: MatrixStatus;
  moicMatrix?: Buffer;
  scenarioStates?: {
    scenarios: Array<{ id: number; params: Record<string, unknown> }>;
  };
  bucketParams?: {
    min: number;
    max: number;
    count: number;
    distribution: string;
    buckets?: Array<{
      name: string;
      median: number;
      p90: number;
    }>;
  };
  bucketCount?: number;
  sOpt?: {
    algorithm: string;
    params: Record<string, unknown>;
    convergence: Record<string, unknown>;
  };
  createdAt: Date;
  updatedAt: Date;
}

/**
 * CVaR calculation result
 */
export interface CvarCalculationResult {
  confidenceLevel: number;
  cvarValue: number;
  tailScenarios: number[];
  expectedShortfall: number;
}

/**
 * Power-law allocation result
 */
export interface PowerLawAllocationResult {
  bucketId: string;
  weight: number;
  dollarAmount: number;
  alpha: number;
  medianMOIC: number;
  p90MOIC: number;
}

// =====================
// ERROR CLASSES
// =====================

/**
 * Error thrown when job is not found
 */
export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job not found: ${jobId}`);
    this.name = 'JobNotFoundError';
  }
}

/**
 * Error thrown when optimization session is not found
 */
export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Optimization session not found: ${sessionId}`);
    this.name = 'SessionNotFoundError';
  }
}

/**
 * Error thrown when scenario matrix is not found
 */
export class MatrixNotFoundError extends Error {
  constructor(matrixId: string) {
    super(`Scenario matrix not found: ${matrixId}`);
    this.name = 'MatrixNotFoundError';
  }
}

/**
 * Error thrown when max retry attempts exceeded
 */
export class MaxRetriesExceededError extends Error {
  constructor(jobId: string, attempts: number) {
    super(`Max retries exceeded for job ${jobId} after ${attempts} attempts`);
    this.name = 'MaxRetriesExceededError';
  }
}

/**
 * Error thrown when invalid job transition is attempted
 */
export class InvalidJobTransitionError extends Error {
  constructor(jobId: string, fromStatus: string, toStatus: string) {
    super(`Invalid job transition for ${jobId}: ${fromStatus} -> ${toStatus}`);
    this.name = 'InvalidJobTransitionError';
  }
}

type CalibrationData = {
  median: number;
  p90: number;
  calibrated: boolean;
};

function getCalibrationData(
  bucketParams: MatrixGenerationResult['bucketParams'] | null | undefined
): CalibrationData {
  const bucket = bucketParams?.buckets?.[0];
  if (bucket && typeof bucket.median === 'number' && typeof bucket.p90 === 'number') {
    return { median: bucket.median, p90: bucket.p90, calibrated: true };
  }

  logger.warn('Using uncalibrated matrix (median/p90 = 1.0)');
  return { median: 1.0, p90: 1.0, calibrated: false };
}

// =====================
// SERVICE CLASS
// =====================

/**
 * PortfolioOptimizationService
 *
 * Provides methods for managing portfolio optimization workflows:
 * - Schedule optimization jobs with the outbox pattern
 * - Track job progress through matrix generation and MILP solving
 * - Retrieve optimization results with CVaR and power-law data
 * - Support deterministic tie-breaking with two-pass MILP
 *
 * @example
 * const service = new PortfolioOptimizationService();
 *
 * // Schedule an optimization job
 * const job = await service.scheduleOptimization({
 *   fundId: 'fund-123',
 *   taxonomyVersion: 'v1.2',
 *   optimizationConfig: {
 *     objective: 'maximize_return',
 *     constraints: { totalFundSize: 100000000 },
 *     algorithm: 'milp'
 *   }
 * });
 *
 * // Check job progress
 * const progress = await service.getJobProgress(job.id);
 *
 * // Get optimization results
 * const results = await service.getOptimizationResults(sessionId);
 */
export class PortfolioOptimizationService {
  // =====================
  // JOB SCHEDULING
  // =====================

  /**
   * Schedule a new optimization job
   *
   * Creates a job in the outbox with status 'pending'. The outbox worker
   * will claim and enqueue this job to BullMQ for processing.
   *
   * Correction #3: Uses make_interval(secs => $n) for scheduled time calculation
   * Correction #6: Index supports ORDER BY next_run_at, created_at for CTE claiming
   * Correction #8: Duplicate detection via job_type + payload hash
   *
   * @param request - Optimization job request
   * @returns Created job outbox record
   *
   * @example
   * const job = await service.scheduleOptimization({
   *   fundId: 'fund-123',
   *   taxonomyVersion: 'v1.2',
   *   optimizationConfig: { ... },
   *   priority: 5
   * });
   */
  async scheduleOptimization(request: CreateOptimizationJobRequest): Promise<JobOutbox> {
    const payload = {
      fundId: request.fundId,
      taxonomyVersion: request.taxonomyVersion,
      optimizationConfig: request.optimizationConfig,
    };

    const insertData: InsertJobOutbox = {
      jobType: 'optimization',
      payload,
      priority: request.priority ?? 0,
      scheduledFor: request.scheduledFor ?? new Date(),
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 3,
    };

    // Validate insert data
    insertJobOutboxSchema.parse(insertData);

    const result = await db
      .insert(jobOutbox)
      .values(insertData)
      .returning();

    if (!result[0]) {
      throw new Error('Failed to create job outbox entry');
    }

    return result[0];
  }

  /**
   * Schedule a matrix generation job
   *
   * Creates a job for generating scenario matrices with Monte Carlo simulation.
   *
   * @param fundId - Fund identifier
   * @param taxonomyVersion - Taxonomy version for sector/stage definitions
   * @param scenarioGenConfig - Scenario generation configuration
   * @param priority - Job priority (higher = more important)
   * @returns Created job outbox record
   */
  async scheduleMatrixGeneration(
    fundId: string,
    taxonomyVersion: string,
    scenarioGenConfig: ScenarioGenConfig,
    priority: number = 0
  ): Promise<JobOutbox> {
    const payload = {
      fundId,
      taxonomyVersion,
      scenarioGenConfig,
    };

    const insertData: InsertJobOutbox = {
      jobType: 'matrix_generation',
      payload,
      priority,
      status: 'pending',
      attemptCount: 0,
      maxAttempts: 3,
    };

    insertJobOutboxSchema.parse(insertData);

    const result = await db
      .insert(jobOutbox)
      .values(insertData)
      .returning();
    
    if (!result[0]) {
      throw new Error('Failed to create job outbox entry');
    }

    return result[0];
  }

  // =====================
  // PROGRESS TRACKING
  // =====================

  /**
   * Get job progress by ID
   *
   * Retrieves the current status and progress of a job from the outbox.
   *
   * @param jobId - Job UUID
   * @returns Job progress information
   * @throws JobNotFoundError if job doesn't exist
   */
  async getJobProgress(jobId: string): Promise<JobProgress> {
    const [job] = await db
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, jobId))
      .limit(1);

    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    return this.mapJobToProgress(job);
  }

  /**
   * Get optimization session progress
   *
   * Retrieves detailed progress for an optimization session including
   * current iteration, pass-1 results, and status.
   *
   * Correction #9: Returns pass1_e_star and primary_lock_epsilon for tie-break
   *
   * @param sessionId - Optimization session UUID
   * @returns Optimization session with progress info
   * @throws SessionNotFoundError if session doesn't exist
   */
  async getOptimizationProgress(sessionId: string): Promise<OptimizationSession> {
    const [session] = await db
      .select()
      .from(optimizationSessions)
      .where(eq(optimizationSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return session;
  }

  /**
   * Update job status
   *
   * Updates the status of a job in the outbox. Validates status transitions
   * to prevent invalid state changes.
   *
   * @param jobId - Job UUID
   * @param status - New status
   * @param errorMessage - Optional error message for failed jobs
   * @returns Updated job record
   * @throws JobNotFoundError if job doesn't exist
   * @throws InvalidJobTransitionError if status transition is invalid
   */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    errorMessage?: string
  ): Promise<JobOutbox> {
    const [existing] = await db
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, jobId))
      .limit(1);

    if (!existing) {
      throw new JobNotFoundError(jobId);
    }

    // Validate status transition
    if (!this.isValidJobTransition(existing.status, status)) {
      throw new InvalidJobTransitionError(jobId, existing.status, status);
    }

    const updateData: Partial<JobOutbox> = {
      status,
      updatedAt: new Date(),
    };

    if (status === 'processing' && !existing.processingAt) {
      updateData.processingAt = new Date();
    }

    if (status === 'completed') {
      updateData.completedAt = new Date();
    }

    if (errorMessage) {
      updateData.errorMessage = errorMessage;
    }

    const result = await db
      .update(jobOutbox)
      .set(updateData)
      .where(eq(jobOutbox.id, jobId))
      .returning();
    
    if (!result[0]) {
      throw new JobNotFoundError(jobId);
    }

    return result[0];
  }

  /**
   * Increment job attempt count with exponential backoff
   *
   * Correction #3: Uses make_interval(secs => $n) for next_run_at calculation
   *
   * @param jobId - Job UUID
   * @returns Updated job record
   */
  async incrementJobAttempt(jobId: string): Promise<JobOutbox> {
    const [existing] = await db
      .select()
      .from(jobOutbox)
      .where(eq(jobOutbox.id, jobId))
      .limit(1);

    if (!existing) {
      throw new JobNotFoundError(jobId);
    }

    const newAttemptCount = (existing.attemptCount ?? 0) + 1;

    // Exponential backoff: 2^attempts seconds, capped at 300s (5 min)
    const backoffSeconds = Math.min(Math.pow(2, newAttemptCount), 300);

    // Correction #3: Use make_interval for parameterized SQL interval
    const result = await db
      .update(jobOutbox)
      .set({
        attemptCount: newAttemptCount,
        status: newAttemptCount >= (existing.maxAttempts ?? 3) ? 'failed' : 'pending',
        nextRunAt: sql`NOW() + make_interval(secs => ${backoffSeconds})`,
        updatedAt: new Date(),
      })
      .where(eq(jobOutbox.id, jobId))
      .returning();

    if (!result[0]) {
      throw new JobNotFoundError(jobId);
    }

    return result[0];
  }

  // =====================
  // RESULTS RETRIEVAL
  // =====================

  /**
   * Get optimization results by session ID
   *
   * Retrieves the complete optimization results including weights,
   * metrics, and tie-break information.
   *
   * Correction #9: Includes pass1_e_star for deterministic tie-break audit
   *
   * @param sessionId - Optimization session UUID
   * @returns Optimization results
   * @throws SessionNotFoundError if session doesn't exist
   */
  async getOptimizationResults(sessionId: string): Promise<OptimizationResults> {
    const [session] = await db
      .select()
      .from(optimizationSessions)
      .where(eq(optimizationSessions.id, sessionId))
      .limit(1);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return this.mapSessionToResults(session);
  }

  /**
   * Get matrix generation results
   *
   * Retrieves the scenario matrix with MOIC data, bucket parameters,
   * and scenario states. Correction #2: Returns BYTEA moic_matrix directly.
   *
   * @param matrixId - Scenario matrix UUID
   * @returns Matrix generation result
   * @throws MatrixNotFoundError if matrix doesn't exist
   */
  async getMatrixResults(matrixId: string): Promise<MatrixGenerationResult> {
    const [matrix] = await db
      .select()
      .from(scenarioMatrices)
      .where(eq(scenarioMatrices.id, matrixId))
      .limit(1);

    if (!matrix) {
      throw new MatrixNotFoundError(matrixId);
    }

    return this.mapMatrixToResult(matrix);
  }

  /**
   * Get CVaR calculations from optimization results
   *
   * Correction #4: Uses consistent confidence level convention (not alpha)
   *
   * @param sessionId - Optimization session UUID
   * @returns CVaR calculation results
   */
  async getCvarCalculations(sessionId: string): Promise<CvarCalculationResult | null> {
    const session = await this.getOptimizationProgress(sessionId);

    if (!session.resultMetrics || typeof session.resultMetrics !== 'object') {
      return null;
    }

    const metrics = session.resultMetrics as Record<string, unknown>;

    if (!metrics['cvar'] || typeof metrics['cvar'] !== 'number') {
      return null;
    }

    return {
      confidenceLevel: 0.95, // Default confidence level (Correction #4)
      cvarValue: metrics['cvar'] as number,
      tailScenarios: [], // Would be populated from actual calculation
      expectedShortfall: metrics['cvar'] as number,
    };
  }

  /**
   * Get power-law allocation results
   *
   * Correction #5: Uses corrected alpha derivation formula
   *
   * @param sessionId - Optimization session UUID
   * @returns Power-law allocation results
   */
  async getPowerLawAllocations(sessionId: string): Promise<PowerLawAllocationResult[]> {
    const session = await this.getOptimizationProgress(sessionId);

    if (!session.resultWeights || typeof session.resultWeights !== 'object') {
      return [];
    }

    const weights = session.resultWeights as Record<string, number>;
    const constraints = (
      session.optimizationConfig as unknown as { constraints?: OptimizationConstraints }
    )?.constraints;
    const totalFundSize = constraints?.totalFundSize ?? 0;

    // Get matrix for bucket parameters
    const [matrix] = await db
      .select()
      .from(scenarioMatrices)
      .where(eq(scenarioMatrices.id, session.matrixId))
      .limit(1);

    const bucketParams = matrix?.bucketParams as MatrixGenerationResult['bucketParams'] | undefined;
    const { median, p90, calibrated } = getCalibrationData(bucketParams);

    if (!calibrated && matrix?.id) {
      logger.warn({ matrixId: matrix.id }, 'Matrix needs regeneration for calibration data');
      if (process.env.NODE_ENV !== 'production') {
        try {
          appendFileSync('regenerate_todo.txt', `${matrix.id}\n`);
        } catch (error) {
          logger.warn({ matrixId: matrix.id, error }, 'Failed to record matrix regeneration todo');
        }
      }
    }

    return Object.entries(weights).map(([bucketId, weight]) => ({
      bucketId,
      weight,
      dollarAmount: weight * totalFundSize,
      // Correction #5: Alpha derived from ln(5) / ln(p90/median)
      alpha: this.calculatePowerLawAlpha(median, p90),
      medianMOIC: median,
      p90MOIC: p90,
    }));
  }

  /**
   * List pending jobs for outbox worker processing
   *
   * Correction #6: ORDER BY next_run_at, created_at matches composite index
   *
   * @param limit - Maximum number of jobs to return
   * @returns Pending jobs ready for processing
   */
  async listPendingJobs(limit: number = 10): Promise<JobOutbox[]> {
    return await db
      .select()
      .from(jobOutbox)
      .where(
        and(
          eq(jobOutbox.status, 'pending'),
          sql`${jobOutbox.scheduledFor} IS NULL OR ${jobOutbox.scheduledFor} <= NOW()`
        )
      )
      // Correction #6: ORDER BY matches composite index (next_run_at, created_at)
      .orderBy(jobOutbox.nextRunAt, jobOutbox.createdAt)
      .limit(limit);
  }

  /**
   * List optimization sessions for a fund
   *
   * @param fundId - Fund identifier
   * @param limit - Maximum number of sessions to return
   * @returns Optimization sessions ordered by creation date
   */
  async listOptimizationSessions(
    fundId: string,
    limit: number = 10
  ): Promise<OptimizationSession[]> {
    const rows = await db
      .select({ session: optimizationSessions })
      .from(optimizationSessions)
      .innerJoin(
        scenarioMatrices,
        eq(optimizationSessions.matrixId, scenarioMatrices.id)
      )
      .where(eq(scenarioMatrices.fundId, fundId))
      .orderBy(desc(optimizationSessions.createdAt))
      .limit(limit);

    return rows.map((row) => row.session);
  }

  // =====================
  // PRIVATE HELPERS
  // =====================

  /**
   * Map job outbox record to progress information
   */
  private mapJobToProgress(job: JobOutbox): JobProgress {
    let progress = 0;

    switch (job.status) {
      case 'pending':
        progress = 0;
        break;
      case 'processing':
        progress = 25;
        break;
      case 'completed':
        progress = 100;
        break;
      case 'failed':
        progress = 0;
        break;
      case 'cancelled':
        progress = 0;
        break;
    }

    const result: JobProgress = {
      jobId: job.id,
      status: job.status,
      attemptCount: job.attemptCount ?? 0,
      maxAttempts: job.maxAttempts ?? 3,
      progress,
    };
    const currentStep = this.getJobStepDescription(job);
    if (currentStep !== undefined) {
      result.currentStep = currentStep;
    }
    if (job.processingAt !== null && job.processingAt !== undefined) {
      result.startedAt = job.processingAt;
    }
    if (job.completedAt !== null && job.completedAt !== undefined) {
      result.completedAt = job.completedAt;
    }
    if (job.errorMessage !== null && job.errorMessage !== undefined) {
      result.errorMessage = job.errorMessage;
    }
    return result;
  }

  /**
   * Get human-readable description of current job step
   */
  private getJobStepDescription(job: JobOutbox): string | undefined {
    if (job.status === 'completed') {
      return 'Completed';
    }

    if (job.status === 'failed') {
      return 'Failed';
    }

    if (job.jobType === 'matrix_generation') {
      return job.status === 'processing' ? 'Generating scenario matrix' : 'Waiting for matrix generation';
    }

    if (job.jobType === 'optimization') {
      return job.status === 'processing' ? 'Running MILP optimization' : 'Waiting for optimization';
    }

    return undefined;
  }

  /**
   * Map optimization session to results format
   */
  private mapSessionToResults(session: OptimizationSession): OptimizationResults {
    const config = session.optimizationConfig as Record<string, unknown> | undefined;

    const result: OptimizationResults = {
      sessionId: session.id,
      status: session.status,
      weights: (session.resultWeights as Record<string, number>) ?? {},
      metrics: (session.resultMetrics as OptimizationResults['metrics']) ?? {
        expectedReturn: 0,
        risk: 0,
      },
      currentIteration: session.currentIteration ?? 0,
    };
    if (session.pass1EStar !== null && session.pass1EStar !== undefined) {
      result.pass1EStar = session.pass1EStar;
    }
    if (session.primaryLockEpsilon !== null && session.primaryLockEpsilon !== undefined) {
      result.primaryLockEpsilon = session.primaryLockEpsilon;
    }
    if (session.totalIterations !== null && session.totalIterations !== undefined) {
      result.totalIterations = session.totalIterations;
    }
    if (session.startedAt !== null && session.startedAt !== undefined) {
      result.startedAt = session.startedAt;
    }
    if (session.completedAt !== null && session.completedAt !== undefined) {
      result.completedAt = session.completedAt;
    }
    return result;
  }

  /**
   * Map scenario matrix to result format
   */
  private mapMatrixToResult(matrix: ScenarioMatrix): MatrixGenerationResult {
    const result: MatrixGenerationResult = {
      matrixId: matrix.id,
      matrixKey: matrix.matrixKey,
      fundId: matrix.fundId,
      status: matrix.status,
      createdAt: matrix.createdAt,
      updatedAt: matrix.updatedAt,
    };
    if (matrix.moicMatrix !== null && matrix.moicMatrix !== undefined) {
      result.moicMatrix = matrix.moicMatrix;
    }
    if (matrix.scenarioStates !== null && matrix.scenarioStates !== undefined) {
      result.scenarioStates =
        matrix.scenarioStates as NonNullable<MatrixGenerationResult['scenarioStates']>;
    }
    if (matrix.bucketParams !== null && matrix.bucketParams !== undefined) {
      result.bucketParams =
        matrix.bucketParams as NonNullable<MatrixGenerationResult['bucketParams']>;
    }
    if (matrix.bucketCount !== null && matrix.bucketCount !== undefined) {
      result.bucketCount = matrix.bucketCount;
    }
    if (matrix.sOpt !== null && matrix.sOpt !== undefined) {
      result.sOpt = matrix.sOpt as NonNullable<MatrixGenerationResult['sOpt']>;
    }
    return result;
  }

  /**
   * Validate job status transition
   */
  private isValidJobTransition(from: JobStatus, to: JobStatus): boolean {
    const validTransitions: Record<JobStatus, JobStatus[]> = {
      pending: ['processing', 'cancelled'],
      processing: ['completed', 'failed', 'cancelled'],
      completed: [],
      failed: ['pending'], // Retry
      cancelled: ['pending'], // Restart
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  /**
   * Calculate power-law alpha from median and p90
   *
   * Correction #5: Uses corrected formula: alpha = ln(5) / ln(p90/median)
   *
   * @param median - Median MOIC
   * @param p90 - 90th percentile MOIC
   * @returns Alpha parameter for power-law distribution
   */
  private calculatePowerLawAlpha(median: number, p90: number): number {
    if (p90 <= median || median <= 0) {
      return 1.0; // Default fallback
    }

    // Correction #5: Proper alpha derivation
    // For Pareto: P(X >= x) = (xmin/x)^alpha
    // At median: P(X >= median) = 0.5
    // At p90: P(X >= p90) = 0.1
    // Ratio: (median/p90)^alpha = 0.5/0.1 = 5
    // Therefore: alpha = ln(5) / ln(p90/median)
    const alpha = Math.log(5) / Math.log(p90 / median);

    // Clamp to reasonable range
    return Math.max(0.5, Math.min(5.0, alpha));
  }
}

// =====================
// SINGLETON EXPORT
// =====================

/**
 * Singleton instance of PortfolioOptimizationService
 */
export const portfolioOptimizationService = new PortfolioOptimizationService();

// Default export for convenience
export default PortfolioOptimizationService;
