/**
 * LP Reporting -- Metric Run Commit Contract (Phase 1c.1).
 *
 * Wire format for the protected commit endpoint:
 *   POST /api/funds/:fundId/metric-runs/commit
 *
 * The commit request carries previewHash + inputsHash so the server can
 *   1. Detect drift (recompute previewHash from the resolved source IDs;
 *      if it differs, return HTTP 409 PREVIEW_DRIFT).
 *   2. Idempotently match an existing draft row by (fundId, inputsHash).
 *      The response sets idempotentHit=true when an existing row is
 *      returned without a new INSERT.
 *
 * @module shared/contracts/lp-reporting/lp-metric-run-commit.contract
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { z } from 'zod';

import { PreviewHashSchema } from './import-commit.contract';
import { LpMetricRunPerspectiveSchema, LpMetricRunTypeSchema } from './lp-metric-run.contract';

export const MetricRunCommitRequestSchema = z
  .object({
    fundId: z.number().int().positive(),
    /** YYYY-MM-DD; structural regex only. Engine enforces calendar semantics. */
    asOfDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    runType: LpMetricRunTypeSchema,
    perspective: LpMetricRunPerspectiveSchema,
    sourceEventIds: z.array(z.number().int().positive()),
    sourceMarkIds: z.array(z.number().int().positive()),
    previewHash: PreviewHashSchema,
    /** sha256 hex; same shape as PreviewHashSchema, semantically distinct. */
    inputsHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();

export const MetricRunCommitResponseSchema = z
  .object({
    metricRunId: z.number().int().positive(),
    inputsHash: z.string().regex(/^[a-f0-9]{64}$/),
    previewHash: PreviewHashSchema,
    /** ISO 8601 with offset. */
    committedAt: z.string().datetime({ offset: true }),
    status: z.literal('draft'),
    /** true when (fundId, inputsHash) matched an existing row (no new INSERT). */
    idempotentHit: z.boolean(),
  })
  .strict();

export type MetricRunCommitRequest = z.infer<typeof MetricRunCommitRequestSchema>;
export type MetricRunCommitResponse = z.infer<typeof MetricRunCommitResponseSchema>;
