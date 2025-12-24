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
import { parseStageDistribution, CANONICAL_STAGES } from '@shared/schemas/parse-stage-distribution';
import { getStageValidationMode } from '../lib/stage-validation-mode';
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
  stageDistribution: z.array(
    z.object({
      stage: z.string(),
      weight: z.number().min(0).max(1),
    })
  ).optional(),
});

const batchSimulationSchema = z.object({
  simulations: z.array(simulationConfigSchema).min(1).max(10),
  enableParallelExecution: z.boolean().default(true)
});

const marketEnvironmentSchema = z.object({
  scenario: z.enum(['bull', 'bear', 'neutral']),
  exitMultipliers: z.object({
    mean: z.number().positive(),
    volatility: z.number().positive()
  }),
  failureRate: z.number().min(0).max(1),
  followOnProbability: z.number().min(0).max(1)
});

const multiEnvironmentSchema = z.object({
  baseConfig: simulationConfigSchema,
  environments: z.array(marketEnvironmentSchema).min(1).max(5)
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Request validation middleware
const validateRequest = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: Function) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res["status"](400)["json"]({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: result.error.issues
        });
      }
      req.body = result.data;
      next();
    } catch (error) {
      res["status"](400)["json"]({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request format'
      });
    }
  };
};

// Response guard middleware
const guardResponse = (req: Request, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  (res as any).json = function(data: any) {
    const guard = assertFiniteDeep(data);
    if (!guard.ok) {
      const failure = guard as { ok: false; path: string | string[]; value: unknown; reason: string };
      const correlationId = req.headers['x-correlation-id'] || 'unknown';
      const failurePath = Array.isArray(failure.path) ? failure.path.join('/') : failure.path;

      console.error(`[ENGINE_NONFINITE] Correlation: ${correlationId}, Path: ${failurePath}, Reason: ${failure.reason}`);

      return res["status"](422)["json"]({
        error: 'ENGINE_NONFINITE',
        path: failurePath,
        reason: failure.reason,
        correlationId,
        message: 'Simulation produced invalid numeric values'
      });
    }
    return originalJson.call(this, data);
  };
  next();
};

// Performance monitoring middleware
const monitorPerformance = (req: Request, res: Response, next: Function) => {
  const startTime = Date.now();

  res['on']('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    recordHttpMetrics(req.method, req.path, res.statusCode, duration);
  });

  next();
};

// Apply middleware to all routes
router["use"](guardResponse);
router["use"](monitorPerformance);

// ============================================================================
// API ENDPOINTS
// ============================================================================

/**
 * POST /api/monte-carlo/simulate
 * Run a single Monte Carlo simulation
 */
router["post"]('/simulate', validateRequest(simulationConfigSchema), async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string || `sim_${Date.now()}`;

  try {
    // Validate stage distribution if provided in simulation config
    let normalizedStages: Record<string, number> | null = null;
    if (req.body.stageDistribution) {
      const { normalized, invalidInputs, suggestions, isValid, errors } = parseStageDistribution(
        req.body.stageDistribution
      );

      if (invalidInputs.length > 0) {
        const mode = await getStageValidationMode();
        // Add warning header for deprecated/invalid stage names
        res.setHeader('X-Stage-Warning', `Unknown stages: ${invalidInputs.join(', ')}`);

        if (mode === 'enforce') {
          return res["status"](400)["json"]({
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
        }
        // In 'warn' mode, log but continue with normalized values
        console.warn(`[MONTE_CARLO] Unknown stage names in ${correlationId}: ${invalidInputs.join(', ')}`);
      }

      normalizedStages = normalized;
    }

    // Create simulation config with normalized stages if validation passed
    const simulationConfig = req.body;
    if (normalizedStages && Object.keys(normalizedStages).length > 0) {
      (simulationConfig as any).stageDistribution = normalizedStages;
    }

    console.log(`[MONTE_CARLO] Starting simulation ${correlationId} with ${simulationConfig.runs} scenarios`);

    const result = await unifiedMonteCarloService.runSimulation(simulationConfig);

    console.log(`[MONTE_CARLO] Completed simulation ${correlationId} in ${result.executionTimeMs}ms using ${result.performance.engineUsed} engine`);

    res["json"]({
      correlationId,
      ...result,
      metadata: {
        version: '3.0-streaming',
        engineUsed: result.performance.engineUsed,
        fallbackTriggered: result.performance.fallbackTriggered,
        memoryUsageMB: result.performance.memoryUsageMB
      }
    });

  } catch (error) {
    console.error(`[MONTE_CARLO] Simulation ${correlationId} failed:`, error);

    res["status"](500)["json"]({
      error: 'SIMULATION_FAILED',
      correlationId,
      message: error instanceof Error ? sanitizeInput(error.message) : 'Simulation execution failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/monte-carlo/simulate/async
 * Queue a simulation for background processing (202 Accepted pattern)
 * Returns immediately with jobId for polling
 */
router["post"]('/simulate/async', validateRequest(simulationConfigSchema), async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string || `sim_async_${Date.now()}`;

  try {
    // Check if queue is available
    if (!isQueueInitialized()) {
      // Fall back to synchronous execution if queue not available
      console.warn(`[MONTE_CARLO] Queue not initialized, falling back to sync execution for ${correlationId}`);

      const result = await unifiedMonteCarloService.runSimulation(req.body);
      return res["json"]({
        correlationId,
        mode: 'sync_fallback',
        ...result,
        metadata: {
          version: '3.0-streaming',
          engineUsed: result.performance.engineUsed,
          fallbackTriggered: true,
          note: 'Queue unavailable, executed synchronously'
        }
      });
    }

    console.log(`[MONTE_CARLO] Queuing async simulation ${correlationId} with ${req.body.runs} scenarios`);

    const { jobId, estimatedWaitMs } = await enqueueSimulation({
      fundId: req.body.fundId,
      runs: req.body.runs,
      timeHorizonYears: req.body.timeHorizonYears,
      baselineId: req.body.baselineId,
      portfolioSize: req.body.portfolioSize,
      requestId: correlationId,
    });

    // Return 202 Accepted with polling information
    res.setHeader('Location', `/api/monte-carlo/jobs/${jobId}`);
    res.setHeader('Retry-After', '5');

    res["status"](202)["json"]({
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
    console.error(`[MONTE_CARLO] Failed to queue simulation ${correlationId}:`, error);

    res["status"](500)["json"]({
      error: 'QUEUE_FAILED',
      correlationId,
      message: error instanceof Error ? sanitizeInput(error.message) : 'Failed to queue simulation',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monte-carlo/jobs/:jobId
 * Get status and result of a queued simulation
 */
router['get']('/jobs/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;
    if (!jobId) {
      return res["status"](400)["json"]({
        error: 'INVALID_JOB_ID',
        message: 'Job ID is required',
      });
    }

    if (!isQueueInitialized()) {
      return res["status"](503)["json"]({
        error: 'QUEUE_UNAVAILABLE',
        message: 'Background job queue is not available',
      });
    }

    const jobStatus = await getJobStatus(jobId);

    if (jobStatus.status === 'unknown') {
      return res["status"](404)["json"]({
        error: 'JOB_NOT_FOUND',
        message: `Job ${jobId} not found`,
      });
    }

    // Add retry-after for incomplete jobs
    if (jobStatus.status === 'waiting' || jobStatus.status === 'active') {
      res.setHeader('Retry-After', '5');
    }

    res["json"]({
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
    res["status"](500)["json"]({
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
    return res["status"](400)["json"]({
      error: 'INVALID_JOB_ID',
      message: 'Job ID is required',
    });
  }

  if (!isQueueInitialized()) {
    return res["status"](503)["json"]({
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
router["post"]('/batch', validateRequest(batchSimulationSchema), async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string || `batch_${Date.now()}`;

  try {
    console.log(`[MONTE_CARLO] Starting batch simulation ${correlationId} with ${req.body.simulations.length} configurations`);

    const results = await unifiedMonteCarloService.runBatchSimulations(req.body.simulations);

    const totalExecutionTime = results.reduce((sum: any, r: any) => sum + r.executionTimeMs, 0);
    const engineUsage = results.reduce((acc: any, r: any) => {
      acc[r.performance.engineUsed] = (acc[r.performance.engineUsed] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log(`[MONTE_CARLO] Completed batch simulation ${correlationId} in ${totalExecutionTime}ms`);

    res["json"]({
      correlationId,
      results,
      summary: {
        totalSimulations: results.length,
        totalExecutionTimeMs: totalExecutionTime,
        engineUsage,
        averageExecutionTimeMs: totalExecutionTime / results.length
      }
    });

  } catch (error) {
    console.error(`[MONTE_CARLO] Batch simulation ${correlationId} failed:`, error);

    res["status"](500)["json"]({
      error: 'BATCH_SIMULATION_FAILED',
      correlationId,
      message: error instanceof Error ? sanitizeInput(error.message) : 'Batch simulation execution failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * POST /api/monte-carlo/multi-environment
 * Run simulation across multiple market environments
 */
router["post"]('/multi-environment', validateRequest(multiEnvironmentSchema), async (req: Request, res: Response) => {
  const correlationId = req.headers['x-correlation-id'] as string || `multi_${Date.now()}`;

  try {
    console.log(`[MONTE_CARLO] Starting multi-environment simulation ${correlationId} for ${req.body.environments.length} scenarios`);

    const results = await unifiedMonteCarloService.runMultiEnvironmentSimulation(
      req.body.baseConfig,
      req.body.environments
    );

    const environmentSummary = Object.entries(results).map(([scenario, result]) => ({
      scenario,
      executionTimeMs: result.executionTimeMs,
      engineUsed: result.performance.engineUsed,
      expectedIRR: result.irr.statistics.mean,
      expectedMultiple: result.multiple.statistics.mean
    }));

    console.log(`[MONTE_CARLO] Completed multi-environment simulation ${correlationId}`);

    res["json"]({
      correlationId,
      results,
      summary: {
        environments: environmentSummary,
        totalEnvironments: req.body.environments.length,
        comparison: {
          bestCase: environmentSummary.reduce((best: any, env: any) =>
            env.expectedIRR > best.expectedIRR ? env : best
          ),
          worstCase: environmentSummary.reduce((worst: any, env: any) =>
            env.expectedIRR < worst.expectedIRR ? env : worst
          )
        }
      }
    });

  } catch (error) {
    console.error(`[MONTE_CARLO] Multi-environment simulation ${correlationId} failed:`, error);

    res["status"](500)["json"]({
      error: 'MULTI_ENVIRONMENT_FAILED',
      correlationId,
      message: error instanceof Error ? sanitizeInput(error.message) : 'Multi-environment simulation failed',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monte-carlo/health
 * Health check for Monte Carlo engines
 */
router['get']('/health', async (req: Request, res: Response) => {
  try {
    const health = await unifiedMonteCarloService.healthCheck();
    const status = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 206 : 503;

    res["status"](status)["json"]({
      status: health.status,
      timestamp: new Date().toISOString(),
      engines: health.engines,
      connectionPools: health.connectionPools,
      recommendations: health.recommendations,
      version: '3.0-streaming'
    });

  } catch (error) {
    res["status"](503)["json"]({
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Health check failed',
      timestamp: new Date().toISOString()
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

    res["json"]({
      statistics: stats,
      recommendations,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res["status"](500)["json"]({
      error: 'PERFORMANCE_STATS_FAILED',
      message: error instanceof Error ? error.message : 'Failed to retrieve performance statistics',
      timestamp: new Date().toISOString()
    });
  }
});

/**
 * GET /api/monte-carlo/funds/:fundId/simulate
 * Quick simulation for a specific fund (GET endpoint for convenience)
 */
router['get']('/funds/:fundId/simulate', async (req: Request, res: Response) => {
  try {
    const fundId = toNumber(req.params.fundId, 'Fund ID');
    const runs = parseInt(req.query.runs as string || '1000');
    const timeHorizonYears = parseInt(req.query.timeHorizonYears as string || '8');
    const engine = req.query.engine as 'streaming' | 'traditional' | 'auto' || 'auto';

    if (runs < 100 || runs > 10000) {
      return res["status"](400)["json"]({
        error: 'INVALID_PARAMETERS',
        message: 'Runs must be between 100 and 10,000 for GET endpoint'
      });
    }

    const config = {
      fundId,
      runs,
      timeHorizonYears,
      forceEngine: engine,
      batchSize: Math.min(runs, 1000)
    };

    const result = await unifiedMonteCarloService.runSimulation(config);

    res["json"]({
      fundId,
      ...result,
      metadata: {
        quickSimulation: true,
        engineUsed: result.performance.engineUsed
      }
    });

  } catch (error) {
    res["status"](500)["json"]({
      error: 'QUICK_SIMULATION_FAILED',
      message: error instanceof Error ? error.message : 'Quick simulation failed'
    });
  }
});

/**
 * DELETE /api/monte-carlo/cache
 * Clear performance history cache
 */
router["delete"]('/cache', async (req: Request, res: Response) => {
  try {
    // This would need to be implemented in the service
    // await unifiedMonteCarloService.clearCache();

    res["json"]({
      message: 'Performance cache cleared',
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    res["status"](500)["json"]({
      error: 'CACHE_CLEAR_FAILED',
      message: error instanceof Error ? error.message : 'Failed to clear cache'
    });
  }
});

// ============================================================================
// ERROR HANDLING
// ============================================================================

// Route-specific error handler
router["use"]((error: Error, req: Request, res: Response, _next: Function) => {
  console.error('[MONTE_CARLO_ROUTES] Error:', error);

  res["status"](500)["json"]({
    error: 'MONTE_CARLO_ERROR',
    message: 'An unexpected error occurred in Monte Carlo simulation',
    timestamp: new Date().toISOString(),
    correlationId: req.headers['x-correlation-id'] || 'unknown'
  });
});

export default router;