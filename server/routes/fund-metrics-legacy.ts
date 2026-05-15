import { Router } from 'express';
import type { Request, Response } from 'express';
import type { ApiError } from '@shared/types';
import { NumberParseError, toNumber } from '@shared/number';
import { logger } from '../lib/logger.js';
import { storage } from '../storage';

const router = Router();
const log = logger.child({ route: 'fund-metrics-legacy' });

router['get']('/fund-metrics/:fundId', async (req: Request, res: Response) => {
  try {
    const fundIdParam = req.params['fundId'];
    const fundId = toNumber(fundIdParam, 'fund ID');

    if (fundId <= 0) {
      const error: ApiError = {
        error: 'Invalid fund ID',
        message: `Fund ID must be a positive integer, received: ${fundIdParam}`,
      };
      return res.status(400).json(error);
    }

    const metrics = await storage.getFundMetrics(fundId);
    return res.json(metrics);
  } catch (error) {
    if (error instanceof NumberParseError) {
      const apiError: ApiError = {
        error: 'Invalid fund ID',
        message: error.message,
      };
      return res.status(400).json(apiError);
    }

    log.error(
      {
        err: error,
        fundId: req.params['fundId'],
      },
      'Failed to fetch legacy fund metrics'
    );

    const apiError: ApiError = {
      error: 'Database query failed',
      message: error instanceof Error ? error.message : 'Failed to fetch fund metrics',
    };
    return res.status(500).json(apiError);
  }
});

export default router;
