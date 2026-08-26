/**
 * Internal KPI collection routes (issue #1300, ruling GR2-4a).
 *
 * This lands BACKEND-ONLY: the routes stay archived through the soak window and
 * have no client consumer yet. Wiring `client/src/pages/kpi-manager/` and
 * `kpi-submission.tsx` off their MSW-only backing is separate, post-activation
 * work. Creation is `Idempotency-Key`-guarded and database
 * backed; review is `If-Match`-guarded against the row version that backs the
 * ETag (missing header -> 428, stale header -> 412).
 *
 * This surface is INTERNAL-ONLY and CSV-first. There is deliberately no
 * company-facing request form, no recipient, no send, no share, and no export
 * endpoint here, and `tests/unit/source/kpi-observation-boundary.test.ts` keeps
 * it that way.
 *
 * @module server/routes/kpi-observations
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { parseFundIdParam } from '@shared/number';
import {
  KpiObservationImportRequestSchema,
  KpiObservationCreateRequestSchema,
  KpiObservationImportResponseSchema,
  KpiObservationListQuerySchema,
  KpiObservationListResponseSchema,
  KpiObservationReviewRequestSchema,
  type KpiCsvRowRejection,
  type KpiObservationV1,
} from '@shared/contracts/kpi/kpi-observation-v1.contract';

import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { parseETag, setETagHeaders, weakETag } from '../lib/http-preconditions';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { parseInternalEconomicsIdempotencyKey } from '../lib/internal-economics-idempotency-key';
import { firstString } from '../lib/request-values';
import { KpiCsvBatchError, parseKpiObservationCsv } from '../services/kpi/kpi-observation-csv';
import {
  KpiObservationServiceError,
  createKpiObservation,
  listKpiObservations,
  loadKpiObservation,
  reviewKpiObservation,
  toKpiObservationContract,
} from '../services/kpi/kpi-observation-service';

const router = Router();

const readLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Writes are bounded tighter than reads: a CSV batch does one idempotent command
 * per row, so an import is far more work than a single-row create.
 */
const writeLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

/**
 * Best-effort actor id. JWT subs are not guaranteed numeric and both actor
 * columns are nullable users.id FKs, so an unresolved identity stores NULL
 * rather than failing an otherwise authorized write.
 */
function resolveActorId(req: Request): number | null {
  return numericIdentity(req.user?.id) ?? numericIdentity(req.user?.sub) ?? null;
}

/**
 * Observation-scoped ETag. Hashing the bare version would collide across
 * observations that happen to share one, so the fund and observation fold in.
 */
function observationETag(observation: { fundId: number; observationId: number; version: number }) {
  return weakETag(
    `kpi-observation:${observation.fundId}:${observation.observationId}:${observation.version}`
  );
}

function respondToTypedError(error: unknown, res: Response): boolean {
  if (error instanceof KpiObservationServiceError) {
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return true;
  }
  if (error instanceof KpiCsvBatchError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return true;
  }
  if (error instanceof IdempotentCommandError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return true;
  }
  return false;
}

/** Path fund id, or a 400 already written to the response. */
function fundIdOrNull(req: Request, res: Response): number | null {
  const fundId = parseFundIdParam(firstString(req.params['fundId']));
  if (fundId === null) {
    res.status(400).json({ error: 'Invalid fund ID' });
    return null;
  }
  return fundId;
}

function observationIdOrNull(req: Request, res: Response): number | null {
  const observationId = parseFundIdParam(firstString(req.params['observationId']));
  if (observationId === null) {
    res.status(400).json({ error: 'Invalid observation ID' });
    return null;
  }
  return observationId;
}

/** Required `Idempotency-Key`, or a 428/400 already written to the response. */
function idempotencyKeyOrNull(req: Request, res: Response): string | null {
  const parsed = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
  if (parsed.kind === 'missing') {
    res
      .status(428)
      .json({ error: 'IDEMPOTENCY_KEY_REQUIRED', message: 'Idempotency-Key header is required.' });
    return null;
  }
  if (parsed.kind === 'invalid') {
    res.status(400).json({
      error: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
    });
    return null;
  }
  return parsed.value;
}

router.get(
  '/api/funds/:fundId/kpi-observations',
  readLimiter,
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;

    const parsedQuery = KpiObservationListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'INVALID_KPI_OBSERVATION_QUERY',
        message: 'Unsupported KPI observation filter.',
        details: parsedQuery.error.flatten(),
      });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) return undefined;

    try {
      const data = await listKpiObservations(fundId, parsedQuery.data);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(KpiObservationListResponseSchema.parse({ data }));
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to list KPI observations' });
    }
  }
);

router.get(
  '/api/funds/:fundId/kpi-observations/:observationId',
  readLimiter,
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    const observationId = observationIdOrNull(req, res);
    if (observationId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId))) return undefined;

    try {
      const row = await loadKpiObservation(fundId, observationId);
      if (row === null) {
        return res
          .status(404)
          .json({ error: 'KPI_OBSERVATION_NOT_FOUND', message: 'KPI observation not found.' });
      }
      const observation = toKpiObservationContract(row);
      // The ETag a subsequent review must echo back in If-Match.
      setETagHeaders(res, observationETag(observation));
      return res.status(200).json(observation);
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to read KPI observation' });
    }
  }
);

router.post(
  '/api/funds/:fundId/kpi-observations',
  writeLimiter,
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;

    const idempotencyKey = idempotencyKeyOrNull(req, res);
    if (idempotencyKey === null) return undefined;

    const parsedBody = KpiObservationCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_KPI_OBSERVATION_BODY',
        message: 'Request body does not satisfy the KPI observation contract.',
        details: parsedBody.error.flatten(),
      });
    }

    try {
      const result = await createKpiObservation({
        fundId,
        request: parsedBody.data,
        // The channel is server-decided; a caller cannot claim a CSV provenance.
        source: 'manual',
        actorId: resolveActorId(req),
        idempotencyKey,
      });
      setETagHeaders(res, observationETag(result.observation));
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(result.replayed ? 200 : 201).json(result.observation);
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to create KPI observation' });
    }
  }
);

/**
 * Fixed-template CSV import. Every row is created through the same idempotent
 * command as a manual entry, keyed `<batch key>:row:<n>`, so re-posting an
 * identical batch after a partial failure replays the rows that landed instead
 * of duplicating them.
 */
router.post(
  '/api/funds/:fundId/kpi-observations/imports',
  writeLimiter,
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;

    const idempotencyKey = idempotencyKeyOrNull(req, res);
    if (idempotencyKey === null) return undefined;

    const parsedBody = KpiObservationImportRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_KPI_IMPORT_BODY',
        message: 'Request body does not satisfy the KPI import contract.',
        details: parsedBody.error.flatten(),
      });
    }

    try {
      const parsed = parseKpiObservationCsv(Buffer.from(parsedBody.data.csvBase64, 'base64'));
      const actorId = resolveActorId(req);
      const imported: KpiObservationV1[] = [];
      const rejected: KpiCsvRowRejection[] = [...parsed.rejected];
      let allReplayed = parsed.accepted.length > 0;

      for (const row of parsed.accepted) {
        try {
          const result = await createKpiObservation({
            fundId,
            request: {
              ...row.request,
              sourceLabel: row.request.sourceLabel ?? parsedBody.data.sourceLabel ?? null,
            },
            source: 'csv_import',
            actorId,
            idempotencyKey: `${idempotencyKey}:row:${row.row}`,
          });
          imported.push(result.observation);
          if (!result.replayed) allReplayed = false;
        } catch (error) {
          if (error instanceof KpiObservationServiceError) {
            rejected.push({ row: row.row, code: error.code, message: error.message });
            continue;
          }
          if (error instanceof IdempotentCommandError) {
            rejected.push({ row: row.row, code: error.code, message: error.message });
            continue;
          }
          throw error;
        }
      }

      rejected.sort((left, right) => left.row - right.row);
      res.setHeader('Cache-Control', 'private, no-store');
      return res
        .status(imported.length > 0 && !allReplayed ? 201 : 200)
        .json(
          KpiObservationImportResponseSchema.parse({ imported, rejected, replayed: allReplayed })
        );
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to import KPI observations' });
    }
  }
);

/**
 * Record a reviewer's decision under optimistic concurrency. Error order mirrors
 * operating-object-tasks: parse (400) -> scope (403) -> If-Match present (428)
 * -> body (400) -> load (404) -> etag (412) -> compare-and-set -> zero-row
 * disambiguation. There is no 409: a review has no immutable precondition of its
 * own, so a zero-row update after a passing precondition means a concurrent
 * review (412) or a deleted fund (404) only.
 */
router.patch(
  '/api/funds/:fundId/kpi-observations/:observationId/review',
  writeLimiter,
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    const observationId = observationIdOrNull(req, res);
    if (observationId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;

    const ifMatch = firstString(req.headers['if-match']);
    if (ifMatch === undefined) {
      return res
        .status(428)
        .json({ error: 'precondition_required', message: 'If-Match header is required' });
    }

    const parsedBody = KpiObservationReviewRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_KPI_REVIEW_BODY',
        message: 'Request body does not satisfy the KPI review contract.',
        details: parsedBody.error.flatten(),
      });
    }

    try {
      const current = await loadKpiObservation(fundId, observationId);
      if (current === null) {
        return res
          .status(404)
          .json({ error: 'KPI_OBSERVATION_NOT_FOUND', message: 'KPI observation not found.' });
      }
      const currentETag = observationETag({
        fundId,
        observationId,
        version: current.version,
      });
      if (parseETag(ifMatch) !== parseETag(currentETag)) {
        return res.status(412).json({
          error: 'precondition_failed',
          message: 'KPI observation has been modified',
          current: currentETag,
        });
      }

      const updated = await reviewKpiObservation({
        fundId,
        observationId,
        expectedVersion: current.version,
        reviewStatus: parsedBody.data.reviewStatus,
        reviewComment: parsedBody.data.reviewComment ?? null,
        actorId: resolveActorId(req),
      });
      if (updated === null) {
        const recheck = await loadKpiObservation(fundId, observationId);
        if (recheck === null) {
          return res
            .status(404)
            .json({ error: 'KPI_OBSERVATION_NOT_FOUND', message: 'KPI observation not found.' });
        }
        return res.status(412).json({
          error: 'precondition_failed',
          message: 'KPI observation has been modified',
          current: observationETag({ fundId, observationId, version: recheck.version }),
        });
      }

      const observation = toKpiObservationContract(updated);
      setETagHeaders(res, observationETag(observation));
      return res.status(200).json(observation);
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to review KPI observation' });
    }
  }
);

export default router;
