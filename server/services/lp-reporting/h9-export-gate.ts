import {
  createMoicActionabilityResolver,
  type MoicActionabilityResult,
} from '../fund-calculation-mode-service';
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

export class H9ExportBlockedError extends Error {
  readonly code: H9ExportBlockerCode;
  readonly surface: H9ExportSurface;

  constructor(surface: H9ExportSurface, code: H9ExportBlockerCode, message: string) {
    super(message);
    this.name = 'H9ExportBlockedError';
    this.code = code;
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
