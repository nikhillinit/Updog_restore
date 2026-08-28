import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { TEAM_WRITE_ROLES } from '@shared/auth/effective-roles';
import { ConstructionReconciliationRequestSchema } from '@shared/contracts/construction-reconciliation-v1.contract';
import { FundIdParamSchema } from '@shared/schemas/portfolio-route';
import { requireAuth, requireFundAccess, requireWriteRole } from '../lib/auth/jwt.js';
import { FundScopeError, FundScopeKindNotImplementedError } from '../lib/fund-scoped-ownership.js';
import { IdempotentCommandError } from '../lib/idempotent-command.js';
import { parseInternalEconomicsIdempotencyKey } from '../lib/internal-economics-idempotency-key.js';
import { createRouteLogger } from '../lib/route-logger.js';
import { sendBodyValidationError } from '../lib/validation-response.js';
import {
  ConstructionReconciliationServiceError,
  getLatestConstructionReconciliation,
  runConstructionReconciliation,
} from '../services/construction-reconciliation-service.js';

const router = Router();
const routeLog = createRouteLogger('construction-reconciliation');

function routeHandler(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function parseFundId(req: Request, res: Response): number | null {
  const parsed = FundIdParamSchema.safeParse(req.params);
  if (!parsed.success) {
    res.status(400).json({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer.',
    });
    return null;
  }
  return parsed.data.fundId;
}

function validateFundIdParam(req: Request, res: Response, next: NextFunction) {
  if (parseFundId(req, res) === null) return;
  next();
}

function parseIdempotencyKey(req: Request, res: Response): string | null {
  const parsed = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
  if (parsed.kind === 'missing') {
    res.status(428).json({
      error: 'idempotency_key_required',
      message: 'Idempotency-Key header is required.',
    });
    return null;
  }
  if (parsed.kind === 'invalid') {
    res.status(400).json({
      error: 'invalid_idempotency_key',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
    });
    return null;
  }
  return parsed.value;
}

router.post(
  '/funds/:fundId/construction-reconciliation/runs',
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  requireWriteRole(TEAM_WRITE_ROLES),
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const idempotencyKey = parseIdempotencyKey(req, res);
    if (idempotencyKey === null) return;

    const parsedRequest = ConstructionReconciliationRequestSchema.safeParse(req.body);
    if (!parsedRequest.success) {
      sendBodyValidationError(
        res,
        parsedRequest.error,
        'Invalid construction reconciliation request'
      );
      return;
    }
    if (parsedRequest.data.fundId !== fundId) {
      res.status(400).json({
        error: 'fund_id_mismatch',
        message: 'Request fundId must equal the route fundId.',
      });
      return;
    }

    const execution = await runConstructionReconciliation({
      fundId,
      idempotencyKey,
      request: parsedRequest.data,
      ...(req.correlationId !== undefined ? { correlationId: req.correlationId } : {}),
    });
    res.setHeader('Cache-Control', 'private, no-store');
    // 201 only when a snapshot was actually persisted; transient
    // unavailable/failed outcomes persist nothing and return 200.
    return res
      .status(execution.replayed || !execution.persisted ? 200 : 201)
      .json(execution.envelope);
  })
);

router.get(
  '/funds/:fundId/construction-reconciliation/latest',
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundId(req, res);
    if (fundId === null) return;

    const response = await getLatestConstructionReconciliation(fundId);
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(response);
  })
);

router.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
  if (error instanceof ConstructionReconciliationServiceError) {
    return res.status(error.status).json({
      error: error.code,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  if (error instanceof IdempotentCommandError) {
    return res.status(error.status).json({
      error: error.code,
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
    });
  }
  if (error instanceof FundScopeError || error instanceof FundScopeKindNotImplementedError) {
    return res.status(error.status).json({
      error: error.code,
      code: error.code,
      message: error.message,
    });
  }
  if (res.headersSent) return next(error);

  routeLog.error({ err: error }, 'Construction reconciliation API error');
  return res.status(500).json({
    error: 'internal_error',
    code: 'CONSTRUCTION_RECONCILIATION_INTERNAL_ERROR',
    message: 'Failed to process construction reconciliation request.',
  });
});

export default router;
