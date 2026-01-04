/**
 * MOIC Calculator API Routes
 *
 * Endpoints for portfolio MOIC calculations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async.js';
import { MOICCalculator } from '../../shared/core/moic/MOICCalculator.js';

const router = Router();

/**
 * POST /api/moic/calculate
 * Calculate portfolio MOIC summary for given investments
 */
router.post(
  '/calculate',
  asyncHandler(async (req: Request, res: Response) => {
    const { investments } = req.body;

    if (!investments || !Array.isArray(investments)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'investments array is required',
      });
    }

    const result = MOICCalculator.generatePortfolioSummary(investments);
    res.json(result);
  })
);

/**
 * POST /api/moic/rank
 * Rank investments by reserves MOIC
 */
router.post(
  '/rank',
  asyncHandler(async (req: Request, res: Response) => {
    const { investments } = req.body;

    if (!investments || !Array.isArray(investments)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'investments array is required',
      });
    }

    const result = MOICCalculator.rankByReservesMOIC(investments);
    res.json(result);
  })
);

export default router;
