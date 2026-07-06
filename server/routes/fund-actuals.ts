import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';

import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';
import {
  buildFundCompanyActualsFacts,
  FundActualsFactsServiceError,
} from '../services/fund-actuals/fund-company-actuals-facts-service';
import { FundCompanyActualsFactsQuerySchema } from '@shared/contracts/fund-actuals/fund-company-actuals-fact.contract';
import { toNumber } from '@shared/number';

const routeLog = createRouteLogger('fund-actuals');
const router = Router();

function validateFundIdParam(req: Request, res: Response, next: NextFunction) {
  try {
    toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    next();
  } catch (error) {
    if (handleNumberParseError(error, res, 'Invalid parameter')) {
      return;
    }

    throw error;
  }
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

router.get(
  '/funds/:fundId/actuals/facts',
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  async (req: Request, res: Response) => {
    try {
      const fundId = toNumber(req.params['fundId'], 'fundId', {
        integer: true,
        min: 1,
      });
      const query = FundCompanyActualsFactsQuerySchema.parse(req.query);
      const result = await buildFundCompanyActualsFacts({
        fundId,
        asOfDate: query.asOfDate ?? todayUtc(),
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(result);
    } catch (error) {
      routeLog.error('Fund actuals facts API error:', error);

      if (handleNumberParseError(error, res, 'Invalid parameter')) {
        return;
      }

      if (error instanceof FundActualsFactsServiceError) {
        return res.status(error.status).json({
          error: error.code,
          message: error.message,
          details: error.details,
        });
      }

      if (error && typeof error === 'object' && 'issues' in error) {
        return res.status(400).json({
          error: 'invalid_actuals_facts_query',
          message: 'Invalid actuals facts query',
          details: error,
        });
      }

      return res.status(500).json({
        error: 'internal_error',
        message: 'Failed to build fund actuals facts',
      });
    }
  }
);

export default router;
