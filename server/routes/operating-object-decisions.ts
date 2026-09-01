import { Router } from 'express';
import type { Request, Response } from 'express';
import { parseFundIdParam } from '@shared/number';
import {
  DECISION_CONTRACT_VERSION,
  DecisionCreateSchema,
  DecisionEvidenceLinkCreateRequestSchema,
  DecisionEvidenceLinkListQuerySchema,
  DecisionEvidenceLinkListResponseSchema,
  DecisionListResponseSchema,
  DecisionOutcomeSchema,
  DecisionTransitionSchema,
  DecisionV1Schema,
  type DecisionV1,
} from '@shared/contracts/operating-objects/decision.contract';
import type { OperatingDecision } from '@shared/schema/operating-objects';
import { enforceProvidedFundScope, enforceTeamWriteRole } from '../lib/auth/provided-fund-scope';
import { parseETag, rowVersionETag } from '../lib/http-preconditions';
import { IdempotentCommandError } from '../lib/idempotent-command';
import { parseInternalEconomicsIdempotencyKey } from '../lib/internal-economics-idempotency-key';
import { firstString } from '../lib/request-values';
import {
  DecisionServiceError,
  createDecision,
  listDecisionsForFund,
  loadDecision,
  recordOutcome,
  supersedeDecision,
  transitionDecision,
} from '../services/operating-objects/decision-service';
import {
  DecisionEvidenceLinkServiceError,
  createDecisionEvidenceLink,
  listDecisionEvidenceLinks,
} from '../services/operating-objects/decision-evidence-link-service';

const router = Router();

function numericIdentity(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value;
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return Number.parseInt(value, 10);
  return null;
}

// Best-effort creator id. JWT subs are not guaranteed numeric and created_by is a
// nullable users.id FK, so an unresolved identity stores NULL (except outcomes,
// where the shipped service requires a numeric actor).
function resolveActorId(req: Request): number | null {
  return numericIdentity(req.user?.id) ?? numericIdentity(req.user?.sub) ?? null;
}

function toResponse(row: OperatingDecision, etag: string): DecisionV1 {
  return DecisionV1Schema.parse({
    contractVersion: DECISION_CONTRACT_VERSION,
    decisionId: row.id,
    fundId: row.fundId,
    title: row.title,
    recommendation: row.recommendation,
    status: row.status,
    supersedesDecisionId: row.supersedesDecisionId,
    outcome: row.outcome,
    outcomeRecordedAt: row.outcomeRecordedAt?.toISOString() ?? null,
    outcomeRecordedBy: row.outcomeRecordedBy,
    followUpOwnerId: row.followUpOwnerId,
    followUpDate: row.followUpDate,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    etag,
  });
}

function respondToTypedError(error: unknown, res: Response): boolean {
  if (error instanceof DecisionServiceError) {
    if (error.code === 'PRECONDITION_FAILED') {
      const currentXmin = error.details?.['currentXmin'];
      res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
        ...(typeof currentXmin === 'string' ? { current: rowVersionETag(currentXmin) } : {}),
      });
      return true;
    }
    res.status(error.statusCode).json({
      error: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : { details: error.details }),
    });
    return true;
  }
  if (error instanceof DecisionEvidenceLinkServiceError) {
    res.status(error.statusCode).json({ error: error.code, message: error.message });
    return true;
  }
  if (error instanceof IdempotentCommandError) {
    res.status(error.status).json({ error: error.code, message: error.message });
    return true;
  }
  return false;
}

function fundIdOrNull(req: Request, res: Response): number | null {
  const fundId = parseFundIdParam(firstString(req.params['fundId']));
  if (fundId === null) {
    res.status(400).json({ error: 'Invalid fund ID' });
    return null;
  }
  return fundId;
}

function decisionIdOrNull(req: Request, res: Response): number | null {
  const decisionId = parseFundIdParam(firstString(req.params['decisionId']));
  if (decisionId === null) {
    res.status(400).json({ error: 'Invalid decision ID' });
    return null;
  }
  return decisionId;
}

function idempotencyKeyOrNull(req: Request, res: Response): string | null {
  const parsed = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
  if (parsed.kind === 'missing') {
    res.status(428).json({
      error: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required.',
    });
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

function ifMatchOrNull(req: Request, res: Response): string | null {
  const ifMatch = firstString(req.headers['if-match']);
  if (!ifMatch) {
    res.status(428).json({
      error: 'IF_MATCH_REQUIRED',
      message: 'If-Match header is required.',
    });
    return null;
  }
  return ifMatch;
}

function setDecisionETag(res: Response, xmin: string): string {
  const etag = rowVersionETag(xmin);
  res.setHeader('ETag', etag);
  return etag;
}

router['post']('/api/funds/:fundId/decisions', async (req: Request, res: Response) => {
  const fundId = fundIdOrNull(req, res);
  if (fundId === null) return undefined;
  if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;
  if (!enforceTeamWriteRole(req, res)) return undefined;

  const idempotencyKey = idempotencyKeyOrNull(req, res);
  if (idempotencyKey === null) return undefined;

  const parsedBody = DecisionCreateSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res
      .status(400)
      .json({ error: 'Invalid request body', details: parsedBody.error.format() });
  }
  if (parsedBody.data.fundId !== fundId) {
    return res
      .status(400)
      .json({ error: 'fundId mismatch', message: 'Body fundId must match the path fundId' });
  }

  try {
    const created = await createDecision({
      ...parsedBody.data,
      actorId: resolveActorId(req),
      idempotencyKey,
    });
    const etag = setDecisionETag(res, created.xmin);
    return res.status(created.replayed ? 200 : 201).json(toResponse(created.row, etag));
  } catch (error) {
    if (respondToTypedError(error, res)) return undefined;
    return res.status(500).json({ error: 'Failed to create decision' });
  }
});

router['get']('/api/funds/:fundId/decisions', async (req: Request, res: Response) => {
  const fundId = fundIdOrNull(req, res);
  if (fundId === null) return undefined;
  if (!(await enforceProvidedFundScope(req, res, fundId))) return undefined;

  try {
    const rows = await listDecisionsForFund(fundId);
    return res.status(200).json(
      DecisionListResponseSchema.parse({
        data: rows.map((item) => toResponse(item.row, rowVersionETag(item.xmin))),
      })
    );
  } catch (error) {
    if (respondToTypedError(error, res)) return undefined;
    return res.status(500).json({ error: 'Failed to list decisions' });
  }
});

router['get']('/api/funds/:fundId/decisions/:decisionId', async (req: Request, res: Response) => {
  const fundId = fundIdOrNull(req, res);
  if (fundId === null) return undefined;
  const decisionId = decisionIdOrNull(req, res);
  if (decisionId === null) return undefined;
  if (!(await enforceProvidedFundScope(req, res, fundId))) return undefined;

  try {
    const decision = await loadDecision(fundId, decisionId);
    if (!decision) {
      return res.status(404).json({ error: 'DECISION_NOT_FOUND', message: 'Decision not found.' });
    }
    const etag = setDecisionETag(res, decision.xmin);
    return res.status(200).json(toResponse(decision.row, etag));
  } catch (error) {
    if (respondToTypedError(error, res)) return undefined;
    return res.status(500).json({ error: 'Failed to load decision' });
  }
});

router['patch']('/api/funds/:fundId/decisions/:decisionId', async (req: Request, res: Response) => {
  const fundId = fundIdOrNull(req, res);
  if (fundId === null) return undefined;
  const decisionId = decisionIdOrNull(req, res);
  if (decisionId === null) return undefined;
  if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;
  if (!enforceTeamWriteRole(req, res)) return undefined;

  const ifMatch = ifMatchOrNull(req, res);
  if (ifMatch === null) return undefined;

  const parsedBody = DecisionTransitionSchema.safeParse(req.body);
  if (!parsedBody.success) {
    return res
      .status(400)
      .json({ error: 'Invalid request body', details: parsedBody.error.format() });
  }

  try {
    const current = await loadDecision(fundId, decisionId);
    if (!current) {
      return res.status(404).json({ error: 'DECISION_NOT_FOUND', message: 'Decision not found.' });
    }
    const currentETag = rowVersionETag(current.xmin);
    if (parseETag(ifMatch) !== parseETag(currentETag)) {
      return res.status(412).json({
        error: 'PRECONDITION_FAILED',
        message: 'Decision has been modified.',
        current: currentETag,
      });
    }

    const updated = await transitionDecision({
      fundId,
      decisionId,
      expectedXmin: current.xmin,
      transition: parsedBody.data,
    });
    const etag = setDecisionETag(res, updated.xmin);
    return res.status(200).json(toResponse(updated.row, etag));
  } catch (error) {
    if (respondToTypedError(error, res)) return undefined;
    return res.status(500).json({ error: 'Failed to transition decision' });
  }
});

router['post'](
  '/api/funds/:fundId/decisions/:decisionId/outcome',
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    const decisionId = decisionIdOrNull(req, res);
    if (decisionId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;
    if (!enforceTeamWriteRole(req, res)) return undefined;

    const ifMatch = ifMatchOrNull(req, res);
    if (ifMatch === null) return undefined;

    const parsedBody = DecisionOutcomeSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', details: parsedBody.error.format() });
    }

    const actorId = resolveActorId(req);
    if (actorId === null) {
      return res
        .status(403)
        .json({ error: 'ACTOR_REQUIRED', message: 'Numeric actor required to record outcome.' });
    }

    try {
      const current = await loadDecision(fundId, decisionId);
      if (!current) {
        return res
          .status(404)
          .json({ error: 'DECISION_NOT_FOUND', message: 'Decision not found.' });
      }
      const currentETag = rowVersionETag(current.xmin);
      const outcomeAlreadyRecorded =
        current.row.outcome !== null ||
        current.row.outcomeRecordedAt !== null ||
        current.row.outcomeRecordedBy !== null;
      if (!outcomeAlreadyRecorded && parseETag(ifMatch) !== parseETag(currentETag)) {
        return res.status(412).json({
          error: 'PRECONDITION_FAILED',
          message: 'Decision has been modified.',
          current: currentETag,
        });
      }

      const updated = await recordOutcome({
        fundId,
        decisionId,
        expectedXmin: current.xmin,
        outcome: parsedBody.data.outcome,
        actorId,
      });
      const etag = setDecisionETag(res, updated.xmin);
      return res.status(200).json(toResponse(updated.row, etag));
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to record decision outcome' });
    }
  }
);

router['post'](
  '/api/funds/:fundId/decisions/:decisionId/supersede',
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    const decisionId = decisionIdOrNull(req, res);
    if (decisionId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;
    if (!enforceTeamWriteRole(req, res)) return undefined;

    const idempotencyKey = idempotencyKeyOrNull(req, res);
    if (idempotencyKey === null) return undefined;

    const parsedBody = DecisionCreateSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res
        .status(400)
        .json({ error: 'Invalid request body', details: parsedBody.error.format() });
    }
    if (parsedBody.data.fundId !== fundId) {
      return res
        .status(400)
        .json({ error: 'fundId mismatch', message: 'Body fundId must match the path fundId' });
    }

    try {
      const created = await supersedeDecision({
        ...parsedBody.data,
        supersedesDecisionId: decisionId,
        actorId: resolveActorId(req),
        idempotencyKey,
      });
      const etag = setDecisionETag(res, created.xmin);
      return res.status(created.replayed ? 200 : 201).json(toResponse(created.row, etag));
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to supersede decision' });
    }
  }
);

router['get'](
  '/api/funds/:fundId/decisions/:decisionId/evidence-links',
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    const decisionId = decisionIdOrNull(req, res);
    if (decisionId === null) return undefined;

    const parsedQuery = DecisionEvidenceLinkListQuerySchema.safeParse(req.query);
    if (!parsedQuery.success) {
      return res.status(400).json({
        error: 'INVALID_DECISION_EVIDENCE_LINK_QUERY',
        message: 'Decision evidence link listing does not accept query parameters.',
      });
    }
    if (!(await enforceProvidedFundScope(req, res, fundId))) return undefined;

    try {
      const data = await listDecisionEvidenceLinks(fundId, decisionId);
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(DecisionEvidenceLinkListResponseSchema.parse({ data }));
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to list decision evidence links' });
    }
  }
);

router['post'](
  '/api/funds/:fundId/decisions/:decisionId/evidence-links',
  async (req: Request, res: Response) => {
    const fundId = fundIdOrNull(req, res);
    if (fundId === null) return undefined;
    const decisionId = decisionIdOrNull(req, res);
    if (decisionId === null) return undefined;
    if (!(await enforceProvidedFundScope(req, res, fundId, { forWrite: true }))) return undefined;
    if (!enforceTeamWriteRole(req, res)) return undefined;

    const idempotencyKey = idempotencyKeyOrNull(req, res);
    if (idempotencyKey === null) return undefined;

    const parsedBody = DecisionEvidenceLinkCreateRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return res.status(400).json({
        error: 'INVALID_DECISION_EVIDENCE_LINK_BODY',
        message: 'Request body does not satisfy the decision evidence contract.',
      });
    }

    try {
      const result = await createDecisionEvidenceLink({
        fundId,
        decisionId,
        target: parsedBody.data.target,
        actorId: resolveActorId(req),
        idempotencyKey,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(result.replayed ? 200 : 201).json(result.evidenceLink);
    } catch (error) {
      if (respondToTypedError(error, res)) return undefined;
      return res.status(500).json({ error: 'Failed to create decision evidence link' });
    }
  }
);

export default router;
