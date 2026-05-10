/**
 * LP Reporting -- metric-run preview and draft commit routes.
 *
 *   POST /api/funds/:fundId/metric-runs/dry-run
 *   POST /api/funds/:fundId/metric-runs/commit
 *   GET  /api/funds/:fundId/metric-runs/latest
 *   GET  /api/funds/:fundId/metric-runs/:metricRunId
 *   POST /api/funds/:fundId/metric-runs/:metricRunId/approve
 *   POST /api/funds/:fundId/metric-runs/:metricRunId/lock
 *   GET  /api/funds/:fundId/metric-runs/:metricRunId/evidence-records
 *   POST /api/funds/:fundId/metric-runs/:metricRunId/evidence-records
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
  MetricRunDetailResponseSchema,
  MetricRunDryRunRequestSchema,
  MetricRunDryRunResponseSchema,
  LatestMetricRunQuerySchema,
  LatestMetricRunResponseSchema,
  MetricRunApproveRequestSchema,
  MetricRunEvidenceCreateRequestSchema,
  MetricRunEvidenceCreateResponseSchema,
  MetricRunEvidenceListResponseSchema,
  MetricRunLifecycleResponseSchema,
  MetricRunLockRequestSchema,
} from '@shared/contracts/lp-reporting';
import {
  buildMetricRunDryRun,
  commitMetricRun,
  MetricRunCommitError,
} from '../../services/lp-reporting/metric-run-commit-service';
import {
  createMetricRunEvidence,
  listMetricRunEvidence,
} from '../../services/lp-reporting/metric-run-evidence-service';
import {
  approveMetricRun,
  getLatestMetricRun,
  getMetricRunDetail,
  lockMetricRun,
} from '../../services/lp-reporting/metric-run-lifecycle-service';

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

function parseMetricRunId(req: Request): number {
  const metricRunId = Number.parseInt(firstString(req.params['metricRunId']) ?? '', 10);
  if (!Number.isFinite(metricRunId) || metricRunId <= 0) {
    throw new MetricRunCommitError(
      400,
      'INVALID_METRIC_RUN_ID',
      'metricRunId must be a positive integer.'
    );
  }
  return metricRunId;
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
  fallbackCode:
    | 'METRIC_RUN_DRY_RUN_FAILED'
    | 'METRIC_RUN_COMMIT_FAILED'
    | 'METRIC_RUN_DETAIL_FAILED'
    | 'METRIC_RUN_LATEST_FAILED'
    | 'METRIC_RUN_APPROVE_FAILED'
    | 'METRIC_RUN_LOCK_FAILED'
    | 'METRIC_RUN_EVIDENCE_CREATE_FAILED'
    | 'METRIC_RUN_EVIDENCE_LIST_FAILED'
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

router.get(
  '/api/funds/:fundId/metric-runs/latest',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const parsed = LatestMetricRunQuerySchema.safeParse({
      runType: firstString(req.query['runType']),
      perspective: firstString(req.query['perspective']),
      asOfDate: firstString(req.query['asOfDate']),
    });
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_QUERY',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await getLatestMetricRun({
        fundId: parseFundId(req),
        ...parsed.data,
      });
      const validated = LatestMetricRunResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_LATEST_FAILED');
    }
  }
);

router.get(
  '/api/funds/:fundId/metric-runs/:metricRunId',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = await getMetricRunDetail({
        fundId: parseFundId(req),
        metricRunId: parseMetricRunId(req),
      });
      const validated = MetricRunDetailResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_DETAIL_FAILED');
    }
  }
);

router.post(
  '/api/funds/:fundId/metric-runs/:metricRunId/approve',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const parsed = MetricRunApproveRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await approveMetricRun({
        fundId: parseFundId(req),
        metricRunId: parseMetricRunId(req),
        userId: resolveAuthenticatedUserId(req),
        expectedVersion: parsed.data.expectedVersion,
      });
      const validated = MetricRunLifecycleResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_APPROVE_FAILED');
    }
  }
);

router.post(
  '/api/funds/:fundId/metric-runs/:metricRunId/lock',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const parsed = MetricRunLockRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await lockMetricRun({
        fundId: parseFundId(req),
        metricRunId: parseMetricRunId(req),
        userId: resolveAuthenticatedUserId(req),
        expectedVersion: parsed.data.expectedVersion,
      });
      const validated = MetricRunLifecycleResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_LOCK_FAILED');
    }
  }
);

router.get(
  '/api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    try {
      const result = await listMetricRunEvidence({
        fundId: parseFundId(req),
        metricRunId: parseMetricRunId(req),
      });
      const validated = MetricRunEvidenceListResponseSchema.parse(result);
      return res.status(200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_EVIDENCE_LIST_FAILED');
    }
  }
);

router.post(
  '/api/funds/:fundId/metric-runs/:metricRunId/evidence-records',
  requireAuth(),
  requireFundAccess,
  metricRunLimiter,
  async (req: Request, res: Response) => {
    const parsed = MetricRunEvidenceCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'INVALID_REQUEST_BODY',
        issues: parsed.error.issues,
      });
    }

    try {
      const result = await createMetricRunEvidence({
        fundId: parseFundId(req),
        metricRunId: parseMetricRunId(req),
        userId: resolveAuthenticatedUserId(req),
        body: parsed.data,
      });
      const validated = MetricRunEvidenceCreateResponseSchema.parse(result);
      return res.status(validated.inserted ? 201 : 200).json(validated);
    } catch (err) {
      return sendMetricRunError(res, err, 'METRIC_RUN_EVIDENCE_CREATE_FAILED');
    }
  }
);

export default router;
