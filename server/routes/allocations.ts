/**
 * Fund Allocation Management API - Phase 1b
 *
 * Provides CRUD operations for managing reserve allocations across portfolio companies
 * with optimistic locking to prevent concurrent update conflicts.
 *
 * @module routes/allocations
 */

import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async';
import { transaction } from '../db/pg-circuit';
import { db } from '../db';
import { logger } from '../lib/logger.js';
import { applyAllocationUpdates } from '../services/allocation-write-service.js';
import { funds, portfolioCompanies } from '@shared/schema';
import { FundIdParamSchema } from '@shared/schemas/portfolio-route';
import { eq, lt, sql, desc, asc, and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
// Stage normalization and validation
import { normalizeStage, CANONICAL_STAGES } from '@shared/schemas/parse-stage-distribution';
import { getStageValidationMode } from '../lib/stage-validation-mode';
import {
  recordValidationDuration,
  recordValidationSuccess,
  recordUnknownStage,
} from '../observability/stage-metrics';
import { setStageWarningHeaders } from '../middleware/deprecation-headers';

// Custom error type for HTTP status codes
interface HttpError extends Error {
  statusCode: number;
  conflicts?: Array<{ company_id: number; expected_version: number; actual_version: number }>;
}

// Type guard for HttpError
const isHttpError = (error: unknown): error is HttpError => {
  if (!error || typeof error !== 'object') return false;
  return (
    'statusCode' in error && typeof (error as { statusCode?: unknown }).statusCode === 'number'
  );
};

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

/**
 * Schema for updating a single company's allocation
 */
const CompanyAllocationUpdateSchema = z.object({
  company_id: z.number().int().positive(),
  planned_reserves_cents: z.number().int().min(0),
  allocation_cap_cents: z.number().int().min(0).optional().nullable(),
  allocation_reason: z.string().max(1000).optional().nullable(),
});

/**
 * Schema for POST /api/funds/:fundId/allocations request body
 * Includes optimistic locking with expected_version
 */
const UpdateAllocationRequestSchema = z
  .object({
    expected_version: z.number().int().min(1),
    updates: z.array(CompanyAllocationUpdateSchema).min(1).max(100),
  })
  .refine(
    (data) => {
      // Validate that allocation_cap >= planned_reserves when cap is set
      return data.updates.every((update) => {
        if (update.allocation_cap_cents !== null && update.allocation_cap_cents !== undefined) {
          return update.allocation_cap_cents >= update.planned_reserves_cents;
        }
        return true;
      });
    },
    {
      message: 'allocation_cap_cents must be >= planned_reserves_cents when set',
    }
  );

/**
 * Query parameter schema for company list endpoint
 */
const CompanyListQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('50')
    .refine((val) => val >= 1 && val <= 200, {
      message: 'Limit must be between 1 and 200',
    }),
  q: z.string().max(255).optional(), // Search query
  status: z.enum(['active', 'exited', 'written-off']).optional(),
  sector: z.string().max(100).optional(),
  stage: z.string().max(50).optional(), // Investment stage (will be normalized)
  sortBy: z.enum(['exit_moic_desc', 'planned_reserves_desc', 'name_asc']).default('exit_moic_desc'),
});

// ============================================================================
// Type Definitions
// ============================================================================

type _UpdateAllocationRequest = z.infer<typeof UpdateAllocationRequestSchema>;

interface _LatestAllocationResponse {
  fund_id: number;
  companies: Array<{
    company_id: number;
    company_name: string;
    sector: string;
    stage: string;
    status: string;
    invested_amount_cents: number;
    planned_reserves_cents: number;
    deployed_reserves_cents: number;
    allocation_cap_cents: number | null;
    allocation_reason: string | null;
    allocation_version: number;
    last_allocation_at: string | null;
  }>;
  metadata: {
    total_planned_cents: number;
    total_deployed_cents: number;
    companies_count: number;
    last_updated_at: string | null;
  };
}

interface _UpdateAllocationResponse {
  success: boolean;
  new_version: number;
  updated_count: number;
  conflicts?: Array<{
    company_id: number;
    expected_version: number;
    actual_version: number;
  }>;
}

interface CompanyListItem {
  id: number;
  name: string;
  sector: string;
  stage: string;
  status: 'active' | 'exited' | 'written-off';
  invested_cents: number;
  deployed_reserves_cents: number;
  planned_reserves_cents: number;
  exit_moic_bps: number | null;
  ownership_pct: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  last_allocation_at: string | null;
}

interface CompanyListResponse {
  companies: CompanyListItem[];
  pagination: {
    next_cursor: string | null;
    has_more: boolean;
    total_count?: number;
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

function safeAllocationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/password authentication failed|database|postgres|sql|connection/i.test(message)) {
    return 'Reserve allocation data is temporarily unavailable. Please retry after the data service is available.';
  }

  return 'Reserve allocation data is temporarily unavailable. Please retry.';
}

function parseActorUserId(req: Request): number | null {
  const rawUserId = req.user?.id as string | number | undefined;
  if (typeof rawUserId === 'number' && Number.isSafeInteger(rawUserId) && rawUserId > 0) {
    return rawUserId;
  }

  if (typeof rawUserId === 'string' && /^\d+$/.test(rawUserId)) {
    const parsed = Number(rawUserId);
    if (Number.isSafeInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * GET /api/funds/:fundId/companies
 *
 * List portfolio companies with allocation data
 *
 * Query Parameters:
 * - cursor: ID of last company from previous page (for pagination)
 * - limit: Number of results (default: 50, max: 200)
 * - q: Search query (company name, case-insensitive)
 * - status: Filter by company status
 * - sector: Filter by sector
 * - sortBy: Sort order (exit_moic_desc | planned_reserves_desc | name_asc)
 *
 * @returns {CompanyListResponse} List of companies with pagination
 * @throws {400} Invalid parameters
 * @throws {404} Fund not found
 */
router['get'](
  '/funds/:fundId/companies',
  asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const requestId = req.rid ?? 'unknown';

    // Validate fundId parameter
    const paramValidation = FundIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res['status'](400)['json']({
        error: 'invalid_fund_id',
        message: 'Fund ID must be a positive integer',
        details: paramValidation.error.format(),
      });
    }

    const { fundId } = paramValidation.data;

    // Validate query parameters
    const queryResult = CompanyListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res['status'](400)['json']({
        error: 'invalid_query_parameters',
        message: 'Invalid query parameters',
        details: queryResult.error.format(),
      });
    }

    const query = queryResult.data;

    // Validate and normalize stage filter if provided
    let normalizedStage: string | undefined;
    if (query.stage) {
      const validationStart = performance.now();
      const normalized = normalizeStage(query.stage);
      const duration = (performance.now() - validationStart) / 1000;
      recordValidationDuration('GET /api/funds/:fundId/companies', duration);

      if (!normalized) {
        const mode = await getStageValidationMode();
        recordUnknownStage('GET /api/funds/:fundId/companies', mode);
        setStageWarningHeaders(res, [query.stage]);

        if (mode === 'enforce') {
          return res['status'](400)['json']({
            error: 'invalid_query_parameters',
            message: 'Invalid investment stage in query parameters',
            details: {
              code: 'INVALID_STAGE',
              invalid: [query.stage],
              validStages: [...CANONICAL_STAGES],
            },
          });
        }
        // In 'warn' mode, pass through the original stage value
        normalizedStage = query.stage;
      } else {
        normalizedStage = normalized;
        recordValidationSuccess('GET /api/funds/:fundId/companies');
      }
    }

    // Build WHERE conditions
    const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

    // Cursor pagination (id < cursor for DESC ordering)
    if (query.cursor !== undefined) {
      conditions.push(lt(portfolioCompanies.id, query.cursor));
    }

    // Status filter
    if (query.status) {
      conditions.push(eq(portfolioCompanies.status, query.status));
    }

    // Sector filter
    if (query.sector) {
      conditions.push(eq(portfolioCompanies.sector, query.sector));
    }

    // Stage filter (using normalized stage)
    if (normalizedStage) {
      conditions.push(eq(portfolioCompanies.stage, normalizedStage));
    }

    // Search filter (case-insensitive LIKE)
    if (query.q) {
      conditions.push(sql`LOWER(${portfolioCompanies.name}) LIKE LOWER(${`%${query.q}%`})`);
    }

    // Build ORDER BY clause based on sortBy
    let orderBy;
    switch (query.sortBy) {
      case 'exit_moic_desc':
        // Sort by exit MOIC descending (nulls last), then by id DESC for cursor pagination
        orderBy = [
          sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
          desc(portfolioCompanies.id),
        ];
        break;
      case 'planned_reserves_desc':
        // Sort by planned reserves descending, then by id DESC
        orderBy = [desc(portfolioCompanies.plannedReservesCents), desc(portfolioCompanies.id)];
        break;
      case 'name_asc':
        // Sort by name ascending, then by id DESC
        orderBy = [asc(portfolioCompanies.name), desc(portfolioCompanies.id)];
        break;
      default:
        // Default to exit MOIC desc
        orderBy = [
          sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
          desc(portfolioCompanies.id),
        ];
    }

    // Fetch limit + 1 to detect if there are more results
    const fetchLimit = query.limit + 1;

    // Execute query using and() which properly preserves the query builder chain
    const results = await db
      .select({
        id: portfolioCompanies.id,
        name: portfolioCompanies.name,
        sector: portfolioCompanies.sector,
        stage: portfolioCompanies.stage,
        status: portfolioCompanies.status,
        investmentAmount: portfolioCompanies.investmentAmount,
        deployedReservesCents: portfolioCompanies.deployedReservesCents,
        plannedReservesCents: portfolioCompanies.plannedReservesCents,
        exitMoicBps: portfolioCompanies.exitMoicBps,
        ownershipCurrentPct: portfolioCompanies.ownershipCurrentPct,
        allocationCapCents: portfolioCompanies.allocationCapCents,
        allocationReason: portfolioCompanies.allocationReason,
        lastAllocationAt: portfolioCompanies.lastAllocationAt,
      })
      .from(portfolioCompanies)
      .where(and(...conditions))
      .orderBy(...orderBy)
      .limit(fetchLimit);

    // Check if we have more results
    const hasMore = results.length > query.limit;
    const companies = hasMore ? results.slice(0, query.limit) : results;

    // Get next cursor (last company ID)
    const nextCursor =
      hasMore && companies.length > 0 ? companies[companies.length - 1]!.id.toString() : null;

    // Convert database results to response format
    const responseCompanies: CompanyListItem[] = companies.map((row: (typeof results)[number]) => ({
      id: row.id,
      name: row.name,
      sector: row.sector,
      stage: row.stage,
      status: row.status as 'active' | 'exited' | 'written-off',
      invested_cents: Math.round(parseFloat(row.investmentAmount || '0') * 100), // Convert decimal dollars to cents
      deployed_reserves_cents: Number(row.deployedReservesCents || 0),
      planned_reserves_cents: Number(row.plannedReservesCents || 0),
      exit_moic_bps: row.exitMoicBps,
      ownership_pct: parseFloat(row.ownershipCurrentPct || '0'),
      allocation_cap_cents: row.allocationCapCents ? Number(row.allocationCapCents) : null,
      allocation_reason: row.allocationReason,
      last_allocation_at: row.lastAllocationAt ? row.lastAllocationAt.toISOString() : null,
    }));

    // Check if fund exists (if no results and no cursor, fund might not exist)
    if (companies.length === 0 && !query.cursor) {
      // Verify fund exists by checking if any companies exist for this fund
      const fundCheck = await db
        .select({ count: sql<number>`count(*)` })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId));

      const totalCompanies = fundCheck[0]?.count || 0;

      if (totalCompanies === 0) {
        return res['status'](404)['json']({
          error: 'fund_not_found',
          message: `Fund with ID ${fundId} not found or has no companies`,
        });
      }
    }

    const response: CompanyListResponse = {
      companies: responseCompanies,
      pagination: {
        next_cursor: nextCursor,
        has_more: hasMore,
        // Note: total_count is optional and expensive - omitted for performance
      },
    };

    // Log request metrics
    const duration = Date.now() - startTime;
    logger.info(
      {
        requestId,
        fundId,
        companyCount: companies.length,
        durationMs: duration,
      },
      'allocations company list served'
    );

    return res['status'](200)['json'](response);
  })
);

/**
 * GET /api/funds/:fundId/allocations/latest
 *
 * Retrieves the latest allocation state for all companies in a fund
 *
 * @returns {LatestAllocationResponse} Current allocation state with metadata
 * @throws {404} Fund not found
 * @throws {500} Database error
 */
router['get'](
  '/funds/:fundId/allocations/latest',
  asyncHandler(async (req: Request, res: Response) => {
    // Validate path parameter
    const paramValidation = FundIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res['status'](400)['json']({
        error: 'Invalid fund ID',
        details: paramValidation.error.format(),
      });
    }

    const { fundId } = paramValidation.data;

    try {
      const [fund] = await db
        .select({ id: funds.id })
        .from(funds)
        .where(eq(funds.id, fundId))
        .limit(1);

      if (!fund) {
        return res['status'](404)['json']({
          error: 'fund_not_found',
          message: `Fund with ID ${fundId} was not found`,
        });
      }

      const rows = await db
        .select({
          company_id: portfolioCompanies.id,
          company_name: portfolioCompanies.name,
          sector: portfolioCompanies.sector,
          stage: portfolioCompanies.stage,
          status: portfolioCompanies.status,
          invested_amount: portfolioCompanies.investmentAmount,
          planned_reserves_cents: portfolioCompanies.plannedReservesCents,
          deployed_reserves_cents: portfolioCompanies.deployedReservesCents,
          allocation_cap_cents: portfolioCompanies.allocationCapCents,
          allocation_reason: portfolioCompanies.allocationReason,
          allocation_version: portfolioCompanies.allocationVersion,
          last_allocation_at: portfolioCompanies.lastAllocationAt,
        })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId))
        .orderBy(asc(portfolioCompanies.id));

      const companies = rows.map((row) => ({
        company_id: row.company_id,
        company_name: row.company_name,
        sector: row.sector,
        stage: row.stage,
        status: row.status,
        invested_amount_cents: Math.round(parseFloat(row.invested_amount || '0') * 100),
        planned_reserves_cents: Number(row.planned_reserves_cents || 0),
        deployed_reserves_cents: Number(row.deployed_reserves_cents || 0),
        allocation_cap_cents:
          row.allocation_cap_cents != null ? Number(row.allocation_cap_cents) : null,
        allocation_reason: row.allocation_reason,
        allocation_version: row.allocation_version,
        last_allocation_at: row.last_allocation_at ? row.last_allocation_at.toISOString() : null,
      }));

      const total_planned_cents = companies.reduce((sum, c) => sum + c.planned_reserves_cents, 0);
      const total_deployed_cents = companies.reduce((sum, c) => sum + c.deployed_reserves_cents, 0);
      const last_updated_at =
        companies
          .map((c) => c.last_allocation_at)
          .filter((d): d is string => d !== null)
          .sort()
          .reverse()[0] || null;

      return res['status'](200)['json']({
        fund_id: fundId,
        companies,
        metadata: {
          total_planned_cents,
          total_deployed_cents,
          companies_count: companies.length,
          last_updated_at,
        },
      });
    } catch (error) {
      logger.warn(
        {
          requestId: req.rid ?? 'unknown',
          fundId,
          error: error instanceof Error ? error.message : String(error),
        },
        'latest allocation read failed'
      );

      return res['status'](503)['json']({
        error: 'allocation_data_unavailable',
        message: safeAllocationErrorMessage(error),
      });
    }
  })
);

/**
 * POST /api/funds/:fundId/allocations
 *
 * Updates allocations for one or more companies with optimistic locking
 *
 * @param {UpdateAllocationRequest} req.body - Allocation updates with expected version
 * @returns {UpdateAllocationResponse} Update result with conflicts if any
 * @throws {400} Invalid request data or validation failure
 * @throws {404} Fund or company not found
 * @throws {409} Version conflict (optimistic lock failure)
 * @throws {500} Database error
 */
router['post'](
  '/funds/:fundId/allocations',
  asyncHandler(async (req: Request, res: Response) => {
    // Validate path parameter
    const paramValidation = FundIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res['status'](400)['json']({
        error: 'Invalid fund ID',
        details: paramValidation.error.format(),
      });
    }

    // Validate request body
    const bodyValidation = UpdateAllocationRequestSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res['status'](400)['json']({
        error: 'Invalid request body',
        details: bodyValidation.error.format(),
      });
    }

    const { fundId } = paramValidation.data;
    const { expected_version, updates } = bodyValidation.data;

    // Get user ID from auth context (if available)
    const userId = parseActorUserId(req);

    // Execute updates in transaction
    const result = await transaction(async (client) => {
      const writeResult = await applyAllocationUpdates(client, {
        fundId,
        updates: updates.map((update) => ({
          company_id: update.company_id,
          planned_reserves_cents: update.planned_reserves_cents,
          allocation_cap_cents: update.allocation_cap_cents ?? null,
          allocation_reason: update.allocation_reason ?? null,
          expected_version,
        })),
        userId,
      });

      return {
        success: true,
        new_version: writeResult.new_version,
        updated_count: writeResult.updated_count,
      };
    });

    return res['status'](200)['json'](result);
  })
);

// ============================================================================
// Error Handler
// ============================================================================

/**
 * Custom error handler for allocation routes
 * Handles optimistic locking conflicts (409) and other errors
 */
router['use']((err: unknown, req: Request, res: Response, next: NextFunction) => {
  // Handle optimistic locking conflicts
  if (isHttpError(err) && err.statusCode === 409 && err.conflicts) {
    return res['status'](409)['json']({
      error: 'Version conflict',
      message: err.message,
      conflicts: err.conflicts,
    });
  }

  // Handle other HTTP errors
  if (isHttpError(err) && err.statusCode) {
    return res['status'](err.statusCode)['json']({
      error: err.statusCode === 404 ? 'fund_not_found' : 'allocation_error',
      message: err.message,
    });
  }

  // Pass to default error handler
  next(err);
});

export default router;
