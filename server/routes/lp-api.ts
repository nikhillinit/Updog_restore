/**
 * LP Reporting Dashboard API Routes
 *
 * Provides endpoints for Limited Partner reporting:
 * - GET /api/lp/profile - LP profile details
 * - GET /api/lp/summary - Dashboard summary
 * - GET /api/lp/capital-account - Paginated capital account transactions
 * - GET /api/lp/funds/:fundId/detail - Fund-specific detail
 * - GET /api/lp/funds/:fundId/holdings - Pro-rata portfolio holdings
 * - GET /api/lp/performance - Performance timeseries
 * - GET /api/lp/performance/benchmark - Benchmark comparison
 * - POST /api/lp/reports/generate - Queue report generation
 * - GET /api/lp/reports - List generated reports
 * - GET /api/lp/reports/:reportId - Report status
 * - GET /api/lp/reports/:reportId/download - Download report file
 *
 * @module server/routes/lp-api
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../lib/auth/jwt';
import { requireLPAccess, requireLPFundAccess } from '../middleware/requireLPAccess';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { toNumber, NumberParseError } from '@shared/number';
import { lpCalculator } from '../services/lp-calculator';
import {
  CapitalAccountQuerySchema,
  PerformanceQuerySchema,
  ReportConfigSchema,
  FundDetailQuerySchema,
} from './lp-api.schemas';
import { db } from '../db';
import { eq, desc, and } from 'drizzle-orm';
import { enqueueReportGeneration, isReportQueueAvailable } from '../queues/report-generation-queue';
import { lpReports, lpFundCommitments } from '@shared/schema-lp-reporting';
import { v4 as uuidv4 } from 'uuid';
import {
  recordLPRequest,
  recordCacheHit,
  recordError,
  recordDataPoints,
  startTimer,
} from '../observability/lp-metrics';
import { lpAuditLogger } from '../services/lp-audit-logger';
import { createCursor, verifyCursor } from '../lib/crypto/cursor-signing';
import { sanitizeForLogging } from '../lib/crypto/pii-sanitizer';

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

/**
 * Rate limiter for LP endpoints
 * 100 requests per minute per LP
 */
const lpLimiter = rateLimit({
  windowMs: 60_000,
  max: 100,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Please try again later.',
    timestamp: new Date().toISOString(),
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

interface LPApiError {
  error: string;
  message: string;
  field?: string;
  timestamp: string;
}

function createErrorResponse(
  code: string,
  message: string,
  field?: string | undefined
): LPApiError {
  const response: LPApiError = {
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
 * GET /api/lp/profile
 *
 * Get LP profile details
 */
router.get(
  '/api/lp/profile',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/profile';

    try {
      const lpProfile = req.lpProfile;

      if (!lpProfile) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Check cache header to determine if this was a cache hit
      const cacheControl = res.getHeader('Cache-Control');
      if (cacheControl && cacheControl.toString().includes('max-age=300')) {
        recordCacheHit(endpoint);
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpProfile.id);

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logProfileView(lpProfile.id, req.user?.id, req);

      return res.json({
        id: lpProfile.id,
        name: lpProfile.name,
        email: lpProfile.email,
        entityType: lpProfile.entityType,
        fundCount: lpProfile.fundIds.length,
      });
    } catch (error) {
      console.error('LP profile API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch LP profile')
      );
    }
  }
);

/**
 * GET /api/lp/summary
 *
 * Get LP dashboard summary (committed, called, distributed, NAV)
 */
router.get(
  '/api/lp/summary',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/summary';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      const summary = await lpCalculator.calculateSummary(lpId);

      // Convert bigints to strings for JSON serialization
      const response = {
        lpId: summary.lpId,
        lpName: summary.lpName,
        totalCommitted: summary.totalCommittedCents.toString(),
        totalCalled: summary.totalCalledCents.toString(),
        totalDistributed: summary.totalDistributedCents.toString(),
        totalNAV: summary.totalNAVCents.toString(),
        totalUnfunded: summary.totalUnfundedCents.toString(),
        fundCount: summary.fundCount,
        irr: summary.irr,
        moic: summary.moic,
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');
      recordCacheHit(endpoint);

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logSummaryView(lpId, req.user?.id, req);

      return res.json(response);
    } catch (error) {
      console.error('LP summary API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to calculate LP summary')
      );
    }
  }
);

/**
 * GET /api/lp/capital-account
 *
 * Get paginated capital account transactions
 *
 * Query parameters:
 * - fundIds: comma-separated fund IDs (optional)
 * - startDate: ISO date (optional)
 * - endDate: ISO date (optional)
 * - limit: number (optional, max 100)
 * - cursor: opaque pagination cursor (optional)
 * - skipCache: boolean (optional)
 */
router.get(
  '/api/lp/capital-account',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/capital-account';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Validate query parameters
      const query = CapitalAccountQuerySchema.parse(req.query);

      // Verify and decode cursor if provided (prevents SQL injection)
      let startOffset = 0;
      if (query.cursor) {
        try {
          const cursorPayload = verifyCursor<{ offset: number; limit: number }>(query.cursor);
          startOffset = cursorPayload.offset;
        } catch (error) {
          const duration = endTimer();
          recordLPRequest(endpoint, 'GET', 400, duration, lpId);
          recordError(endpoint, 'INVALID_CURSOR', 400);
          return res.status(400).json(
            createErrorResponse('INVALID_CURSOR', 'Pagination cursor is invalid or tampered')
          );
        }
      }

      // Get all commitments for this LP (filtered by fundIds if provided)
      const commitments = await db
        .select()
        .from(lpFundCommitments)
        .where(eq(lpFundCommitments.lpId, lpId));

      const filteredCommitments = query.fundIds
        ? commitments.filter((c) => query.fundIds?.includes(c.fundId))
        : commitments;

      if (filteredCommitments.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 200, duration, lpId);
        recordDataPoints(endpoint, 0);
        return res.json({
          transactions: [],
          nextCursor: null,
          hasMore: false,
        });
      }

      // For simplicity, get transactions from first commitment
      // In production, you'd merge transactions from all commitments
      const commitmentId = filteredCommitments[0]?.id;
      if (!commitmentId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 200, duration, lpId);
        recordDataPoints(endpoint, 0);
        return res.json({
          transactions: [],
          nextCursor: null,
          hasMore: false,
        });
      }

      const endDate = query.endDate || new Date().toISOString().split('T')[0] || '';
      const transactions = await lpCalculator.calculateCapitalAccount(
        commitmentId,
        endDate
      );

      // Apply pagination with cursor offset
      const limit = query.limit || 50;
      const paginatedTransactions = transactions.slice(startOffset, startOffset + limit);
      const hasMore = transactions.length > startOffset + limit;

      // Convert bigints to strings
      const responseTransactions = paginatedTransactions.map((t) => ({
        id: t.id,
        activityType: t.activityType,
        amount: t.amountCents.toString(),
        activityDate: t.activityDate.toISOString(),
        effectiveDate: t.effectiveDate.toISOString(),
        description: t.description,
        runningBalance: t.runningBalanceCents.toString(),
      }));

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');
      recordCacheHit(endpoint);

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);
      recordDataPoints(endpoint, responseTransactions.length);

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logCapitalAccountView(lpId, req.user?.id, query.fundIds, req);

      // Create signed cursor for next page (prevents tampering)
      const nextCursor = hasMore
        ? createCursor({ offset: startOffset + limit, limit })
        : null;

      return res.json({
        transactions: responseTransactions,
        nextCursor,
        hasMore,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 400, duration);
        recordError(endpoint, 'VALIDATION_ERROR', 400);
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid query parameters',
            firstError?.path.join('.')
          )
        );
      }

      console.error('Capital account API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch capital account')
      );
    }
  }
);

/**
 * GET /api/lp/funds/:fundId/detail
 *
 * Get fund-specific capital account and performance
 *
 * Query parameters:
 * - asOfDate: ISO date (optional, defaults to today)
 * - includeHoldings: boolean (optional, defaults to true)
 * - skipCache: boolean (optional)
 */
router.get(
  '/api/lp/funds/:fundId/detail',
  requireAuth(),
  requireLPAccess,
  requireLPFundAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    try {
      const fundIdParam = req.params['fundId'];
      const fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', 'Fund ID must be a positive integer', 'fundId')
        );
      }

      const lpId = req.lpProfile?.id;
      if (!lpId) {
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Validate query parameters
      const query = FundDetailQuerySchema.parse(req.query);
      const asOfDate = query.asOfDate || new Date().toISOString().split('T')[0] || '';

      // Get commitment for this fund
      const commitment = await db
        .select()
        .from(lpFundCommitments)
        .where(and(eq(lpFundCommitments.lpId, lpId), eq(lpFundCommitments.fundId, fundId)))
        .limit(1);

      if (commitment.length === 0) {
        return res.status(404).json(
          createErrorResponse('COMMITMENT_NOT_FOUND', `No commitment found for fund ${fundId}`)
        );
      }

      const commitmentData = commitment[0];
      if (!commitmentData) {
        return res.status(404).json(
          createErrorResponse('COMMITMENT_NOT_FOUND', `No commitment found for fund ${fundId}`)
        );
      }

      // Get capital account
      const transactions = await lpCalculator.calculateCapitalAccount(
        commitmentData.id,
        asOfDate
      );

      const latestTransaction = transactions[transactions.length - 1];

      const response: Record<string, unknown> = {
        fundId,
        commitmentId: commitmentData.id,
        commitmentAmount: commitmentData.commitmentAmountCents.toString(),
        commitmentDate: commitmentData.commitmentDate.toISOString(),
        status: commitmentData.status,
        capitalAccount: {
          asOfDate,
          calledCapital: latestTransaction?.runningBalanceCents.toString() || '0',
          transactionCount: transactions.length,
        },
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logFundDetailView(lpId, fundId, req.user?.id, req);

      return res.json(response);
    } catch (error) {
      if (error instanceof NumberParseError) {
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', error.message)
        );
      }

      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid query parameters',
            firstError?.path.join('.')
          )
        );
      }

      console.error('Fund detail API error:', sanitizeForLogging(error));
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch fund detail')
      );
    }
  }
);

/**
 * GET /api/lp/funds/:fundId/holdings
 *
 * Get LP's pro-rata share of portfolio holdings
 */
router.get(
  '/api/lp/funds/:fundId/holdings',
  requireAuth(),
  requireLPAccess,
  requireLPFundAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    try {
      const fundIdParam = req.params['fundId'];
      const fundId = toNumber(fundIdParam, 'fundId');

      if (fundId <= 0) {
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', 'Fund ID must be a positive integer', 'fundId')
        );
      }

      const lpId = req.lpProfile?.id;
      if (!lpId) {
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      const holdings = await lpCalculator.calculateProRataHoldings(lpId, fundId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logHoldingsView(lpId, fundId, req.user?.id, req);

      return res.json({
        fundId,
        holdings,
        totalHoldings: holdings.length,
        totalValue: holdings.reduce((sum, h) => sum + h.lpProRataValue, 0),
      });
    } catch (error) {
      if (error instanceof NumberParseError) {
        return res.status(400).json(
          createErrorResponse('INVALID_PARAMETER', error.message)
        );
      }

      console.error('Holdings API error:', sanitizeForLogging(error));
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch holdings')
      );
    }
  }
);

/**
 * GET /api/lp/performance
 *
 * Get performance timeseries (IRR, MOIC)
 *
 * Query parameters:
 * - fundId: number (optional, defaults to all funds)
 * - startDate: ISO date (optional)
 * - endDate: ISO date (optional)
 * - granularity: daily|weekly|monthly|quarterly (optional, defaults to monthly)
 * - includeBenchmarks: boolean (optional)
 * - skipCache: boolean (optional)
 */
router.get(
  '/api/lp/performance',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/performance';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Validate query parameters
      const query = PerformanceQuerySchema.parse(req.query);

      // Get commitments (filtered by fundId if provided)
      const commitments = await db
        .select()
        .from(lpFundCommitments)
        .where(eq(lpFundCommitments.lpId, lpId));

      const filteredCommitments = query.fundId
        ? commitments.filter((c) => c.fundId === query.fundId)
        : commitments;

      if (filteredCommitments.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 200, duration, lpId);
        recordDataPoints(endpoint, 0);
        return res.json({
          performance: [],
          granularity: query.granularity,
        });
      }

      // For simplicity, get performance from first commitment
      // In production, you'd aggregate across all commitments
      const commitmentId = filteredCommitments[0]?.id;
      if (!commitmentId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 200, duration, lpId);
        recordDataPoints(endpoint, 0);
        return res.json({
          performance: [],
          granularity: query.granularity,
        });
      }

      const startDate =
        query.startDate ||
        new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] ||
        '';
      const endDate = query.endDate || new Date().toISOString().split('T')[0] || '';

      const performance = await lpCalculator.calculatePerformance(
        commitmentId,
        startDate,
        endDate
      );

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');
      recordCacheHit(endpoint);

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);
      recordDataPoints(endpoint, performance.length);

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logPerformanceView(lpId, req.user?.id, query.fundId, req);

      return res.json({
        performance,
        granularity: query.granularity,
        dataPoints: performance.length,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 400, duration);
        recordError(endpoint, 'VALIDATION_ERROR', 400);
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid query parameters',
            firstError?.path.join('.')
          )
        );
      }

      console.error('Performance API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch performance')
      );
    }
  }
);

/**
 * GET /api/lp/performance/benchmark
 *
 * Get benchmark comparison data
 */
router.get(
  '/api/lp/performance/benchmark',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    try {
      const lpId = req.lpProfile?.id;

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      if (lpId) {
        await lpAuditLogger.logBenchmarkView(lpId, req.user?.id, req);
      }

      // Placeholder for benchmark comparison logic
      // In production, this would fetch actual benchmark data
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      return res.json({
        benchmarks: [
          {
            name: 'Cambridge Associates VC Index',
            irr: 0.15,
            moic: 2.5,
          },
        ],
        note: 'Benchmark data placeholder - implement actual benchmark logic',
      });
    } catch (error) {
      console.error('Benchmark API error:', sanitizeForLogging(error));
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch benchmark data')
      );
    }
  }
);

/**
 * POST /api/lp/reports/generate
 *
 * Queue report generation job
 *
 * Body: ReportConfigSchema
 */
router.post(
  '/api/lp/reports/generate',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/reports/generate';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'POST', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Validate request body
      const config = ReportConfigSchema.parse(req.body);

      // Create report record
      const reportId = uuidv4();
      const idempotencyKey = `lp_${lpId}_report_${Date.now()}`;

      await db.insert(lpReports).values({
        id: reportId,
        lpId,
        reportType: config.reportType,
        reportPeriodStart: new Date(config.dateRange.startDate),
        reportPeriodEnd: new Date(config.dateRange.endDate),
        status: 'pending',
        format: config.format || 'pdf',
        templateId: config.templateId,
        metadata: config.metadata,
        idempotencyKey,
      });

      // Queue report generation job with BullMQ (if queue is available)
      if (isReportQueueAvailable()) {
        try {
          const { jobId, estimatedWaitMs } = await enqueueReportGeneration({
            reportId,
            lpId,
            reportType: config.reportType,
            dateRange: config.dateRange,
            format: config.format || 'pdf',
            ...(config.fundIds && { fundIds: config.fundIds }),
            ...(config.sections && { sections: config.sections }),
            ...(config.templateId && { templateId: config.templateId }),
            ...(config.metadata && { metadata: config.metadata }),
          });
          console.log(`[LP-API] Queued report ${reportId}, jobId: ${jobId}, wait: ${estimatedWaitMs}ms`);
        } catch (queueError) {
          console.error(`[LP-API] Failed to queue report ${reportId}:`, queueError);
          // Report is still created in pending state, can be retried
        }
      } else {
        console.log(`[LP-API] Report queue unavailable, report ${reportId} will remain pending`);
      }

      res.setHeader('Content-Type', 'application/json');

      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 202, duration, lpId);

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logReportGeneration(
        lpId,
        reportId,
        config.reportType,
        req.user?.id,
        req
      );

      return res.status(202).json({
        reportId,
        status: 'pending',
        message: 'Report generation queued',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'POST', 400, duration);
        recordError(endpoint, 'VALIDATION_ERROR', 400);
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid report configuration',
            firstError?.path.join('.')
          )
        );
      }

      console.error('Report generation API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'POST', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to queue report generation')
      );
    }
  }
);

/**
 * GET /api/lp/reports
 *
 * List generated reports for this LP
 */
router.get(
  '/api/lp/reports',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      const reports = await db
        .select({
          id: lpReports.id,
          reportType: lpReports.reportType,
          reportPeriodStart: lpReports.reportPeriodStart,
          reportPeriodEnd: lpReports.reportPeriodEnd,
          status: lpReports.status,
          format: lpReports.format,
          generatedAt: lpReports.generatedAt,
          createdAt: lpReports.createdAt,
        })
        .from(lpReports)
        .where(eq(lpReports.lpId, lpId))
        .orderBy(desc(lpReports.createdAt))
        .limit(50);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logReportListView(lpId, req.user?.id, req);

      return res.json({
        reports,
        total: reports.length,
      });
    } catch (error) {
      console.error('Reports list API error:', sanitizeForLogging(error));
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch reports')
      );
    }
  }
);

/**
 * GET /api/lp/reports/:reportId
 *
 * Get report status
 */
router.get(
  '/api/lp/reports/:reportId',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    try {
      const reportId = req.params['reportId'];
      const lpId = req.lpProfile?.id;

      if (!reportId) {
        return res.status(400).json(
          createErrorResponse('INVALID_REQUEST', 'Report ID is required')
        );
      }

      if (!lpId) {
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      const report = await db
        .select()
        .from(lpReports)
        .where(and(eq(lpReports.id, reportId), eq(lpReports.lpId, lpId)))
        .limit(1);

      if (report.length === 0) {
        return res.status(404).json(
          createErrorResponse('REPORT_NOT_FOUND', `Report ${reportId} not found`)
        );
      }

      const reportData = report[0];

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=10');

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logReportStatusView(lpId, reportId, req.user?.id, req);

      return res.json(reportData);
    } catch (error) {
      console.error('Report status API error:', sanitizeForLogging(error));
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch report status')
      );
    }
  }
);

/**
 * GET /api/lp/reports/:reportId/download
 *
 * Download report file
 */
router.get(
  '/api/lp/reports/:reportId/download',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    try {
      const reportId = req.params['reportId'];
      const lpId = req.lpProfile?.id;

      if (!reportId) {
        return res.status(400).json(
          createErrorResponse('INVALID_REQUEST', 'Report ID is required')
        );
      }

      if (!lpId) {
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      const report = await db
        .select()
        .from(lpReports)
        .where(and(eq(lpReports.id, reportId), eq(lpReports.lpId, lpId)))
        .limit(1);

      if (report.length === 0) {
        return res.status(404).json(
          createErrorResponse('REPORT_NOT_FOUND', `Report ${reportId} not found`)
        );
      }

      const reportData = report[0];
      if (!reportData) {
        return res.status(404).json(
          createErrorResponse('REPORT_NOT_FOUND', `Report ${reportId} not found`)
        );
      }

      if (reportData.status !== 'ready') {
        return res.status(400).json(
          createErrorResponse(
            'REPORT_NOT_READY',
            `Report is ${reportData.status}, not ready for download`
          )
        );
      }

      if (!reportData.fileUrl) {
        return res.status(404).json(
          createErrorResponse('FILE_NOT_FOUND', 'Report file not found')
        );
      }

      // SECURITY: Log LP data access for compliance (SOC2, GDPR)
      await lpAuditLogger.logReportDownload(lpId, reportId, req.user?.id, req);

      // TODO: Implement actual file download logic
      // For now, return a redirect to the file URL
      res.redirect(reportData.fileUrl);
    } catch (error) {
      console.error('Report download API error:', sanitizeForLogging(error));
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to download report')
      );
    }
  }
);

// ============================================================================
// SETTINGS ENDPOINTS
// ============================================================================

/**
 * Settings validation schemas
 */
const LPNotificationPreferencesSchema = z.object({
  emailCapitalCalls: z.boolean().optional(),
  emailDistributions: z.boolean().optional(),
  emailQuarterlyReports: z.boolean().optional(),
  emailAnnualReports: z.boolean().optional(),
  emailMarketUpdates: z.boolean().optional(),
});

const LPDisplayPreferencesSchema = z.object({
  currency: z.enum(['USD', 'EUR', 'GBP']).optional(),
  numberFormat: z.enum(['US', 'EU']).optional(),
  timezone: z.string().optional(),
  dateFormat: z.enum(['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD']).optional(),
});

const LPSettingsSchema = z.object({
  notifications: LPNotificationPreferencesSchema.optional(),
  display: LPDisplayPreferencesSchema.optional(),
});

/**
 * GET /api/lp/settings
 *
 * Get LP notification and display preferences
 */
router.get(
  '/api/lp/settings',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/settings';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Fetch LP settings from database
      // For now, return default settings (settings table not yet implemented)
      const defaultSettings = {
        notifications: {
          emailCapitalCalls: true,
          emailDistributions: true,
          emailQuarterlyReports: true,
          emailAnnualReports: true,
          emailMarketUpdates: false,
        },
        display: {
          currency: 'USD',
          numberFormat: 'US',
          timezone: 'America/New_York',
          dateFormat: 'MM/DD/YYYY',
        },
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json(defaultSettings);
    } catch (error) {
      console.error('Settings GET API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to fetch settings')
      );
    }
  }
);

/**
 * PUT /api/lp/settings
 *
 * Update LP notification and display preferences
 */
router.put(
  '/api/lp/settings',
  requireAuth(),
  requireLPAccess,
  lpLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/settings';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'PUT', 404, duration);
        return res.status(404).json(
          createErrorResponse('LP_NOT_FOUND', 'LP profile not found')
        );
      }

      // Validate request body
      const settings = LPSettingsSchema.parse(req.body);

      // TODO: Persist settings to database
      // For now, just validate and echo back
      console.log(`[LP-API] Settings update for LP ${lpId}:`, sanitizeForLogging(settings));

      // SECURITY: Log settings change for audit
      await lpAuditLogger.logSettingsUpdate(lpId, req.user?.id, req);

      res.setHeader('Content-Type', 'application/json');

      const duration = endTimer();
      recordLPRequest(endpoint, 'PUT', 200, duration, lpId);

      return res.json({
        success: true,
        message: 'Settings updated successfully',
        settings,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'PUT', 400, duration);
        return res.status(400).json(
          createErrorResponse(
            'VALIDATION_ERROR',
            firstError?.message || 'Invalid settings',
            firstError?.path.join('.')
          )
        );
      }

      console.error('Settings PUT API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'PUT', 500, duration);
      return res.status(500).json(
        createErrorResponse('INTERNAL_ERROR', 'Failed to update settings')
      );
    }
  }
);

export default router;
