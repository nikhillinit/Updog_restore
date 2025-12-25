/**
 * Performance Dashboard API Routes
 *
 * Provides endpoints for portfolio performance analysis:
 * - GET /api/funds/:fundId/performance/timeseries - Time-series metrics
 * - GET /api/funds/:fundId/performance/breakdown - Metrics by dimension
 * - GET /api/funds/:fundId/performance/comparison - Date comparisons
 *
 * @module server/routes/performance-api
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../lib/auth/jwt';
import { requireFundAccess } from '../middleware/requireAuth';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { toNumber, NumberParseError } from '@shared/number';
import { storage } from '../storage';
import { performanceCalculator } from '../services/performance-calculator';
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
  recordCacheHit,
  recordCacheMiss,
  recordCalculation,
  recordDataPoints,
  recordError,
} from '../observability/performance-metrics';

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

// ============================================================================
// ROUTES
// ============================================================================

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
    let cacheHit = false;
    let fundId = 0;

    try {
      // Parse and validate fund ID
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        const durationMs = endTimer();
        recordPerformanceRequest('timeseries', 'GET', 400, durationMs, fundId);
        recordError('timeseries', 'invalid_fund_id');
        return res.status(400).json(
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
        return res.status(404).json(
          createErrorResponse('FUND_NOT_FOUND', `Fund ${fundId} not found`)
        );
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

      // Record cache status
      if (cacheHit) {
        recordCacheHit('timeseries');
      } else {
        recordCacheMiss('timeseries');
      }
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
          cacheHit,
          computeTimeMs: Math.round(durationMs),
        },
      };

      recordPerformanceRequest('timeseries', 'GET', 200, durationMs, fundId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(response);
    } catch (error) {
      const durationMs = endTimer();

      if (error instanceof NumberParseError) {
        recordPerformanceRequest('timeseries', 'GET', 400, durationMs, fundId);
        recordError('timeseries', 'number_parse_error');
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', error.message)
        );
      }

      if (error instanceof z.ZodError) {
        recordPerformanceRequest('timeseries', 'GET', 400, durationMs, fundId);
        recordError('timeseries', 'validation_error');
        const firstError = error.errors[0];
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid query parameters',
            firstError?.path.join('.')
          )
        );
      }

      recordPerformanceRequest('timeseries', 'GET', 500, durationMs, fundId);
      recordError('timeseries', 'internal_error');
      console.error('Performance timeseries API error:', error);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to calculate performance timeseries')
      );
    }
  }
);

/**
 * GET /api/funds/:fundId/performance/breakdown
 *
 * Get metrics broken down by sector, stage, or company.
 *
 * Query parameters:
 * - asOfDate: ISO date (optional, defaults to now)
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
    const cacheHit = false;
    let fundId = 0;

    try {
      // Parse and validate fund ID
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        const durationMs = endTimer();
        recordPerformanceRequest('breakdown', 'GET', 400, durationMs, fundId);
        recordError('breakdown', 'invalid_fund_id');
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', `Fund ID must be a positive integer`, 'fundId')
        );
      }

      // Validate query parameters
      const query = BreakdownQuerySchema.parse(req.query);

      // Default asOfDate to today
      const asOfDate: string = query.asOfDate ?? new Date().toISOString().split('T')[0] ?? '';

      // Get fund name for response
      const fund = await storage.getFund(fundId);
      if (!fund) {
        const durationMs = endTimer();
        recordPerformanceRequest('breakdown', 'GET', 404, durationMs, fundId);
        recordError('breakdown', 'fund_not_found');
        return res.status(404).json(
          createErrorResponse('FUND_NOT_FOUND', `Fund ${fundId} not found`)
        );
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

      // Record cache status
      if (cacheHit) {
        recordCacheHit('breakdown');
      } else {
        recordCacheMiss('breakdown');
      }
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
          cacheHit,
          computeTimeMs: Math.round(durationMs),
        },
      };

      recordPerformanceRequest('breakdown', 'GET', 200, durationMs, fundId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(response);
    } catch (error) {
      const durationMs = endTimer();

      if (error instanceof NumberParseError) {
        recordPerformanceRequest('breakdown', 'GET', 400, durationMs, fundId);
        recordError('breakdown', 'number_parse_error');
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', error.message)
        );
      }

      if (error instanceof z.ZodError) {
        recordPerformanceRequest('breakdown', 'GET', 400, durationMs, fundId);
        recordError('breakdown', 'validation_error');
        const firstError = error.errors[0];
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid query parameters',
            firstError?.path.join('.')
          )
        );
      }

      recordPerformanceRequest('breakdown', 'GET', 500, durationMs, fundId);
      recordError('breakdown', 'internal_error');
      console.error('Performance breakdown API error:', error);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to calculate performance breakdown')
      );
    }
  }
);

/**
 * GET /api/funds/:fundId/performance/comparison
 *
 * Compare fund metrics across multiple dates.
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
    const cacheHit = false;
    let fundId = 0;

    try {
      // Parse and validate fund ID
      const fundIdParam = req.params['fundId'];
      fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        const durationMs = endTimer();
        recordPerformanceRequest('comparison', 'GET', 400, durationMs, fundId);
        recordError('comparison', 'invalid_fund_id');
        return res.status(400).json(
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
        return res.status(404).json(
          createErrorResponse('FUND_NOT_FOUND', `Fund ${fundId} not found`)
        );
      }

      // Calculate comparison
      const calcTimer = startTimer();
      const { comparisons, deltas } = await performanceCalculator.calculateComparison(
        fundId,
        query.dates,
        query.metrics
      );
      recordCalculation('comparison', 'multi-date', calcTimer());

      // Record cache status
      if (cacheHit) {
        recordCacheHit('comparison');
      } else {
        recordCacheMiss('comparison');
      }
      recordDataPoints('comparison', comparisons.length);

      const durationMs = endTimer();
      const response: ComparisonResponse = {
        fundId,
        fundName: fund.name,
        comparisons,
        deltas,
        meta: {
          dates: query.dates,
          cacheHit,
          computeTimeMs: Math.round(durationMs),
        },
      };

      recordPerformanceRequest('comparison', 'GET', 200, durationMs, fundId);
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(response);
    } catch (error) {
      const durationMs = endTimer();

      if (error instanceof NumberParseError) {
        recordPerformanceRequest('comparison', 'GET', 400, durationMs, fundId);
        recordError('comparison', 'number_parse_error');
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', error.message)
        );
      }

      if (error instanceof z.ZodError) {
        recordPerformanceRequest('comparison', 'GET', 400, durationMs, fundId);
        recordError('comparison', 'validation_error');
        const firstError = error.errors[0];
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid query parameters',
            firstError?.path.join('.')
          )
        );
      }

      recordPerformanceRequest('comparison', 'GET', 500, durationMs, fundId);
      recordError('comparison', 'internal_error');
      console.error('Performance comparison API error:', error);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to calculate performance comparison')
      );
    }
  }
);

export default router;
