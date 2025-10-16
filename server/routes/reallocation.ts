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

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { query, transaction } from '../db';
import { dollarsToCents, centsToDollars } from '../../client/src/lib/units';

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
});

/**
 * Request body for preview endpoint
 */
const ReallocationPreviewRequestSchema = z.object({
  current_version: z.number().int().positive(),
  proposed_allocations: z.array(ProposedAllocationSchema).min(1),
});

/**
 * Request body for commit endpoint (same as preview)
 */
const ReallocationCommitRequestSchema = ReallocationPreviewRequestSchema.extend({
  reason: z.string().optional(),
  user_id: z.number().int().positive().optional(),
});

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

type ProposedAllocation = z.infer<typeof ProposedAllocationSchema>;
type ReallocationPreviewRequest = z.infer<typeof ReallocationPreviewRequestSchema>;
type ReallocationCommitRequest = z.infer<typeof ReallocationCommitRequestSchema>;

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
  new_version: number;
  updated_count: number;
  audit_id: string;
  timestamp: string;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Fetch current allocations for a fund
 */
async function fetchCurrentAllocations(
  fundId: number
): Promise<CompanyAllocation[]> {
  const result = await query<CompanyAllocation>(
    `SELECT
       id as company_id,
       name as company_name,
       planned_reserves_cents,
       allocation_cap_cents,
       allocation_version,
       status
     FROM portfoliocompanies
     WHERE fund_id = $1
     ORDER BY id`,
    [fundId]
  );
  return result.rows;
}

/**
 * Calculate deltas between current and proposed allocations
 */
function calculateDeltas(
  current: CompanyAllocation[],
  proposed: ProposedAllocation[]
): AllocationDelta[] {
  const proposedMap = new Map(
    proposed.map(p => [p.company_id, p.planned_reserves_cents])
  );

  return current.map(curr => {
    const to_cents = proposedMap.get(curr.company_id) ?? curr.planned_reserves_cents;
    const delta_cents = to_cents - curr.planned_reserves_cents;
    const delta_pct = curr.planned_reserves_cents === 0
      ? (to_cents > 0 ? 100 : 0)
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
  const currentMap = new Map(current.map(c => [c.company_id, c]));
  const proposedMap = new Map(proposed.map(p => [p.company_id, p]));

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
 * Verify version consistency across all companies in a fund
 */
async function verifyVersionConsistency(
  fundId: number,
  expectedVersion: number
): Promise<{ consistent: boolean; actualVersions: number[] }> {
  const result = await query<{ allocation_version: number }>(
    `SELECT DISTINCT allocation_version
     FROM portfoliocompanies
     WHERE fund_id = $1`,
    [fundId]
  );

  const actualVersions = result.rows.map((r: { allocation_version: number }) => r.allocation_version);
  const consistent = actualVersions.length === 1 && actualVersions[0] === expectedVersion;

  return { consistent, actualVersions };
}

/**
 * Get fund size for validation
 */
async function getFundSize(fundId: number): Promise<number> {
  const result = await query<{ size: string }>(
    `SELECT size FROM funds WHERE id = $1`,
    [fundId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Fund ${fundId} not found`);
  }

  // Convert from decimal string to cents
  return dollarsToCents(parseFloat(result.rows[0].size));
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
 * @body current_version - Expected current version (for optimistic locking)
 * @body proposed_allocations - Array of {company_id, planned_reserves_cents, allocation_cap_cents?}
 *
 * @returns ReallocationPreviewResponse with deltas, warnings, and validation
 */
router["post"](
  '/api/funds/:fundId/reallocation/preview',
  async (req: Request, res: Response) => {
    try {
      const fundId = parseInt(req.params.fundId, 10);
      if (isNaN(fundId) || fundId <= 0) {
        return res["status"](400)["json"]({ error: 'Invalid fund ID' });
      }

      // Validate request body
      const parseResult = ReallocationPreviewRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res["status"](400)["json"]({
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
      }

      const { current_version, proposed_allocations } = parseResult.data;

      // Fetch current allocations
      const currentAllocations = await fetchCurrentAllocations(fundId);
      if (currentAllocations.length === 0) {
        return res["status"](404)["json"]({ error: 'Fund has no portfolio companies' });
      }

      // Verify version consistency
      const { consistent, actualVersions } = await verifyVersionConsistency(
        fundId,
        current_version
      );
      if (!consistent) {
        return res["status"](409)["json"]({
          error: 'Version conflict',
          message: `Expected version ${current_version}, but found ${actualVersions.join(', ')}`,
          current_versions: actualVersions,
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
      const delta_pct = total_allocated_before === 0
        ? (total_allocated_after > 0 ? 100 : 0)
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

      return res["status"](200)["json"](response);
    } catch (error) {
      console.error('[Reallocation Preview] Error:', error);
      return res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

/**
 * POST /api/funds/:fundId/reallocation/commit
 *
 * Commit reallocation changes to database with transaction safety.
 * Creates audit log entry and increments allocation_version.
 *
 * @param fundId - Fund identifier
 * @body current_version - Expected current version (for optimistic locking)
 * @body proposed_allocations - Array of {company_id, planned_reserves_cents, allocation_cap_cents?}
 * @body reason - Optional reason for reallocation
 * @body user_id - Optional user ID for audit trail
 *
 * @returns ReallocationCommitResponse with success status, new version, and audit ID
 */
router["post"](
  '/api/funds/:fundId/reallocation/commit',
  async (req: Request, res: Response) => {
    try {
      const fundId = parseInt(req.params.fundId, 10);
      if (isNaN(fundId) || fundId <= 0) {
        return res["status"](400)["json"]({ error: 'Invalid fund ID' });
      }

      // Validate request body
      const parseResult = ReallocationCommitRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        return res["status"](400)["json"]({
          error: 'Invalid request body',
          details: parseResult.error.format(),
        });
      }

      const { current_version, proposed_allocations, reason, user_id } = parseResult.data;

      // Execute transaction
      const result = await transaction(async (client: any) => {
        // Step 1: Verify version and lock rows
        const versionCheck = await client.query<{ allocation_version: number }>(
          `SELECT allocation_version
           FROM portfoliocompanies
           WHERE fund_id = $1
           FOR UPDATE`,
          [fundId]
        );

        if (versionCheck.rows.length === 0) {
          throw new Error('Fund has no portfolio companies');
        }

        const actualVersions = [...new Set(versionCheck.rows.map((r: { allocation_version: number }) => r.allocation_version))];
        if (actualVersions.length !== 1 || actualVersions[0] !== current_version) {
          throw new Error(
            `Version conflict: expected ${current_version}, found ${actualVersions.join(', ')}`
          );
        }

        // Step 2: Fetch current allocations for audit
        const currentResult = await client.query<CompanyAllocation>(
          `SELECT
             id as company_id,
             name as company_name,
             planned_reserves_cents,
             allocation_cap_cents,
             allocation_version,
             status
           FROM portfoliocompanies
           WHERE fund_id = $1
           ORDER BY id`,
          [fundId]
        );

        const currentAllocations = currentResult.rows;
        const fundSize = await getFundSize(fundId);

        // Step 3: Calculate deltas and validate
        const deltas = calculateDeltas(currentAllocations, proposed_allocations);
        const { warnings, errors } = detectWarnings(
          deltas,
          currentAllocations,
          proposed_allocations,
          fundSize
        );

        // Step 4: Block commit if validation errors exist
        if (errors.length > 0) {
          throw new Error(`Validation failed: ${errors.join('; ')}`);
        }

        // Step 5: Build batch update query using CASE statements
        if (proposed_allocations.length === 0) {
          throw new Error('No allocations to update');
        }

        // Build parameter array and CASE statements
        const companyIds = proposed_allocations.map((p) => p.company_id);
        const params: (number | null)[] = [fundId]; // $1

        // Build CASE WHEN for planned_reserves_cents
        const plannedCases = proposed_allocations
          .map((prop, idx) => {
            params.push(prop.company_id); // company_id
            params.push(prop.planned_reserves_cents); // planned_reserves_cents
            return `WHEN $${params.length - 1} THEN $${params.length}::BIGINT`;
          })
          .join(' ');

        // Build CASE WHEN for allocation_cap_cents (only if provided)
        const hasCapUpdates = proposed_allocations.some((p) => p.allocation_cap_cents !== undefined);
        let capCases = '';
        if (hasCapUpdates) {
          capCases = proposed_allocations
            .map((prop) => {
              if (prop.allocation_cap_cents !== undefined) {
                const companyIdIdx = params.indexOf(prop.company_id);
                params.push(prop.allocation_cap_cents);
                return `WHEN $${companyIdIdx} THEN $${params.length}::BIGINT`;
              }
              return '';
            })
            .filter(Boolean)
            .join(' ');
        }

        // Add company IDs to params
        const companyIdPlaceholders = companyIds.map((id) => {
          params.push(id);
          return `$${params.length}`;
        }).join(',');

        // Construct UPDATE query
        const updateQuery = `
          UPDATE portfoliocompanies
          SET
            planned_reserves_cents = CASE id ${plannedCases} ELSE planned_reserves_cents END,
            ${hasCapUpdates ? `allocation_cap_cents = CASE id ${capCases} ELSE allocation_cap_cents END,` : ''}
            allocation_version = allocation_version + 1,
            last_allocation_at = NOW()
          WHERE fund_id = $1 AND id IN (${companyIdPlaceholders})
        `;

        // Execute batch update
        const updateResult = await client.query(updateQuery, params);

        // Step 6: Insert audit log
        const newVersion = current_version + 1;
        const changesJson = deltas.map((d) => ({
          company_id: d.company_id,
          company_name: d.company_name,
          from_cents: d.from_cents,
          to_cents: d.to_cents,
          delta_cents: d.delta_cents,
        }));

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
            user_id ?? null,
            current_version,
            newVersion,
            JSON.stringify(changesJson),
            reason ?? null,
          ]
        );

        return {
          new_version: newVersion,
          updated_count: updateResult.rowCount ?? 0,
          audit_id: auditResult.rows[0].id,
        };
      });

      // Build response
      const response: ReallocationCommitResponse = {
        success: true,
        new_version: result.new_version,
        updated_count: result.updated_count,
        audit_id: result.audit_id,
        timestamp: new Date().toISOString(),
      };

      return res["status"](200)["json"](response);
    } catch (error) {
      console.error('[Reallocation Commit] Error:', error);

      // Check for version conflict
      if (error instanceof Error && error.message.includes('Version conflict')) {
        return res["status"](409)["json"]({
          error: 'Version conflict',
          message: error.message,
        });
      }

      // Check for validation errors
      if (error instanceof Error && error.message.includes('Validation failed')) {
        return res["status"](400)["json"]({
          error: 'Validation failed',
          message: error.message,
        });
      }

      return res["status"](500)["json"]({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
);

export default router;
