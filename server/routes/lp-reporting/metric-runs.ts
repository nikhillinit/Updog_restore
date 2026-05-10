/**
 * LP Reporting -- metric-run preview and draft commit routes.
 *
 *   POST /api/funds/:fundId/metric-runs/dry-run
 *   POST /api/funds/:fundId/metric-runs/commit
 *
 * Dry-run returns the full metric envelope plus a server-owned preview hash.
 * Commit re-runs the calculation from persisted source rows and only writes a
 * draft lp_metric_runs row when that hash still matches.
 *
 * @module server/routes/lp-reporting/metric-runs
 * @see docs/adr/ADR-010-xirr-day-count-and-bounds.md
 * @see docs/adr/ADR-011-decimal-string-api-convention.md
 */

import { Router, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';

import { requireAuth, requireFundAccess } from '../../lib/auth/jwt';
import { firstString } from '../../lib/request-values';
import {
  MetricRunCommitRequestSchema,
  MetricRunCommitResponseSchema,
  MetricRunDryRunRequestSchema,
  MetricRunDryRunResponseSchema,
} from '@shared/contracts/lp-reporting';
import {
  buildMetricRunDryRun,
  commitMetricRun,
  MetricRunCommitError,
} from '../../services/lp-reporting/metric-run-commit-service';

const router = Router();

const metricRunLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'TOO_MANY_REQUESTS',
    message: 'LP-reporting metric-run requests are limited to 20 per hour per user.',
  },
  keyGenerator: (req: Request) => {
    const userId = req.user?.id;
    return userId !== undefined
      ? `lp-reporting-metric-run:${userId}`
      : 'lp-reporting-metric-run:anon';
  },
});

function parseFundId(req: Request): number {
  const fundId = Number.parseInt(firstString(req.params['fundId']) ?? '', 10);
  if (!Number.isFinite(fundId) || fundId <= 0) {
    throw new MetricRunCommitError(400, 'INVALID_FUND_ID', 'fundId must be a positive integer.');
  }
  return fundId;
}

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

function resolveAuthenticatedUserId(req: Request): number {
  const userWithLegacyId = req.user as (Express.User & { userId?: unknown }) | undefined;
  const userId =
    numericIdentity(userWithLegacyId?.userId) ??
    numericIdentity(req.user?.id) ??
    numericIdentity(req.user?.sub);
  if (userId === null) {
    throw new MetricRunCommitError(
      401,
      'AUTH_USER_ID_UNRESOLVED',
      'Authenticated user could not be resolved to a numeric users.id.'
    );
  }
  return userId;
}

function sendMetricRunError(
  res: Response,
  err: unknown,
  fallbackCode: 'METRIC_RUN_DRY_RUN_FAILED' | 'METRIC_RUN_COMMIT_FAILED'
): Response {
  if (err instanceof MetricRunCommitError) {
    return res.status(err.status).json({
      error: err.code,
      message: err.message,
      ...(err.details !== undefined && { details: err.details }),
    });
  }
  const message = err instanceof Error ? err.message : 'Unknown error';
  return res.status(500).json({
    error: fallbackCode,
    message,
  });
}

router.post(
  '/api/funds/:fundId/metric-runs/dry-run',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const parsed = MetricRunDryRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await buildMetricRunDryRun({
        fundId: parseFundId(req),
        ...parsed.data,
      });
      const validated = MetricRunDryRunResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_DRY_RUN_FAILED');
    }
  }
);

router.post(
  '/api/funds/:fundId/metric-runs/commit',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const parsed = MetricRunCommitRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await commitMetricRun({
        fundId: parseFundId(req),
        userId: resolveAuthenticatedUserId(req),
        ...parsed.data,
      });
      const validated = MetricRunCommitResponseSchema.parse(result);
      return res.status(validated.inserted ? 201 : 200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_COMMIT_FAILED');
    }
  }
);

export default router;
