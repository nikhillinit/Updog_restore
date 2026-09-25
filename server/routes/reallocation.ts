/**
 * Fund Reallocation API (Phase 1b)
 *
 * Implements preview and commit endpoints for reserve reallocation with:
 * - Optimistic locking (version-based)
 * - Transaction safety
 * - Warning detection (cap exceeded, concentration risk, etc.)
 * - Comprehensive audit logging
 *
 * @module server/routes/reallocation
 */

import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { parseFundIdParam } from '@shared/number';
import { PARTNER_WRITE_ROLES } from '@shared/auth/effective-roles';
import { query, transaction, type PoolClient } from '../db/index';
import { dollarsToCents, centsToDollars } from '@shared/units';
import { firstString, getUserId } from '../lib/request-values';
import { createRouteLogger } from '../lib/route-logger.js';
import { requireWriteRole } from '../lib/auth/jwt';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';

const routeLog = createRouteLogger('reallocation');
const requirePartnerWrite = requireWriteRole(PARTNER_WRITE_ROLES);

const router = Router();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

/**
 * Proposed allocation for a single company
 */
const ProposedAllocationSchema = z.object({
  company_id: z.number().int().positive(),
  planned_reserves_cents: z.number().int().nonnegative(),
  allocation_cap_cents: z.number().int().nonnegative().optional(),
  expected_version: z.number().int().positive(),
});

/**
 * Shared request body for preview and commit endpoints
 */
const ReallocationRequestBaseSchema = z.object({
  proposed_allocations: z
    .array(ProposedAllocationSchema)
    .min(1)
    .refine(
      (allocations) => {
        const seen = new Set<number>();
        return allocations.every((allocation) => {
          if (seen.has(allocation.company_id)) return false;
          seen.add(allocation.company_id);
          return true;
        });
      },
      (allocations) => {
        const seen = new Set<number>();
        const duplicates = new Set<number>();
        for (const allocation of allocations) {
          if (seen.has(allocation.company_id)) duplicates.add(allocation.company_id);
          seen.add(allocation.company_id);
        }
        return {
          message: `Duplicate company IDs in allocation update payload: ${[...duplicates].join(
            ', '
          )}`,
        };
      }
    ),
});

const ReallocationPreviewRequestSchema = ReallocationRequestBaseSchema;

/**
 * Request body for commit endpoint (same as preview)
 */
const ReallocationCommitRequestSchema = ReallocationRequestBaseSchema.extend({
  reason: z.string().optional(),
  user_id: z.number().int().positive().optional(),
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type ProposedAllocation = z.infer<typeof ProposedAllocationSchema>;
type _ReallocationPreviewRequest = z.infer<typeof ReallocationPreviewRequestSchema>;
type _ReallocationCommitRequest = z.infer<typeof ReallocationCommitRequestSchema>;

interface CompanyAllocation {
  company_id: number;
  company_name: string;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_version: number;
  status: string;
}

interface AllocationDelta {
  company_id: number;
  company_name: string;
  from_cents: number;
  to_cents: number;
  delta_cents: number;
  delta_pct: number;
  status: 'increased' | 'decreased' | 'unchanged';
}

interface Warning {
  type: 'cap_exceeded' | 'negative_delta' | 'high_concentration' | 'unrealistic_moic';
  company_id?: number;
  message: string;
  severity: 'warning' | 'error';
}

interface ReallocationPreviewResponse {
  deltas: AllocationDelta[];
  totals: {
    total_allocated_before: number;
    total_allocated_after: number;
    delta_cents: number;
    delta_pct: number;
  };
  warnings: Warning[];
  validation: {
    is_valid: boolean;
    errors: string[];
  };
}

interface ReallocationCommitResponse {
  success: boolean;
  updated_count: number;
  new_versions: Array<{ company_id: number; new_version: number }>;
  audit_ids: Array<{ company_id: number; audit_id: string }>;
  timestamp: string;
}

interface ReallocationRouteError extends Error {
  statusCode: number;
  code: 'VERSION_CONFLICT' | 'VALIDATION_FAILED';
  details?: {
    current_versions: Array<{ company_id: number; current_version: number }>;
  };
}

function createReallocationRouteError(
  statusCode: number,
  code: ReallocationRouteError['code'],
  message: string,
  details?: ReallocationRouteError['details']
): ReallocationRouteError {
  const error = new Error(message) as ReallocationRouteError;
  error.statusCode = statusCode;
  error.code = code;
  if (details) error.details = details;
  return error;
}

function isReallocationRouteError(error: unknown): error is ReallocationRouteError {
  return (
    error instanceof Error &&
    typeof (error as Partial<ReallocationRouteError>).statusCode === 'number' &&
    ((error as Partial<ReallocationRouteError>).code === 'VERSION_CONFLICT' ||
      (error as Partial<ReallocationRouteError>).code === 'VALIDATION_FAILED')
  );
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch current allocations for a fund
 */
async function fetchCurrentAllocations(
  fundId: number,
  client?: PoolClient
): Promise<CompanyAllocation[]> {
  const sql = `SELECT
       id as company_id,
       name as company_name,
       planned_reserves_cents,
       allocation_cap_cents,
       allocation_version,
       status
     FROM portfoliocompanies
     WHERE fund_id = $1
     ORDER BY id`;
  const result = client
    ? await client.query<CompanyAllocation>(sql, [fundId])
    : await query<CompanyAllocation>(sql, [fundId]);
  // bigint columns arrive as strings from pg; coerce once so delta math and
  // audit JSON carry numbers.
  return result.rows.map((row) => ({
    ...row,
    planned_reserves_cents: Number(row.planned_reserves_cents),
    allocation_cap_cents:
      row.allocation_cap_cents === null ? null : Number(row.allocation_cap_cents),
  }));
}

/**
 * Calculate deltas between current and proposed allocations
 */
function calculateDeltas(
  current: CompanyAllocation[],
  proposed: ProposedAllocation[]
): AllocationDelta[] {
  const proposedMap = new Map(proposed.map((p) => [p.company_id, p.planned_reserves_cents]));

  return current.map((curr) => {
    const to_cents = proposedMap.get(curr.company_id) ?? curr.planned_reserves_cents;
    const delta_cents = to_cents - curr.planned_reserves_cents;
    const delta_pct =
      curr.planned_reserves_cents === 0
        ? to_cents > 0
          ? 100
          : 0
        : (delta_cents / curr.planned_reserves_cents) * 100;

    let status: 'increased' | 'decreased' | 'unchanged';
    if (delta_cents > 0) status = 'increased';
    else if (delta_cents < 0) status = 'decreased';
    else status = 'unchanged';

    return {
      company_id: curr.company_id,
      company_name: curr.company_name,
      from_cents: curr.planned_reserves_cents,
      to_cents,
      delta_cents,
      delta_pct,
      status,
    };
  });
}

/**
 * Detect warnings and validation errors
 */
function detectWarnings(
  deltas: AllocationDelta[],
  current: CompanyAllocation[],
  proposed: ProposedAllocation[],
  fundSize: number
): { warnings: Warning[]; errors: string[] } {
  const warnings: Warning[] = [];
  const errors: string[] = [];

  // Build maps for efficient lookup
  const currentMap = new Map(current.map((c) => [c.company_id, c]));
  const _proposedMap = new Map(proposed.map((p) => [p.company_id, p]));

  // Check 1: Cap exceeded (blocking error)
  for (const prop of proposed) {
    const curr = currentMap.get(prop.company_id);
    if (!curr) {
      errors.push(`Company ID ${prop.company_id} not found in fund`);
      continue;
    }

    const cap = prop.allocation_cap_cents ?? curr.allocation_cap_cents;
    if (cap !== null && prop.planned_reserves_cents > cap) {
      warnings.push({
        type: 'cap_exceeded',
        company_id: prop.company_id,
        message: `${curr.company_name}: Allocation $${centsToDollars(prop.planned_reserves_cents).toLocaleString()} exceeds cap of $${centsToDollars(cap).toLocaleString()}`,
        severity: 'error',
      });
      errors.push(`Company ${curr.company_name} exceeds allocation cap`);
    }
  }

  // Check 2: High concentration (warning only)
  const totalAfter = deltas.reduce((sum, d) => sum + d.to_cents, 0);
  if (totalAfter > 0) {
    for (const delta of deltas) {
      const concentration = delta.to_cents / totalAfter;
      if (concentration > 0.3) {
        warnings.push({
          type: 'high_concentration',
          company_id: delta.company_id,
          message: `${delta.company_name}: High concentration (${(concentration * 100).toFixed(1)}% of total reserves)`,
          severity: 'warning',
        });
      }
    }
  }

  // Check 3: Unrealistic MOIC (warning only)
  // Assuming 10x MOIC is the threshold for "unrealistic"
  for (const prop of proposed) {
    const curr = currentMap.get(prop.company_id);
    if (!curr) continue;

    // Calculate implied MOIC based on initial investment vs reserves
    // This is a simplified heuristic - actual MOIC calculation would need more context
    const totalInvestment = prop.planned_reserves_cents;
    if (totalInvestment > fundSize * 0.5) {
      warnings.push({
        type: 'unrealistic_moic',
        company_id: prop.company_id,
        message: `${curr.company_name}: Total allocation ($${centsToDollars(totalInvestment).toLocaleString()}) suggests very high conviction (>50% of fund)`,
        severity: 'warning',
      });
    }
  }

  // Check 4: Negative allocation (blocking error)
  for (const prop of proposed) {
    if (prop.planned_reserves_cents < 0) {
      const curr = currentMap.get(prop.company_id);
      errors.push(`Company ${curr?.company_name ?? prop.company_id} has negative allocation`);
    }
  }

  return { warnings, errors };
}

/**
 * Get fund size for validation
 */
async function getFundSize(fundId: number, client?: PoolClient): Promise<number> {
  const result = client
    ? await client.query<{ size: string }>(`SELECT size FROM funds WHERE id = $1`, [fundId])
    : await query<{ size: string }>(`SELECT size FROM funds WHERE id = $1`, [fundId]);

  const fundRow = result.rows[0];
  if (!fundRow) {
    throw new Error(`Fund ${fundId} not found`);
  }

  // Convert from decimal string to cents
  return dollarsToCents(parseFloat(fundRow.size));
}

// ============================================================================
// ENDPOINTS
// ============================================================================

/**
 * POST /api/funds/:fundId/reallocation/preview
 *
 * Preview reallocation changes without committing to database.
 * Returns deltas, warnings, and validation results.
 *
 * @param fundId - Fund identifier
 * @body proposed_allocations - Array of {company_id, planned_reserves_cents, allocation_cap_cents?, expected_version}
 *
 * @returns ReallocationPreviewResponse with deltas, warnings, and validation
 */
router['post']('/api/funds/:fundId/reallocation/preview', async (req: Request, res: Response) => {
  try {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    if (fundId === null) {
      return res.status(400).json({ error: 'Invalid fund ID' });
    }

    if (!(await enforceProvidedFundScope(req, res, fundId))) {
      return;
    }

    // Validate request body
    const parseResult = ReallocationPreviewRequestSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parseResult.error.format(),
      });
    }

    const { proposed_allocations } = parseResult.data;

    // Fetch current allocations
    const currentAllocations = await fetchCurrentAllocations(fundId);
    if (currentAllocations.length === 0) {
      return res.status(404).json({ error: 'Fund has no portfolio companies' });
    }

    const currentByCompanyId = new Map(
      currentAllocations.map((allocation) => [allocation.company_id, allocation])
    );
    const currentVersions = proposed_allocations
      .filter((proposal) => {
        const current = currentByCompanyId.get(proposal.company_id);
        return current !== undefined && current.allocation_version !== proposal.expected_version;
      })
      .map((proposal) => {
        const current = currentByCompanyId.get(proposal.company_id)!;
        return {
          company_id: proposal.company_id,
          current_version: current.allocation_version,
        };
      })
      .sort((a, b) => a.company_id - b.company_id);
    if (currentVersions.length > 0) {
      return res.status(409).json({
        error: 'Version conflict',
        message: 'One or more allocation versions are stale',
        details: { current_versions: currentVersions },
      });
    }

    // Get fund size for validation
    const fundSize = await getFundSize(fundId);

    // Calculate deltas
    const deltas = calculateDeltas(currentAllocations, proposed_allocations);

    // Calculate totals
    const total_allocated_before = deltas.reduce((sum, d) => sum + d.from_cents, 0);
    const total_allocated_after = deltas.reduce((sum, d) => sum + d.to_cents, 0);
    const delta_cents = total_allocated_after - total_allocated_before;
    const delta_pct =
      total_allocated_before === 0
        ? total_allocated_after > 0
          ? 100
          : 0
        : (delta_cents / total_allocated_before) * 100;

    // Detect warnings and errors
    const { warnings, errors } = detectWarnings(
      deltas,
      currentAllocations,
      proposed_allocations,
      fundSize
    );

    // Build response
    const response: ReallocationPreviewResponse = {
      deltas,
      totals: {
        total_allocated_before,
        total_allocated_after,
        delta_cents,
        delta_pct,
      },
      warnings,
      validation: {
        is_valid: errors.length === 0,
        errors,
      },
    };

    return res.status(200).json(response);
  } catch (error) {
    routeLog.error('[Reallocation Preview] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/funds/:fundId/reallocation/commit
 *
 * Commit reallocation changes to database with transaction safety.
 * Creates audit log entry and increments allocation_version.
 *
 * @param fundId - Fund identifier
 * @body proposed_allocations - Array of {company_id, planned_reserves_cents, allocation_cap_cents?, expected_version}
 * @body reason - Optional reason for reallocation
 * @body user_id - Legacy input ignored; audit actor comes from verified credentials
 *
 * @returns ReallocationCommitResponse with success status, new version, and audit ID
 */
router['post'](
  '/api/funds/:fundId/reallocation/commit',
  requirePartnerWrite,
  async (req: Request, res: Response) => {
    try {
      const fundId = parseFundIdParam(firstString(req.params['fundId']));
      if (fundId === null) {
        return res.status(400).json({ error: 'Invalid fund ID' });
      }

      if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) {
        return;
      }

      // Validate request body
      const parseResult = ReallocationCommitRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res.status(400).json({
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
      }

      const { proposed_allocations, reason } = parseResult.data;
      const actorId = getUserId(req);
      if (!actorId) {
        return res.status(401).json({
          error: 'Authentication required',
          message: 'User must be authenticated to commit reallocation changes',
        });
      }

      // Execute transaction
      const result = await transaction(async (client: PoolClient) => {
        // Step 1: Lock only proposed rows in deterministic order.
        const proposedCompanyIds = proposed_allocations
          .map((proposal) => proposal.company_id)
          .sort((a, b) => a - b);
        const lockedRows = await client.query<{
          id: number;
          allocation_version: number;
          planned_reserves_cents: number;
          allocation_cap_cents: number | null;
        }>(
          `SELECT id, allocation_version, planned_reserves_cents, allocation_cap_cents
           FROM portfoliocompanies
           WHERE fund_id = $1 AND id = ANY($2::int[])
           ORDER BY id
           FOR UPDATE`,
          [fundId, proposedCompanyIds]
        );

        const proposedByCompanyId = new Map(
          proposed_allocations.map((proposal) => [proposal.company_id, proposal])
        );
        const currentVersions = lockedRows.rows
          .filter(
            (row) => row.allocation_version !== proposedByCompanyId.get(row.id)!.expected_version
          )
          .map((row) => ({
            company_id: row.id,
            current_version: row.allocation_version,
          }));
        if (currentVersions.length > 0) {
          throw createReallocationRouteError(
            409,
            'VERSION_CONFLICT',
            'One or more allocation versions are stale',
            { current_versions: currentVersions }
          );
        }

        // Step 2: Fetch current allocations and fund size for validation/audit.
        const currentAllocations = await fetchCurrentAllocations(fundId, client);
        const fundSize = await getFundSize(fundId, client);

        // Step 3: Calculate deltas and validate
        const deltas = calculateDeltas(currentAllocations, proposed_allocations);
        const { warnings: _warnings, errors } = detectWarnings(
          deltas,
          currentAllocations,
          proposed_allocations,
          fundSize
        );

        // Step 4: Block commit if validation errors exist
        if (errors.length > 0) {
          throw createReallocationRouteError(
            400,
            'VALIDATION_FAILED',
            `Validation failed: ${errors.join('; ')}`
          );
        }

        // Step 5: Update and audit each proposed row in ascending company order.
        const currentByCompanyId = new Map(
          currentAllocations.map((allocation) => [allocation.company_id, allocation])
        );
        const orderedProposals = [...proposed_allocations].sort(
          (a, b) => a.company_id - b.company_id
        );
        const newVersions: Array<{ company_id: number; new_version: number }> = [];
        const auditIds: Array<{ company_id: number; audit_id: string }> = [];

        for (const proposal of orderedProposals) {
          const current = currentByCompanyId.get(proposal.company_id);
          if (!current) {
            throw new Error(`Company ${proposal.company_id} vanished after validation`);
          }

          const updateResult = await client.query<{ allocation_version: number }>(
            `UPDATE portfoliocompanies
             SET planned_reserves_cents = $1,
                 allocation_cap_cents = COALESCE($2, allocation_cap_cents),
                 allocation_version = allocation_version + 1,
                 last_allocation_at = NOW()
             WHERE fund_id = $3 AND id = $4
             RETURNING allocation_version`,
            [
              proposal.planned_reserves_cents,
              proposal.allocation_cap_cents ?? null,
              fundId,
              proposal.company_id,
            ]
          );
          const updatedRow = updateResult.rows[0];
          if (!updatedRow) {
            throw new Error(`Failed to update company ${proposal.company_id}`);
          }

          const delta = deltas.find((item) => item.company_id === proposal.company_id)!;
          const changesJson = {
            company_id: delta.company_id,
            company_name: delta.company_name,
            from_cents: delta.from_cents,
            to_cents: delta.to_cents,
            delta_cents: delta.delta_cents,
            ...(proposal.allocation_cap_cents !== undefined
              ? {
                  cap_from_cents: current.allocation_cap_cents,
                  cap_to_cents: proposal.allocation_cap_cents,
                }
              : {}),
          };
          const auditResult = await client.query<{ id: string }>(
            `INSERT INTO reallocation_audit (
               fund_id,
               user_id,
               baseline_version,
               new_version,
               changes_json,
               reason
             ) VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id`,
            [
              fundId,
              actorId,
              proposal.expected_version,
              updatedRow.allocation_version,
              JSON.stringify(changesJson),
              reason ?? null,
            ]
          );
          const auditRow = auditResult.rows[0];
          if (!auditRow) {
            throw new Error('Failed to create audit record');
          }

          newVersions.push({
            company_id: proposal.company_id,
            new_version: updatedRow.allocation_version,
          });
          auditIds.push({ company_id: proposal.company_id, audit_id: auditRow.id });
        }

        return {
          new_versions: newVersions,
          updated_count: newVersions.length,
          audit_ids: auditIds,
        };
      });

      // Build response
      const response: ReallocationCommitResponse = {
        success: true,
        updated_count: result.updated_count,
        new_versions: result.new_versions,
        audit_ids: result.audit_ids,
        timestamp: new Date().toISOString(),
      };

      return res.status(200).json(response);
    } catch (error) {
      routeLog.error('[Reallocation Commit] Error:', error);

      if (isReallocationRouteError(error)) {
        return res.status(error.statusCode).json({
          error: error.code === 'VERSION_CONFLICT' ? 'Version conflict' : 'Validation failed',
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        });
      }

      return res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
