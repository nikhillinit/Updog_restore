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

import { createHash } from 'node:crypto';

import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { PARTNER_WRITE_ROLES, TEAM_WRITE_ROLES } from '@shared/auth/effective-roles';
import { toNumber } from '@shared/number';
import {
  AnalysisDraftCreateRequestSchema,
  AnalysisDraftEconomicsReferencePatchRequestSchema,
  AnalysisDraftSaveRequestSchema,
  AnalysisPeriodSchema,
  QuarterlyDraftRunRequestSchema,
} from '../../shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import {
  QuarterlyReviewCategorySchema,
  QuarterlyReviewItemMutationSchema,
  QuarterlyReviewWaiverMutationSchema,
} from '../../shared/contracts/internal-analysis/quarterly-review-v1.contract';
import {
  NarrativeGenerateRequestSchema,
  NarrativeNoteCreateRequestSchema,
  NarrativeReviseRequestSchema,
  type NarrativeAnchor,
} from '../../shared/contracts/internal-analysis/internal-narrative-draft-v1.contract';
import {
  InternalNarrativeServiceError,
  appendNote,
  createInternalNarrativePorts,
  generateNarrative,
  getNarrativeForAnchor,
  listNotesForAnchor,
  reviseNarrative,
  toNarrativeContract,
  toNoteContract,
} from '../services/internal-analysis/internal-narrative-draft-service';

import { requireAuth, requireFundAccess, requireRole, requireWriteRole } from '../lib/auth/jwt.js';
import { FundScopeError } from '../lib/fund-scoped-ownership';
import { setETagHeaders, weakETag } from '../lib/http-preconditions';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { parseInternalEconomicsIdempotencyKey } from '../lib/internal-economics-idempotency-key.js';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';
import {
  AnalysisCheckpointServiceError,
  type DraftRecord,
  createAnalysisCheckpointPorts,
  createDraftForPeriod,
  listReferences,
  planQuarterlyDrafts,
  replaceDraftEconomicsReferenceWithReceipt,
  refreshDraftWithReceipt,
  saveDraftWithReceipt,
  startCorrectionDraft,
  toDraftContract,
  toReferenceContract,
} from '../services/internal-analysis/analysis-checkpoint-service';
import {
  QuarterlyReviewServiceError,
  createQuarterlyReviewPorts,
  executeQuarterlyReviewItemCommand,
  executeQuarterlyReviewWaiverCommand,
} from '../services/internal-analysis/quarterly-review-service';

const routeLog = createRouteLogger('internal-analysis');
const router = Router();
const POSTGRES_INT_MAX = 2_147_483_647;

function isPositivePostgresInt(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= POSTGRES_INT_MAX;
}

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
    toNumber(req.params['fundId'], 'fundId', {
      integer: true,
      min: 1,
      max: POSTGRES_INT_MAX,
    });
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
  return toNumber(req.params['fundId'], 'fundId', {
    integer: true,
    min: 1,
    max: POSTGRES_INT_MAX,
  });
}

function actorIdOf(req: Request): number | null {
  const raw = req.user?.id ?? req.user?.sub ?? req.context?.userId;
  if (raw === undefined || raw === null) return null;
  const parsed = Number(raw);
  return isPositivePostgresInt(parsed) ? parsed : null;
}

/**
 * Draft-scoped ETag. `rowVersionETag` hashes the bare version, which would collide
 * across drafts that happen to share a version number, so the fund and draft are
 * folded in.
 */
function draftETag(draft: DraftRecord): string {
  return draftVersionETag(draft.fundId, draft.draftId, draft.version);
}

function draftVersionETag(fundId: number, draftId: number, version: number): string {
  return weakETag(`internal-analysis-draft:${fundId}:${draftId}:${version}`);
}

function respondToTypedError(error: unknown, res: Response, context?: { fundId: number }): boolean {
  const typed = error as { code?: unknown; details?: unknown } | null;
  if (
    (typed?.code === 'QUARTERLY_REVIEW_ROSTER_CORRUPT' ||
      typed?.code === 'QUARTERLY_REVIEW_BASIS_CONFLICT') &&
    context
  ) {
    const details = typed.details as { draftId?: unknown; draftVersion?: unknown } | undefined;
    if (typeof details?.draftId === 'number' && typeof details.draftVersion === 'number') {
      setETagHeaders(
        res,
        weakETag(
          `internal-analysis-draft:${context.fundId}:${details.draftId}:${details.draftVersion}`
        )
      );
    }
  }
  if (
    error instanceof AnalysisCheckpointServiceError ||
    error instanceof InternalNarrativeServiceError ||
    error instanceof QuarterlyReviewServiceError
  ) {
    if (
      error.code === 'QUARTERLY_REVIEW_INCOMPLETE' ||
      error.code === 'QUARTERLY_REVIEW_ROSTER_CORRUPT'
    ) {
      routeLog.warn('Quarterly review command rejected by integrity gate', {
        event: 'quarterly-review.command-rejected',
        code: error.code,
        fundId: context?.fundId,
        details: error.details,
      });
    }
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

function requiredCommandHeader(req: Request, name: 'If-Match' | 'Idempotency-Key'): string {
  if (name === 'Idempotency-Key') {
    const parsed = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
    if (parsed.kind === 'missing') {
      throw new AnalysisCheckpointServiceError(
        428,
        'PRECONDITION_REQUIRED',
        'Idempotency-Key header is required.'
      );
    }
    if (parsed.kind === 'invalid') {
      throw new AnalysisCheckpointServiceError(
        400,
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key must contain 1 to 128 RFC token characters.'
      );
    }
    return parsed.value;
  }
  const value = req.header(name);
  if (typeof value !== 'string' || value.trim() === '') {
    throw new AnalysisCheckpointServiceError(
      428,
      'PRECONDITION_REQUIRED',
      `${name} header is required.`
    );
  }
  return value;
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
    if (!isPositivePostgresInt(draftId)) {
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

router.get(
  '/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!isPositivePostgresInt(draftId)) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid draftId' });
    }
    try {
      const review = await createQuarterlyReviewPorts().getCurrentReview(fundId, draftId);
      res.setHeader('Cache-Control', 'private, no-store');
      if (typeof review['draftEtag'] === 'string') res.setHeader('ETag', review['draftEtag']);
      return res.json(review);
    } catch (error) {
      if (respondToTypedError(error, res, { fundId })) return undefined;
      throw error;
    }
  })
);

router.patch(
  '/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/items/:category',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireWriteRole(TEAM_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    const companyId = Number(req.params['companyId']);
    const category = QuarterlyReviewCategorySchema.safeParse(req.params['category']);
    const body = QuarterlyReviewItemMutationSchema.safeParse(req.body);
    if (
      !isPositivePostgresInt(draftId) ||
      !isPositivePostgresInt(companyId) ||
      !category.success ||
      !body.success
    ) {
      return res
        .status(400)
        .json({
          error: 'invalid_quarterly_review_item_request',
          message: 'Invalid quarterly review item request.',
        });
    }
    try {
      const actorId = actorIdOf(req);
      if (actorId === null)
        throw new QuarterlyReviewServiceError(
          403,
          'QUARTERLY_REVIEW_ACTOR_FORBIDDEN',
          'Numeric actor identity is required.'
        );
      const result = await executeQuarterlyReviewItemCommand(createQuarterlyReviewPorts(), {
        fundId,
        draftId,
        companyId,
        category: category.data,
        actorId,
        idempotencyKey: requiredCommandHeader(req, 'Idempotency-Key'),
        rawIfMatch: requiredCommandHeader(req, 'If-Match'),
        body: body.data,
      });
      return res.json({ result });
    } catch (error) {
      if (respondToTypedError(error, res, { fundId })) return undefined;
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/drafts/:draftId/quarterly-review/companies/:companyId/waiver',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireWriteRole(PARTNER_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    const companyId = Number(req.params['companyId']);
    const body = QuarterlyReviewWaiverMutationSchema.safeParse(req.body);
    if (!isPositivePostgresInt(draftId) || !isPositivePostgresInt(companyId) || !body.success) {
      return res
        .status(400)
        .json({
          error: 'invalid_quarterly_review_waiver_request',
          message: 'Invalid quarterly review waiver request.',
        });
    }
    try {
      const actorId = actorIdOf(req);
      if (actorId === null)
        throw new QuarterlyReviewServiceError(
          403,
          'QUARTERLY_REVIEW_ACTOR_FORBIDDEN',
          'Numeric actor identity is required.'
        );
      const result = await executeQuarterlyReviewWaiverCommand(createQuarterlyReviewPorts(), {
        fundId,
        draftId,
        companyId,
        actorId,
        idempotencyKey: requiredCommandHeader(req, 'Idempotency-Key'),
        rawIfMatch: requiredCommandHeader(req, 'If-Match'),
        body: body.data,
      });
      return res.json({ result });
    } catch (error) {
      if (respondToTypedError(error, res, { fundId })) return undefined;
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/drafts',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireWriteRole(TEAM_WRITE_ROLES),
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
      if (respondToTypedError(error, res, { fundId })) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to create analysis draft');
      throw error;
    }
  })
);

router.patch(
  '/funds/:fundId/internal-analysis/drafts/:draftId/economics-reference',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireWriteRole(TEAM_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!isPositivePostgresInt(draftId)) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid draftId' });
    }

    try {
      const parsed = AnalysisDraftEconomicsReferencePatchRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          error: 'invalid_analysis_economics_reference_request',
          message: 'Invalid analysis economics-reference request',
          details: parsed.error.flatten(),
        });
      }
      if (
        parsed.data.economicsReferenceId !== null &&
        !isPositivePostgresInt(parsed.data.economicsReferenceId)
      ) {
        return res.status(400).json({
          error: 'invalid_analysis_economics_reference_request',
          message: 'Invalid analysis economics-reference request',
        });
      }

      const actorId = actorIdOf(req);
      if (actorId === null) {
        throw new AnalysisCheckpointServiceError(403, 'ACTOR_REQUIRED', 'Numeric actor required.');
      }
      const result = await replaceDraftEconomicsReferenceWithReceipt(
        createAnalysisCheckpointPorts(),
        {
          fundId,
          draftId,
          economicsReferenceId: parsed.data.economicsReferenceId,
          actorId,
          idempotencyKey: requiredCommandHeader(req, 'Idempotency-Key'),
          rawIfMatch: requiredCommandHeader(req, 'If-Match'),
        }
      );
      if (result.resultingDraftVersion === undefined) {
        throw new Error('Economics-reference receipt omitted resulting draft version.');
      }
      setETagHeaders(res, draftVersionETag(fundId, draftId, result.resultingDraftVersion));
      return res.json({ result });
    } catch (error) {
      if (respondToTypedError(error, res, { fundId })) return undefined;
      routeLog.error(
        { err: error, fundId, draftId },
        'Failed to replace analysis draft economics reference'
      );
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
  requireWriteRole(TEAM_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!isPositivePostgresInt(draftId)) {
      return res.status(400).json({ error: 'Invalid parameter', message: 'Invalid draftId' });
    }

    try {
      const actorId = actorIdOf(req);
      if (actorId === null) {
        throw new AnalysisCheckpointServiceError(403, 'ACTOR_REQUIRED', 'Numeric actor required.');
      }
      const result = await refreshDraftWithReceipt(createAnalysisCheckpointPorts(), {
        fundId,
        draftId,
        actorId,
        idempotencyKey: requiredCommandHeader(req, 'Idempotency-Key'),
        rawIfMatch: requiredCommandHeader(req, 'If-Match'),
      });
      return res.json({ result });
    } catch (error) {
      if (respondToTypedError(error, res, { fundId })) return undefined;
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
  requireWriteRole(TEAM_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const draftId = Number(req.params['draftId']);
    if (!isPositivePostgresInt(draftId)) {
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
      const actorId = actorIdOf(req);
      if (actorId === null) {
        throw new AnalysisCheckpointServiceError(403, 'ACTOR_REQUIRED', 'Numeric actor required.');
      }
      const reference = await saveDraftWithReceipt(createAnalysisCheckpointPorts(), {
        fundId,
        draftId,
        acknowledgeMixedBasis: parsed.data.acknowledgeMixedBasis,
        actorId,
        idempotencyKey: requiredCommandHeader(req, 'Idempotency-Key'),
        rawIfMatch: requiredCommandHeader(req, 'If-Match'),
      });
      return res.status(201).json({ reference: toReferenceContract(reference) });
    } catch (error) {
      if (respondToTypedError(error, res, { fundId })) return undefined;
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
    if (!isPositivePostgresInt(referenceId)) {
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
  requireWriteRole(TEAM_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const referenceId = Number(req.params['referenceId']);
    if (!isPositivePostgresInt(referenceId)) {
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

// ---------------------------------------------------------------------------
// Task 19: source-linked narrative drafts and append-only notes
// ---------------------------------------------------------------------------

/** Build the anchor from a parsed request/query carrying exactly one of the two ids. */
function toAnchor(input: {
  analysisDraftId?: number | undefined;
  analysisReferenceId?: number | undefined;
}): NarrativeAnchor {
  return input.analysisDraftId !== undefined
    ? { kind: 'analysis_draft', id: input.analysisDraftId }
    : { kind: 'analysis_reference', id: input.analysisReferenceId as number };
}

/** Resolve the anchor from `?analysisDraftId=` / `?analysisReferenceId=`, or answer 400. */
function parseAnchorFromQuery(req: Request, res: Response): NarrativeAnchor | null {
  const draftRaw = req.query['analysisDraftId'];
  const refRaw = req.query['analysisReferenceId'];
  const draftId = draftRaw === undefined ? undefined : Number(draftRaw);
  const refId = refRaw === undefined ? undefined : Number(refRaw);
  const provided = (draftId === undefined ? 0 : 1) + (refId === undefined ? 0 : 1);
  if (provided !== 1) {
    res.status(400).json({
      error: 'invalid_anchor',
      message: 'Provide exactly one of analysisDraftId or analysisReferenceId.',
    });
    return null;
  }
  if (draftId !== undefined) {
    if (!Number.isInteger(draftId) || draftId < 1) {
      res.status(400).json({ error: 'invalid_anchor', message: 'Invalid analysisDraftId' });
      return null;
    }
    return { kind: 'analysis_draft', id: draftId };
  }
  if (refId === undefined || !Number.isInteger(refId) || refId < 1) {
    res.status(400).json({ error: 'invalid_anchor', message: 'Invalid analysisReferenceId' });
    return null;
  }
  return { kind: 'analysis_reference', id: refId };
}

/**
 * The note's idempotency key. A retry with the same `Idempotency-Key` header is a
 * no-op; without one, identical body+supersedes hashes to a stable key so a
 * double-submit still cannot append a duplicate note.
 */
function noteIdempotencyKey(
  req: Request,
  fundId: number,
  anchor: NarrativeAnchor,
  body: string,
  supersedesNoteId: number | null
): string {
  const header = req.header('Idempotency-Key');
  if (header !== undefined && header.trim() !== '') {
    return `note:${fundId}:${header.trim()}`;
  }
  const digest = createHash('sha256')
    .update(`${anchor.kind}:${anchor.id}:${supersedesNoteId ?? ''}:${body}`)
    .digest('hex');
  return `note:${fundId}:${anchor.kind}:${anchor.id}:${digest}`;
}

router.get(
  '/funds/:fundId/internal-analysis/narratives',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const anchor = parseAnchorFromQuery(req, res);
    if (anchor === null) return undefined;

    try {
      const { narrative, basis } = await getNarrativeForAnchor(createInternalNarrativePorts(), {
        fundId,
        anchor,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({
        narrative: narrative === null ? null : toNarrativeContract(narrative, basis),
      });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to load internal narrative');
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/narratives/generate',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const parsed = NarrativeGenerateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_narrative_generate_request',
        message: 'Invalid narrative generate request',
        details: parsed.error.flatten(),
      });
    }

    try {
      const ports = createInternalNarrativePorts();
      const anchor = toAnchor(parsed.data);
      const narrative = await generateNarrative(ports, {
        fundId,
        anchor,
        actorId: actorIdOf(req),
      });
      const basis = await ports.getAnchorBasis(fundId, anchor);
      if (basis === null) {
        return res
          .status(404)
          .json({ error: 'ANCHOR_NOT_FOUND', message: 'Analysis anchor not found.' });
      }
      return res.status(201).json({ narrative: toNarrativeContract(narrative, basis) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to generate internal narrative');
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/narratives/revise',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const parsed = NarrativeReviseRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_narrative_revise_request',
        message: 'Invalid narrative revise request',
        details: parsed.error.flatten(),
      });
    }

    try {
      const ports = createInternalNarrativePorts();
      const anchor = toAnchor(parsed.data);
      const narrative = await reviseNarrative(ports, {
        fundId,
        anchor,
        claims: parsed.data.claims,
        actorId: actorIdOf(req),
      });
      const basis = await ports.getAnchorBasis(fundId, anchor);
      if (basis === null) {
        return res
          .status(404)
          .json({ error: 'ANCHOR_NOT_FOUND', message: 'Analysis anchor not found.' });
      }
      return res.status(201).json({ narrative: toNarrativeContract(narrative, basis) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to revise internal narrative');
      throw error;
    }
  })
);

router.get(
  '/funds/:fundId/internal-analysis/notes',
  readLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const anchor = parseAnchorFromQuery(req, res);
    if (anchor === null) return undefined;

    try {
      const notes = await listNotesForAnchor(createInternalNarrativePorts(), { fundId, anchor });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.json({ notes: notes.map(toNoteContract) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to list internal analysis notes');
      throw error;
    }
  })
);

router.post(
  '/funds/:fundId/internal-analysis/notes',
  writeLimiter,
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = fundIdOf(req);
    const parsed = NarrativeNoteCreateRequestSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'invalid_note_create_request',
        message: 'Invalid note create request',
        details: parsed.error.flatten(),
      });
    }

    try {
      const anchor = toAnchor(parsed.data);
      const supersedesNoteId = parsed.data.supersedesNoteId ?? null;
      const note = await appendNote(createInternalNarrativePorts(), {
        fundId,
        anchor,
        body: parsed.data.body,
        supersedesNoteId,
        actorId: actorIdOf(req),
        idempotencyKey: noteIdempotencyKey(req, fundId, anchor, parsed.data.body, supersedesNoteId),
      });
      return res.status(201).json({ note: toNoteContract(note) });
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      routeLog.error({ err: error, fundId }, 'Failed to append internal analysis note');
      throw error;
    }
  })
);

export default router;
