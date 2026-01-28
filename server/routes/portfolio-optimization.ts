/**
 * Portfolio Optimization API Routes
 *
 * Endpoints for portfolio construction and optimization:
 * - POST /api/portfolio-optimization/run - Start optimization job
 * - GET /api/portfolio-optimization/:jobId/status - Get job status
 * - GET /api/portfolio-optimization/:jobId/results - Get optimization results
 *
 * @module server/routes/portfolio-optimization
 * @see docs/plans/2026-01-04-phase1-implementation-plan.md
 */

import type { Request, Response } from 'express';
import express from 'express';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { jobOutbox } from '@shared/schema';
import {
  PortfolioOptimizationService,
  JobNotFoundError,
  SessionNotFoundError,
  MatrixNotFoundError,
  MaxRetriesExceededError,
  InvalidJobTransitionError,
  type CreateOptimizationJobRequest,
  type OptimizationConstraints,
} from '../services/portfolio-optimization-service';

const router = express.Router();

// =====================
// SERVICE INSTANCE
// =====================

const optimizationService = new PortfolioOptimizationService();

// =====================
// REQUEST VALIDATION SCHEMAS
// =====================

/**
 * Schema for optimization constraints
 */
const OptimizationConstraintsSchema = z.object({
  maxLossProbability: z.number().min(0).max(1).optional(),
  cvarConfidenceLevel: z.number().min(0).max(1).optional(),
  cvarLimit: z.number().min(0).max(1).optional(),
  minExpectedWinners: z.number().int().nonnegative().optional(),
  sectorBounds: z
    .record(z.object({ min: z.number().min(0).max(1), max: z.number().min(0).max(1) }))
    .optional(),
  stageBounds: z
    .record(z.object({ min: z.number().min(0).max(1), max: z.number().min(0).max(1) }))
    .optional(),
  bucketMaxWeight: z.number().min(0).max(1).optional(),
  totalFundSize: z.number().positive(),
});

/**
 * Schema for scenario generation configuration
 */
const ScenarioGenConfigSchema = z.object({
  scenarioCount: z.number().int().positive(),
  regimeConfig: z.object({
    regimes: z.array(
      z.object({
        name: z.string(),
        probability: z.number().min(0).max(1),
        shockRanges: z.object({
          min: z.number(),
          max: z.number(),
        }),
      })
    ),
    correlationMatrix: z.array(z.array(z.number())),
  }),
  recyclingConfig: z.object({
    enabled: z.boolean(),
    utilization: z.number().min(0).max(1),
    cashMultiple: z.number().positive(),
    maxRecycleDeals: z.number().int().nonnegative(),
  }),
});

/**
 * Schema for run optimization request
 */
const RunOptimizationRequestSchema = z.object({
  fundId: z.string().min(1),
  taxonomyVersion: z.string().min(1),
  optimizationConfig: z.object({
    objective: z.enum(['maximize_return', 'minimize_risk', 'risk_adjusted']),
    constraints: OptimizationConstraintsSchema,
    algorithm: z.string().min(1),
    maxIterations: z.number().int().positive().optional(),
    convergenceTolerance: z.number().positive().optional(),
  }),
  scenarioGenConfig: ScenarioGenConfigSchema.optional(),
  priority: z.number().int().min(0).max(100).optional(),
  scheduledFor: z.string().datetime().optional(),
});

/**
 * Schema for job ID parameter
 */
const JobIdParamSchema = z.object({
  jobId: z.string().uuid(),
});

// =====================
// ERROR HANDLING
// =====================

/**
 * Type guard to check if error is a ZodError
 */
function isZodError(error: unknown): error is { name: 'ZodError'; errors: unknown } {
  return (
    typeof error === 'object' && error !== null && 'name' in error && error.name === 'ZodError'
  );
}

/**
 * Type guard to check if error has a message property
 */
function hasMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

/**
 * Handle service errors and return appropriate HTTP response
 */
function handleServiceError(error: unknown, res: Response): void {
  if (error instanceof JobNotFoundError) {
    res.status(404).json({
      error: 'job_not_found',
      message: error.message,
    });
    return;
  }

  if (error instanceof SessionNotFoundError) {
    res.status(404).json({
      error: 'session_not_found',
      message: error.message,
    });
    return;
  }

  if (error instanceof MatrixNotFoundError) {
    res.status(404).json({
      error: 'matrix_not_found',
      message: error.message,
    });
    return;
  }

  if (error instanceof MaxRetriesExceededError) {
    res.status(422).json({
      error: 'max_retries_exceeded',
      message: error.message,
    });
    return;
  }

  if (error instanceof InvalidJobTransitionError) {
    res.status(409).json({
      error: 'invalid_transition',
      message: error.message,
    });
    return;
  }

  if (isZodError(error)) {
    res.status(400).json({
      error: 'validation_error',
      message: 'Invalid request data',
      details: error.errors,
    });
    return;
  }

  // Log unexpected errors
  console.error('Unexpected error in portfolio optimization:', error);

  res.status(500).json({
    error: 'internal_error',
    message: hasMessage(error) ? error.message : 'An unexpected error occurred',
  });
}

// =====================
// ROUTES
// =====================

/**
 * POST /api/portfolio-optimization/run
 *
 * Start a new portfolio optimization job.
 *
 * Request body:
 * {
 *   fundId: string;
 *   taxonomyVersion: string;
 *   optimizationConfig: {
 *     objective: 'maximize_return' | 'minimize_risk' | 'risk_adjusted';
 *     constraints: {
 *       maxLossProbability?: number;
 *       cvarConfidenceLevel?: number;
 *       cvarLimit?: number;
 *       minExpectedWinners?: number;
 *       sectorBounds?: Record<string, { min: number; max: number }>;
 *       stageBounds?: Record<string, { min: number; max: number }>;
 *       bucketMaxWeight?: number;
 *       totalFundSize: number;
 *     };
 *     algorithm: string;
 *     maxIterations?: number;
 *     convergenceTolerance?: number;
 *   };
 *   scenarioGenConfig?: ScenarioGenConfig;
 *   priority?: number;
 *   scheduledFor?: string; // ISO 8601 datetime
 * }
 *
 * Response:
 * {
 *   jobId: string;
 *   status: 'pending' | 'processing' | 'completed' | 'failed';
 *   scheduledFor: string;
 *   message: string;
 * }
 */
router.post('/run', async (req: Request, res: Response) => {
  try {
    // Validate request body
    const validated = RunOptimizationRequestSchema.parse(req.body);

    const rawConstraints = validated.optimizationConfig.constraints;
    const constraints: OptimizationConstraints = {
      totalFundSize: rawConstraints.totalFundSize,
    };
    if (rawConstraints.maxLossProbability !== undefined) {
      constraints.maxLossProbability = rawConstraints.maxLossProbability;
    }
    if (rawConstraints.cvarConfidenceLevel !== undefined) {
      constraints.cvarConfidenceLevel = rawConstraints.cvarConfidenceLevel;
    }
    if (rawConstraints.cvarLimit !== undefined) {
      constraints.cvarLimit = rawConstraints.cvarLimit;
    }
    if (rawConstraints.minExpectedWinners !== undefined) {
      constraints.minExpectedWinners = rawConstraints.minExpectedWinners;
    }
    if (rawConstraints.sectorBounds !== undefined) {
      constraints.sectorBounds = rawConstraints.sectorBounds;
    }
    if (rawConstraints.stageBounds !== undefined) {
      constraints.stageBounds = rawConstraints.stageBounds;
    }
    if (rawConstraints.bucketMaxWeight !== undefined) {
      constraints.bucketMaxWeight = rawConstraints.bucketMaxWeight;
    }

    // Schedule the optimization job
    const optimizationConfig: CreateOptimizationJobRequest['optimizationConfig'] = {
      objective: validated.optimizationConfig.objective,
      constraints,
      algorithm: validated.optimizationConfig.algorithm,
    };
    if (validated.optimizationConfig.maxIterations !== undefined) {
      optimizationConfig.maxIterations = validated.optimizationConfig.maxIterations;
    }
    if (validated.optimizationConfig.convergenceTolerance !== undefined) {
      optimizationConfig.convergenceTolerance = validated.optimizationConfig.convergenceTolerance;
    }

    const scheduleData: CreateOptimizationJobRequest = {
      fundId: validated.fundId,
      taxonomyVersion: validated.taxonomyVersion,
      optimizationConfig,
    };
    if (validated.priority !== undefined) {
      scheduleData.priority = validated.priority;
    }
    if (validated.scheduledFor) {
      scheduleData.scheduledFor = new Date(validated.scheduledFor);
    }
    const job = await optimizationService.scheduleOptimization(scheduleData);

    // If scenario generation config provided, also schedule matrix generation
    if (validated.scenarioGenConfig) {
      await optimizationService.scheduleMatrixGeneration(
        validated.fundId,
        validated.taxonomyVersion,
        validated.scenarioGenConfig,
        validated.priority ?? 0
      );
    }

    res.status(201).json({
      jobId: job.id,
      status: job.status,
      scheduledFor: job.scheduledFor?.toISOString() ?? new Date().toISOString(),
      message: 'Optimization job scheduled successfully',
    });
  } catch (error) {
    handleServiceError(error, res);
  }
});

/**
 * GET /api/portfolio-optimization/:jobId/status
 *
 * Get the current status and progress of an optimization job.
 *
 * Path params:
 *   jobId: string (UUID)
 *
 * Response:
 * {
 *   jobId: string;
 *   status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
 *   progress: number; // 0-100
 *   currentStep?: string;
 *   attemptCount: number;
 *   maxAttempts: number;
 *   startedAt?: string;
 *   completedAt?: string;
 *   errorMessage?: string;
 * }
 */
router.get('/:jobId/status', async (req: Request, res: Response) => {
  try {
    // Validate job ID
    const params = JobIdParamSchema.parse({ jobId: req.params['jobId'] });
    const jobId = params['jobId'];

    // Get job progress
    const progress = await optimizationService.getJobProgress(jobId);

    res.json({
      jobId: progress.jobId,
      status: progress.status,
      progress: progress.progress,
      currentStep: progress.currentStep,
      attemptCount: progress.attemptCount,
      maxAttempts: progress.maxAttempts,
      startedAt: progress.startedAt?.toISOString(),
      completedAt: progress.completedAt?.toISOString(),
      errorMessage: progress.errorMessage,
    });
  } catch (error) {
    handleServiceError(error, res);
  }
});

/**
 * GET /api/portfolio-optimization/:jobId/results
 *
 * Get the optimization results including weights, metrics, and tie-break info.
 *
 * Path params:
 *   jobId: string (UUID)
 *
 * Query params:
 *   includeCvar?: boolean - Include CVaR calculations (default: false)
 *   includePowerLaw?: boolean - Include power-law allocations (default: false)
 *
 * Response:
 * {
 *   sessionId: string;
 *   status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
 *   weights: Record<string, number>;
 *   metrics: {
 *     expectedReturn: number;
 *     risk: number;
 *     sharpeRatio?: number;
 *     cvar?: number;
 *   };
 *   pass1EStar?: number;
 *   primaryLockEpsilon?: number;
 *   currentIteration: number;
 *   totalIterations?: number;
 *   startedAt?: string;
 *   completedAt?: string;
 *   cvarCalculations?: CvarCalculationResult;
 *   powerLawAllocations?: PowerLawAllocationResult[];
 * }
 */
router.get('/:jobId/results', async (req: Request, res: Response) => {
  try {
    // Validate job ID
    const resultParams = JobIdParamSchema.parse({ jobId: req.params['jobId'] });
    const jobId = resultParams['jobId'];

    // Get query params
    const query = req.query as Record<string, string | undefined>;
    const includeCvar = query['includeCvar'] === 'true';
    const includePowerLaw = query['includePowerLaw'] === 'true';

    // First get the job to find associated session
    const [job] = await db.select().from(jobOutbox).where(eq(jobOutbox.id, jobId)).limit(1);

    if (!job) {
      throw new JobNotFoundError(jobId);
    }

    // For now, return job progress as results may not be ready
    // In a full implementation, we'd look up the associated optimization session
    const progress = await optimizationService.getJobProgress(jobId);

    // Build response
    type ResultsResponse = {
      jobId: string;
      status: string;
      progress: number;
      currentStep?: string;
      sessionId?: string;
      weights?: Record<string, number>;
      metrics?: { expectedReturn: number; risk: number; sharpeRatio?: number; cvar?: number };
      pass1EStar?: number;
      primaryLockEpsilon?: number;
      currentIteration?: number;
      totalIterations?: number;
      startedAt?: string;
      completedAt?: string;
      cvarCalculations?: unknown;
      powerLawAllocations?: unknown;
      note?: string;
    };

    const response: ResultsResponse = {
      jobId: progress.jobId,
      status: progress.status,
      progress: progress.progress,
    };
    if (progress.currentStep !== undefined) {
      response.currentStep = progress.currentStep;
    }

    // If job is completed, try to get full results from session
    if (progress.status === 'completed') {
      // Look for associated optimization session
      // In practice, the job payload would contain the session ID
      const payload = job.payload as Record<string, unknown> | undefined;
      const payloadSessionId = payload?.['sessionId'];

      if (payloadSessionId && typeof payloadSessionId === 'string') {
        try {
          const results = await optimizationService.getOptimizationResults(payloadSessionId);
          if (results.sessionId) response.sessionId = results.sessionId;
          if (results.weights) response.weights = results.weights;
          if (results.metrics) response.metrics = results.metrics;
          if (results.pass1EStar !== undefined) response.pass1EStar = results.pass1EStar;
          if (results.primaryLockEpsilon !== undefined)
            response.primaryLockEpsilon = results.primaryLockEpsilon;
          if (results.currentIteration !== undefined)
            response.currentIteration = results.currentIteration;
          if (results.totalIterations !== undefined)
            response.totalIterations = results.totalIterations;
          if (results.startedAt) response.startedAt = results.startedAt.toISOString();
          if (results.completedAt) response.completedAt = results.completedAt.toISOString();

          // Include CVaR calculations if requested
          if (includeCvar) {
            const cvar = await optimizationService.getCvarCalculations(payloadSessionId);
            response.cvarCalculations = cvar;
          }

          // Include power-law allocations if requested
          if (includePowerLaw) {
            const allocations = await optimizationService.getPowerLawAllocations(payloadSessionId);
            response.powerLawAllocations = allocations;
          }
        } catch {
          // Session may not exist yet, return progress only
          response.note = 'Results not yet available';
        }
      } else {
        response.note = 'No associated optimization session found';
      }
    }

    res.json(response);
  } catch (error) {
    handleServiceError(error, res);
  }
});

/**
 * GET /api/portfolio-optimization/sessions/:sessionId
 *
 * Get detailed information about an optimization session.
 *
 * Path params:
 *   sessionId: string (UUID)
 *
 * Response:
 * {
 *   id: string;
 *   matrixId: string;
 *   optimizationConfig: object;
 *   pass1EStar?: number;
 *   primaryLockEpsilon?: number;
 *   resultWeights?: Record<string, number>;
 *   resultMetrics?: object;
 *   status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
 *   currentIteration: number;
 *   totalIterations?: number;
 *   startedAt?: string;
 *   completedAt?: string;
 *   createdAt: string;
 *   updatedAt: string;
 * }
 */
router.get('/sessions/:sessionId', async (req: Request, res: Response) => {
  try {
    // Validate session ID
    const sessionParams = JobIdParamSchema.parse({ jobId: req.params['sessionId'] });
    const sessionId = sessionParams['jobId'];

    // Get optimization session
    const session = await optimizationService.getOptimizationProgress(sessionId);

    res.json({
      id: session.id,
      matrixId: session.matrixId,
      optimizationConfig: session.optimizationConfig,
      pass1EStar: session.pass1EStar,
      primaryLockEpsilon: session.primaryLockEpsilon,
      resultWeights: session.resultWeights,
      resultMetrics: session.resultMetrics,
      status: session.status,
      currentIteration: session.currentIteration,
      totalIterations: session.totalIterations,
      startedAt: session.startedAt?.toISOString(),
      completedAt: session.completedAt?.toISOString(),
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (error) {
    handleServiceError(error, res);
  }
});

/**
 * GET /api/portfolio-optimization/matrices/:matrixId
 *
 * Get scenario matrix details (without the full MOIC data).
 *
 * Path params:
 *   matrixId: string (UUID)
 *
 * Response:
 * {
 *   matrixId: string;
 *   matrixKey: string;
 *   fundId: string;
 *   status: 'pending' | 'processing' | 'complete' | 'failed' | 'invalidated';
 *   bucketCount?: number;
 *   bucketParams?: object;
 *   scenarioStates?: object;
 *   sOpt?: object;
 *   createdAt: string;
 *   updatedAt: string;
 * }
 */
router.get('/matrices/:matrixId', async (req: Request, res: Response) => {
  try {
    // Validate matrix ID
    const matrixParams = JobIdParamSchema.parse({ jobId: req.params['matrixId'] });
    const matrixId = matrixParams['jobId'];

    // Get matrix result (metadata only, not the full BYTEA data)
    const matrix = await optimizationService.getMatrixResults(matrixId);

    res.json({
      matrixId: matrix.matrixId,
      matrixKey: matrix.matrixKey,
      fundId: matrix.fundId,
      status: matrix.status,
      bucketCount: matrix.bucketCount,
      bucketParams: matrix.bucketParams,
      scenarioStates: matrix.scenarioStates,
      sOpt: matrix.sOpt,
      createdAt: matrix.createdAt.toISOString(),
      updatedAt: matrix.updatedAt.toISOString(),
    });
  } catch (error) {
    handleServiceError(error, res);
  }
});

// =====================
// EXPORTS
// =====================

export default router;
export { optimizationService };
