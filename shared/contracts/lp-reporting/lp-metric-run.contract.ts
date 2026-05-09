/**
 * LP Reporting -- LP Metric Run Contract (CREATE shape)
 *
 * Mirrors the lp_metric_runs table from
 * server/migrations/20260508_lp_reporting_foundation_v1.up.sql.
 *
 * Phase 1.1 locks the wire format for `resultsJson` and `diagnosticsJson`.
 * The metric-run results shape is the canonical contract for DPI / RVPI /
 * TVPI / MOIC / Net IRR / Gross IRR plus the XIRR diagnostic wrapper that
 * Phase 1.2 (engine) will produce. Money fields are decimal strings per
 * ADR-011 (docs/adr/ADR-011-decimal-string-api-convention.md). XIRR
 * diagnostics follow ADR-010 (docs/adr/ADR-010-xirr-day-count-and-bounds.md).
 *
 * @module shared/contracts/lp-reporting/lp-metric-run.contract
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';

import { DecimalStringSchema } from './cash-flow-event.contract';

export const LpMetricRunTypeSchema = z.enum([
  'quarterly_report',
  'fundraise_pack',
  'internal_review',
  'lp_update',
]);

export const LpMetricRunPerspectiveSchema = z.enum(['lp_net', 'fund_gross', 'vehicle']);

export const LpMetricRunStatusSchema = z.enum([
  'draft',
  'approved',
  'locked',
  'exported',
  'superseded',
]);

export type LpMetricRunType = z.infer<typeof LpMetricRunTypeSchema>;
export type LpMetricRunPerspective = z.infer<typeof LpMetricRunPerspectiveSchema>;
export type LpMetricRunStatus = z.infer<typeof LpMetricRunStatusSchema>;

// ---------------------------------------------------------------------------
// XIRR diagnostic enums + shape (per ADR-010, mirrors XIRRResult in
// shared/lib/finance/xirr.ts and the Phase 1 diagnostic wrapper contract).
// ---------------------------------------------------------------------------

export const XirrConvergenceSchema = z.enum(['converged', 'bounded_high', 'bounded_low', 'failed']);

export const XirrMethodSchema = z.enum(['newton', 'brent', 'bisection', 'none']);

export const XirrBoundHitSchema = z.enum(['min', 'max']);

export const XirrFailureReasonSchema = z.enum([
  'INSUFFICIENT_CASH_FLOWS',
  'NO_SIGN_CHANGE',
  'MULTIPLE_ROOTS',
  'OUT_OF_BOUNDS_HIGH',
  'OUT_OF_BOUNDS_LOW',
  'NUMERICAL_INSTABILITY',
]);

export const XirrDiagnosticSchema = z
  .object({
    convergence: XirrConvergenceSchema,
    iterations: z.number().int().nonnegative(),
    method: XirrMethodSchema,
    boundHit: XirrBoundHitSchema.nullable(),
    failureReason: XirrFailureReasonSchema.nullable(),
  })
  .strict();

export const MarkConfidenceMixSchema = z
  .object({
    high: z.number().int().nonnegative(),
    medium: z.number().int().nonnegative(),
    low: z.number().int().nonnegative(),
  })
  .strict();

export type XirrConvergence = z.infer<typeof XirrConvergenceSchema>;
export type XirrMethod = z.infer<typeof XirrMethodSchema>;
export type XirrBoundHit = z.infer<typeof XirrBoundHitSchema>;
export type XirrFailureReason = z.infer<typeof XirrFailureReasonSchema>;
export type XirrDiagnostic = z.infer<typeof XirrDiagnosticSchema>;
export type MarkConfidenceMix = z.infer<typeof MarkConfidenceMixSchema>;

// ---------------------------------------------------------------------------
// Metric-run results (locked Phase 1.1 wire format).
// All money + ratio fields are decimal strings; null is allowed for
// ratios that are undefined when contributions are zero (e.g. dpi/rvpi).
// ---------------------------------------------------------------------------

export const LpMetricRunResultsSchema = z
  .object({
    asOfDate: z.string().date(),
    currency: z.literal('USD').default('USD'),
    dpi: DecimalStringSchema.nullable(),
    rvpi: DecimalStringSchema.nullable(),
    tvpi: DecimalStringSchema.nullable(),
    moic: DecimalStringSchema.nullable(),
    netIrr: DecimalStringSchema.nullable(),
    grossIrr: DecimalStringSchema.nullable(),
    xirrDiagnostic: z
      .object({
        net: XirrDiagnosticSchema,
        gross: XirrDiagnosticSchema,
      })
      .strict(),
    contributionsTotal: DecimalStringSchema,
    distributionsTotal: DecimalStringSchema,
    currentNav: DecimalStringSchema,
    markConfidenceMix: MarkConfidenceMixSchema,
  })
  .strict();

export type LpMetricRunResults = z.infer<typeof LpMetricRunResultsSchema>;

// ---------------------------------------------------------------------------
// Diagnostics (sidecar; engine version, precision, warnings).
// ---------------------------------------------------------------------------

export const ImportWarningCodeSchema = z.string().min(1);

export const LpMetricRunDiagnosticsSchema = z
  .object({
    engineVersion: z.string().min(1),
    decimalPrecision: z.number().int().positive(),
    excludedFutureMarks: z.array(z.number().int().positive()).default([]),
    warnings: z
      .array(
        z
          .object({
            code: ImportWarningCodeSchema,
            message: z.string(),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

export type LpMetricRunDiagnostics = z.infer<typeof LpMetricRunDiagnosticsSchema>;

// ---------------------------------------------------------------------------
// CREATE request (mirrors lp_metric_runs row insert).
// ---------------------------------------------------------------------------

export const LpMetricRunCreateSchema = z
  .object({
    fundId: z.number().int().positive(),
    vehicleId: z.number().int().positive().optional(),

    asOfDate: z.string().date(),
    runType: LpMetricRunTypeSchema,
    perspective: LpMetricRunPerspectiveSchema,
    status: LpMetricRunStatusSchema.default('draft'),

    inputsHash: z.string().min(1).max(128),
    sourceEventIds: z.array(z.number().int().positive()).default([]),
    sourceMarkIds: z.array(z.number().int().positive()).default([]),
    sourceEvidenceIds: z.array(z.number().int().positive()).default([]),

    methodologyVersion: z.string().min(1).max(64),
    calculationVersion: z.string().min(1).max(64),

    /** Locked Phase 1.1 metric-run results shape. */
    resultsJson: LpMetricRunResultsSchema,
    /** Locked Phase 1.1 diagnostics shape. */
    diagnosticsJson: LpMetricRunDiagnosticsSchema.optional(),
  })
  .strict();

export type LpMetricRunCreate = z.infer<typeof LpMetricRunCreateSchema>;
