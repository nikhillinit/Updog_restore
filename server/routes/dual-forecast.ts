import { Router } from 'express';
import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { getDualForecast } from '../services/current-forecast-serving-seam';
import { DualForecastResponseSchema } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import type { MetricsCalculationError } from '@shared/types/metrics';
import { toNumber } from '@shared/number';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';
import { handleNumberParseError } from '../lib/number-parse-error';
import { createRouteLogger } from '../lib/route-logger.js';

const routeLog = createRouteLogger('dual-forecast');

const router = Router();

const comparisonQuery = z
  .object({
    asOfDate: z.string().date().optional(),
    baselineSnapshotId: z
      .string()
      .regex(/^[1-9]\d*$/)
      .transform(Number)
      .pipe(z.number().int().positive().safe())
      .optional(),
    baselineStartMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .optional(),
  })
  .refine((query) => Boolean(query.baselineSnapshotId) === Boolean(query.baselineStartMonth), {
    message: 'Baseline snapshot and calendar start month must be supplied together.',
  });

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

router['get'](
  '/funds/:fundId/dual-forecast',
  requireAuth(),
  validateFundIdParam,
  requireFundAccess,
  async (req: Request, res: Response) => {
    try {
      const fundIdParam = req.params['fundId'];
      const fundId = toNumber(fundIdParam, 'fundId', { integer: true, min: 1 });

      const query = comparisonQuery.safeParse(req.query);
      if (!query.success) {
        return res.status(400).json({
          error: 'INVALID_QUERY',
          message: 'Use a valid asOfDate and paired baselineSnapshotId/baselineStartMonth.',
        });
      }
      const dualForecast =
        Object.keys(query.data).length === 0
          ? await getDualForecast(fundId)
          : await getDualForecast(fundId, query.data);

      // Egress contract parse (ADR-031): a contract-invalid payload is a
      // defect, not staleness, so it fails loudly instead of shipping.
      const parsed = DualForecastResponseSchema.safeParse(dualForecast);
      if (!parsed.success) {
        routeLog.error('Dual forecast contract violation:', parsed.error);
        return res.status(500).json({
          error: 'CONTRACT_VIOLATION',
          message: 'Dual forecast response failed contract validation',
        });
      }

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(parsed.data);
    } catch (error) {
      routeLog.error('Dual forecast API error:', error);

      if (handleNumberParseError(error, res, 'Invalid parameter')) {
        return;
      }

      if (isMetricsCalculationError(error)) {
        const statusCode = error.code === 'INSUFFICIENT_DATA' ? 404 : 500;
        return res.status(statusCode).json({
          error: error.code,
          message:
            error.code === 'INSUFFICIENT_DATA'
              ? 'Forecast data is unavailable for this fund'
              : 'Dual forecast is temporarily unavailable',
          component: error.component,
          timestamp: error.timestamp,
        });
      }

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Dual forecast is temporarily unavailable',
      });
    }
  }
);

function isMetricsCalculationError(error: unknown): error is MetricsCalculationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    'component' in error &&
    'message' in error &&
    'timestamp' in error
  );
}

export default router;
