/**
 * LP Distributions API Routes
 *
 * Sprint 3 endpoints for distribution tracking (TC-LP-004):
 * - GET /api/lp/distributions - List distributions with waterfall/tax breakdown
 * - GET /api/lp/distributions/:distributionId - Get distribution details
 * - GET /api/lp/distributions/summary - Get distribution summary by year
 * - GET /api/lp/distributions/tax-summary/:year - Get tax summary for K-1
 *
 * @module server/routes/lp-distributions
 */

/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../lib/auth/jwt';
import { requireLPAccess } from '../middleware/requireLPAccess';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db';
import { eq, and, desc, sql } from 'drizzle-orm';
import { lpDistributionDetails } from '@shared/schema-lp-sprint3';
import { funds } from '@shared/schema';
import { createCursor, verifyCursor } from '../lib/crypto/cursor-signing';
import { sanitizeForLogging } from '../lib/crypto/pii-sanitizer';
import { lpAuditLogger } from '../services/lp-audit-logger';
import { recordLPRequest, recordError, startTimer } from '../observability/lp-metrics';

const router = Router();

// ============================================================================
// RATE LIMITERS
// ============================================================================

const distributionsLimiter = rateLimit({
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
// VALIDATION SCHEMAS
// ============================================================================

const DistributionsQuerySchema = z.object({
  fundId: z.coerce.number().positive().optional(),
  year: z.coerce.number().min(2000).max(new Date().getFullYear()).optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

const TaxSummaryParamsSchema = z.object({
  year: z.coerce.number().min(2000).max(new Date().getFullYear()),
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

function createErrorResponse(code: string, message: string, field?: string): LPApiError {
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

function formatCentsAsString(cents: bigint | null | undefined): string {
  return (cents ?? 0n).toString();
}

// ============================================================================
// GET /api/lp/distributions
// ============================================================================

/**
 * List distributions for the authenticated LP
 *
 * Query parameters:
 * - fundId: Filter by fund ID
 * - year: Filter by distribution year
 * - limit: Number of results (max 100)
 * - cursor: Pagination cursor
 */
router.get(
  '/api/lp/distributions',
  requireAuth(),
  requireLPAccess,
  distributionsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/distributions';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration);
        recordError(endpoint, 'LP_NOT_FOUND', 404);
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate query parameters
      const query = DistributionsQuerySchema.parse(req.query);

      // Verify and decode cursor if provided
      let startOffset = 0;
      if (query.cursor) {
        try {
          const cursorPayload = verifyCursor<{ offset: number; limit: number }>(query.cursor);
          startOffset = cursorPayload.offset;
        } catch {
          const duration = endTimer();
          recordLPRequest(endpoint, 'GET', 400, duration, lpId);
          recordError(endpoint, 'INVALID_CURSOR', 400);
          return res
            .status(400)
            .json(
              createErrorResponse('INVALID_CURSOR', 'Pagination cursor is invalid or tampered')
            );
        }
      }

      // Build query conditions
      const conditions = [eq(lpDistributionDetails.lpId, lpId)];

      if (query.fundId) {
        conditions.push(eq(lpDistributionDetails.fundId, query.fundId));
      }

      if (query.year) {
        const yearStart = `${query.year}-01-01`;
        const yearEnd = `${query.year}-12-31`;
        conditions.push(
          sql`${lpDistributionDetails.distributionDate} >= ${yearStart} AND ${lpDistributionDetails.distributionDate} <= ${yearEnd}`
        );
      }

      // Query distributions with fund name
      const distributions = await db
        .select({
          id: lpDistributionDetails.id,
          lpId: lpDistributionDetails.lpId,
          fundId: lpDistributionDetails.fundId,
          fundName: funds.name,
          distributionNumber: lpDistributionDetails.distributionNumber,
          totalAmountCents: lpDistributionDetails.totalAmountCents,
          distributionDate: lpDistributionDetails.distributionDate,
          distributionType: lpDistributionDetails.distributionType,
          status: lpDistributionDetails.status,
          returnOfCapitalCents: lpDistributionDetails.returnOfCapitalCents,
          preferredReturnCents: lpDistributionDetails.preferredReturnCents,
          carriedInterestCents: lpDistributionDetails.carriedInterestCents,
          catchUpCents: lpDistributionDetails.catchUpCents,
          createdAt: lpDistributionDetails.createdAt,
        })
        .from(lpDistributionDetails)
        .leftJoin(funds, eq(lpDistributionDetails.fundId, funds.id))
        .where(and(...conditions))
        .orderBy(desc(lpDistributionDetails.distributionDate), desc(lpDistributionDetails.id))
        .limit(query.limit + 1)
        .offset(startOffset);

      // Check if there are more results
      const hasMore = distributions.length > query.limit;
      const paginatedDistributions = hasMore ? distributions.slice(0, query.limit) : distributions;

      // Calculate total distributed
      const totalDistributed = paginatedDistributions.reduce(
        (sum, d) => sum + (d.totalAmountCents ?? 0n),
        0n
      );

      // Format response
      const responseDistributions = paginatedDistributions.map((d) => ({
        id: d.id,
        fundId: d.fundId,
        fundName: d.fundName ?? 'Unknown Fund',
        distributionNumber: d.distributionNumber,
        totalAmount: formatCentsAsString(d.totalAmountCents),
        distributionDate: d.distributionDate,
        distributionType: d.distributionType,
        status: d.status,
        breakdown: {
          returnOfCapital: formatCentsAsString(d.returnOfCapitalCents),
          preferredReturn: formatCentsAsString(d.preferredReturnCents),
          carriedInterest: formatCentsAsString(d.carriedInterestCents),
          catchUp: formatCentsAsString(d.catchUpCents),
        },
      }));

      // Create signed cursor for next page
      const nextCursor = hasMore
        ? createCursor({ offset: startOffset + query.limit, limit: query.limit })
        : null;

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      // Audit log
      await lpAuditLogger.logDistributionsListView(lpId, req.user?.id, req);

      return res.json({
        distributions: responseDistributions,
        nextCursor,
        hasMore,
        totalDistributed: formatCentsAsString(totalDistributed),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 400, duration);
        recordError(endpoint, 'VALIDATION_ERROR', 400);
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

      console.error('Distributions list API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch distributions'));
    }
  }
);

// ============================================================================
// GET /api/lp/distributions/summary
// ============================================================================

/**
 * Get distribution summary grouped by year
 */
router.get(
  '/api/lp/distributions/summary',
  requireAuth(),
  requireLPAccess,
  distributionsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/distributions/summary';

    try {
      const lpId = req.lpProfile?.id;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      const query = z
        .object({
          fundId: z.coerce.number().positive().optional(),
        })
        .parse(req.query);

      // Build conditions
      const conditions = [eq(lpDistributionDetails.lpId, lpId)];
      if (query.fundId) {
        conditions.push(eq(lpDistributionDetails.fundId, query.fundId));
      }

      // Get all distributions for grouping
      const distributions = await db
        .select({
          distributionDate: lpDistributionDetails.distributionDate,
          totalAmountCents: lpDistributionDetails.totalAmountCents,
          distributionType: lpDistributionDetails.distributionType,
          returnOfCapitalCents: lpDistributionDetails.returnOfCapitalCents,
        })
        .from(lpDistributionDetails)
        .where(and(...conditions))
        .orderBy(desc(lpDistributionDetails.distributionDate));

      // Group by year
      const byYear = new Map<
        number,
        {
          totalDistributed: bigint;
          distributionCount: number;
          byType: Record<string, bigint>;
        }
      >();

      for (const d of distributions) {
        const year = new Date(d.distributionDate).getFullYear();
        const existing = byYear.get(year) || {
          totalDistributed: 0n,
          distributionCount: 0,
          byType: {
            return_of_capital: 0n,
            capital_gains: 0n,
            dividend: 0n,
            mixed: 0n,
          },
        };

        existing.totalDistributed += d.totalAmountCents ?? 0n;
        existing.distributionCount += 1;
        const typeKey = d.distributionType || 'mixed';
        if (typeKey in existing.byType) {
          existing.byType[typeKey] = (existing.byType[typeKey] ?? 0n) + (d.totalAmountCents ?? 0n);
        }

        byYear.set(year, existing);
      }

      // Format response
      const summary = Array.from(byYear.entries()).map(([year, data]) => ({
        year,
        totalDistributed: formatCentsAsString(data.totalDistributed),
        distributionCount: data.distributionCount,
        byType: Object.fromEntries(
          Object.entries(data.byType).map(([k, v]) => [k, formatCentsAsString(v)])
        ),
      }));

      const totalAllTime = distributions.reduce((sum, d) => sum + (d.totalAmountCents ?? 0n), 0n);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        summary: summary.sort((a, b) => b.year - a.year),
        totalAllTime: formatCentsAsString(totalAllTime),
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const firstError = error.errors[0];
        return res
          .status(400)
          .json(createErrorResponse('VALIDATION_ERROR', firstError?.message || 'Invalid query'));
      }

      console.error('Distributions summary API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch distribution summary'));
    }
  }
);

// ============================================================================
// GET /api/lp/distributions/tax-summary/:year
// ============================================================================

/**
 * Get tax summary for K-1 preparation
 *
 * Returns aggregated tax categories for a specific tax year.
 */
router.get(
  '/api/lp/distributions/tax-summary/:year',
  requireAuth(),
  requireLPAccess,
  distributionsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/distributions/tax-summary/:year';

    try {
      const lpId = req.lpProfile?.id;
      const lpName = req.lpProfile?.name;

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      // Validate year parameter
      const yearParam = TaxSummaryParamsSchema.safeParse({ year: req.params['year'] });
      if (!yearParam.success) {
        return res
          .status(400)
          .json(
            createErrorResponse(
              'VALIDATION_ERROR',
              'Year must be between 2000 and current year',
              'year'
            )
          );
      }

      const { year } = yearParam.data;
      const yearStart = `${year}-01-01`;
      const yearEnd = `${year}-12-31`;

      // Get distributions for the year with fund info
      const distributions = await db
        .select({
          fundId: lpDistributionDetails.fundId,
          fundName: funds.name,
          totalAmountCents: lpDistributionDetails.totalAmountCents,
          nonTaxableCents: lpDistributionDetails.nonTaxableCents,
          ordinaryIncomeCents: lpDistributionDetails.ordinaryIncomeCents,
          longTermGainsCents: lpDistributionDetails.longTermGainsCents,
          qualifiedDividendsCents: lpDistributionDetails.qualifiedDividendsCents,
          returnOfCapitalCents: lpDistributionDetails.returnOfCapitalCents,
        })
        .from(lpDistributionDetails)
        .leftJoin(funds, eq(lpDistributionDetails.fundId, funds.id))
        .where(
          and(
            eq(lpDistributionDetails.lpId, lpId),
            sql`${lpDistributionDetails.distributionDate} >= ${yearStart}`,
            sql`${lpDistributionDetails.distributionDate} <= ${yearEnd}`
          )
        );

      // Aggregate tax categories
      let totalNonTaxable = 0n;
      let totalOrdinaryIncome = 0n;
      let totalLongTermGains = 0n;
      let totalQualifiedDividends = 0n;
      let totalDistributed = 0n;

      // Group by fund
      const byFundMap = new Map<
        number,
        {
          fundName: string;
          nonTaxable: bigint;
          ordinaryIncome: bigint;
          longTermGains: bigint;
          qualifiedDividends: bigint;
        }
      >();

      for (const d of distributions) {
        totalNonTaxable += d.nonTaxableCents ?? 0n;
        totalOrdinaryIncome += d.ordinaryIncomeCents ?? 0n;
        totalLongTermGains += d.longTermGainsCents ?? 0n;
        totalQualifiedDividends += d.qualifiedDividendsCents ?? 0n;
        totalDistributed += d.totalAmountCents ?? 0n;

        const fundData = byFundMap.get(d.fundId) || {
          fundName: d.fundName ?? 'Unknown Fund',
          nonTaxable: 0n,
          ordinaryIncome: 0n,
          longTermGains: 0n,
          qualifiedDividends: 0n,
        };

        fundData.nonTaxable += d.nonTaxableCents ?? 0n;
        fundData.ordinaryIncome += d.ordinaryIncomeCents ?? 0n;
        fundData.longTermGains += d.longTermGainsCents ?? 0n;
        fundData.qualifiedDividends += d.qualifiedDividendsCents ?? 0n;

        byFundMap.set(d.fundId, fundData);
      }

      // Format by fund
      const byFund = Array.from(byFundMap.entries()).map(([fundId, data]) => ({
        fundId,
        fundName: data.fundName,
        nonTaxable: formatCentsAsString(data.nonTaxable),
        ordinaryIncome: formatCentsAsString(data.ordinaryIncome),
        longTermGains: formatCentsAsString(data.longTermGains),
        qualifiedDividends: formatCentsAsString(data.qualifiedDividends),
      }));

      // K-1 line item mapping (simplified)
      const k1LineItems = {
        line1: formatCentsAsString(totalOrdinaryIncome), // Ordinary business income
        line8: formatCentsAsString(totalLongTermGains), // Net long-term capital gain
        line11: formatCentsAsString(totalQualifiedDividends), // Qualified dividends
        line19a: formatCentsAsString(totalDistributed), // Distributions
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=3600'); // 1 hour for tax data

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      return res.json({
        year,
        lpId,
        lpName: lpName ?? 'Unknown LP',

        taxCategories: {
          nonTaxableReturnOfCapital: formatCentsAsString(totalNonTaxable),
          ordinaryIncome: formatCentsAsString(totalOrdinaryIncome),
          longTermCapitalGains: formatCentsAsString(totalLongTermGains),
          qualifiedDividends: formatCentsAsString(totalQualifiedDividends),
        },

        byFund,
        k1LineItems,
        totalDistributed: formatCentsAsString(totalDistributed),
      });
    } catch (error) {
      console.error('Tax summary API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch tax summary'));
    }
  }
);

// ============================================================================
// GET /api/lp/distributions/:distributionId
// ============================================================================

/**
 * Get distribution details with full waterfall and tax breakdown
 */
router.get(
  '/api/lp/distributions/:distributionId',
  requireAuth(),
  requireLPAccess,
  distributionsLimiter,
  async (req: Request, res: Response) => {
    const endTimer = startTimer();
    const endpoint = '/api/lp/distributions/:distributionId';

    try {
      const lpId = req.lpProfile?.id;
      const distributionId = req.params['distributionId'];

      if (!lpId) {
        return res.status(404).json(createErrorResponse('LP_NOT_FOUND', 'LP profile not found'));
      }

      if (!distributionId) {
        return res
          .status(400)
          .json(createErrorResponse('INVALID_REQUEST', 'Distribution ID is required'));
      }

      // Fetch distribution with fund name
      const distributions = await db
        .select({
          id: lpDistributionDetails.id,
          lpId: lpDistributionDetails.lpId,
          fundId: lpDistributionDetails.fundId,
          fundName: funds.name,
          distributionNumber: lpDistributionDetails.distributionNumber,
          totalAmountCents: lpDistributionDetails.totalAmountCents,
          distributionDate: lpDistributionDetails.distributionDate,
          distributionType: lpDistributionDetails.distributionType,
          status: lpDistributionDetails.status,
          // Waterfall breakdown
          returnOfCapitalCents: lpDistributionDetails.returnOfCapitalCents,
          preferredReturnCents: lpDistributionDetails.preferredReturnCents,
          carriedInterestCents: lpDistributionDetails.carriedInterestCents,
          catchUpCents: lpDistributionDetails.catchUpCents,
          // Tax breakdown
          nonTaxableCents: lpDistributionDetails.nonTaxableCents,
          ordinaryIncomeCents: lpDistributionDetails.ordinaryIncomeCents,
          longTermGainsCents: lpDistributionDetails.longTermGainsCents,
          qualifiedDividendsCents: lpDistributionDetails.qualifiedDividendsCents,
          // Wire info
          wireDate: lpDistributionDetails.wireDate,
          wireReference: lpDistributionDetails.wireReference,
          notes: lpDistributionDetails.notes,
          createdAt: lpDistributionDetails.createdAt,
          updatedAt: lpDistributionDetails.updatedAt,
        })
        .from(lpDistributionDetails)
        .leftJoin(funds, eq(lpDistributionDetails.fundId, funds.id))
        .where(eq(lpDistributionDetails.id, distributionId))
        .limit(1);

      if (distributions.length === 0) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 404, duration, lpId);
        return res
          .status(404)
          .json(
            createErrorResponse(
              'DISTRIBUTION_NOT_FOUND',
              `Distribution ${distributionId} not found`
            )
          );
      }

      const distribution = distributions[0];
      if (!distribution) {
        return res
          .status(404)
          .json(
            createErrorResponse(
              'DISTRIBUTION_NOT_FOUND',
              `Distribution ${distributionId} not found`
            )
          );
      }

      // Verify LP owns this distribution
      if (distribution.lpId !== lpId) {
        const duration = endTimer();
        recordLPRequest(endpoint, 'GET', 403, duration, lpId);
        return res
          .status(403)
          .json(createErrorResponse('FORBIDDEN', 'You do not have access to this distribution'));
      }

      const response = {
        id: distribution.id,
        fundId: distribution.fundId,
        fundName: distribution.fundName ?? 'Unknown Fund',
        distributionNumber: distribution.distributionNumber,
        totalAmount: formatCentsAsString(distribution.totalAmountCents),
        distributionDate: distribution.distributionDate,
        distributionType: distribution.distributionType,
        status: distribution.status,

        // Waterfall breakdown
        breakdown: {
          returnOfCapital: formatCentsAsString(distribution.returnOfCapitalCents),
          preferredReturn: formatCentsAsString(distribution.preferredReturnCents),
          carriedInterest: formatCentsAsString(distribution.carriedInterestCents),
          catchUp: formatCentsAsString(distribution.catchUpCents),
        },

        // Tax breakdown
        taxBreakdown: {
          nonTaxable: formatCentsAsString(distribution.nonTaxableCents),
          ordinaryIncome: formatCentsAsString(distribution.ordinaryIncomeCents),
          longTermGains: formatCentsAsString(distribution.longTermGainsCents),
          qualifiedDividends: formatCentsAsString(distribution.qualifiedDividendsCents),
        },

        // Wire info
        wireDate: distribution.wireDate,
        wireReference: distribution.wireReference,
        notes: distribution.notes,

        createdAt: distribution.createdAt.toISOString(),
        updatedAt: distribution.updatedAt.toISOString(),
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=300');

      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 200, duration, lpId);

      // Audit log
      await lpAuditLogger.logDistributionDetailView(lpId, distributionId, req.user?.id, req);

      return res.json(response);
    } catch (error) {
      console.error('Distribution detail API error:', sanitizeForLogging(error));
      const duration = endTimer();
      recordLPRequest(endpoint, 'GET', 500, duration);
      recordError(endpoint, 'INTERNAL_ERROR', 500);
      return res
        .status(500)
        .json(createErrorResponse('INTERNAL_ERROR', 'Failed to fetch distribution'));
    }
  }
);

export default router;
