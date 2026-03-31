import type { PoolClient } from 'pg';

export interface AllocationWriteConflict {
  company_id: number;
  expected_version: number;
  actual_version: number;
}

export interface AllocationWriteUpdate {
  company_id: number;
  planned_reserves_cents: number;
  allocation_cap_cents: number | null;
  allocation_reason: string | null;
  expected_version: number;
}

export interface AllocationWriteResult {
  new_version: number;
  updated_count: number;
}

export interface AllocationWriteAuditMetadata {
  source?: string;
  scenario_id?: string;
}

interface HttpError extends Error {
  statusCode: number;
  code?: string;
  conflicts?: AllocationWriteConflict[];
}

function createHttpError(
  statusCode: number,
  message: string,
  conflicts?: AllocationWriteConflict[],
  code?: string
): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  if (conflicts) {
    error.conflicts = conflicts;
  }
  if (code) {
    error.code = code;
  }
  return error;
}

async function verifyFundExists(client: PoolClient, fundId: number): Promise<void> {
  const fundCheck = await client.query('SELECT id FROM funds WHERE id = $1', [fundId]);

  if (fundCheck.rows.length === 0) {
    throw createHttpError(404, `Fund ${fundId} not found`);
  }
}

async function verifyCompaniesInFund(
  client: PoolClient,
  fundId: number,
  companyIds: number[]
): Promise<void> {
  const uniqueCompanyIds = [...new Set(companyIds)];
  const companyCheck = await client.query<{ id: number }>(
    `SELECT id
       FROM portfoliocompanies
      WHERE fund_id = $1
        AND id = ANY($2::int[])`,
    [fundId, uniqueCompanyIds]
  );

  if (companyCheck.rows.length !== uniqueCompanyIds.length) {
    const foundIds = new Set(companyCheck.rows.map((row) => row.id));
    const missingIds = uniqueCompanyIds.filter((companyId) => !foundIds.has(companyId));
    throw createHttpError(404, `Companies not found in fund ${fundId}: ${missingIds.join(', ')}`);
  }
}

function assertUniqueCompanyIds(updates: AllocationWriteUpdate[]): void {
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  for (const update of updates) {
    if (seen.has(update.company_id)) {
      duplicates.add(update.company_id);
    }
    seen.add(update.company_id);
  }

  if (duplicates.size > 0) {
    throw createHttpError(
      400,
      `Duplicate company IDs in allocation update payload: ${[...duplicates].join(', ')}`,
      undefined,
      'duplicate_company_ids'
    );
  }
}

async function updateCompanyAllocation(
  client: PoolClient,
  fundId: number,
  update: AllocationWriteUpdate
): Promise<{ conflict: AllocationWriteConflict | null; nextVersion: number | null }> {
  const versionCheck = await client.query<{ allocation_version: number }>(
    `SELECT allocation_version
       FROM portfoliocompanies
      WHERE fund_id = $1
        AND id = $2
      FOR UPDATE`,
    [fundId, update.company_id]
  );

  if (versionCheck.rows.length === 0) {
    throw createHttpError(404, `Company ${update.company_id} not found in fund ${fundId}`);
  }

  const currentVersion = versionCheck.rows[0]!.allocation_version;
  if (currentVersion !== update.expected_version) {
    return {
      conflict: {
        company_id: update.company_id,
        expected_version: update.expected_version,
        actual_version: currentVersion,
      },
      nextVersion: null,
    };
  }

  const result = await client.query<{ allocation_version: number }>(
    `UPDATE portfoliocompanies
        SET planned_reserves_cents = $1,
            allocation_cap_cents = $2,
            allocation_reason = $3,
            allocation_version = allocation_version + 1,
            last_allocation_at = NOW()
      WHERE fund_id = $4
        AND id = $5
        AND allocation_version = $6
      RETURNING allocation_version`,
    [
      update.planned_reserves_cents,
      update.allocation_cap_cents,
      update.allocation_reason,
      fundId,
      update.company_id,
      update.expected_version,
    ]
  );

  if (result.rows.length === 0) {
    return {
      conflict: {
        company_id: update.company_id,
        expected_version: update.expected_version,
        actual_version: currentVersion,
      },
      nextVersion: null,
    };
  }

  return {
    conflict: null,
    nextVersion: result.rows[0]!.allocation_version,
  };
}

async function logAllocationEvent(
  client: PoolClient,
  fundId: number,
  userId: number | null,
  updates: AllocationWriteUpdate[],
  newVersion: number,
  auditMetadata: AllocationWriteAuditMetadata | null
): Promise<void> {
  await client.query(
    `INSERT INTO fund_events
     (fund_id, event_type, payload, user_id, event_time, operation, entity_type, metadata)
     VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
    [
      fundId,
      'ALLOCATION_UPDATED',
      JSON.stringify({
        updates: updates.map(({ expected_version: _expectedVersion, ...rest }) => rest),
        new_version: newVersion,
        update_count: updates.length,
      }),
      userId,
      'UPDATE',
      'allocation',
      JSON.stringify({
        timestamp: new Date().toISOString(),
        company_count: updates.length,
        ...(auditMetadata ?? {}),
      }),
    ]
  );
}

export async function applyAllocationUpdates(
  client: PoolClient,
  options: {
    fundId: number;
    updates: AllocationWriteUpdate[];
    userId: number | null;
    auditMetadata?: AllocationWriteAuditMetadata | null;
  }
): Promise<AllocationWriteResult> {
  const { fundId, updates, userId, auditMetadata = null } = options;

  if (updates.length === 0) {
    throw createHttpError(400, 'No allocations to update');
  }

  assertUniqueCompanyIds(updates);
  await verifyFundExists(client, fundId);
  await verifyCompaniesInFund(
    client,
    fundId,
    updates.map((update) => update.company_id)
  );

  const conflicts: AllocationWriteConflict[] = [];
  const nextVersions: number[] = [];

  for (const update of updates) {
    const { conflict, nextVersion } = await updateCompanyAllocation(client, fundId, update);
    if (conflict) {
      conflicts.push(conflict);
      continue;
    }

    if (nextVersion !== null) {
      nextVersions.push(nextVersion);
    }
  }

  if (conflicts.length > 0) {
    throw createHttpError(
      409,
      `Version conflict: ${conflicts.length} companies have been updated by another user`,
      conflicts,
      'version_conflict'
    );
  }

  const newVersion = Math.max(...nextVersions);
  await logAllocationEvent(client, fundId, userId, updates, newVersion, auditMetadata);

  return {
    new_version: newVersion,
    updated_count: updates.length,
  };
}
