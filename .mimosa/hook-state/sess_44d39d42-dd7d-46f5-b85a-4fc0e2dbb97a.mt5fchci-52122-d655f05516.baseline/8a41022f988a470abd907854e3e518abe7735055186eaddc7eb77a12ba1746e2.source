import { Router } from 'express';
import type { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';

import type { ApiError } from '@shared/types';
import { parseFundIdParam } from '@shared/number';

import { NotFoundError, ValidationError } from '../errors';
import { enforceProvidedFundScope } from '../lib/auth/provided-fund-scope';
import { getPortfolioOverview } from '../services/portfolio-overview-service';

const router = Router();

const portfolioOverviewLimiter = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// Replicated from server/routes/portfolio-companies.ts (deliberately not lifted,
// to keep the sibling route untouched while PR-D is in flight).
function parseAsOfQuery(asOfQuery: string): Date {
  const monthMatch = /^(\d{4})-(\d{2})$/.exec(asOfQuery);
  if (monthMatch) {
    const year = Number.parseInt(monthMatch[1]!, 10);
    const monthIndex = Number.parseInt(monthMatch[2]!, 10) - 1;

    if (monthIndex < 0 || monthIndex > 11) {
      throw new ValidationError(`Invalid asOf query: ${asOfQuery}`);
    }

    return new Date(Date.UTC(year, monthIndex + 1, 0, 23, 59, 59, 999));
  }

  const parsed = new Date(asOfQuery);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`Invalid asOf query: ${asOfQuery}`);
  }

  return parsed;
}

router['get'](
  '/portfolio-overview',
  portfolioOverviewLimiter,
  async (req: Request, res: Response) => {
    try {
      // Express query values can be arrays/objects; require a single string.
      const rawFundId = req.query['fundId'];
      if (typeof rawFundId !== 'string' || rawFundId.length === 0) {
        const error: ApiError = {
          error: 'fund_scope_required',
          message: 'A fundId query parameter is required to read the portfolio overview',
        };
        return res.status(400).json(error);
      }

      const fundId = parseFundIdParam(rawFundId);
      if (fundId === null) {
        const error: ApiError = {
          error: 'invalid_fund_id',
          message: `Fund ID must be a positive integer, received: ${rawFundId}`,
        };
        return res.status(400).json(error);
      }

      const rawAsOf = req.query['asOf'];
      if (rawAsOf !== undefined && typeof rawAsOf !== 'string') {
        const error: ApiError = {
          error: 'invalid_as_of',
          message: 'asOf must be a single string value',
        };
        return res.status(400).json(error);
      }

      if (!(await enforceProvidedFundScope(req, res, fundId))) {
        return;
      }

      let asOf: Date | undefined;
      if (typeof rawAsOf === 'string') {
        asOf = parseAsOfQuery(rawAsOf);
      }

      const overview = await getPortfolioOverview(fundId, {
        ...(asOf ? { asOf } : {}),
        ...(typeof rawAsOf === 'string' ? { requestedAsOf: rawAsOf } : {}),
      });
      return res.json(overview);
    } catch (error) {
      if (error instanceof NotFoundError) {
        const apiError: ApiError = {
          error: 'fund_not_found',
          message: error.message,
        };
        return res.status(404).json(apiError);
      }

      if (error instanceof ValidationError) {
        const apiError: ApiError = {
          error: 'invalid_as_of',
          message: error.message,
        };
        return res.status(400).json(apiError);
      }

      const apiError: ApiError = {
        error: 'overview_failed',
        message: error instanceof Error ? error.message : 'Failed to compute portfolio overview',
      };
      return res.status(500).json(apiError);
    }
  }
);

export default router;
