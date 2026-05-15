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
import type { Investment as MOICInvestment } from '../../shared/core/moic/MOICCalculator.js';

const router = Router();

// Request validation schema
const investmentSchema = z.object({
  id: z.string(),
  name: z.string(),
  initialInvestment: z.number(),
  followOnInvestment: z.number(),
  currentValuation: z.number(),
  projectedExitValue: z.number(),
  exitProbability: z.number(),
  plannedReserves: z.number(),
  reserveExitMultiple: z.number(),
  investmentDate: z.coerce.date(),
});

const moicCalculationSchema = z.object({
  investments: z.array(investmentSchema),
});

/**
 * Canonical adapter: database portfolio company / investment row → MOIC input.
 *
 * Prevents the "Investment 6-way duality" collision where a Drizzle row
 * (with `amount`, `round`, `ownershipPercentage`) is passed to MOICCalculator
 * which expects `currentValuation`, `projectedExitValue`, etc.
 *
 * @param row - Raw database row from portfolioCompanies + investments join
 * @returns MOICInvestment ready for MOICCalculator
 */
export function dbToMOICInvestment(row: {
  id: number | string;
  name: string;
  investmentAmount?: string | number | null;
  currentValuation?: string | number | null;
  projectedExitValue?: string | number | null;
  exitProbability?: string | number | null;
  plannedReservesCents?: number | bigint | null;
  exitMoicBps?: number | null;
  investmentDate?: Date | string | null;
  followOnAmount?: string | number | null;
}): MOICInvestment {
  const toNumber = (v: unknown): number => {
    if (v == null) return 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'bigint') return Number(v);
    if (typeof v === 'string') return Number(v);
    return 0;
  };

  // exitMoicBps is stored in basis points (e.g. 250 = 2.5x)
  const exitMoic = toNumber(row.exitMoicBps) / 100;

  return {
    id: String(row.id),
    name: row.name,
    initialInvestment: toNumber(row.investmentAmount),
    followOnInvestment: toNumber(row.followOnAmount),
    currentValuation: toNumber(row.currentValuation),
    projectedExitValue: toNumber(row.projectedExitValue),
    exitProbability: toNumber(row.exitProbability),
    plannedReserves: toNumber(row.plannedReservesCents) / 100, // cents → dollars
    reserveExitMultiple: exitMoic > 0 ? exitMoic : 1,
    investmentDate: row.investmentDate ? new Date(row.investmentDate) : new Date(),
  };
}

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
