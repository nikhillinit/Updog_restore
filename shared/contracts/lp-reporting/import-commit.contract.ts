/**
 * LP Reporting -- Import Commit Contract (Phase 1c.1).
 *
 * Wire format for the protected commit endpoints:
 *   POST /api/funds/:fundId/imports/ledger/commit
 *   POST /api/funds/:fundId/imports/valuation-marks/commit
 *
 * Phase 1c locks the commit-handshake contract BEFORE the server
 * handlers ship (1c.3-1c.5) so the client commit hooks (1c.2) can
 * integrate against a single source of truth. The handshake works as:
 *
 *   1. Client posts to .../dry-run, receives { ..., previewHash, ... }.
 *   2. Client posts to .../commit with that previewHash + the original
 *      payload + the importBatchId returned by dry-run.
 *   3. Server recomputes the previewHash from the (sorted, normalized)
 *      parsed rows. If it differs, the server returns HTTP 409 with a
 *      PreviewDriftError body. If it matches, the server INSERTs the
 *      rows in a single transaction and returns the persisted IDs.
 *
 * PreviewHashSchema is the canonical home for the sha256-hex regex used
 * across the dry-run and commit responses. The dry-run contracts
 * re-import this constant to avoid drift.
 *
 * @module shared/contracts/lp-reporting/import-commit.contract
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';

/**
 * sha256 hex (64 lowercase chars). The same shape backs PreviewHash and
 * the metric-run inputsHash; PreviewHashSchema is the canonical export.
 *
 * Defined here (not in import-dry-run.contract.ts) so this file is the
 * lowest-level node in the lp-reporting contract dependency graph and
 * the dry-run contracts can re-import it without creating a cycle.
 */
export const PreviewHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

/**
 * Mirrors SourceTypeSchema in import-dry-run.contract.ts. Inlined here
 * to keep import-commit.contract.ts free of upward imports (PreviewHashSchema
 * needs to flow INTO import-dry-run.contract.ts for its previewHash field).
 */
const CommitSourceTypeSchema = z.enum(['csv', 'notion']);

export type PreviewHash = z.infer<typeof PreviewHashSchema>;

// ---------------------------------------------------------------------------
// 409 error body (server returns this when the recomputed hash drifts).
// ---------------------------------------------------------------------------

export const PreviewDriftErrorSchema = z
  .object({
    code: z.literal('PREVIEW_DRIFT'),
    expectedPreviewHash: PreviewHashSchema,
    actualPreviewHash: PreviewHashSchema,
    diff: z
      .object({
        addedSourceIds: z.array(z.union([z.number().int(), z.string()])),
        removedSourceIds: z.array(z.union([z.number().int(), z.string()])),
        changedFieldsByEntity: z.record(z.string(), z.array(z.string())).optional(),
      })
      .strict(),
  })
  .strict();

export type PreviewDriftError = z.infer<typeof PreviewDriftErrorSchema>;

// ---------------------------------------------------------------------------
// Commit request shapes (ledger + valuation marks).
// Both endpoints take the same fields; defined separately so the inferred
// types are nominally distinct at call sites.
// ---------------------------------------------------------------------------

const baseCommitRequestShape = {
  fundId: z.number().int().positive(),
  sourceType: CommitSourceTypeSchema,
  /** base64-encoded CSV payload, identical convention to the dry-run request. */
  payload: z.string().min(1),
  previewHash: PreviewHashSchema,
  /** UUID generated server-side on dry-run; client echoes back here. */
  importBatchId: z.string().uuid(),
} as const;

export const LedgerImportCommitRequestSchema = z.object(baseCommitRequestShape).strict();

export const ValuationMarkImportCommitRequestSchema = z.object(baseCommitRequestShape).strict();

export type LedgerImportCommitRequest = z.infer<typeof LedgerImportCommitRequestSchema>;
export type ValuationMarkImportCommitRequest = z.infer<
  typeof ValuationMarkImportCommitRequestSchema
>;

// ---------------------------------------------------------------------------
// Commit response shapes.
// ---------------------------------------------------------------------------

export const LedgerImportCommitResponseSchema = z
  .object({
    persistedEventIds: z.array(z.number().int().positive()),
    importBatchId: z.string().uuid(),
    /** ISO 8601 with offset (e.g. "2026-05-09T05:00:00Z"). */
    committedAt: z.string().datetime({ offset: true }),
    previewHash: PreviewHashSchema,
    rowCount: z.number().int().nonnegative(),
  })
  .strict();

export const ValuationMarkImportCommitResponseSchema = z
  .object({
    persistedMarkIds: z.array(z.number().int().positive()),
    importBatchId: z.string().uuid(),
    committedAt: z.string().datetime({ offset: true }),
    previewHash: PreviewHashSchema,
    rowCount: z.number().int().nonnegative(),
  })
  .strict();

export type LedgerImportCommitResponse = z.infer<typeof LedgerImportCommitResponseSchema>;
export type ValuationMarkImportCommitResponse = z.infer<
  typeof ValuationMarkImportCommitResponseSchema
>;
