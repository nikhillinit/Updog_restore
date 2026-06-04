/**
 * Performance Dashboard API Routes
 *
 * Provides endpoints for portfolio performance analysis:
 * - GET /api/funds/:fundId/performance/timeseries - Time-series metrics
 * - GET /api/funds/:fundId/performance/metrics - Persisted fund metric rows
 * - GET /api/funds/:fundId/performance/breakdown - Metrics by dimension
 * - GET /api/funds/:fundId/performance/comparison - Date comparisons
 *
 * @module server/routes/performance-api
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { desc, eq } from 'drizzle-orm';
import { toNumber, NumberParseError } from '@shared/number';
import { db } from '../db';
import { storage } from '../storage';
import { performanceCalculator } from '../services/performance-calculator';
import { fundMetrics, pacingHistory } from '@shared/schema';
import {
  TimeseriesQuerySchema,
  BreakdownQuerySchema,
  ComparisonQuerySchema,
} from './performance-api.schemas';
import type {
  TimeseriesResponse,
  BreakdownResponse,
  ComparisonResponse,
  PerformanceApiError,
} from '@shared/types/performance-api';
import {
  startTimer,
  recordPerformanceRequest,
  recordCacheMiss,
  recordCalculation,
  recordDataPoints,
  recordError,
} from '../observability/performance-metrics';
import { logger } from '../lib/logger.js';

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

/**
 * Standard rate limiter for performance endpoints
 * 60 requests per minute per IP
 */
const performanceLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many performance requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function createErrorResponse(
  code: string,
  message: string,
  field?: string | undefined
): PerformanceApiError {
  const response: PerformanceApiError = {
    error: code,
    message,
    timestamp: new Date().toISOString(),
  };
  if (field !== undefined) {
    response.field = field;
  }
  return response;
}

function respondNumberParseError(
  res: Response,
  error: unknown,
  field?: string | undefined
): boolean {
  if (!(error instanceof NumberParseError)) {
    return false;
  }

  res.status(400).json(createErrorResponse('INVALID_PARAMETER', error.message, field));
  return true;
}

function respondObservedNumberParseError(
  metricName: 'timeseries' | 'breakdown' | 'comparison',
  res: Response,
  error: unknown,
  durationMs: number,
  fundId: number
): boolean {
  if (!(error instanceof NumberParseError)) {
    return false;
  }

  recordPerformanceRequest(metricName, 'GET', 400, durationMs, fundId);
  recordError(metricName, 'number_parse_error');
  return respondNumberParseError(res, error);
}

function parseListLimit(value: unknown, defaultLimit = 100, maxLimit = 200): number {
  const rawLimit = Number.parseInt(String(value ?? defaultLimit), 10);
  return Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, maxLimit) : defaultLimit;
}

// ============================================================================
// ROUTES
// ============================================================================

/**
 * GET /api/funds/:fundId/performance/metrics
 *
 * Read persisted fund metric rows for a fund. This is intentionally row-level;
 * generated time-series responses are not a visibility proof for imports.
 */
router.get(
  '/api/funds/:fundId/performance/metrics',
  requireAuth(),
  requireFundAccess,
  performanceLimiter,
  async (req: Request, res: Response) => {
    let fundId = 0;
    try {
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');
      if (fundId <= 0) {
        recordError('fund-metrics', 'invalid_fund_id');
        return res
          .status(400)
          .json(
            createErrorResponse('INVALID_PARAMETER', `Fund ID must be a positive integer`, 'fundId')
          );
      }

      const limit = parseListLimit(req.query['limit']);
      const rows = await db
        .select({
          id: fundMetrics.id,
          fundId: fundMetrics.fundId,
          metricDate: fundMetrics.metricDate,
          asOfDate: fundMetrics.asOfDate,
          totalValue: fundMetrics.totalValue,
          irr: fundMetrics.irr,
          multiple: fundMetrics.multiple,
          dpi: fundMetrics.dpi,
          tvpi: fundMetrics.tvpi,
          runId: fundMetrics.runId,
          configId: fundMetrics.configId,
          configVersion: fundMetrics.configVersion,
          createdAt: fundMetrics.createdAt,
        })
        .from(fundMetrics)
        .where(eq(fundMetrics.fundId, fundId))
        .orderBy(desc(fundMetrics.metricDate), desc(fundMetrics.id))
        .limit(limit);

      return res.json({
        success: true,
        data: rows,
        count: rows.length,
      });
    } catch (error) {
      if (respondNumberParseError(res, error, 'fundId')) {
        return;
      }

      logger.error({ err: error, fundId }, 'fund metrics API error');
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch fund metrics'));
    }
  }
);

/**
 * GET /api/funds/:fundId/pacing-history
 *
 * Read imported or calculated pacing history for a fund.
 */
router.get(
  '/api/funds/:fundId/pacing-history',
  requireAuth(),
  requireFundAccess,
  performanceLimiter,
  async (req: Request, res: Response) => {
    let fundId = 0;
    try {
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');
      if (fundId <= 0) {
        recordError('pacing-history', 'invalid_fund_id');
        return res
          .status(400)
          .json(
            createErrorResponse('INVALID_PARAMETER', `Fund ID must be a positive integer`, 'fundId')
          );
      }

      const limit = parseListLimit(req.query['limit']);
      const rows = await db
        .select({
          id: pacingHistory.id,
          fundId: pacingHistory.fundId,
          quarter: pacingHistory.quarter,
          deploymentAmount: pacingHistory.deploymentAmount,
          marketCondition: pacingHistory.marketCondition,
          createdAt: pacingHistory.createdAt,
        })
        .from(pacingHistory)
        .where(eq(pacingHistory.fundId, fundId))
        .orderBy(desc(pacingHistory.createdAt), desc(pacingHistory.id))
        .limit(limit);

      return res.json({
        success: true,
        data: rows,
        count: rows.length,
      });
    } catch (error) {
      if (respondNumberParseError(res, error, 'fundId')) {
        return;
      }

      logger.error({ err: error, fundId }, 'pacing history API error');
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch pacing history'));
    }
  }
);

/**
 * GET /api/funds/:fundId/performance/timeseries
 *
 * Get fund metrics over time for trend analysis and charts.
 *
 * Query parameters:
 * - startDate: ISO date (required)
 * - endDate: ISO date (required)
 * - granularity: daily|weekly|monthly|quarterly (required)
 * - metrics: comma-separated metric names (optional)
 * - skipCache: boolean (optional)
 */
router.get(
  '/api/funds/:fundId/performance/timeseries',
  requireAuth(),
  requireFundAccess,
  performanceLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    let fundId = 0;

    try {
      // Parse and validate fund ID
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        const durationMs = endTimer();
        recordPerformanceRequest('timeseries', 'GET', 400, durationMs, fundId);
        recordError('timeseries', 'invalid_fund_id');
        return res
          .status(400)
          .json(
            createErrorResponse('INVALID_PARAMETER', `Fund ID must be a positive integer`, 'fundId')
          );
      }

      // Validate query parameters
      const query = TimeseriesQuerySchema.parse(req.query);

      // Get fund name for response
      const fund = await storage.getFund(fundId);
      if (!fund) {
        const durationMs = endTimer();
        recordPerformanceRequest('timeseries', 'GET', 404, durationMs, fundId);
        recordError('timeseries', 'fund_not_found');
        return res
          .status(404)
          .json(createErrorResponse('FUND_NOT_FOUND', `Fund ${fundId} not found`));
      }

      // Calculate timeseries metrics
      const calcTimer = startTimer();
      const timeseries = await performanceCalculator.calculateTimeseries(
        fundId,
        query.startDate,
        query.endDate,
        query.granularity,
        query.metrics
      );
      recordCalculation('timeseries', query.granularity, calcTimer());

      // No cache layer is wired for this route today, so every request is a truthful miss.
      recordCacheMiss('timeseries');
      recordDataPoints('timeseries', timeseries.length);

      const durationMs = endTimer();
      const response: TimeseriesResponse = {
        fundId,
        fundName: fund.name,
        granularity: query.granularity,
        timeseries,
        meta: {
          startDate: query.startDate,
          endDate: query.endDate,
          dataPoints: timeseries.length,
          cacheHit: false,
          computeTimeMs: Math.round(durationMs),
        },
      };

      recordPerformanceRequest('timeseries', 'GET', 200, durationMs, fundId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(response);
    } catch (error) {
      const durationMs = endTimer();

      if (respondObservedNumberParseError('timeseries', res, error, durationMs, fundId)) {
        return;
      }

      if (error instanceof z.ZodError) {
        recordPerformanceRequest('timeseries', 'GET', 400, durationMs, fundId);
        recordError('timeseries', 'validation_error');
        const firstError = error.errors[0];
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              firstError?.message || 'Invalid query parameters',
              firstError?.path.join('.')
            )
          );
      }

      recordPerformanceRequest('timeseries', 'GET', 500, durationMs, fundId);
      recordError('timeseries', 'internal_error');
      logger.error({ error }, 'Performance timeseries API error');
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to calculate performance timeseries'));
    }
  }
);

/**
 * GET /api/funds/:fundId/performance/breakdown
 *
 * Get current-state metrics broken down by sector, stage, or company.
 *
 * Query parameters:
 * - asOfDate: ISO date (optional, current date only in mounted contract)
 * - groupBy: sector|stage|company (required)
 * - includeExited: boolean (optional, defaults to false)
 * - skipCache: boolean (optional)
 */
router.get(
  '/api/funds/:fundId/performance/breakdown',
  requireAuth(),
  requireFundAccess,
  performanceLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    let fundId = 0;

    try {
      // Parse and validate fund ID
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        const durationMs = endTimer();
        recordPerformanceRequest('breakdown', 'GET', 400, durationMs, fundId);
        recordError('breakdown', 'invalid_fund_id');
        return res
          .status(400)
          .json(
            createErrorResponse('INVALID_PARAMETER', `Fund ID must be a positive integer`, 'fundId')
          );
      }

      // Validate query parameters
      const query = BreakdownQuerySchema.parse(req.query);

      // Mounted `/performance` currently supports current-state breakdown only.
      const today = new Date().toISOString().split('T')[0] ?? '';
      const asOfDate: string = query.asOfDate ?? today;

      if (query.asOfDate && query.asOfDate !== today) {
        const durationMs = endTimer();
        recordPerformanceRequest('breakdown', 'GET', 501, durationMs, fundId);
        recordError('breakdown', 'unsupported_historical_as_of');
        return res
          .status(501)
          .json(
            createErrorResponse(
              'UNSUPPORTED_CAPABILITY',
              'Historical breakdown as-of dates are not supported by the mounted performance flow',
              'asOfDate'
            )
          );
      }

      // Get fund name for response
      const fund = await storage.getFund(fundId);
      if (!fund) {
        const durationMs = endTimer();
        recordPerformanceRequest('breakdown', 'GET', 404, durationMs, fundId);
        recordError('breakdown', 'fund_not_found');
        return res
          .status(404)
          .json(createErrorResponse('FUND_NOT_FOUND', `Fund ${fundId} not found`));
      }

      // Calculate breakdown
      const calcTimer = startTimer();
      const { breakdown, totals } = await performanceCalculator.calculateBreakdown(
        fundId,
        asOfDate,
        query.groupBy,
        query.includeExited || false
      );
      recordCalculation('breakdown', query.groupBy, calcTimer());

      // No cache layer is wired for this route today, so every request is a truthful miss.
      recordCacheMiss('breakdown');
      recordDataPoints('breakdown', breakdown.length);

      const durationMs = endTimer();
      const response: BreakdownResponse = {
        fundId,
        fundName: fund.name,
        asOfDate,
        groupBy: query.groupBy,
        breakdown,
        totals,
        meta: {
          cacheHit: false,
          computeTimeMs: Math.round(durationMs),
        },
      };

      recordPerformanceRequest('breakdown', 'GET', 200, durationMs, fundId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(response);
    } catch (error) {
      const durationMs = endTimer();

      if (respondObservedNumberParseError('breakdown', res, error, durationMs, fundId)) {
        return;
      }

      if (error instanceof z.ZodError) {
        recordPerformanceRequest('breakdown', 'GET', 400, durationMs, fundId);
        recordError('breakdown', 'validation_error');
        const firstError = error.errors[0];
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              firstError?.message || 'Invalid query parameters',
              firstError?.path.join('.')
            )
          );
      }

      recordPerformanceRequest('breakdown', 'GET', 500, durationMs, fundId);
      recordError('breakdown', 'internal_error');
      logger.error({ error }, 'Performance breakdown API error');
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to calculate performance breakdown'));
    }
  }
);

/**
 * GET /api/funds/:fundId/performance/comparison
 *
 * Compare persisted fund-metric snapshots across multiple dates.
 *
 * Query parameters:
 * - dates: comma-separated ISO dates (required, 1-5 dates)
 * - metrics: comma-separated metric names (optional)
 * - skipCache: boolean (optional)
 */
router.get(
  '/api/funds/:fundId/performance/comparison',
  requireAuth(),
  requireFundAccess,
  performanceLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    let fundId = 0;

    try {
      // Parse and validate fund ID
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        const durationMs = endTimer();
        recordPerformanceRequest('comparison', 'GET', 400, durationMs, fundId);
        recordError('comparison', 'invalid_fund_id');
        return res
          .status(400)
          .json(
            createErrorResponse('INVALID_PARAMETER', `Fund ID must be a positive integer`, 'fundId')
          );
      }

      // Validate query parameters
      const query = ComparisonQuerySchema.parse(req.query);

      // Get fund name for response
      const fund = await storage.getFund(fundId);
      if (!fund) {
        const durationMs = endTimer();
        recordPerformanceRequest('comparison', 'GET', 404, durationMs, fundId);
        recordError('comparison', 'fund_not_found');
        return res
          .status(404)
          .json(createErrorResponse('FUND_NOT_FOUND', `Fund ${fundId} not found`));
      }

      // Calculate comparison
      const calcTimer = startTimer();
      const { comparisons, deltas } = await performanceCalculator.calculateComparison(
        fundId,
        query.dates,
        query.metrics
      );
      recordCalculation('comparison', 'multi-date', calcTimer());

      // No cache layer is wired for this route today, so every request is a truthful miss.
      recordCacheMiss('comparison');
      recordDataPoints('comparison', comparisons.length);

      const durationMs = endTimer();
      const response: ComparisonResponse = {
        fundId,
        fundName: fund.name,
        comparisons,
        deltas,
        meta: {
          dates: query.dates,
          cacheHit: false,
          computeTimeMs: Math.round(durationMs),
        },
      };

      recordPerformanceRequest('comparison', 'GET', 200, durationMs, fundId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(response);
    } catch (error) {
      const durationMs = endTimer();

      if (respondObservedNumberParseError('comparison', res, error, durationMs, fundId)) {
        return;
      }

      if (error instanceof z.ZodError) {
        recordPerformanceRequest('comparison', 'GET', 400, durationMs, fundId);
        recordError('comparison', 'validation_error');
        const firstError = error.errors[0];
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              firstError?.message || 'Invalid query parameters',
              firstError?.path.join('.')
            )
          );
      }

      recordPerformanceRequest('comparison', 'GET', 500, durationMs, fundId);
      recordError('comparison', 'internal_error');
      logger.error({ error }, 'Performance comparison API error');
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to calculate performance comparison'));
    }
  }
);

export default router;
