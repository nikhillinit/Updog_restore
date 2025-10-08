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
import type { PoolClient } from 'pg';
import { db } from '../db';
import { portfolioCompanies } from '@shared/schema';
import { eq, and, lt, sql, desc, asc, SQL } from 'drizzle-orm';

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
const UpdateAllocationRequestSchema = z.object({
  expected_version: z.number().int().min(1),
  updates: z.array(CompanyAllocationUpdateSchema).min(1).max(100),
}).refine(
  (data) => {
    // Validate that allocation_cap >= planned_reserves when cap is set
    return data.updates.every(update => {
      if (update.allocation_cap_cents !== null && update.allocation_cap_cents !== undefined) {
        return update.allocation_cap_cents >= update.planned_reserves_cents;
      }
      return true;
    });
  },
  {
    message: "allocation_cap_cents must be >= planned_reserves_cents when set",
  }
);

/**
 * Schema for validating fundId path parameter
 */
const FundIdParamSchema = z.object({
  fundId: z.string().regex(/^\d+$/).transform(Number),
});

/**
 * Query parameter schema for company list endpoint
 */
const CompanyListQuerySchema = z.object({
  cursor: z.string().regex(/^\d+$/).transform(Number).optional(),
  limit: z.string()
    .regex(/^\d+$/)
    .transform(Number)
    .default('50')
    .refine(val => val >= 1 && val <= 200, {
      message: 'Limit must be between 1 and 200'
    }),
  q: z.string().max(255).optional(), // Search query
  status: z.enum(['active', 'exited', 'written-off']).optional(),
  sector: z.string().max(100).optional(),
  sortBy: z.enum(['exit_moic_desc', 'planned_reserves_desc', 'name_asc']).default('exit_moic_desc'),
});

// ============================================================================
// Type Definitions
// ============================================================================

type CompanyAllocationUpdate = z.infer<typeof CompanyAllocationUpdateSchema>;
type UpdateAllocationRequest = z.infer<typeof UpdateAllocationRequestSchema>;

interface CompanyAllocationRow {
  company_id: number;
  company_name: string;
  planned_reserves_cents: string;
  deployed_reserves_cents: string;
  allocation_cap_cents: string | null;
  allocation_reason: string | null;
  allocation_version: number;
  last_allocation_at: Date | null;
}

interface LatestAllocationResponse {
  fund_id: number;
  companies: Array<{
    company_id: number;
    company_name: string;
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

interface UpdateAllocationResponse {
  success: boolean;
  new_version: number;
  updated_count: number;
  conflicts?: Array<{
    company_id: number;
    expected_version: number;
    actual_version: number;
  }>;
}

interface ConflictInfo {
  company_id: number;
  expected_version: number;
  actual_version: number;
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

/**
 * Verify that a fund exists and return its ID
 * @throws {Error} with 404 status if fund not found
 */
async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const fundCheck = await client.query(
    'SELECT id FROM funds WHERE id = $1',
    [fundId]
  );

  if (fundCheck.rows.length === 0) {
    const error: any = new Error(`Fund ${fundId} not found`);
    error.statusCode = 404;
    throw error;
  }
}

/**
 * Verify that all company IDs belong to the specified fund
 * @throws {Error} with 404 status if any company not found or doesn't belong to fund
 */
async function verifyCompaniesInFund(
  client: PoolClient,
  fundId: number,
  companyIds: number[]
): Promise<void> {
  const companyCheck = await client.query(
    `SELECT id FROM portfoliocompanies
     WHERE fund_id = $1 AND id = ANY($2::int[])`,
    [fundId, companyIds]
  );

  if (companyCheck.rows.length !== companyIds.length) {
    const foundIds = companyCheck.rows.map((r: any) => r.id);
    const missingIds = companyIds.filter(id => !foundIds.includes(id));
    const error: any = new Error(
      `Companies not found in fund ${fundId}: ${missingIds.join(', ')}`
    );
    error.statusCode = 404;
    throw error;
  }
}

/**
 * Update a single company's allocation with version check
 * Returns null if successful, or conflict info if version mismatch
 */
async function updateCompanyAllocation(
  client: PoolClient,
  fundId: number,
  expectedVersion: number,
  update: CompanyAllocationUpdate,
  userId: number | null
): Promise<ConflictInfo | null> {
  // First, check the current version with row lock
  const versionCheck = await client.query(
    `SELECT allocation_version
     FROM portfoliocompanies
     WHERE fund_id = $1 AND id = $2
     FOR UPDATE`,
    [fundId, update.company_id]
  );

  if (versionCheck.rows.length === 0) {
    const error: any = new Error(`Company ${update.company_id} not found in fund ${fundId}`);
    error.statusCode = 404;
    throw error;
  }

  const currentVersion = versionCheck.rows[0].allocation_version;

  // Check for version conflict
  if (currentVersion !== expectedVersion) {
    return {
      company_id: update.company_id,
      expected_version: expectedVersion,
      actual_version: currentVersion,
    };
  }

  // Version matches - proceed with update
  const result = await client.query(
    `UPDATE portfoliocompanies
     SET
       planned_reserves_cents = $1,
       allocation_cap_cents = $2,
       allocation_reason = $3,
       allocation_version = allocation_version + 1,
       last_allocation_at = NOW()
     WHERE fund_id = $4 AND id = $5 AND allocation_version = $6
     RETURNING allocation_version`,
    [
      update.planned_reserves_cents,
      update.allocation_cap_cents,
      update.allocation_reason,
      fundId,
      update.company_id,
      expectedVersion,
    ]
  );

  // Double-check that update succeeded
  if (result.rows.length === 0) {
    // This should not happen due to FOR UPDATE lock, but handle it anyway
    return {
      company_id: update.company_id,
      expected_version: expectedVersion,
      actual_version: currentVersion,
    };
  }

  return null; // Success
}

/**
 * Log allocation change to fund_events table for audit trail
 */
async function logAllocationEvent(
  client: PoolClient,
  fundId: number,
  userId: number | null,
  updates: CompanyAllocationUpdate[],
  newVersion: number
): Promise<void> {
  await client.query(
    `INSERT INTO fund_events
     (fund_id, event_type, payload, user_id, event_time, operation, entity_type, metadata)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
    [
      fundId,
      'ALLOCATION_UPDATED',
      JSON.stringify({
        updates,
        new_version: newVersion,
        update_count: updates.length,
      }),
      userId,
      'UPDATE',
      'allocation',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        company_count: updates.length,
      }),
    ]
  );
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
router.get('/funds/:fundId/companies', asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = (req as any).rid || 'unknown';

  // Validate fundId parameter
  const paramValidation = FundIdParamSchema.safeParse(req.params);
  if (!paramValidation.success) {
    return res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
      details: paramValidation.error.format()
    });
  }

  const { fundId } = paramValidation.data;

  // Validate query parameters
  const queryResult = CompanyListQuerySchema.safeParse(req.query);
  if (!queryResult.success) {
    return res.status(400).json({
      error: 'invalid_query_parameters',
      message: 'Invalid query parameters',
      details: queryResult.error.format()
    });
  }

  const query = queryResult.data;

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

  // Search filter (case-insensitive LIKE)
  if (query.q) {
    conditions.push(sql`LOWER(${portfolioCompanies.name}) LIKE LOWER(${'%' + query.q + '%'})`);
  }

  // Build ORDER BY clause based on sortBy
  let orderBy: SQL[];
  switch (query.sortBy) {
    case 'exit_moic_desc':
      // Sort by exit MOIC descending (nulls last), then by id DESC for cursor pagination
      orderBy = [
        sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
        desc(portfolioCompanies.id)
      ];
      break;
    case 'planned_reserves_desc':
      // Sort by planned reserves descending, then by id DESC
      orderBy = [
        desc(portfolioCompanies.plannedReservesCents),
        desc(portfolioCompanies.id)
      ];
      break;
    case 'name_asc':
      // Sort by name ascending, then by id DESC
      orderBy = [
        asc(portfolioCompanies.name),
        desc(portfolioCompanies.id)
      ];
      break;
    default:
      // Default to exit MOIC desc
      orderBy = [
        sql`${portfolioCompanies.exitMoicBps} DESC NULLS LAST`,
        desc(portfolioCompanies.id)
      ];
  }

  // Fetch limit + 1 to detect if there are more results
  const fetchLimit = query.limit + 1;

  // Execute query
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
  const nextCursor = hasMore && companies.length > 0
    ? companies[companies.length - 1].id.toString()
    : null;

  // Convert database results to response format
  const responseCompanies: CompanyListItem[] = companies.map((row: typeof results[number]) => ({
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
      return res.status(404).json({
        error: 'fund_not_found',
        message: `Fund with ID ${fundId} not found or has no companies`
      });
    }
  }

  const response: CompanyListResponse = {
    companies: responseCompanies,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      // Note: total_count is optional and expensive - omitted for performance
    }
  };

  // Log request metrics
  const duration = Date.now() - startTime;
  console.log(`[${requestId}] GET /api/funds/${fundId}/companies - ${companies.length} results in ${duration}ms`);

  return res.status(200).json(response);
}));

/**
 * GET /api/funds/:fundId/allocations/latest
 *
 * Retrieves the latest allocation state for all companies in a fund
 *
 * @returns {LatestAllocationResponse} Current allocation state with metadata
 * @throws {404} Fund not found
 * @throws {500} Database error
 */
router.get(
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

    // Execute query in transaction for consistency
    const result = await transaction(async (client) => {
      // Verify fund exists
      await verifyFundExists(client, fundId);

      // Get all companies with their allocation data
      const companiesResult = await client.query<CompanyAllocationRow>(
        `SELECT
           id as company_id,
           name as company_name,
           planned_reserves_cents,
           deployed_reserves_cents,
           allocation_cap_cents,
           allocation_reason,
           allocation_version,
           last_allocation_at
         FROM portfoliocompanies
         WHERE fund_id = $1
         ORDER BY id ASC`,
        [fundId]
      );

      // Convert database strings to numbers
      const companies = companiesResult.rows.map(row => ({
        company_id: row.company_id,
        company_name: row.company_name,
        planned_reserves_cents: parseInt(row.planned_reserves_cents, 10),
        deployed_reserves_cents: parseInt(row.deployed_reserves_cents, 10),
        allocation_cap_cents: row.allocation_cap_cents ? parseInt(row.allocation_cap_cents, 10) : null,
        allocation_reason: row.allocation_reason,
        allocation_version: row.allocation_version,
        last_allocation_at: row.last_allocation_at ? row.last_allocation_at.toISOString() : null,
      }));

      // Calculate metadata
      const total_planned_cents = companies.reduce(
        (sum, c) => sum + c.planned_reserves_cents,
        0
      );
      const total_deployed_cents = companies.reduce(
        (sum, c) => sum + c.deployed_reserves_cents,
        0
      );
      const last_updated_at = companies
        .map(c => c.last_allocation_at)
        .filter((d): d is string => d !== null)
        .sort()
        .reverse()[0] || null;

      return {
        fund_id: fundId,
        companies,
        metadata: {
          total_planned_cents,
          total_deployed_cents,
          companies_count: companies.length,
          last_updated_at,
        },
      };
    });

    return res.status(200).json(result);
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
router.post(
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
    const { expected_version, updates } = bodyValidation.data;

    // Get user ID from auth context (if available)
    const userId = (req as any).user?.id || null;

    // Execute updates in transaction
    const result = await transaction(async (client) => {
      // Verify fund exists
      await verifyFundExists(client, fundId);

      // Verify all companies belong to the fund
      const companyIds = updates.map(u => u.company_id);
      await verifyCompaniesInFund(client, fundId, companyIds);

      // Update each company and collect conflicts
      const conflicts: ConflictInfo[] = [];
      let successCount = 0;

      for (const update of updates) {
        const conflict = await updateCompanyAllocation(
          client,
          fundId,
          expected_version,
          update,
          userId
        );

        if (conflict) {
          conflicts.push(conflict);
        } else {
          successCount++;
        }
      }

      // If any conflicts occurred, rollback and return conflict details
      if (conflicts.length > 0) {
        throw {
          statusCode: 409,
          conflicts,
          message: `Version conflict: ${conflicts.length} companies have been updated by another user`,
        };
      }

      // All updates succeeded - log the event
      const newVersion = expected_version + 1;
      await logAllocationEvent(client, fundId, userId, updates, newVersion);

      return {
        success: true,
        new_version: newVersion,
        updated_count: successCount,
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
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  // Handle optimistic locking conflicts
  if (err.statusCode === 409 && err.conflicts) {
    return res.status(409).json({
      error: 'Version conflict',
      message: err.message,
      conflicts: err.conflicts,
    });
  }

  // Handle other HTTP errors
  if (err.statusCode) {
    return res.status(err.statusCode).json({
      error: err.message,
    });
  }

  // Pass to default error handler
  next(err);
});

export default router;
