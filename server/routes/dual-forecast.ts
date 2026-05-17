import { Router } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { metricsAggregator } from '../services/metrics-aggregator';
import type { MetricsCalculationError } from '@shared/types/metrics';
import { NumberParseError, toNumber } from '@shared/number';
import { requireAuth, requireFundAccess } from '../lib/auth/jwt';

const router = Router();

function validateFundIdParam(req: Request, res: Response, next: NextFunction) {
  try {
    toNumber(req.params['fundId'], 'fundId', { integer: true, min: 1 });
    next();
  } catch (error) {
    if (error instanceof NumberParseError) {
      return res.status(400).json({
        error: 'Invalid parameter',
        message: error.message,
      });
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

      const dualForecast = await metricsAggregator.getDualForecast(fundId);

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'private, max-age=60');
      return res.json(dualForecast);
    } catch (error) {
      console.error('Dual forecast API error:', error);

      if (error instanceof NumberParseError) {
        return res.status(400).json({
          error: 'Invalid parameter',
          message: error.message,
        });
      }

      if (isMetricsCalculationError(error)) {
        const statusCode = error.code === 'INSUFFICIENT_DATA' ? 404 : 500;
        return res.status(statusCode).json({
          error: error.code,
          message: error.message,
          component: error.component,
          timestamp: error.timestamp,
        });
      }

      return res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Failed to calculate dual forecast',
        details: error instanceof Error ? error.message : 'Unknown error',
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
