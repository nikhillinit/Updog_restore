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
  CashPositionSchema,
  CashTransactionSchema,
  RecurringExpenseSchema,
} from '@shared/schemas/cashflow-schema';
import {
  LiquidityEngine,
  type StressTestFactors,
  type PlannedInvestment,
  type CapitalCallConstraints,
} from '../../shared/core/liquidity/index.js';

const router = Router();

// Request validation schemas
const stressTestFactorsSchema = z
  .object({
    distributionDelay: z.number(),
    investmentAcceleration: z.number(),
    lpFundingDelay: z.number(),
    expenseIncrease: z.number(),
  })
  .partial();

const plannedInvestmentSchema = z.object({
  id: z.string(),
  description: z.string(),
  amount: z.number(),
  targetDate: z.coerce.date(),
  priority: z.number(),
  companyId: z.string().optional(),
});

const capitalCallConstraintsSchema = z
  .object({
    noticePeriodDays: z.number(),
    paymentPeriodDays: z.number(),
    minCallAmount: z.number().optional(),
    maxCallAmount: z.number().optional(),
    maxCallsPerQuarter: z.number().optional(),
  })
  .partial();

const analyzeCashFlowsSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  transactions: z.array(CashTransactionSchema),
});

const liquidityForecastSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  currentPosition: CashPositionSchema,
  transactions: z.array(CashTransactionSchema).optional(),
  recurringExpenses: z.array(RecurringExpenseSchema).default([]),
  months: z.number().default(12),
});

const stressTestSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  currentPosition: CashPositionSchema,
  stressFactors: stressTestFactorsSchema.optional(),
});

const optimizeCallsSchema = z.object({
  fundId: z.string(),
  fundSize: z.number(),
  currentPosition: CashPositionSchema,
  plannedInvestments: z.array(plannedInvestmentSchema),
  constraints: capitalCallConstraintsSchema.optional(),
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
    const factors: StressTestFactors = {
      distributionDelay: stressFactors?.distributionDelay ?? 6,
      investmentAcceleration: stressFactors?.investmentAcceleration ?? 1.5,
      lpFundingDelay: stressFactors?.lpFundingDelay ?? 3,
      expenseIncrease: stressFactors?.expenseIncrease ?? 0.1,
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
    const callConstraints: CapitalCallConstraints = {
      noticePeriodDays: constraints?.noticePeriodDays ?? 10,
      paymentPeriodDays: constraints?.paymentPeriodDays ?? 30,
      ...(constraints?.minCallAmount !== undefined
        ? { minCallAmount: constraints.minCallAmount }
        : {}),
      ...(constraints?.maxCallAmount !== undefined
        ? { maxCallAmount: constraints.maxCallAmount }
        : {}),
      ...(constraints?.maxCallsPerQuarter !== undefined
        ? { maxCallsPerQuarter: constraints.maxCallsPerQuarter }
        : {}),
    };

    // Parse dates in planned investments
    const investments: PlannedInvestment[] = plannedInvestments.map((inv) => ({
      id: inv.id,
      description: inv.description,
      amount: inv.amount,
      targetDate: new Date(inv.targetDate),
      priority: inv.priority,
      ...(inv.companyId !== undefined ? { companyId: inv.companyId } : {}),
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
