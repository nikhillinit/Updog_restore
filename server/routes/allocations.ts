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
import { logger } from '../lib/logger.js';
import { applyAllocationUpdates } from '../services/allocation-write-service.js';
import { FundIdParamSchema } from '@shared/schemas/portfolio-route';
// Stage normalization and validation
import { normalizeStage, CANONICAL_STAGES } from '@shared/schemas/parse-stage-distribution';
import { getStageValidationMode } from '../lib/stage-validation-mode';
import {
  recordValidationDuration,
  recordValidationSuccess,
  recordUnknownStage,
} from '../observability/stage-metrics';
import { setStageWarningHeaders } from '../middleware/deprecation-headers';
import { PARTNER_WRITE_ROLES } from '@shared/auth/effective-roles';
import { requireWriteRole } from '../lib/auth/jwt';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import {
  decodeCompanyListCursor,
  isCompanyListCursorCompatible,
} from '../services/allocations/company-list-cursor.js';
import {
  allocationReadService,
  type CompanyListReadInput,
} from '../services/allocations/allocation-read-service.js';

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
const requirePartnerWrite = requireWriteRole(PARTNER_WRITE_ROLES);

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

const CompanyListSortBySchema = z.enum(['exit_moic_desc', 'planned_reserves_desc', 'name_asc']);

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

// ============================================================================
// Helper Functions
// ============================================================================

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

    const readInput: CompanyListReadInput = {
      fundId,
      limit: query.limit,
      sortBy: query.sortBy,
      ...(query.cursor !== undefined ? { cursor: query.cursor } : {}),
      ...(query.q !== undefined ? { q: query.q } : {}),
      ...(query.status !== undefined ? { status: query.status } : {}),
      ...(query.sector !== undefined ? { sector: query.sector } : {}),
      ...(normalizedStage !== undefined ? { stage: normalizedStage } : {}),
    };
    const result = await allocationReadService.listCompanies(readInput);

    if (result.kind === 'not_found') {
      return res.status(404).json({
        error: 'fund_not_found',
        message: `Fund with ID ${fundId} not found or has no companies`,
      });
    }

    // Log request metrics
    const duration = Date.now() - startTime;
    logger.info(
      {
        requestId,
        fundId,
        companyCount: result.response.companies.length,
        durationMs: duration,
      },
      'allocations company list served'
    );

    return res.status(200).json(result.response);
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
      const response = await allocationReadService.getLatest({
        fundId,
        requestId: req.rid ?? 'unknown',
      });

      if (!response) {
        return res.status(404).json({
          error: 'fund_not_found',
          message: `Fund with ID ${fundId} was not found`,
        });
      }

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
  requirePartnerWrite,
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
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) {
      return;
    }

    // Validate request body
    const bodyValidation = UpdateAllocationRequestSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: bodyValidation.error.format(),
      });
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
