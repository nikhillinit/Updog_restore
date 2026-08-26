import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { parseFundIdParam } from '@shared/number';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt.js';
import { isTeamMemberUser } from '../lib/auth/principal.js';
import { IdempotentCommandError } from '../lib/idempotent-command.js';
import { parseInternalEconomicsIdempotencyKey } from '../lib/internal-economics-idempotency-key.js';
import { firstString } from '../lib/request-values.js';
import {
  executeLpEconomicsRun,
  getLpEconomicsRunReceipt,
  LpEconomicsRunServiceError,
} from '../services/internal-economics/lp-economics-run-service.js';
import {
  LpEconomicsRunRequestV1_1Schema,
  type LpEconomicsRunRequestV1_1,
} from '../../shared/contracts/internal-economics/lp-economics-run-v1.1.contract.js';

const router = Router();

const internalEconomicsReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const internalEconomicsWriteLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

interface InternalEconomicsRouteLocals {
  idempotencyKey?: string;
  request?: LpEconomicsRunRequestV1_1;
}

function routeLocals(res: Response): InternalEconomicsRouteLocals {
  return res.locals as InternalEconomicsRouteLocals;
}

function validateCanonicalId(
  parameter: 'fundId' | 'runId',
  errorLabel: 'Invalid fund ID' | 'Invalid run ID',
  message: string
) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (parseFundIdParam(firstString(req.params[parameter])) === null) {
      return res.status(400).json({ error: errorLabel, message });
    }
    next();
  };
}

const validateFundId = validateCanonicalId(
  'fundId',
  'Invalid fund ID',
  'Fund ID must be a canonical positive integer'
);

const validateRunId = validateCanonicalId(
  'runId',
  'Invalid run ID',
  'Run ID must be a canonical positive integer'
);

function requireInvestmentTeamUser(req: Request, res: Response, next: NextFunction) {
  if (!isTeamMemberUser(req.user)) {
    return res.status(403).json({
      error: 'Forbidden',
      message: 'Investment-team access is required',
    });
  }
  next();
}

function routeHandler(handler: (req: Request, res: Response) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(handler(req, res)).catch(next);
  };
}

function parseIdempotencyKey(req: Request, res: Response, next: NextFunction): Response | void {
  const parsed = parseInternalEconomicsIdempotencyKey(req.headers['idempotency-key']);
  if (parsed.kind === 'missing') {
    return res.status(428).json({
      error: 'IDEMPOTENCY_KEY_REQUIRED',
      message: 'Idempotency-Key header is required.',
    });
  }
  if (parsed.kind === 'invalid') {
    return res.status(400).json({
      error: 'INVALID_IDEMPOTENCY_KEY',
      message: 'Idempotency-Key must contain 1 to 128 RFC token characters.',
    });
  }

  routeLocals(res).idempotencyKey = parsed.value;
  next();
}

function parseRunRequest(req: Request, res: Response, next: NextFunction): Response | void {
  const parsed = LpEconomicsRunRequestV1_1Schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: 'INVALID_BODY',
      message: 'The request body does not satisfy the LP economics run contract.',
    });
  }

  routeLocals(res).request = parsed.data;
  next();
}

function parseCanonicalActorId(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function actorIdFromRequest(req: Request): number | null {
  return parseCanonicalActorId(req.user?.id) ?? parseCanonicalActorId(req.user?.sub);
}

function sendTypedServiceError(res: Response, error: unknown): Response | null {
  if (error instanceof LpEconomicsRunServiceError) {
    return res.status(error.statusCode).json({ error: error.code, message: error.message });
  }
  if (error instanceof IdempotentCommandError) {
    return res.status(error.status).json({ error: error.code, message: error.message });
  }
  return null;
}

router.post(
  '/funds/:fundId/internal-economics/runs',
  internalEconomicsWriteLimiter,
  requireAuth(),
  validateFundId,
  requireInvestmentTeamUser,
  requireFundAccess,
  parseIdempotencyKey,
  parseRunRequest,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    const { idempotencyKey, request } = routeLocals(res);
    if (fundId === null || idempotencyKey === undefined || request === undefined) {
      throw new Error('Validated internal-economics command inputs became invalid.');
    }

    try {
      const execution = await executeLpEconomicsRun({
        fundId,
        actorId: actorIdFromRequest(req),
        idempotencyKey,
        request,
      });
      res.setHeader('Cache-Control', 'private, no-store');
      if (!execution.replayed) {
        res.setHeader(
          'Location',
          `/api/funds/${fundId}/internal-economics/runs/${execution.receipt.runId}`
        );
      }
      return res.status(execution.replayed ? 200 : 201).json(execution.receipt);
    } catch (error) {
      const response = sendTypedServiceError(res, error);
      if (response !== null) return response;
      throw error;
    }
  })
);

router.get(
  '/funds/:fundId/internal-economics/runs/:runId',
  internalEconomicsReadLimiter,
  requireAuth(),
  validateFundId,
  requireInvestmentTeamUser,
  requireFundAccess,
  validateRunId,
  routeHandler(async (req: Request, res: Response) => {
    const fundId = parseFundIdParam(firstString(req.params['fundId']));
    const runId = parseFundIdParam(firstString(req.params['runId']));
    if (fundId === null || runId === null) {
      throw new Error('Validated internal-economics route parameters became invalid.');
    }

    try {
      const receipt = await getLpEconomicsRunReceipt({ fundId, runId });
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(200).json(receipt);
    } catch (error) {
      if (error instanceof LpEconomicsRunServiceError) {
        return res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  })
);

export default router;
