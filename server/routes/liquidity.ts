/**
 * Liquidity Engine API Routes
 *
 * Endpoints for cashflow analysis, liquidity forecasting, and stress testing.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { asyncHandler } from '../middleware/async.js';
import {
  LiquidityEngine,
  type StressTestFactors,
  type PlannedInvestment,
  type CapitalCallConstraints,
} from '../../shared/core/liquidity/index.js';

const router = Router();

/**
 * POST /api/liquidity/analyze
 * Analyze cash flows and calculate key metrics
 */
router.post(
  '/analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const { fundId, fundSize, transactions } = req.body;

    if (!fundId || typeof fundSize !== 'number') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'fundId and fundSize are required',
      });
    }

    if (!transactions || !Array.isArray(transactions)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'transactions array is required',
      });
    }

    const engine = new LiquidityEngine(fundId, fundSize);
    const analysis = engine.analyzeCashFlows(transactions);

    res.json(analysis);
  })
);

/**
 * POST /api/liquidity/forecast
 * Generate liquidity forecast with multiple scenarios
 */
router.post(
  '/forecast',
  asyncHandler(async (req: Request, res: Response) => {
    const {
      fundId,
      fundSize,
      currentPosition,
      transactions,
      recurringExpenses = [],
      months = 12,
    } = req.body;

    if (!fundId || typeof fundSize !== 'number') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'fundId and fundSize are required',
      });
    }

    if (!currentPosition) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'currentPosition is required',
      });
    }

    const engine = new LiquidityEngine(fundId, fundSize);
    const forecast = engine.generateLiquidityForecast(
      currentPosition,
      transactions || [],
      recurringExpenses,
      months
    );

    res.json(forecast);
  })
);

/**
 * POST /api/liquidity/stress-test
 * Run stress test scenarios
 */
router.post(
  '/stress-test',
  asyncHandler(async (req: Request, res: Response) => {
    const { fundId, fundSize, currentPosition, stressFactors } = req.body;

    if (!fundId || typeof fundSize !== 'number') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'fundId and fundSize are required',
      });
    }

    if (!currentPosition) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'currentPosition is required',
      });
    }

    // Default stress factors if not provided
    const factors: StressTestFactors = stressFactors || {
      distributionDelay: 6,
      investmentAcceleration: 1.5,
      lpFundingDelay: 3,
      expenseIncrease: 0.1,
    };

    const engine = new LiquidityEngine(fundId, fundSize);
    const result = engine.runStressTest(currentPosition, factors);

    res.json(result);
  })
);

/**
 * POST /api/liquidity/optimize-calls
 * Optimize capital call schedule
 */
router.post(
  '/optimize-calls',
  asyncHandler(async (req: Request, res: Response) => {
    const { fundId, fundSize, currentPosition, plannedInvestments, constraints } = req.body;

    if (!fundId || typeof fundSize !== 'number') {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'fundId and fundSize are required',
      });
    }

    if (!currentPosition) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'currentPosition is required',
      });
    }

    if (!plannedInvestments || !Array.isArray(plannedInvestments)) {
      return res.status(400).json({
        error: 'invalid_request',
        message: 'plannedInvestments array is required',
      });
    }

    // Default constraints if not provided
    const callConstraints: CapitalCallConstraints = constraints || {
      noticePeriodDays: 10,
      paymentPeriodDays: 30,
    };

    // Parse dates in planned investments
    const investments: PlannedInvestment[] = plannedInvestments.map((inv: PlannedInvestment) => ({
      ...inv,
      targetDate: new Date(inv.targetDate),
    }));

    const engine = new LiquidityEngine(fundId, fundSize);
    const schedule = engine.optimizeCapitalCallSchedule(
      currentPosition,
      investments,
      callConstraints
    );

    res.json(schedule);
  })
);

export default router;
