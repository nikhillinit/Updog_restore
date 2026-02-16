/**
 * Backtesting API Routes
 *
 * REST endpoints for Monte Carlo simulation backtesting and validation:
 * - Run backtests against historical fund performance
 * - Compare scenarios with different market conditions
 * - Retrieve backtest history and results
 * - Get available historical scenarios
 *
 * @author Claude Code
 * @version 1.0 - Initial Implementation
 */

import { Router } from 'express';
import type { z } from 'zod';
import type { Request, Response, NextFunction } from 'express';
import { backtestingService } from '../services/backtesting-service';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import { recordHttpMetrics } from '../metrics';
import {
  enqueueBacktestJob,
  getBacktestJobStatus,
  subscribeToBacktestJob,
  isBacktestingTerminalStatus,
  isBacktestingQueueInitialized,
} from '../queues/backtesting-queue';
import {
  BacktestConfigSchema,
  ScenarioCompareRequestSchema,
  BacktestHistoryQuerySchema,
} from '@shared/validation/backtesting-schemas';
import type {
  BacktestConfig,
  HistoricalScenarioName,
  BacktestAsyncRunResponse,
  BacktestJobStatusResponse,
} from '@shared/types/backtesting';

const router = Router();

// ============================================================================
// MIDDLEWARE
// ============================================================================

// Request validation middleware
const validateRequest = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Request validation failed',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      (req as Request & { validatedBody: T }).validatedBody = result.data;
      next();
    } catch {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid request format',
      });
    }
  };
};

// Query validation middleware
const validateQuery = <T>(schema: z.ZodSchema<T>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = schema.safeParse(req.query);
      if (!result.success) {
        return res.status(400).json({
          error: 'VALIDATION_ERROR',
          message: 'Query parameter validation failed',
          details: result.error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
            code: issue.code,
          })),
        });
      }
      (req as Request & { validatedQuery: T }).validatedQuery = result.data;
      next();
    } catch {
      res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'Invalid query parameters',
      });
    }
  };
};

// Performance monitoring middleware
const monitorPerformance = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000;
    recordHttpMetrics(req.method, req.path, res.statusCode, duration);
  });

  next();
};

// Error handler middleware
const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

const hasFundAccess = (req: Request, fundId: number): boolean => {
  const userFundIds = req.user?.fundIds || [];

  // Empty fundIds means unrestricted access (admin/superuser pattern).
  if (userFundIds.length === 0) {
    return true;
  }

  return userFundIds.includes(fundId);
};

const canAccessJob = (req: Request, job: { fundId: number; requesterUserId?: string }): boolean => {
  if (!hasFundAccess(req, job.fundId)) {
    return false;
  }

  const userFundIds = req.user?.fundIds || [];
  // Unrestricted users can inspect all jobs within accessible funds.
  if (userFundIds.length === 0) {
    return true;
  }

  // For scoped users, bind job visibility to requesting user identity.
  if (!job.requesterUserId) {
    return true;
  }

  return req.user?.id === job.requesterUserId || req.user?.sub === job.requesterUserId;
};

// ============================================================================
// ROUTES
// ============================================================================

/**
 * POST /api/backtesting/run
 *
 * Run a Monte Carlo backtest against historical fund performance.
 *
 * Request body:
 * - fundId: number - The fund to backtest
 * - startDate: string - Start date (YYYY-MM-DD)
 * - endDate: string - End date (YYYY-MM-DD)
 * - simulationRuns: number - Number of simulation runs (100-50000)
 * - comparisonMetrics: string[] - Metrics to compare (irr, tvpi, dpi, multiple, totalValue)
 * - includeHistoricalScenarios: boolean - Whether to include scenario comparisons
 * - historicalScenarios: string[] - Scenarios to compare against
 * - baselineId: string - Optional baseline UUID
 * - snapshotId: string - Optional snapshot UUID
 * - randomSeed: number - Optional random seed for reproducibility
 *
 * Returns:
 * - backtestId: string - Unique identifier for this backtest
 * - config: object - The configuration used
 * - executionTimeMs: number - Time taken to run
 * - timestamp: string - When the backtest was run
 * - simulationSummary: object - Simulation results with distributions
 * - actualPerformance: object - Actual fund performance data
 * - validationMetrics: object - Validation and calibration metrics
 * - dataQuality: object - Data quality assessment
 * - scenarioComparisons: object[] - Scenario comparison results (if requested)
 * - recommendations: string[] - Recommendations based on analysis
 */
router.post(
  '/run',
  requireAuth(),
  monitorPerformance,
  validateRequest(BacktestConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const config = (req as Request & { validatedBody: BacktestConfig }).validatedBody;
    const correlationId = req.headers['x-correlation-id'] as string | undefined;

    if (!hasFundAccess(req, config.fundId)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `You do not have access to fund ${config.fundId}`,
        correlationId,
      });
    }

    try {
      const result = await backtestingService.runBacktest(config, {
        ...(correlationId ? { correlationId } : {}),
        ...(req.user?.id ? { requesterUserId: req.user.id } : {}),
      });

      res.status(200).json({
        correlationId,
        result,
      });
    } catch (error) {
      console.error('[backtesting] Run backtest failed:', error);

      res.status(500).json({
        error: 'BACKTEST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        correlationId,
      });
    }
  })
);

/**
 * POST /api/backtesting/run/async
 *
 * Queue an async backtest run and return a job handle for polling/SSE.
 * Supports request deduplication via Idempotency-Key.
 */
router.post(
  '/run/async',
  requireAuth(),
  monitorPerformance,
  validateRequest(BacktestConfigSchema),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isBacktestingQueueInitialized()) {
      return res.status(503).json({
        error: 'QUEUE_UNAVAILABLE',
        message: 'Backtesting queue is unavailable',
      });
    }

    const config = (req as Request & { validatedBody: BacktestConfig }).validatedBody;
    const correlationId =
      (req.headers['x-correlation-id'] as string | undefined) ?? `bt_async_${Date.now()}`;

    if (!hasFundAccess(req, config.fundId)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `You do not have access to fund ${config.fundId}`,
        correlationId,
      });
    }

    const idempotencyKey =
      (req.headers['idempotency-key'] as string | undefined) ??
      (req.headers['x-idempotency-key'] as string | undefined);

    const { jobId, estimatedWaitMs, deduplicated } = await enqueueBacktestJob({
      config,
      correlationId,
      ...(req.user?.id ? { requesterUserId: req.user.id } : {}),
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });

    const links = {
      self: `/api/backtesting/jobs/${jobId}`,
      poll: `/api/backtesting/jobs/${jobId}`,
      stream: `/api/backtesting/jobs/${jobId}/stream`,
    };

    const payload: BacktestAsyncRunResponse = {
      jobId,
      status: 'queued',
      stage: 'queued',
      progressPercent: 0,
      correlationId,
      deduplicated,
      estimatedWaitMs,
      message: deduplicated
        ? 'Request deduplicated, returning existing async job'
        : 'Backtest job queued',
      links,
    };

    res.setHeader('Location', links.self);
    res.setHeader('Retry-After', '2');
    return res.status(202).json(payload);
  })
);

/**
 * GET /api/backtesting/jobs/:jobId
 *
 * Poll async backtesting job status.
 */
router.get(
  '/jobs/:jobId',
  requireAuth(),
  monitorPerformance,
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params['jobId'];
    if (!jobId) {
      return res.status(400).json({
        error: 'INVALID_JOB_ID',
        message: 'Job ID is required',
      });
    }

    if (!isBacktestingQueueInitialized()) {
      return res.status(503).json({
        error: 'QUEUE_UNAVAILABLE',
        message: 'Backtesting queue is unavailable',
      });
    }

    const status = await getBacktestJobStatus(jobId);
    if (status.status === 'unknown') {
      return res.status(404).json({
        error: 'JOB_NOT_FOUND',
        message: `Backtesting job ${jobId} was not found`,
      });
    }

    if (!canAccessJob(req, status)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `You do not have access to job ${jobId}`,
      });
    }

    const terminal = isBacktestingTerminalStatus(status.status);
    const payload: BacktestJobStatusResponse = {
      jobId: status.jobId,
      status: status.status,
      stage: status.stage,
      progressPercent: status.progressPercent,
      updatedAt: status.updatedAt,
      links: {
        self: `/api/backtesting/jobs/${jobId}`,
        poll: `/api/backtesting/jobs/${jobId}`,
        ...(terminal ? {} : { stream: `/api/backtesting/jobs/${jobId}/stream` }),
      },
      ...(status.message ? { message: status.message } : {}),
      ...(status.correlationId ? { correlationId: status.correlationId } : {}),
      ...(status.resultRef ? { resultRef: status.resultRef } : {}),
      ...(status.error ? { error: status.error } : {}),
    };

    if (!terminal) {
      res.setHeader('Retry-After', '2');
    }

    return res.status(200).json(payload);
  })
);

/**
 * GET /api/backtesting/jobs/:jobId/stream
 *
 * Stream async backtesting job status updates over SSE.
 */
router.get(
  '/jobs/:jobId/stream',
  requireAuth(),
  asyncHandler(async (req: Request, res: Response) => {
    const jobId = req.params['jobId'];
    if (!jobId) {
      return res.status(400).json({
        error: 'INVALID_JOB_ID',
        message: 'Job ID is required',
      });
    }

    if (!isBacktestingQueueInitialized()) {
      return res.status(503).json({
        error: 'QUEUE_UNAVAILABLE',
        message: 'Backtesting queue is unavailable',
      });
    }

    const snapshot = await getBacktestJobStatus(jobId);
    if (snapshot.status === 'unknown') {
      return res.status(404).json({
        error: 'JOB_NOT_FOUND',
        message: `Backtesting job ${jobId} was not found`,
      });
    }

    if (!canAccessJob(req, snapshot)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `You do not have access to job ${jobId}`,
      });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`event: connected\ndata: ${JSON.stringify({ jobId })}\n\n`);
    res.write(`event: status\ndata: ${JSON.stringify(snapshot)}\n\n`);

    const unsubscribe = subscribeToBacktestJob(jobId, {
      onStatus: (eventSnapshot) => {
        res.write(`event: status\ndata: ${JSON.stringify(eventSnapshot)}\n\n`);
      },
      onComplete: (eventSnapshot) => {
        res.write(`event: complete\ndata: ${JSON.stringify(eventSnapshot)}\n\n`);
        res.end();
      },
      onFailed: (eventSnapshot) => {
        res.write(`event: error\ndata: ${JSON.stringify(eventSnapshot)}\n\n`);
        res.end();
      },
      onTimedOut: (eventSnapshot) => {
        res.write(`event: timeout\ndata: ${JSON.stringify(eventSnapshot)}\n\n`);
        res.end();
      },
      onCancelled: (eventSnapshot) => {
        res.write(`event: cancelled\ndata: ${JSON.stringify(eventSnapshot)}\n\n`);
        res.end();
      },
    });

    req.on('close', () => {
      unsubscribe();
    });
  })
);

/**
 * GET /api/backtesting/fund/:fundId/history
 *
 * Retrieve backtest history for a specific fund.
 *
 * Path parameters:
 * - fundId: number - The fund ID
 *
 * Query parameters:
 * - limit: number - Maximum results to return (1-100, default 10)
 * - offset: number - Number of results to skip (default 0)
 * - startDate: string - Filter by start date (YYYY-MM-DD)
 * - endDate: string - Filter by end date (YYYY-MM-DD)
 *
 * Returns:
 * - history: object[] - Array of backtest results
 * - pagination: object - Pagination info (limit, offset, count, hasMore)
 */
router.get(
  '/fund/:fundId/history',
  requireAuth(),
  requireFundAccess,
  monitorPerformance,
  validateQuery(BacktestHistoryQuerySchema),
  asyncHandler(async (req: Request, res: Response) => {
    const fundId = parseInt(req.params['fundId']!, 10);
    const query = (req as Request & { validatedQuery: z.infer<typeof BacktestHistoryQuerySchema> })
      .validatedQuery;

    if (isNaN(fundId) || fundId <= 0) {
      return res.status(400).json({
        error: 'INVALID_FUND_ID',
        message: 'Fund ID must be a positive integer',
      });
    }

    try {
      // Build options object, only including defined properties for exactOptionalPropertyTypes
      const historyOptions: {
        limit?: number;
        offset?: number;
        startDate?: string;
        endDate?: string;
      } = {};
      if (query.limit !== undefined) historyOptions.limit = query.limit;
      if (query.offset !== undefined) historyOptions.offset = query.offset;
      if (query.startDate !== undefined) historyOptions.startDate = query.startDate;
      if (query.endDate !== undefined) historyOptions.endDate = query.endDate;

      const history = await backtestingService.getBacktestHistory(fundId, historyOptions);

      res.status(200).json({
        fundId,
        history,
        pagination: {
          limit: query.limit,
          offset: query.offset,
          count: history.length,
          hasMore: history.length === query.limit,
        },
      });
    } catch (error) {
      console.error('[backtesting] Get history failed:', error);

      res.status(500).json({
        error: 'HISTORY_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  })
);

/**
 * GET /api/backtesting/result/:backtestId
 *
 * Retrieve a specific backtest result by ID.
 *
 * Path parameters:
 * - backtestId: string - The backtest UUID
 *
 * Returns:
 * - result: object - The backtest result
 */
router.get(
  '/result/:backtestId',
  requireAuth(),
  monitorPerformance,
  asyncHandler(async (req: Request, res: Response) => {
    const backtestId = req.params['backtestId']!;

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(backtestId)) {
      return res.status(400).json({
        error: 'INVALID_BACKTEST_ID',
        message: 'Backtest ID must be a valid UUID',
      });
    }

    try {
      const result = await backtestingService.getBacktestById(backtestId);

      if (!result) {
        return res.status(404).json({
          error: 'BACKTEST_NOT_FOUND',
          message: 'No backtest found with the specified ID',
        });
      }

      if (!hasFundAccess(req, result.config.fundId)) {
        return res.status(403).json({
          error: 'FORBIDDEN',
          message: `You do not have access to fund ${result.config.fundId}`,
        });
      }

      res.status(200).json({ result });
    } catch (error) {
      console.error('[backtesting] Get backtest result failed:', error);

      res.status(500).json({
        error: 'RESULT_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  })
);

/**
 * POST /api/backtesting/compare-scenarios
 *
 * Compare multiple historical scenarios for a fund.
 *
 * Request body:
 * - fundId: number - The fund to run scenarios against
 * - scenarios: string[] - Array of scenario names to compare
 * - simulationRuns: number - Runs per scenario (100-25000, default 5000)
 *
 * Returns:
 * - correlationId: string - Request correlation ID
 * - fundId: number - The fund ID
 * - comparisons: object[] - Array of scenario comparison results
 * - summary: object - Summary of the comparison
 */
interface ScenarioCompareBody {
  fundId: number;
  scenarios: HistoricalScenarioName[];
  simulationRuns: number;
}

router.post(
  '/compare-scenarios',
  requireAuth(),
  monitorPerformance,
  validateRequest(ScenarioCompareRequestSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { fundId, scenarios, simulationRuns } = (
      req as Request & { validatedBody: ScenarioCompareBody }
    ).validatedBody;
    const correlationId = req.headers['x-correlation-id'] as string | undefined;

    if (!hasFundAccess(req, fundId)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: `You do not have access to fund ${fundId}`,
        correlationId,
      });
    }

    try {
      const comparisons = await backtestingService.compareScenarios(
        fundId,
        scenarios,
        simulationRuns
      );

      res.status(200).json({
        correlationId,
        fundId,
        comparisons,
        summary: {
          scenariosCompared: comparisons.length,
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error: unknown) {
      console.error('[backtesting] Scenario comparison failed:', error);

      res.status(500).json({
        error: 'SCENARIO_COMPARISON_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
        correlationId,
      });
    }
  })
);

/**
 * GET /api/backtesting/scenarios
 *
 * Get list of available historical scenarios.
 *
 * Returns:
 * - scenarios: string[] - Array of available scenario names
 */
router.get(
  '/scenarios',
  requireAuth(),
  monitorPerformance,
  asyncHandler(async (req: Request, res: Response) => {
    try {
      const scenarios = backtestingService.getAvailableScenariosList();

      res.status(200).json({ scenarios });
    } catch (error) {
      console.error('[backtesting] Get scenarios failed:', error);

      res.status(500).json({
        error: 'SCENARIOS_FETCH_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      });
    }
  })
);

// ============================================================================
// ERROR HANDLER
// ============================================================================

router.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
  console.error('[backtesting] Unhandled error:', err);

  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred',
    correlationId: req.headers['x-correlation-id'],
  });
});

export default router;
