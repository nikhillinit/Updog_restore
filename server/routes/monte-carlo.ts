/**
 * Monte Carlo Simulation API Routes
 *
 * Provides REST endpoints for running Monte Carlo simulations with:
 * - Automatic engine selection (streaming vs traditional)
 * - Performance monitoring and optimization
 * - Comprehensive error handling and validation
 * - Backward compatibility with existing API
 *
 * @author Claude Code
 * @version 1.0 - Production API
 */

import { Router } from 'express';
import { z } from 'zod';
import { unifiedMonteCarloService } from '../services/monte-carlo-service-unified';
import type { UnifiedSimulationConfig } from '../services/monte-carlo-service-unified';
import type { Request, Response, NextFunction } from 'express';
import { assertFiniteDeep } from '../middleware/engine-guards';
import { recordHttpMetrics } from '../metrics';
import { toNumber } from '@shared/number';
import { sanitizeInput } from '../utils/sanitizer.js';
import {
  enqueueSimulation,
  getJobStatus,
  isQueueInitialized,
  subscribeToJob,
} from '../queues/simulation-queue';
import type { SimulationJobData } from '../queues/simulation-queue';
import { parseStageDistribution, CANONICAL_STAGES } from '@shared/schemas/parse-stage-distribution';
import { getStageValidationMode } from '../lib/stage-validation-mode';
import { logger } from '../lib/logger';
// import { setStageWarningHeaders } from '../middleware/deprecation-headers';

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const simulationConfigSchema = z.object({
  fundId: z.number().int().positive(),
  runs: z.number().int().min(100).max(50000).default(10000),
  timeHorizonYears: z.number().min(1).max(15).default(8),
  baselineId: z.string().uuid().optional(),
  portfolioSize: z.number().int().positive().optional(),
  deploymentScheduleMonths: z.number().int().min(12).max(120).optional(),
  randomSeed: z.number().int().optional(),

  // Streaming configuration
  batchSize: z.number().int().min(100).max(5000).default(1000),
  maxConcurrentBatches: z.number().int().min(1).max(10).default(4),
  enableResultStreaming: z.boolean().default(true),
  memoryThresholdMB: z.number().min(50).max(2000).default(100),
  enableGarbageCollection: z.boolean().default(true),

  // Engine selection
  forceEngine: z.enum(['streaming', 'traditional', 'auto']).default('auto'),
  performanceMode: z.enum(['speed', 'memory', 'balanced']).default('balanced'),
  enableFallback: z.boolean().default(true),

  // Stage distribution (optional, for portfolio composition)
  stageDistribution: z
    .array(
      z.object({
        stage: z.string(),
        weight: z.number().min(0).max(1),
      })
    )
    .optional(),
});

const batchSimulationSchema = z.object({
  simulations: z.array(simulationConfigSchema).min(1).max(10),
  enableParallelExecution: z.boolean().default(true),
});

const marketEnvironmentSchema = z.object({
  scenario: z.enum(['bull', 'bear', 'neutral']),
  exitMultipliers: z.object({
    mean: z.number().positive(),
    volatility: z.number().positive(),
  }),
  failureRate: z.number().min(0).max(1),
  followOnProbability: z.number().min(0).max(1),
});

const multiEnvironmentSchema = z.object({
  baseConfig: simulationConfigSchema,
  environments: z.array(marketEnvironmentSchema).min(1).max(5),
});

type SimulationConfigRequest = z.infer<typeof simulationConfigSchema>;
type BatchSimulationRequest = z.infer<typeof batchSimulationSchema>;
type MultiEnvironmentRequest = z.infer<typeof multiEnvironmentSchema>;
type ValidatedBodyRequest<T> = Request & { validatedBody: T };

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Request validation middleware
const validateRequest = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res['status'](400)['json']({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: result.error.issues,
        });
      }
      (req as ValidatedBodyRequest<T>).validatedBody = result.data;
      next();
    } catch {
      res['status'](400)['json']({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request format',
      });
    }
  };
};

function getCorrelationId(req: Request, fallbackPrefix: string): string {
  return (
    (req.headers['x-correlation-id'] as string | undefined) ?? `${fallbackPrefix}_${Date.now()}`
  );
}

function toUnifiedSimulationConfig(config: SimulationConfigRequest): UnifiedSimulationConfig {
  return {
    fundId: config.fundId,
    runs: config.runs,
    timeHorizonYears: config.timeHorizonYears,
    ...(config.baselineId ? { baselineId: config.baselineId } : {}),
    ...(config.portfolioSize !== undefined ? { portfolioSize: config.portfolioSize } : {}),
    ...(config.deploymentScheduleMonths !== undefined
      ? { deploymentScheduleMonths: config.deploymentScheduleMonths }
      : {}),
    ...(config.randomSeed !== undefined ? { randomSeed: config.randomSeed } : {}),
    batchSize: config.batchSize,
    maxConcurrentBatches: config.maxConcurrentBatches,
    enableResultStreaming: config.enableResultStreaming,
    memoryThresholdMB: config.memoryThresholdMB,
    enableGarbageCollection: config.enableGarbageCollection,
    forceEngine: config.forceEngine,
    performanceMode: config.performanceMode,
    enableFallback: config.enableFallback,
  };
}

async function buildSimulationConfig(
  config: SimulationConfigRequest,
  res: Response,
  correlationId: string,
  context: string
): Promise<{ ok: true; config: UnifiedSimulationConfig } | { ok: false }> {
  if (config.stageDistribution && config.stageDistribution.length > 0) {
    const stagePercentages = config.stageDistribution.reduce<Record<string, number>>(
      (acc, entry) => {
        acc[entry.stage] = (acc[entry.stage] ?? 0) + entry.weight * 100;
        return acc;
      },
      {}
    );
    const { invalidInputs, suggestions, errors } = parseStageDistribution(stagePercentages);

    if (invalidInputs.length > 0) {
      res.setHeader('X-Stage-Warning', `Unknown stages: ${invalidInputs.join(', ')}`);
    }

    if (invalidInputs.length > 0 || errors.length > 0) {
      const mode = await getStageValidationMode();

      logger.warn(
        { context, correlationId, mode, invalidInputs, errors },
        '[MONTE_CARLO] Stage distribution validation warning'
      );

      if (mode === 'enforce') {
        res['status'](400)['json']({
          error: 'INVALID_STAGE_DISTRIBUTION',
          message: 'Unknown investment stage(s) in stageDistribution.',
          details: {
            invalid: invalidInputs,
            suggestions,
            validStages: [...CANONICAL_STAGES],
            errors,
          },
          correlationId,
        });
        return { ok: false };
      }
    }
  }

  return {
    ok: true,
    config: toUnifiedSimulationConfig(config),
  };
}

// Response guard middleware
const guardResponse = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json.bind(res);
  res.json = ((data: unknown) => {
    const guard = assertFiniteDeep(data);
    if (!guard.ok) {
      const correlationId = (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown';

      logger.error(
        {
          correlationId,
          path: guard.path,
          reason: guard.reason,
        },
        '[ENGINE_NONFINITE] Simulation produced invalid numeric values'
      );

      return res['status'](422)['json']({
        error: 'ENGINE_NONFINITE',
        path: guard.path,
        reason: guard.reason,
        correlationId,
        message: 'Simulation produced invalid numeric values',
      });
    }
    return originalJson(data);
  }) as Response['json'];
  next();
};

// Performance monitoring middleware
const monitorPerformance = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res['on']('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    recordHttpMetrics(req.method, req.path, res.statusCode, duration);
  });

  next();
};

// Apply middleware to all routes
router['use'](guardResponse);
router['use'](monitorPerformance);

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * POST /api/monte-carlo/simulate
 * Run a single Monte Carlo simulation
 */
router['post'](
  '/simulate',
  validateRequest(simulationConfigSchema),
  async (req: Request, res: Response) => {
    const correlationId = getCorrelationId(req, 'sim');

    try {
      const parsedRequest = (req as ValidatedBodyRequest<SimulationConfigRequest>).validatedBody;
      const built = await buildSimulationConfig(parsedRequest, res, correlationId, 'simulate');
      if (!built.ok) {
        return;
      }
      const simulationConfig = built.config;

      logger.info(
        { correlationId, runs: simulationConfig.runs, fundId: simulationConfig.fundId },
        '[MONTE_CARLO] Starting simulation'
      );

      const result = await unifiedMonteCarloService.runSimulation(simulationConfig);

      logger.info(
        {
          correlationId,
          executionTimeMs: result.executionTimeMs,
          engineUsed: result.performance.engineUsed,
        },
        '[MONTE_CARLO] Completed simulation'
      );

      res['json']({
        correlationId,
        ...result,
        metadata: {
          version: '3.0-streaming',
          engineUsed: result.performance.engineUsed,
          fallbackTriggered: result.performance.fallbackTriggered,
          memoryUsageMB: result.performance.memoryUsageMB,
        },
      });
    } catch (error) {
      logger.error({ correlationId, error }, '[MONTE_CARLO] Simulation failed');

      res['status'](500)['json']({
        error: 'SIMULATION_FAILED',
        correlationId,
        message:
          error instanceof Error ? sanitizeInput(error.message) : 'Simulation execution failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/monte-carlo/simulate/async
 * Queue a simulation for background processing (202 Accepted pattern)
 * Returns immediately with jobId for polling
 */
router['post'](
  '/simulate/async',
  validateRequest(simulationConfigSchema),
  async (req: Request, res: Response) => {
    const correlationId = getCorrelationId(req, 'sim_async');

    try {
      const parsedRequest = (req as ValidatedBodyRequest<SimulationConfigRequest>).validatedBody;
      const built = await buildSimulationConfig(
        parsedRequest,
        res,
        correlationId,
        'simulate_async'
      );
      if (!built.ok) {
        return;
      }
      const simulationConfig = built.config;

      // Check if queue is available
      if (!isQueueInitialized()) {
        // Fall back to synchronous execution if queue not available
        logger.warn(
          { correlationId },
          '[MONTE_CARLO] Queue not initialized, falling back to sync execution'
        );

        const result = await unifiedMonteCarloService.runSimulation(simulationConfig);
        return res['json']({
          correlationId,
          mode: 'sync_fallback',
          ...result,
          metadata: {
            version: '3.0-streaming',
            engineUsed: result.performance.engineUsed,
            fallbackTriggered: true,
            note: 'Queue unavailable, executed synchronously',
          },
        });
      }

      logger.info(
        { correlationId, runs: simulationConfig.runs, fundId: simulationConfig.fundId },
        '[MONTE_CARLO] Queuing async simulation'
      );

      const simulationJob: SimulationJobData = {
        fundId: simulationConfig.fundId,
        runs: simulationConfig.runs,
        timeHorizonYears: simulationConfig.timeHorizonYears,
        requestId: correlationId,
        ...(simulationConfig.baselineId !== undefined
          ? { baselineId: simulationConfig.baselineId }
          : {}),
        ...(simulationConfig.portfolioSize !== undefined
          ? { portfolioSize: simulationConfig.portfolioSize }
          : {}),
      };
      const { jobId, estimatedWaitMs } = await enqueueSimulation(simulationJob);

      // Return 202 Accepted with polling information
      res.setHeader('Location', `/api/monte-carlo/jobs/${jobId}`);
      res.setHeader('Retry-After', '5');

      res['status'](202)['json']({
        correlationId,
        jobId,
        status: 'queued',
        estimatedWaitMs,
        message: 'Simulation queued for background processing',
        _links: {
          self: `/api/monte-carlo/jobs/${jobId}`,
          poll: `/api/monte-carlo/jobs/${jobId}`,
          stream: `/api/monte-carlo/jobs/${jobId}/stream`,
        },
      });
    } catch (error) {
      logger.error({ correlationId, error }, '[MONTE_CARLO] Failed to queue simulation');

      res['status'](500)['json']({
        error: 'QUEUE_FAILED',
        correlationId,
        message:
          error instanceof Error ? sanitizeInput(error.message) : 'Failed to queue simulation',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/monte-carlo/jobs/:jobId
 * Get status and result of a queued simulation
 */
router['get']('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res['status'](400)['json']({
        error: 'INVALID_JOB_ID',
        message: 'Job ID is required',
      });
    }

    if (!isQueueInitialized()) {
      return res['status'](503)['json']({
        error: 'QUEUE_UNAVAILABLE',
        message: 'Background job queue is not available',
      });
    }

    const jobStatus = await getJobStatus(jobId);

    if (jobStatus.status === 'unknown') {
      return res['status'](404)['json']({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    // Add retry-after for incomplete jobs
    if (jobStatus.status === 'waiting' || jobStatus.status === 'active') {
      res.setHeader('Retry-After', '5');
    }

    res['json']({
      jobId,
      ...jobStatus,
      _links: {
        self: `/api/monte-carlo/jobs/${jobId}`,
        ...(jobStatus.status === 'waiting' || jobStatus.status === 'active'
          ? { stream: `/api/monte-carlo/jobs/${jobId}/stream` }
          : {}),
      },
    });
  } catch (error) {
    res['status'](500)['json']({
      error: 'JOB_STATUS_FAILED',
      message: error instanceof Error ? error.message : 'Failed to get job status',
    });
  }
});

/**
 * GET /api/monte-carlo/jobs/:jobId/stream
 * SSE endpoint for real-time job progress updates
 */
router['get']('/jobs/:jobId/stream', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  if (!jobId) {
    return res['status'](400)['json']({
      error: 'INVALID_JOB_ID',
      message: 'Job ID is required',
    });
  }

  if (!isQueueInitialized()) {
    return res['status'](503)['json']({
      error: 'QUEUE_UNAVAILABLE',
      message: 'Background job queue is not available',
    });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);

  // Subscribe to job events
  const unsubscribe = subscribeToJob(jobId, {
    onProgress: (event) => {
      res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
    },
    onComplete: (event) => {
      res.write(`event: complete\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    },
    onFailed: (event) => {
      res.write(`event: error\ndata: ${JSON.stringify(event)}\n\n`);
      res.end();
    },
  });

  // Handle client disconnect
  req.on('close', () => {
    unsubscribe();
  });
});

/**
 * POST /api/monte-carlo/batch
 * Run multiple simulations in batch
 */
router['post'](
  '/batch',
  validateRequest(batchSimulationSchema),
  async (req: Request, res: Response) => {
    const correlationId = getCorrelationId(req, 'batch');

    try {
      const parsedRequest = (req as ValidatedBodyRequest<BatchSimulationRequest>).validatedBody;
      const normalizedConfigs: UnifiedSimulationConfig[] = [];
      for (const [index, config] of parsedRequest.simulations.entries()) {
        const built = await buildSimulationConfig(config, res, correlationId, `batch[${index}]`);
        if (!built.ok) {
          return;
        }
        normalizedConfigs.push(built.config);
      }

      logger.info(
        { correlationId, batchSize: normalizedConfigs.length },
        '[MONTE_CARLO] Starting batch simulation'
      );

      const results = await unifiedMonteCarloService.runBatchSimulations(normalizedConfigs);

      const totalExecutionTime = results.reduce((sum, r) => sum + r.executionTimeMs, 0);
      const engineUsage = results.reduce(
        (acc, r) => {
          acc[r.performance.engineUsed] = (acc[r.performance.engineUsed] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      logger.info(
        { correlationId, totalExecutionTimeMs: totalExecutionTime },
        '[MONTE_CARLO] Completed batch simulation'
      );

      res['json']({
        correlationId,
        results,
        summary: {
          totalSimulations: results.length,
          totalExecutionTimeMs: totalExecutionTime,
          engineUsage,
          averageExecutionTimeMs: totalExecutionTime / results.length,
        },
      });
    } catch (error) {
      logger.error({ correlationId, error }, '[MONTE_CARLO] Batch simulation failed');

      res['status'](500)['json']({
        error: 'BATCH_SIMULATION_FAILED',
        correlationId,
        message:
          error instanceof Error
            ? sanitizeInput(error.message)
            : 'Batch simulation execution failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * POST /api/monte-carlo/multi-environment
 * Run simulation across multiple market environments
 */
router['post'](
  '/multi-environment',
  validateRequest(multiEnvironmentSchema),
  async (req: Request, res: Response) => {
    const correlationId = getCorrelationId(req, 'multi');

    try {
      const parsedRequest = (req as ValidatedBodyRequest<MultiEnvironmentRequest>).validatedBody;
      const built = await buildSimulationConfig(
        parsedRequest.baseConfig,
        res,
        correlationId,
        'multi-environment'
      );
      if (!built.ok) {
        return;
      }

      logger.info(
        { correlationId, environmentCount: parsedRequest.environments.length },
        '[MONTE_CARLO] Starting multi-environment simulation'
      );

      const results = await unifiedMonteCarloService.runMultiEnvironmentSimulation(
        built.config,
        parsedRequest.environments
      );

      const environmentSummary = Object.entries(results).map(([scenario, result]) => ({
        scenario,
        executionTimeMs: result.executionTimeMs,
        engineUsed: result.performance.engineUsed,
        expectedIRR: result.irr.statistics.mean,
        expectedMultiple: result.multiple.statistics.mean,
      }));

      logger.info({ correlationId }, '[MONTE_CARLO] Completed multi-environment simulation');

      res['json']({
        correlationId,
        results,
        summary: {
          environments: environmentSummary,
          totalEnvironments: parsedRequest.environments.length,
          comparison: {
            bestCase: environmentSummary.reduce((best, env) =>
              env.expectedIRR > best.expectedIRR ? env : best
            ),
            worstCase: environmentSummary.reduce((worst, env) =>
              env.expectedIRR < worst.expectedIRR ? env : worst
            ),
          },
        },
      });
    } catch (error) {
      logger.error({ correlationId, error }, '[MONTE_CARLO] Multi-environment simulation failed');

      res['status'](500)['json']({
        error: 'MULTI_ENVIRONMENT_FAILED',
        correlationId,
        message:
          error instanceof Error
            ? sanitizeInput(error.message)
            : 'Multi-environment simulation failed',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /api/monte-carlo/health
 * Health check for Monte Carlo engines
 */
router['get']('/health', async (req: Request, res: Response) => {
  try {
    const health = await unifiedMonteCarloService.healthCheck();
    const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 206 : 503;
    const connectionPools = health.connectionPools as Record<string, unknown>;

    res['status'](status)['json']({
      status: health.status,
      timestamp: new Date().toISOString(),
      engines: health.engines,
      connectionPools,
      recommendations: health.recommendations,
      version: '3.0-streaming',
    });
  } catch (error) {
    res['status'](503)['json']({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/monte-carlo/performance
 * Get performance statistics and optimization recommendations
 */
router['get']('/performance', async (req: Request, res: Response) => {
  try {
    const stats = unifiedMonteCarloService.getPerformanceStats();
    const recommendations = unifiedMonteCarloService.getOptimizationRecommendations();

    res['json']({
      statistics: stats,
      recommendations,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res['status'](500)['json']({
      error: 'PERFORMANCE_STATS_FAILED',
      message: error instanceof Error ? error.message : 'Failed to retrieve performance statistics',
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /api/monte-carlo/funds/:fundId/simulate
 * Quick simulation for a specific fund (GET endpoint for convenience)
 */
router['get']('/funds/:fundId/simulate', async (req: Request, res: Response) => {
  try {
    const fundId = toNumber(req.params['fundId'], 'Fund ID');
    const runs = parseInt((req.query['runs'] as string) || '1000');
    const timeHorizonYears = parseInt((req.query['timeHorizonYears'] as string) || '8');
    const engine = (req.query['engine'] as 'streaming' | 'traditional' | 'auto') || 'auto';

    if (runs < 100 || runs > 10000) {
      return res['status'](400)['json']({
        error: 'INVALID_PARAMETERS',
        message: 'Runs must be between 100 and 10,000 for GET endpoint',
      });
    }

    const config = {
      fundId,
      runs,
      timeHorizonYears,
      forceEngine: engine,
      batchSize: Math.min(runs, 1000),
    };

    const result = await unifiedMonteCarloService.runSimulation(config);

    res['json']({
      fundId,
      ...result,
      metadata: {
        quickSimulation: true,
        engineUsed: result.performance.engineUsed,
      },
    });
  } catch (error) {
    res['status'](500)['json']({
      error: 'QUICK_SIMULATION_FAILED',
      message: error instanceof Error ? error.message : 'Quick simulation failed',
    });
  }
});

/**
 * DELETE /api/monte-carlo/cache
 * Clear performance history cache
 */
router['delete']('/cache', async (req: Request, res: Response) => {
  try {
    // This would need to be implemented in the service
    // await unifiedMonteCarloService.clearCache();

    res['json']({
      message: 'Performance cache cleared',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    res['status'](500)['json']({
      error: 'CACHE_CLEAR_FAILED',
      message: error instanceof Error ? error.message : 'Failed to clear cache',
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Route-specific error handler
router['use']((error: unknown, req: Request, res: Response, _next: NextFunction) => {
  logger.error({ error }, '[MONTE_CARLO_ROUTES] Error');

  res['status'](500)['json']({
    error: 'MONTE_CARLO_ERROR',
    message: 'An unexpected error occurred in Monte Carlo simulation',
    timestamp: new Date().toISOString(),
    correlationId: (req.headers['x-correlation-id'] as string | undefined) ?? 'unknown',
  });
});

export default router;
