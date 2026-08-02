import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import { parseFundIdParam } from '@shared/number';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt.js';
import { isTeamMemberUser } from '../lib/auth/principal.js';
import { firstString } from '../lib/request-values.js';
import {
  getLpEconomicsRunReceipt,
  LpEconomicsRunServiceError,
} from '../services/internal-economics/lp-economics-run-service.js';

const router = Router();

const internalEconomicsReadLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

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
