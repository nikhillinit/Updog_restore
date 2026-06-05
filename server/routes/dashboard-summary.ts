import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import type { ApiError } from '@shared/types';
import { parseFundIdParam, toNumber } from '@shared/number';
import { storage } from '../storage';
import { getDashboardSummaryReadModel } from '../services/dashboard-summary-read-service';
import { handleNumberParseError } from '../lib/number-parse-error';
import { firstString } from '../lib/request-values';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { logger } from '../lib/logger.js';

const router = Router();
const log = logger.child({ route: 'dashboard-summary' });

const dashboardSummaryLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

router['get'](
  '/dashboard-summary/:fundId',
  dashboardSummaryLimiter,
  async (req: Request, res: Response) => {
    try {
      const fundIdParam = firstString(req.params['fundId']);
      const fundId = parseFundIdParam(fundIdParam);

      if (fundId === null) {
        toNumber(fundIdParam, 'fund ID');
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
        };
        return res.status(400).json(error);
      }

      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }

      const dashboardSummary = await getDashboardSummaryReadModel(storage, fundId);
      if (!dashboardSummary) {
        const error: ApiError = {
          error: 'Fund not found',
          message: `No fund exists with ID: ${fundId}`,
        };
        return res.status(404).json(error);
      }

      return res.json(dashboardSummary);
    } catch (error) {
      if (handleNumberParseError(error, res, 'Invalid fund ID')) {
        return;
      }

      log.error({ err: error, fundId: req.params['fundId'] }, 'Failed to fetch dashboard summary');
      const apiError: ApiError = {
        error: 'Dashboard data processing failed',
        message: error instanceof Error ? error.message : 'Failed to fetch dashboard summary',
        details: { fundId: req.params['fundId'] },
      };
      return res.status(500).json(apiError);
    }
  }
);

export default router;
