/**
 * Internal periodic analysis routes (PLAN_61 Task 18, Wave G).
 *
 * Drafts are revisable and carry an ETag derived from their row version; refresh
 * and save are `If-Match`-guarded so a stale reader cannot clobber a concurrent
 * refresh (missing header -> 428, stale header -> 412). References are immutable
 * and are listed terminal-per-chain by default.
 *
 * These are INTERNAL reference snapshots -- never closes, restatements, or
 * approved reports. There is deliberately no approval, recipient, send, or export
 * endpoint here, and `tests/unit/source/internal-analysis-boundary.test.ts` keeps
 * it that way.
 *
 * @module server/routes/internal-analysis
 */
import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { toNumber } from '@shared/number';
import {
  AnalysisDraftCreateRequestSchema,
  AnalysisDraftSaveRequestSchema,
  AnalysisPeriodSchema,
  QuarterlyDraftRunRequestSchema,
} from '../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import { requireAuth, requireFundAccess, requireRole } from '../lib/auth/jwt.js';
import { FundScopeError } from '../lib/fund-scoped-ownership';
import { assertNotModified, setETagHeaders, weakETag } from '../lib/http-preconditions';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';
import {
  AnalysisCheckpointServiceError,
  type DraftRecord,
  createAnalysisCheckpointPorts,
  createDraftForPeriod,
  listReferences,
  planQuarterlyDrafts,
  refreshDraft,
  saveDraft,
  startCorrectionDraft,
  toDraftContract,
  toReferenceContract,
} from '../services/internal-analysis/analysis-checkpoint-service';

const routeLog = createRouteLogger('internal-analysis');
const router = Router();

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function validateFundIdParam(req: Request, res: Response, next: NextFunction) {
  try {
    toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    next();
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid parameter')) return;
    throw error;
  }
}

function routeHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function fundIdOf(req: Request): number {
  return toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
}

function actorIdOf(req: Request): number | null {
  const raw = req.user?.id ?? req.user?.sub;
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Draft-scoped ETag. `rowVersionETag` hashes the bare version, which would collide
 * across drafts that happen to share a version number, so the fund and draft are
 * folded in.
 */
function draftETag(draft: DraftRecord): string {
  return weakETag(`internal-analysis-draft:${draft.fundId}:${draft.draftId}:${draft.version}`);
}

/** Resolve the draft an `If-Match`-guarded write targets, or answer 404/428/412. */
async function requireFreshDraft(
  req: Request,
  fundId: number,
  draftId: number
): Promise<DraftRecord> {
  const ports = createAnalysisCheckpointPorts();
  const draft = await ports.getDraftById(fundId, draftId);
  if (draft === null) {
    throw new AnalysisCheckpointServiceError(404, 'DRAFT_NOT_FOUND', 'Analysis draft not found.');
  }
  // Throws 428 when If-Match is absent, 412 when it no longer matches.
  assertNotModified(draftETag(draft), req.header('If-Match'));
  return draft;
}

function respondToTypedError(error: unknown, res: Response): boolean {
  if (error instanceof AnalysisCheckpointServiceError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return true;
  }
  if (error instanceof FundScopeError) {
    res.status(404).json({ error: error.code, message: error.message });
    return true;
  }
  if (error instanceof IdempotentCommandError) {
    res.status(409).json({
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return true;
  }
  const precondition = error as { status?: number; code?: string; message?: string } | null;
  if (precondition && (precondition.status === 428 || precondition.status === 412)) {
    res.status(precondition.status).json({
      error: precondition.code ?? 'PRECONDITION_FAILED',
      message: precondition.message ?? 'Precondition failed',
    });
    return true;
  }
  return false;
}

router.get(
  '/funds/:fundId/internal-analysis/drafts',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const drafts = await createAnalysisCheckpointPorts().listDrafts(fundIdOf(req));
    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ drafts: drafts.map(toDraftContract) });
  })
);

router.get(
  '/funds/:fundId/internal-analysis/drafts/:draftId',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!Number.isInteger(draftId) || draftId < 1) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid draftId' });
    }

    const draft = await createAnalysisCheckpointPorts().getDraftById(fundId, draftId);
    if (draft === null) {
      return res
        .status(404)
        .json({ error: 'DRAFT_NOT_FOUND', message: 'Analysis draft not found.' });
    }

    // The ETag a subsequent refresh or save must echo back in If-Match.
    setETagHeaders(res, draftETag(draft));
    return res.json({ draft: toDraftContract(draft) });
  })
);

router.post(
  '/funds/:fundId/internal-analysis/drafts',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const parsed = AnalysisDraftCreateRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_analysis_draft_request',
        message: 'Invalid analysis draft request',
        details: parsed.error.flatten(),
      });
    }

    const period = AnalysisPeriodSchema.safeParse(parsed.data);
    if (!period.success) {
      return res.status(400).json({
        error: 'invalid_analysis_period',
        message: 'Invalid analysis period',
        details: period.error.flatten(),
      });
    }

    try {
      const draft = await createDraftForPeriod(createAnalysisCheckpointPorts(), {
        fundId,
        period: period.data,
        actorId: actorIdOf(req),
      });
      setETagHeaders(res, draftETag(draft));
      return res.status(201).json({ draft: toDraftContract(draft) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to create analysis draft');
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/drafts/:draftId/refresh',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!Number.isInteger(draftId) || draftId < 1) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid draftId' });
    }

    try {
      const current = await requireFreshDraft(req, fundId, draftId);
      const refreshed = await refreshDraft(createAnalysisCheckpointPorts(), {
        fundId,
        draftId,
        expectedVersion: current.version,
        actorId: actorIdOf(req),
      });
      // Refresh advanced the cutoff and repinned every consumer, so the ETag rotates.
      setETagHeaders(res, draftETag(refreshed));
      return res.json({ draft: toDraftContract(refreshed) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId, draftId }, 'Failed to refresh analysis draft');
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/drafts/:draftId/save',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!Number.isInteger(draftId) || draftId < 1) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid draftId' });
    }

    const parsed = AnalysisDraftSaveRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_analysis_save_request',
        message: 'Invalid analysis save request',
        details: parsed.error.flatten(),
      });
    }

    try {
      const current = await requireFreshDraft(req, fundId, draftId);
      const reference = await saveDraft(createAnalysisCheckpointPorts(), {
        fundId,
        draftId,
        expectedVersion: current.version,
        acknowledgeMixedBasis: parsed.data.acknowledgeMixedBasis,
        actorId: actorIdOf(req),
      });
      return res.status(201).json({ reference: toReferenceContract(reference) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId, draftId }, 'Failed to save analysis draft');
      throw error;
    }
  })
);

router.get(
  '/funds/:fundId/internal-analysis/references',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    // Terminal-per-chain by default: a corrected snapshot must not compete with
    // its successor in comparison.
    const includeSuperseded = req.query['includeSuperseded'] === 'true';
    const references = await listReferences(createAnalysisCheckpointPorts(), {
      fundId,
      includeSuperseded,
    });

    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ references: references.map(toReferenceContract) });
  })
);

router.get(
  '/funds/:fundId/internal-analysis/references/:referenceId',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const referenceId = Number(req.params['referenceId']);
    if (!Number.isInteger(referenceId) || referenceId < 1) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid referenceId' });
    }

    const ports = createAnalysisCheckpointPorts();
    const reference = await ports.getReferenceById(fundId, referenceId);
    if (reference === null) {
      return res
        .status(404)
        .json({ error: 'REFERENCE_NOT_FOUND', message: 'Analysis reference not found.' });
    }

    // The contract requires revisionHistory; it is also where an explicit
    // mixed-basis acknowledgement is recorded (R34-d), so the detail view can
    // show WHY a reference carries the warning.
    const revisionHistory = await ports.listRevisionEvents(fundId, referenceId);

    res.setHeader('Cache-Control', 'private, no-store');
    return res.json({ reference: toReferenceContract(reference), revisionHistory });
  })
);

router.post(
  '/funds/:fundId/internal-analysis/references/:referenceId/drafts',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const referenceId = Number(req.params['referenceId']);
    if (!Number.isInteger(referenceId) || referenceId < 1) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid referenceId' });
    }

    try {
      // A late correction: saving this draft supersedes the reference it came from.
      const draft = await startCorrectionDraft(createAnalysisCheckpointPorts(), {
        fundId,
        referenceId,
        actorId: actorIdOf(req),
      });
      setETagHeaders(res, draftETag(draft));
      return res.status(201).json({ draft: toDraftContract(draft) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId, referenceId }, 'Failed to start a correction draft');
      throw error;
    }
  })
);

/**
 * Manual planner trigger (R33-b). Startup catch-up is bounded to 30 days, which at
 * quarterly cadence covers at most one period; this is the escape hatch for a
 * longer outage. It only ENQUEUES, so it is safe on either surface -- the job is
 * processed by the Docker/Railway worker that owns the claim loop.
 */
router.post(
  '/admin/funds/:fundId/internal-analysis/quarterly-draft-run',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireRole('admin'),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const parsed = QuarterlyDraftRunRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_quarterly_draft_run_request',
        message: 'Invalid quarterly draft run request',
        details: parsed.error.flatten(),
      });
    }

    let period;
    if (parsed.data.periodStart !== undefined && parsed.data.periodEnd !== undefined) {
      const candidate = AnalysisPeriodSchema.safeParse({
        periodKind: 'quarterly',
        periodStart: parsed.data.periodStart,
        periodEnd: parsed.data.periodEnd,
      });
      if (!candidate.success) {
        return res.status(400).json({
          error: 'invalid_analysis_period',
          message: 'Invalid analysis period',
          details: candidate.error.flatten(),
        });
      }
      period = candidate.data;
    }

    try {
      const ports = createAnalysisCheckpointPorts();
      const result = await planQuarterlyDrafts(ports, new Date(), {
        ...(parsed.data.catchupDays === undefined ? {} : { catchupDays: parsed.data.catchupDays }),
        ...(period === undefined ? {} : { period }),
        // Restrict the fan-out to the fund this admin route is scoped to.
        fundIds: [fundId],
      });
      return res.status(202).json(result);
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to plan quarterly analysis drafts');
      throw error;
    }
  })
);

export default router;
