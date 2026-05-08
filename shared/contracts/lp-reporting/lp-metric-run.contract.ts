/**
 * LP Reporting -- LP Metric Run Contract (CREATE shape)
 *
 * Mirrors the lp_metric_runs table from
 * server/migrations/20260508_lp_reporting_foundation_v1.up.sql.
 *
 * `resultsJson` and `diagnosticsJson` are intentionally `z.unknown()`
 * for Phase 0; the metric-run results shape is filled by Phase 1 once
 * DPI / RVPI / TVPI / MOIC / Net IRR / Gross IRR are implemented and
 * the XIRR diagnostic wrapper exists. Locking the wire format now would
 * either constrain Phase 1's design or be wrong on first contact.
 *
 * @module shared/contracts/lp-reporting/lp-metric-run.contract
 */

import { z } from 'zod';

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

    /** Phase 1 fills the metric-run results shape. */
    resultsJson: z.unknown(),
    /** Phase 1 fills the diagnostics shape. */
    diagnosticsJson: z.unknown().optional(),
  })
  .strict();

export type LpMetricRunCreate = z.infer<typeof LpMetricRunCreateSchema>;
