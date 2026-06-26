import { and, eq } from 'drizzle-orm';

import { db } from '../../db';
import { lpReportPackages } from '@shared/schema/lp-reporting-evidence';
import {
  createMoicActionabilityResolver,
  type MoicActionabilityResult,
} from '../fund-calculation-mode-service';
import { MetricRunCommitError } from './metric-run-commit-service';
import { moicActionabilityBlocksTotal } from '../../metrics';

export type H9ExportSurface =
  | 'render_model'
  | 'live_json_export'
  | 'stored_json_export'
  | 'stored_csv_export';

export type H9ExportBlockerCode =
  | 'H9_METADATA_MISSING'
  | 'H9_NOT_ACTIONABLE'
  | 'H9_FINGERPRINT_STALE'
  | 'H9_REVALIDATION_UNAVAILABLE';

export class H9ExportBlockedError extends MetricRunCommitError {
  readonly surface: H9ExportSurface;

  constructor(surface: H9ExportSurface, code: H9ExportBlockerCode, message: string) {
    super(409, code, message, { surface });
    this.name = 'H9ExportBlockedError';
    this.surface = surface;
  }
}

/** The stored H9 columns as carried on an lp_report_packages row. */
export interface StoredH9 {
  h9MoicSourceInputHash: string | null;
  h9RoundEvidenceInputHash: string | null;
  h9RoundEvidenceAssumptionsHash: string | null;
  h9FingerprintHash: string | null;
  h9PolicyVersion: string | null;
  h9ActionabilityStatus: string | null;
}

function block(surface: H9ExportSurface, code: H9ExportBlockerCode, message: string): never {
  moicActionabilityBlocksTotal.inc({ surface, blocker_code: code.toLowerCase() });
  throw new H9ExportBlockedError(surface, code, message);
}

/**
 * Authoritative export-time H9 gate. Reads the stored package H9 columns and
 * re-resolves the CURRENT fingerprint on the supplied database/transaction.
 * Fail-closed: any null metadata, non-actionable status, hash drift, or resolver
 * error blocks the export. Never mutates the stored artifact.
 */
export async function assertH9ExportActionable(params: {
  surface: H9ExportSurface;
  fundId: number;
  stored: StoredH9;
  database: unknown;
}): Promise<void> {
  const { surface, fundId, stored, database } = params;

  if (stored.h9ActionabilityStatus == null || stored.h9FingerprintHash == null) {
    block(surface, 'H9_METADATA_MISSING', 'Report package has no H9 actionability metadata.');
  }

  let current: MoicActionabilityResult;
  try {
    current = await createMoicActionabilityResolver({ database }).resolveForFund(fundId);
  } catch {
    block(surface, 'H9_REVALIDATION_UNAVAILABLE', 'H9 actionability could not be revalidated.');
  }

  if (stored.h9ActionabilityStatus !== 'actionable') {
    block(surface, 'H9_NOT_ACTIONABLE', 'Report package is not actionable.');
  }

  if (
    current.actionability !== 'actionable' ||
    stored.h9FingerprintHash !== current.sourceFingerprint.fingerprintHash ||
    stored.h9PolicyVersion !== current.sourceFingerprint.policyVersion
  ) {
    block(surface, 'H9_FINGERPRINT_STALE', 'Report package H9 fingerprint is stale.');
  }
}

/**
 * Load the stored H9 columns for a package and run the export gate. For the
 * stored export surfaces, which hold only the export record, not the package row.
 * Fail-closed when the package row is absent because H9 cannot be revalidated.
 */
export async function assertH9PackageExportable(params: {
  surface: H9ExportSurface;
  fundId: number;
  metricRunId: number;
  database?: unknown;
}): Promise<void> {
  const database = (params.database ?? db) as typeof db;
  const [row] = await database
    .select({
      h9MoicSourceInputHash: lpReportPackages.h9MoicSourceInputHash,
      h9RoundEvidenceInputHash: lpReportPackages.h9RoundEvidenceInputHash,
      h9RoundEvidenceAssumptionsHash: lpReportPackages.h9RoundEvidenceAssumptionsHash,
      h9FingerprintHash: lpReportPackages.h9FingerprintHash,
      h9PolicyVersion: lpReportPackages.h9PolicyVersion,
      h9ActionabilityStatus: lpReportPackages.h9ActionabilityStatus,
    })
    .from(lpReportPackages)
    .where(
      and(
        eq(lpReportPackages.fundId, params.fundId),
        eq(lpReportPackages.metricRunId, params.metricRunId)
      )
    )
    .limit(1);
  if (!row) {
    block(
      params.surface,
      'H9_METADATA_MISSING',
      'Report package row not found; cannot revalidate H9 actionability.'
    );
  }
  await assertH9ExportActionable({
    surface: params.surface,
    fundId: params.fundId,
    stored: row,
    database,
  });
}
