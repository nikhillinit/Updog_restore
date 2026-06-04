/**
 * LP Reporting -- Import Dry-Run Contract.
 *
 * Wire format for the protected dry-run endpoints:
 *   POST /api/funds/:fundId/imports/ledger/dry-run
 *   POST /api/funds/:fundId/imports/valuation-marks/dry-run
 *
 * No commit endpoints exist in Phase 0 (Phase 1 work). The dry-run path
 * is read-only -- the route handler MUST NOT INSERT into
 * cash_flow_events or valuation_marks. The Phase 0.4 verifier asserts
 * via DB spy.
 *
 * Mirrors design §8.5 verbatim with .strict() at every level.
 *
 * @module shared/contracts/lp-reporting/import-dry-run.contract
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';
import { DecimalStringSchema, MoneyStringSchema } from './cash-flow-event.contract';

export const SourceTypeSchema = z.enum(['csv', 'notion']);
export const ImportSeveritySchema = z.enum(['error', 'warning']);
export const PreviewHashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export type SourceType = z.infer<typeof SourceTypeSchema>;
export type ImportSeverity = z.infer<typeof ImportSeveritySchema>;
export type PreviewHash = z.infer<typeof PreviewHashSchema>;

export const ImportWarningSchema = z
  .object({
    row: z.number().int().nonnegative(),
    column: z.string().max(64).optional(),
    code: z.string().max(64),
    message: z.string().max(500),
  })
  .strict();

export const ImportErrorSchema = z
  .object({
    row: z.number().int().nonnegative(),
    column: z.string().max(64).optional(),
    code: z.string().max(64),
    message: z.string().max(500),
    severity: ImportSeveritySchema.default('error'),
  })
  .strict();

export type ImportWarning = z.infer<typeof ImportWarningSchema>;
export type ImportError = z.infer<typeof ImportErrorSchema>;

/**
 * Generic preview row. Concrete fields depend on the parsed source
 * (ledger event vs. valuation mark). The shape is intentionally loose
 * -- the validated, typed CREATE shapes live in the cash-flow-event /
 * valuation-mark contracts and are only constructed at commit time.
 */
export const ImportPreviewRowSchema = z
  .object({
    rowIndex: z.number().int().nonnegative(),
    eventType: z.string().max(64).optional(),
    markSource: z.string().max(64).optional(),
    companyId: z.number().int().positive().optional(),
    lpId: z.number().int().positive().optional(),
    amount: MoneyStringSchema.optional(),
    fairValue: MoneyStringSchema.optional(),
    eventDate: z.string().optional(),
    asOfDate: z.string().optional(),
    confidenceLevel: z.string().max(16).optional(),
    duplicate: z.boolean().default(false),
    excluded: z.boolean().default(false),
    excludedReason: z.string().max(256).optional(),
  })
  .strict();

export type ImportPreviewRow = z.infer<typeof ImportPreviewRowSchema>;

export const ReconciliationSummarySchema = z
  .object({
    calledCapitalImported: MoneyStringSchema,
    calledCapitalExpected: MoneyStringSchema.optional(),
    distributionsImported: MoneyStringSchema,
    latestNavImported: MoneyStringSchema,
    difference: DecimalStringSchema.optional(),
    explanations: z.array(z.string().max(500)).default([]),
  })
  .strict();

export type ReconciliationSummary = z.infer<typeof ReconciliationSummarySchema>;

export const ImportDryRunResponseSchema = z
  .object({
    importId: z.string().uuid(),
    sourceType: SourceTypeSchema,
    previewHash: PreviewHashSchema,
    parsedRows: z.number().int().nonnegative(),
    validRows: z.number().int().nonnegative(),
    invalidRows: z.number().int().nonnegative(),
    duplicateRows: z.number().int().nonnegative(),
    warnings: z.array(ImportWarningSchema).default([]),
    errors: z.array(ImportErrorSchema).default([]),
    reconciliation: ReconciliationSummarySchema,
    preview: z.array(ImportPreviewRowSchema).default([]),
  })
  .strict();

export type ImportDryRunResponse = z.infer<typeof ImportDryRunResponseSchema>;

export const ImportDryRunRequestSchema = z
  .object({
    sourceType: SourceTypeSchema,
    payload: z.string().min(1),
  })
  .strict();

export type ImportDryRunRequest = z.infer<typeof ImportDryRunRequestSchema>;
