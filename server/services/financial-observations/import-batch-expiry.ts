/**
 * Check-on-use expiry for import batches and their source artifacts (§9).
 * Task 6 only refuses on expiry; it never writes expiry state (Task 8 owns the
 * sweep). Shared by the case-resolution and commit services.
 *
 * @module server/services/financial-observations/import-batch-expiry
 */
import { sql } from 'drizzle-orm';

import type { db } from '../../db';
import { ReconciliationApiError } from './reconciliation-errors';

type ExpiryDatabase = typeof db;

export async function isImportBatchExpired(
  database: ExpiryDatabase,
  fundId: number,
  importBatchId: number | null
): Promise<boolean> {
  if (importBatchId === null) return false;
  const result = await database.execute(sql`
    SELECT (
      b.status = 'expired'
      OR b.purged_at IS NOT NULL
      OR (b.purge_after <= now()
          AND (b.retention_extended_until IS NULL OR b.retention_extended_until <= now()))
      OR a.id IS NULL
      OR a.payload IS NULL
      OR a.purged_at IS NOT NULL
      OR (a.purge_after <= now()
          AND (a.retention_extended_until IS NULL OR a.retention_extended_until <= now()))
    ) AS expired
    FROM import_batches b
    LEFT JOIN source_artifacts a
      ON a.id = b.source_artifact_id AND a.fund_id = b.fund_id
    WHERE b.id = ${importBatchId} AND b.fund_id = ${fundId}
  `);
  const rows = Array.isArray(result)
    ? (result as Array<Record<string, unknown>>)
    : ((result as { rows?: Array<Record<string, unknown>> }).rows ?? []);
  const value = rows[0]?.['expired'];
  return value === true || value === 't' || value === 'true';
}

export async function assertImportBatchNotExpired(
  database: ExpiryDatabase,
  fundId: number,
  importBatchId: number | null
): Promise<void> {
  if (await isImportBatchExpired(database, fundId, importBatchId)) {
    throw new ReconciliationApiError(
      409,
      'BATCH_EXPIRED',
      'The import batch or artifact has expired.'
    );
  }
}
