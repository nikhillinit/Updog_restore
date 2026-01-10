/**
 * Liquidity Engine API Routes
 *
 * Endpoints for cashflow analysis, liquidity forecasting, and stress testing.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../middleware/async.js';
import {
  LiquidityEngine,
  type StressTestFactors,
  type PlannedInvestment,
  type CapitalCallConstraints,
} from '../../shared/core/liquidity/index.js';

const router = Router();

// Request validation schemas
const analyzeCashFlowsSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  transactions: z.array(z.unknown()),
});

const liquidityForecastSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  currentPosition: z.unknown(),
  transactions: z.array(z.unknown()).optional(),
  recurringExpenses: z.array(z.unknown()).default([]),
  months: z.number().default(12),
});

const stressTestSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  currentPosition: z.unknown(),
  stressFactors: z.object({
    distributionDelay: z.number().optional(),
    investmentAcceleration: z.number().optional(),
    lpFundingDelay: z.number().optional(),
    expenseIncrease: z.number().optional(),
  }).optional(),
});

const optimizeCallsSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  currentPosition: z.unknown(),
  plannedInvestments: z.array(z.unknown()),
  constraints: z.object({
    noticePeriodDays: z.number().optional(),
    paymentPeriodDays: z.number().optional(),
  }).optional(),
});

/**
 * POST /api/liquidity/analyze
 * Analyze cash flows and calculate key metrics
 */
router.post(
  '/analyze',
  asyncHandler(async (req: Request, res: Response) => {
    const { fundId, fundSize, transactions } = analyzeCashFlowsSchema.parse(req.body);

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
      recurringExpenses,
      months,
    } = liquidityForecastSchema.parse(req.body);

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
    const { fundId, fundSize, currentPosition, stressFactors } = stressTestSchema.parse(req.body);

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
    const { fundId, fundSize, currentPosition, plannedInvestments, constraints } = optimizeCallsSchema.parse(req.body);

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
