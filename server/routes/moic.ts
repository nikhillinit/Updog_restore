/**
 * MOIC Calculator API Routes
 *
 * Endpoints for portfolio MOIC calculations.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async.js';
import { MOICCalculator } from '../../shared/core/moic/MOICCalculator.js';

const router = Router();

// Request validation schema
const moicCalculationSchema = z.object({
  investments: z.array(z.object({
    invested: z.number(),
    currentValue: z.number(),
  })),
});

/**
 * POST /api/moic/calculate
 * Calculate portfolio MOIC summary for given investments
 */
router.post(
  '/calculate',
  asyncHandler(async (req: Request, res: Response) => {
    const { investments } = moicCalculationSchema.parse(req.body);

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
    const { investments } = moicCalculationSchema.parse(req.body);

    const result = MOICCalculator.rankByReservesMOIC(investments);
    res.json(result);
  })
);

export default router;
