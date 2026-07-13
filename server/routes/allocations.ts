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
import { eq, sql, desc, asc, and } from 'drizzle-orm';
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
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { storage } from '../storage';
import { AllocationCompanyActualsDriftV1Schema } from '@shared/contracts/allocations/allocation-actuals-drift-v1.contract';
import type { FundCompanyActualsFactsResponse } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import {
  buildAllocationActualsDrift,
  buildFailedAllocationActualsDrift,
} from '../services/allocations/allocation-actuals-drift-service.js';
import {
  buildFundCompanyActualsFacts,
  FundActualsFactsServiceError,
} from '../services/fund-actuals/fund-company-actuals-facts-service.js';

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

const DEFAULT_ALLOCATION_ERROR_MESSAGE =
  'Reserve allocation data is temporarily unavailable. Please retry.';
const DATA_SERVICE_ALLOCATION_ERROR_MESSAGE =
  'Reserve allocation data is temporarily unavailable. Please retry after the data service is available.';
const ALLOCATION_DATA_SERVICE_ERROR_PATTERNS = [
  /password authentication failed/i,
  /database/i,
  /postgres/i,
  /sql/i,
  /connection/i,
] as const;

interface AllocationErrorMapping {
  pattern: RegExp;
  message: string;
}

const ALLOCATION_ERROR_MAPPINGS = [
  ...ALLOCATION_DATA_SERVICE_ERROR_PATTERNS.map((pattern) => ({
    pattern,
    message: DATA_SERVICE_ALLOCATION_ERROR_MESSAGE,
  })),
] satisfies AllocationErrorMapping[];

// ============================================================================
// Validation Schemas
// ============================================================================

const COMPANY_LIST_CURSOR_BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;
const CompanyListSortBySchema = z.enum(['exit_moic_desc', 'planned_reserves_desc', 'name_asc']);

const LatestAllocationActualsDriftSummarySchema = z
  .object({
    facts_status: z.enum(['available', 'failed']),
    drifted_company_count: z.number().int().nonnegative(),
    material_company_count: z.number().int().nonnegative(),
    degraded_company_count: z.number().int().nonnegative(),
    facts_input_hash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    as_of_date: z.string().date(),
  })
  .strict();

const LatestAllocationCompanySchema = z
  .object({
    company_id: z.number().int().positive(),
    company_name: z.string(),
    sector: z.string(),
    stage: z.string(),
    status: z.string(),
    invested_amount_cents: z.number().int(),
    planned_reserves_cents: z.number().int(),
    deployed_reserves_cents: z.number().int(),
    allocation_cap_cents: z.number().int().nullable(),
    allocation_reason: z.string().nullable(),
    allocation_version: z.number().int().nonnegative(),
    last_allocation_at: z.string().datetime().nullable(),
    allocation_facts_missing: z.boolean(),
    missing_allocation_fields: z.array(z.string()),
    actuals_drift: AllocationCompanyActualsDriftV1Schema,
  })
  .strict();

const LatestAllocationResponseSchema = z
  .object({
    fund_id: z.number().int().positive(),
    companies: z.array(LatestAllocationCompanySchema),
    metadata: z
      .object({
        total_planned_cents: z.number().int(),
        total_deployed_cents: z.number().int(),
        companies_count: z.number().int().nonnegative(),
        allocation_facts_missing_count: z.number().int().nonnegative(),
        last_updated_at: z.string().datetime().nullable(),
        actuals_drift_summary: LatestAllocationActualsDriftSummarySchema,
      })
      .strict(),
  })
  .strict();

type CompanyListSortBy = z.infer<typeof CompanyListSortBySchema>;
type CompanyListCursorKey = string | number | null;

interface CompanyListCursor {
  k: CompanyListCursorKey;
  id: number;
}

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
const CompanyListQuerySchema = z
  .object({
    cursor: z
      .string()
      .transform((value, context) => {
        const decoded = decodeCompanyListCursor(value);
        if (!decoded) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Invalid cursor',
          });
          return z.NEVER;
        }
        return decoded;
      })
      .optional(),
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
    sortBy: CompanyListSortBySchema.default('exit_moic_desc'),
  })
  .superRefine((query, context) => {
    if (query.cursor && !isCompanyListCursorCompatible(query.cursor, query.sortBy)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cursor'],
        message: 'Cursor does not match sort order',
      });
    }
  });

// ============================================================================
// Type Definitions
// ============================================================================

type _UpdateAllocationRequest = z.infer<typeof UpdateAllocationRequestSchema>;

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
  fundId: number;
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

interface CompanyListSourceRow {
  id: number;
  fundId: number | null;
  name: string;
  sector: string;
  stage: string;
  status: string | null;
  investmentAmount: string | number | null;
  deployedReservesCents?: number | bigint | null;
  plannedReservesCents?: number | bigint | null;
  exitMoicBps?: number | null;
  ownershipCurrentPct?: string | number | null;
  allocationCapCents?: number | bigint | null;
  allocationReason?: string | null;
  lastAllocationAt?: Date | string | null;
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

function decodeCompanyListCursor(cursor: string): CompanyListCursor | null {
  if (!COMPANY_LIST_CURSOR_BASE64URL_PATTERN.test(cursor)) {
    return null;
  }

  try {
    const decoded = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(decoded) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }

    const payload = parsed as Record<string, unknown>;
    const id = payload['id'];
    const key = payload['k'];

    if (!Object.prototype.hasOwnProperty.call(payload, 'k')) {
      return null;
    }

    if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
      return null;
    }

    if (
      key !== null &&
      typeof key !== 'string' &&
      (typeof key !== 'number' || !Number.isFinite(key))
    ) {
      return null;
    }

    return { k: key as CompanyListCursorKey, id };
  } catch {
    return null;
  }
}

function isCompanyListCursorCompatible(
  cursor: CompanyListCursor,
  sortBy: CompanyListSortBy
): boolean {
  if (sortBy === 'name_asc') {
    return typeof cursor.k === 'string';
  }

  if (sortBy === 'planned_reserves_desc') {
    return typeof cursor.k === 'number';
  }

  return cursor.k === null || typeof cursor.k === 'number';
}

function allocationErrorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function findAllocationErrorMapping(message: string): AllocationErrorMapping | undefined {
  return ALLOCATION_ERROR_MAPPINGS.find((mapping) => mapping.pattern.test(message));
}

function allocationErrorMappingMessage(mapping: AllocationErrorMapping | undefined): string {
  return mapping?.message ?? DEFAULT_ALLOCATION_ERROR_MESSAGE;
}

async function loadAllocationActualsFacts(input: {
  fundId: number;
  asOfDate: string;
  requestId: string;
}): Promise<FundCompanyActualsFactsResponse | null> {
  try {
    return await buildFundCompanyActualsFacts({
      fundId: input.fundId,
      asOfDate: input.asOfDate,
    });
  } catch (error) {
    logger.warn(
      {
        requestId: input.requestId,
        fundId: input.fundId,
        errorCode:
          error instanceof FundActualsFactsServiceError ? error.code : 'unexpected_facts_error',
        error: error instanceof Error ? error.message : String(error),
      },
      'actuals facts unavailable for latest allocation read'
    );
    return null;
  }
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

function missingAllocationFields(row: {
  planned_reserves_cents: number | bigint | string | null;
  deployed_reserves_cents: number | bigint | string | null;
  allocation_version: number | null;
}): string[] {
  const fields: string[] = [];
  if (row.planned_reserves_cents == null) fields.push('planned_reserves_cents');
  if (row.deployed_reserves_cents == null) fields.push('deployed_reserves_cents');
  if (row.allocation_version == null) fields.push('allocation_version');
  return fields;
}

function normalizeCompanyListStatus(status: string | null | undefined): CompanyListItem['status'] {
  return status === 'exited' || status === 'written-off' ? status : 'active';
}

function isoDateOrNull(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  return value instanceof Date ? value.toISOString() : value;
}

function plannedReservesSortValue(company: object): number {
  if ('plannedReservesCents' in company) {
    return Number(company.plannedReservesCents ?? 0);
  }

  return 0;
}

function exitMoicSortKey(company: object): number | null {
  if ('exitMoicBps' in company) {
    if (company.exitMoicBps == null) {
      return null;
    }
    const value = Number(company.exitMoicBps);
    return Number.isFinite(value) ? value : null;
  }

  return null;
}

function companyListSortKey(
  company: CompanyListSourceRow,
  sortBy: CompanyListSortBy
): CompanyListCursorKey {
  if (sortBy === 'name_asc') {
    return company.name;
  }

  if (sortBy === 'planned_reserves_desc') {
    return plannedReservesSortValue(company);
  }

  return exitMoicSortKey(company);
}

function compareNullableNumberDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) {
    return 0;
  }
  if (left === null) {
    return 1;
  }
  if (right === null) {
    return -1;
  }
  return right - left;
}

function compareCompanyListRows(
  left: CompanyListSourceRow,
  right: CompanyListSourceRow,
  sortBy: CompanyListSortBy
): number {
  if (sortBy === 'name_asc') {
    return left.name.localeCompare(right.name) || right.id - left.id;
  }

  if (sortBy === 'planned_reserves_desc') {
    return plannedReservesSortValue(right) - plannedReservesSortValue(left) || right.id - left.id;
  }

  return (
    compareNullableNumberDesc(exitMoicSortKey(left), exitMoicSortKey(right)) || right.id - left.id
  );
}

function isAfterCompanyListCursor(
  company: CompanyListSourceRow,
  cursor: CompanyListCursor,
  sortBy: CompanyListSortBy
): boolean {
  const key = companyListSortKey(company, sortBy);

  if (sortBy === 'name_asc') {
    return (
      typeof key === 'string' &&
      typeof cursor.k === 'string' &&
      (key.localeCompare(cursor.k) > 0 || (key === cursor.k && company.id < cursor.id))
    );
  }

  if (sortBy === 'planned_reserves_desc') {
    return (
      typeof key === 'number' &&
      typeof cursor.k === 'number' &&
      (key < cursor.k || (key === cursor.k && company.id < cursor.id))
    );
  }

  if (cursor.k === null) {
    return key === null && company.id < cursor.id;
  }

  return (
    typeof cursor.k === 'number' &&
    (key === null ||
      (typeof key === 'number' && (key < cursor.k || (key === cursor.k && company.id < cursor.id))))
  );
}

function encodeCompanyListCursor(company: CompanyListSourceRow, sortBy: CompanyListSortBy): string {
  return Buffer.from(
    JSON.stringify({ k: companyListSortKey(company, sortBy), id: company.id })
  ).toString('base64url');
}

function requireCompanyListCursorNumberKey(cursor: CompanyListCursor): number {
  if (typeof cursor.k !== 'number') {
    throw new Error('Invalid numeric company-list cursor key');
  }
  return cursor.k;
}

function requireCompanyListCursorStringKey(cursor: CompanyListCursor): string {
  if (typeof cursor.k !== 'string') {
    throw new Error('Invalid string company-list cursor key');
  }
  return cursor.k;
}

function companyListCursorPredicate(cursor: CompanyListCursor, sortBy: CompanyListSortBy): SQL {
  if (sortBy === 'planned_reserves_desc') {
    const key = requireCompanyListCursorNumberKey(cursor);
    return sql`(${portfolioCompanies.plannedReservesCents}, ${portfolioCompanies.id}) < (${key}, ${cursor.id})`;
  }

  if (sortBy === 'name_asc') {
    const key = requireCompanyListCursorStringKey(cursor);
    return sql`(${portfolioCompanies.name}, -${portfolioCompanies.id}) > (${key}, ${-cursor.id})`;
  }

  if (cursor.k === null) {
    return sql`${portfolioCompanies.exitMoicBps} IS NULL AND ${portfolioCompanies.id} < ${cursor.id}`;
  }

  const key = requireCompanyListCursorNumberKey(cursor);
  return sql`((${portfolioCompanies.exitMoicBps}, ${portfolioCompanies.id}) < (${key}, ${cursor.id}) OR ${portfolioCompanies.exitMoicBps} IS NULL)`;
}

function companyListItemFromRow(row: CompanyListSourceRow, fundId: number): CompanyListItem {
  return {
    id: row.id,
    fundId: row.fundId ?? fundId,
    name: row.name,
    sector: row.sector,
    stage: row.stage,
    status: normalizeCompanyListStatus(row.status),
    invested_cents: Math.round(parseFloat(String(row.investmentAmount ?? '0')) * 100),
    deployed_reserves_cents: Number(row.deployedReservesCents ?? 0),
    planned_reserves_cents: Number(row.plannedReservesCents ?? 0),
    exit_moic_bps: row.exitMoicBps ?? null,
    ownership_pct: parseFloat(String(row.ownershipCurrentPct ?? '0')),
    allocation_cap_cents: row.allocationCapCents != null ? Number(row.allocationCapCents) : null,
    allocation_reason: row.allocationReason ?? null,
    last_allocation_at: isoDateOrNull(row.lastAllocationAt),
  };
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
 * - cursor: Opaque cursor from previous page (for pagination)
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
      return res.status(400).json({
        error: 'invalid_fund_id',
        message: 'Fund ID must be a positive integer',
        details: paramValidation.error.format(),
      });
    }

    const { fundId } = paramValidation.data;
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    // Validate query parameters
    const queryResult = CompanyListQuerySchema.safeParse(req.query);
    if (!queryResult.success) {
      return res.status(400).json({
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
          return res.status(400).json({
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

    if (storage.kind === 'memory') {
      const storedAll = await storage.getPortfolioCompanies(fundId);

      if (storedAll.length === 0 && query.cursor === undefined) {
        return res.status(404).json({
          error: 'fund_not_found',
          message: `Fund with ID ${fundId} not found or has no companies`,
        });
      }

      const sorted = storedAll
        .filter((company) => {
          if (query.cursor && !isAfterCompanyListCursor(company, query.cursor, query.sortBy)) {
            return false;
          }
          if (query.status && normalizeCompanyListStatus(company.status) !== query.status) {
            return false;
          }
          if (query.sector && company.sector !== query.sector) {
            return false;
          }
          if (normalizedStage && company.stage !== normalizedStage) {
            return false;
          }
          if (query.q && !company.name.toLowerCase().includes(query.q.toLowerCase())) {
            return false;
          }
          return true;
        })
        .sort((left, right) => compareCompanyListRows(left, right, query.sortBy));

      const memHasMore = sorted.length > query.limit;
      const page = memHasMore ? sorted.slice(0, query.limit) : sorted;
      const memNextCursor =
        memHasMore && page.length > 0
          ? encodeCompanyListCursor(page[page.length - 1]!, query.sortBy)
          : null;
      const responseCompanies = page.map((company) => companyListItemFromRow(company, fundId));

      const response: CompanyListResponse = {
        companies: responseCompanies,
        pagination: {
          next_cursor: memNextCursor,
          has_more: memHasMore,
          // Note: total_count is optional and expensive - omitted for performance
        },
      };

      // Log request metrics
      const duration = Date.now() - startTime;
      logger.info(
        {
          requestId,
          fundId,
          companyCount: responseCompanies.length,
          durationMs: duration,
        },
        'allocations company list served'
      );

      return res.status(200).json(response);
    }

    // Build WHERE conditions
    const conditions: SQL[] = [eq(portfolioCompanies.fundId, fundId)];

    // Cursor pagination follows the active ORDER BY key plus id DESC tiebreaker.
    if (query.cursor !== undefined) {
      conditions.push(companyListCursorPredicate(query.cursor, query.sortBy));
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
        fundId: portfolioCompanies.fundId,
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

    // Get next cursor from the last row's active sort key and id.
    const nextCursor =
      hasMore && companies.length > 0
        ? encodeCompanyListCursor(companies[companies.length - 1]!, query.sortBy)
        : null;

    // Convert database results to response format
    const responseCompanies: CompanyListItem[] = companies.map((row: (typeof results)[number]) =>
      companyListItemFromRow(row, fundId)
    );

    if (responseCompanies.length === 0 && query.cursor === undefined) {
      // Verify fund exists by checking if any companies exist for this fund
      const fundCheck = await db
        .select({ count: sql<number>`count(*)` })
        .from(portfolioCompanies)
        .where(eq(portfolioCompanies.fundId, fundId));

      const totalCompanies = fundCheck[0]?.count || 0;

      if (totalCompanies === 0) {
        return res.status(404).json({
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
        companyCount: responseCompanies.length,
        durationMs: duration,
      },
      'allocations company list served'
    );

    return res.status(200).json(response);
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
      return res.status(400).json({
        error: 'Invalid fund ID',
        details: paramValidation.error.format(),
      });
    }

    const { fundId } = paramValidation.data;
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    try {
      const [fund] = await db
        .select({ id: funds.id })
        .from(funds)
        .where(eq(funds.id, fundId))
        .limit(1);

      if (!fund) {
        return res.status(404).json({
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

      const asOfDate = new Date().toISOString().slice(0, 10);
      const actualsFacts = await loadAllocationActualsFacts({
        fundId,
        asOfDate,
        requestId: req.rid ?? 'unknown',
      });
      const factsByCompanyId = new Map(
        actualsFacts?.facts.map((fact) => [fact.companyId, fact]) ?? []
      );

      const companies = rows.map((row) => {
        const missingFields = missingAllocationFields(row);
        const plannedReservesCents =
          row.planned_reserves_cents != null ? Number(row.planned_reserves_cents) : 0;
        const deployedReservesCents =
          row.deployed_reserves_cents != null ? Number(row.deployed_reserves_cents) : 0;
        const allocationVersion = row.allocation_version ?? 0;
        const driftAllocationVersion = allocationVersion > 0 ? allocationVersion : 1;
        const driftInput = {
          allocation: {
            companyId: row.company_id,
            deployedReservesCents,
            investmentAmount: row.invested_amount || '0',
            allocationVersion: driftAllocationVersion,
            lastAllocationAt: row.last_allocation_at,
          },
          asOfDate,
        };
        const actualsDrift =
          actualsFacts === null
            ? buildFailedAllocationActualsDrift(driftInput)
            : buildAllocationActualsDrift({
                ...driftInput,
                fact: factsByCompanyId.get(row.company_id) ?? null,
              });

        return {
          company_id: row.company_id,
          company_name: row.company_name,
          sector: row.sector,
          stage: row.stage,
          status: row.status,
          invested_amount_cents: Math.round(parseFloat(row.invested_amount || '0') * 100),
          planned_reserves_cents: plannedReservesCents,
          deployed_reserves_cents: deployedReservesCents,
          allocation_cap_cents:
            row.allocation_cap_cents != null ? Number(row.allocation_cap_cents) : null,
          allocation_reason: row.allocation_reason,
          allocation_version: allocationVersion,
          last_allocation_at: row.last_allocation_at ? row.last_allocation_at.toISOString() : null,
          allocation_facts_missing: missingFields.length > 0,
          missing_allocation_fields: missingFields,
          actuals_drift: actualsDrift,
        };
      });

      const total_planned_cents = companies.reduce((sum, c) => sum + c.planned_reserves_cents, 0);
      const total_deployed_cents = companies.reduce((sum, c) => sum + c.deployed_reserves_cents, 0);
      const last_updated_at =
        companies
          .map((c) => c.last_allocation_at)
          .filter((d): d is string => d !== null)
          .sort()
          .reverse()[0] || null;

      const response = LatestAllocationResponseSchema.parse({
        fund_id: fundId,
        companies,
        metadata: {
          total_planned_cents,
          total_deployed_cents,
          companies_count: companies.length,
          allocation_facts_missing_count: companies.filter((c) => c.allocation_facts_missing)
            .length,
          last_updated_at,
          actuals_drift_summary: {
            facts_status: actualsFacts === null ? 'failed' : 'available',
            drifted_company_count: companies.filter((company) =>
              company.actuals_drift.comparisons.some((comparison) => comparison.state === 'drifted')
            ).length,
            material_company_count: companies.filter((company) =>
              company.actuals_drift.comparisons.some((comparison) => comparison.material)
            ).length,
            degraded_company_count: companies.filter(
              (company) => company.actuals_drift.trustState !== 'LIVE'
            ).length,
            facts_input_hash: actualsFacts?.inputHash ?? null,
            as_of_date: asOfDate,
          },
        },
      });

      return res.status(200).json(response);
    } catch (error) {
      logger.warn(
        {
          requestId: req.rid ?? 'unknown',
          fundId,
          error: error instanceof Error ? error.message : String(error),
        },
        'latest allocation read failed'
      );

      return res.status(503).json({
        error: 'allocation_data_unavailable',
        message: allocationErrorMappingMessage(
          findAllocationErrorMapping(allocationErrorText(error))
        ),
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
      return res.status(400).json({
        error: 'Invalid fund ID',
        details: paramValidation.error.format(),
      });
    }

    // Validate request body
    const bodyValidation = UpdateAllocationRequestSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.format(),
      });
    }

    const { fundId } = paramValidation.data;
    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

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

    return res.status(200).json(result);
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
    return res.status(409).json({
      error: 'Version conflict',
      message: err.message,
      conflicts: err.conflicts,
    });
  }

  // Handle other HTTP errors
  if (isHttpError(err) && err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.statusCode === 404 ? 'fund_not_found' : 'allocation_error',
      message: err.message,
    });
  }

  // Pass to default error handler
  next(err);
});

export default router;
