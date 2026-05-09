/**
 * LP Reporting -- Metric-run dry-run route (Phase 1.3).
 *
 * One protected POST endpoint. Dry-run only -- no writes to the
 * lp_metric_runs table (persistence ships in a follow-up run).
 *
 *   POST /api/funds/:fundId/metric-runs/dry-run
 *
 * Middleware chain (mirrors server/routes/lp-reporting/imports.ts):
 *   requireAuth() -> requireFundAccess -> rateLimit(20/hour/user) -> handler
 *
 * Handler flow:
 *   1. Parse fundId from req.params (numeric).
 *   2. Validate body via MetricRunDryRunRequestSchema.
 *   3. Reject perspective='vehicle' (unsupported by Phase 1.2 engine).
 *   4. Load cashFlowEvents + valuationMarks by id from the database, scoped to fundId.
 *   5. Map DB rows -> engine input types (ParsedCashFlowEvent / ParsedValuationMark).
 *   6. Call computeMetrics() from the engine.
 *   7. Validate result.results via LpMetricRunResultsSchema.parse.
 *   8. Return 200 with the parsed result + diagnostics + inputsHash.
 *
 * @module server/routes/lp-reporting/metric-runs
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import { inArray } from 'drizzle-orm';
import { z } from 'zod';

import { requireAuth, requireFundAccess } from '../../lib/auth/jwt';
import { firstString } from '../../lib/request-values';
import { db } from '../../db';
import { cashFlowEvents, valuationMarks } from '@shared/schema/lp-reporting-evidence';
import {
  LpMetricRunResultsSchema,
  LpMetricRunTypeSchema,
  LpMetricRunPerspectiveSchema,
} from '@shared/contracts/lp-reporting';
import {
  computeMetrics,
  type CashFlowEventType,
  type CashFlowPerspectiveLite,
  type ConfidenceLevel,
  type EventStatus,
  type MarkStatus,
  type ParsedCashFlowEvent,
  type ParsedValuationMark,
} from '../../services/lp-reporting/metrics-engine';

const router = Router();

const MetricRunDryRunRequestSchema = z
  .object({
    asOfDate: z.string().date(),
    runType: LpMetricRunTypeSchema,
    perspective: LpMetricRunPerspectiveSchema,
    sourceEventIds: z.array(z.number().int().positive()).default([]),
    sourceMarkIds: z.array(z.number().int().positive()).default([]),
  })
  .strict();

const metricRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'LP-reporting metric-run dry-runs are limited to 20 per hour per user.',
  },
  // Mirror keyGenerator pattern from imports.ts -- bucket by user id, never IP.
  keyGenerator: (req: Request) => {
    const userId = req.user?.id;
    return userId !== undefined
      ? `lp-reporting-metric-run:${userId}`
      : 'lp-reporting-metric-run:anon';
  },
});

/**
 * Convert a Drizzle timestamp value (Date | string) to an ISO date-time string
 * for the engine. The engine slices to YYYY-MM-DD internally so either form
 * works, but normalising here avoids leaking Date objects into pure code.
 */
function toIsoDateString(value: Date | string): string {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value;
}

router.post(
  '/api/funds/:fundId/metric-runs/dry-run',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);
    if (!Number.isFinite(fundId) || fundId <= 0) {
      return res.status(400).json({ error: 'INVALID_FUND_ID' });
    }

    const parsed = MetricRunDryRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
      });
    }
    const { asOfDate, runType, perspective, sourceEventIds, sourceMarkIds } = parsed.data;

    // Phase 1.2 engine supports lp_net and fund_gross only. 'vehicle' is in
    // the schema (Phase 1.1 wire format reserves it) but not yet implemented.
    if (perspective !== 'lp_net' && perspective !== 'fund_gross') {
      return res.status(400).json({
        error: 'UNSUPPORTED_PERSPECTIVE',
        message: 'metric-run dry-run currently supports lp_net and fund_gross only.',
      });
    }

    try {
      const eventRows = sourceEventIds.length
        ? await db.select().from(cashFlowEvents).where(inArray(cashFlowEvents.id, sourceEventIds))
        : [];

      const markRows = sourceMarkIds.length
        ? await db.select().from(valuationMarks).where(inArray(valuationMarks.id, sourceMarkIds))
        : [];

      // Defense-in-depth: requireFundAccess covered URL fundId, but the
      // requested event/mark IDs could belong to a different fund. Reject
      // any cross-fund row before it can contribute to metrics.
      const wrongFundEvents = eventRows.filter((e) => e.fundId !== fundId);
      const wrongFundMarks = markRows.filter((m) => m.fundId !== fundId);
      if (wrongFundEvents.length > 0 || wrongFundMarks.length > 0) {
        return res.status(403).json({
          error: 'CROSS_FUND_RESOURCE',
          message: 'one or more requested event/mark IDs do not belong to this fund',
        });
      }

      // Map DB rows -> engine input shapes. The engine uses string-typed
      // discriminators (event_type, perspective, status, confidence_level)
      // rather than the broad varchar typing returned by Drizzle, so cast
      // explicitly here. The DB CHECK constraints guarantee the values.
      const cashFlowEventsParsed: ParsedCashFlowEvent[] = eventRows.map((row) => ({
        id: row.id,
        eventType: row.eventType as CashFlowEventType,
        amount: row.amount,
        eventDate: toIsoDateString(row.eventDate),
        perspective: row.perspective as CashFlowPerspectiveLite,
        ...(row.status != null && { status: row.status as EventStatus }),
        reversalOfEventId: row.reversalOfEventId ?? null,
      }));

      const valuationMarksParsed: ParsedValuationMark[] = markRows.map((row) => ({
        id: row.id,
        fairValue: row.fairValue,
        markDate: row.markDate,
        asOfDate: row.asOfDate,
        ...(row.status != null && { status: row.status as MarkStatus }),
        confidenceLevel: row.confidenceLevel as ConfidenceLevel,
        ...(row.companyId != null && { companyId: row.companyId }),
      }));

      const computed = computeMetrics({
        fundId,
        asOfDate,
        perspective,
        cashFlowEvents: cashFlowEventsParsed,
        valuationMarks: valuationMarksParsed,
      });

      // Defensive validation of engine output before returning. The engine
      // is pure and tested directly; this guards against contract drift.
      const resultsParsed = LpMetricRunResultsSchema.parse(computed.results);

      return res.status(200).json({
        results: resultsParsed,
        diagnostics: computed.diagnostics,
        inputsHash: computed.inputsHash,
        runType,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      return res.status(500).json({
        error: 'METRIC_RUN_DRY_RUN_FAILED',
        message,
      });
    }
  }
);

export default router;
