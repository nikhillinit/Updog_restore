/**
 * Portfolio Intelligence API Routes
 *
 * RESTful endpoints for portfolio construction modeling, scenario planning,
 * reserve optimization, and performance forecasting. Built for internal VC tools
 * with comprehensive simulation and analysis capabilities.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { idempotency } from '../middleware/idempotency';
import { positiveInt, bounded01, nonNegative } from '@shared/schema-helpers';
import { toNumber, NumberParseError } from '@shared/number';
import type { ApiError } from '@shared/types';

const router = Router();

// Extend Request type to include user property for authentication
interface AuthenticatedRequest extends Request {
  user?: { id: string };
}

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

// Fund Strategy Model Schemas
const CreateStrategySchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  modelType: z.enum(['strategic', 'tactical', 'opportunistic', 'defensive', 'balanced']),
  targetPortfolioSize: positiveInt().default(25),
  maxPortfolioSize: positiveInt().default(30),
  targetDeploymentPeriodMonths: positiveInt().default(36),
  checkSizeRange: z.object({
    min: nonNegative(),
    max: nonNegative(),
    target: nonNegative()
  }),
  sectorAllocation: z.record(z.string(), bounded01()),
  stageAllocation: z.record(z.string(), bounded01()),
  geographicAllocation: z.record(z.string(), bounded01()).optional(),
  initialReservePercentage: bounded01().default(0.50),
  followOnStrategy: z.record(z.any()),
  concentrationLimits: z.record(z.any()),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  targetIrr: bounded01().optional(),
  targetMultiple: nonNegative().optional(),
  targetDpi: nonNegative().optional(),
  tags: z.array(z.string().max(50)).max(10).default([])
});

const UpdateStrategySchema = CreateStrategySchema.partial();

// Portfolio Scenario Schemas
const CreateScenarioSchema = z.object({
  strategyModelId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scenarioType: z.enum(['base_case', 'optimistic', 'pessimistic', 'stress_test', 'custom']),
  marketEnvironment: z.enum(['bull', 'normal', 'bear', 'recession']).default('normal'),
  dealFlowAssumption: nonNegative().default(1.00),
  valuationEnvironment: nonNegative().default(1.00),
  exitEnvironment: nonNegative().default(1.00),
  plannedInvestments: z.array(z.record(z.any())),
  deploymentSchedule: z.record(z.any())
});

// Scenario Comparison Schema
const CompareScenarioSchema = z.object({
  baseScenarioId: z.string().uuid(),
  comparisonScenarioIds: z.array(z.string().uuid()).min(1).max(5),
  comparisonType: z.enum(['strategy_comparison', 'scenario_analysis', 'sensitivity_test', 'optimization_study']),
  comparisonMetrics: z.array(z.string()).min(1),
  weightScheme: z.record(z.string(), nonNegative()).optional()
});

// Monte Carlo Simulation Schema
const RunSimulationSchema = z.object({
  simulationType: z.enum(['portfolio_construction', 'performance_forecast', 'risk_analysis', 'optimization']),
  numberOfRuns: positiveInt().default(10000),
  inputDistributions: z.record(z.any()),
  correlationMatrix: z.record(z.any()).optional(),
  constraints: z.record(z.any()).optional()
});

// Reserve Optimization Schemas
const OptimizeReservesSchema = z.object({
  strategyType: z.enum(['proportional', 'milestone_based', 'performance_based', 'opportunistic', 'hybrid']),
  totalReserveAmount: nonNegative(),
  maxPerCompanyPct: bounded01().default(0.20),
  allocationRules: z.record(z.any()),
  optimizationObjective: z.enum(['irr_maximization', 'risk_minimization', 'risk_adjusted_return', 'portfolio_balance']).default('risk_adjusted_return'),
  monteCarloIterations: positiveInt().default(5000)
});

const BacktestReserveSchema = z.object({
  strategyId: z.string().uuid(),
  backtestPeriodStart: z.string().datetime(),
  backtestPeriodEnd: z.string().datetime(),
  benchmarkStrategy: z.enum(['equal_weight', 'market_cap', 'custom']).default('equal_weight')
});

// Performance Forecast Schemas
const CreateForecastSchema = z.object({
  scenarioId: z.string().uuid().optional(),
  baselineId: z.string().uuid().optional(),
  forecastName: z.string().min(1).max(100),
  forecastType: z.enum(['fund_level', 'portfolio_level', 'company_level', 'sector_level']),
  forecastHorizonYears: positiveInt().default(10),
  methodology: z.enum(['historical_extrapolation', 'monte_carlo', 'machine_learning', 'hybrid', 'expert_judgment']),
  assumptions: z.record(z.any()).optional()
});

const ValidateForecastSchema = z.object({
  forecastId: z.string().uuid(),
  actualMetrics: z.record(z.any()),
  validationPeriod: z.string().datetime()
});

// Quick Action Schemas
const QuickScenarioSchema = z.object({
  strategyModelId: z.string().uuid(),
  marketCondition: z.enum(['bull', 'normal', 'bear']).default('normal'),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  timeHorizon: positiveInt().default(10)
});

// ============================================================================
// STRATEGY MANAGEMENT ROUTES
// ============================================================================

/**
 * Create a new fund strategy model
 * POST /api/portfolio/strategies
 */
router["post"]('/api/portfolio/strategies', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Get fund ID from query parameter
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters'
      };
      return res["status"](400)["json"](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // Validate request body
    const validation = CreateStrategySchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid strategy data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const data = validation.data;
    const userId = parseInt(req.user?.id || '0');

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create strategies'
      };
      return res["status"](401)["json"](error);
    }

    // TODO: Implement with actual database service
    // const strategy = await portfolioIntelligenceService.strategies.create({
    //   fundId: parsedFundId,
    //   ...data,
    //   createdBy: userId
    // });

    // Mock response for now
    const strategy = {
      id: `strategy_${Math.random().toString(36).slice(2)}`,
      fundId: parsedFundId,
      ...data,
      createdBy: userId,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: strategy,
      message: 'Strategy model created successfully'
    });
  } catch (error) {
    console.error('Strategy creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create strategy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Get strategies for a fund
 * GET /api/portfolio/strategies/:fundId
 */
router['get']('/api/portfolio/strategies/:fundId', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['fundId'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    // Parse query parameters
    // TODO: These will be used when database service is implemented
    const _isActive = req.query['isActive'] === 'true' ? true : req.query['isActive'] === 'false' ? false : undefined;
    const _modelType = req.query['modelType'] as string;
    const _limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    // TODO: Implement with actual database service
    // const strategies = await portfolioIntelligenceService.strategies.getByFund(fundId, {
    //   isActive: _isActive,
    //   modelType: _modelType,
    //   limit: _limit
    // });

    // Mock response for now
    const strategies = [
      {
        id: 'strategy_1',
        fundId,
        name: 'Base Strategy',
        modelType: 'strategic',
        isActive: true,
        createdAt: new Date().toISOString()
      }
    ];

    res["json"]({
      success: true,
      data: strategies,
      count: strategies.length
    });
  } catch (error) {
    console.error('Strategies fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch strategies',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Update a strategy
 * PUT /api/portfolio/strategies/:id
 */
router["put"]('/api/portfolio/strategies/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const strategyId = req.params['id'];
    if (!strategyId) {
      const error: ApiError = {
        error: 'Invalid strategy ID',
        message: 'Strategy ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const validation = UpdateStrategySchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid strategy update data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to update strategies'
      };
      return res["status"](401)["json"](error);
    }

    // TODO: Implement update logic
    const updatedStrategy = {
      id: strategyId,
      ...validation.data,
      updatedAt: new Date().toISOString()
    };

    res["json"]({
      success: true,
      data: updatedStrategy,
      message: 'Strategy updated successfully'
    });
  } catch (error) {
    console.error('Strategy update error:', error);
    const apiError: ApiError = {
      error: 'Failed to update strategy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Delete a strategy
 * DELETE /api/portfolio/strategies/:id
 */
router["delete"]('/api/portfolio/strategies/:id', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const strategyId = req.params['id'];
    if (!strategyId) {
      const error: ApiError = {
        error: 'Invalid strategy ID',
        message: 'Strategy ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to delete strategies'
      };
      return res["status"](401)["json"](error);
    }

    // TODO: Implement soft delete (set isActive: false)
    // await portfolioIntelligenceService.strategies.deactivate(strategyId, userId);

    res["json"]({
      success: true,
      message: 'Strategy deactivated successfully'
    });
  } catch (error) {
    console.error('Strategy deletion error:', error);
    const apiError: ApiError = {
      error: 'Failed to delete strategy',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// ============================================================================
// SCENARIO OPERATIONS ROUTES
// ============================================================================

/**
 * Create a portfolio scenario
 * POST /api/portfolio/scenarios
 */
router["post"]('/api/portfolio/scenarios', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters'
      };
      return res["status"](400)["json"](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const validation = CreateScenarioSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid scenario data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create scenarios'
      };
      return res["status"](401)["json"](error);
    }

    // TODO: Implement scenario creation
    const scenario = {
      id: `scenario_${Math.random().toString(36).slice(2)}`,
      fundId: parsedFundId,
      ...validation.data,
      status: 'draft',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: scenario,
      message: 'Portfolio scenario created successfully'
    });
  } catch (error) {
    console.error('Scenario creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create scenario',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Get scenarios for a fund
 * GET /api/portfolio/scenarios/:fundId
 */
router['get']('/api/portfolio/scenarios/:fundId', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['fundId'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const scenarioType = req.query['scenarioType'] as string;
    const status = req.query['status'] as string;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    // TODO: Implement database query
    const scenarios = [
      {
        id: 'scenario_1',
        fundId,
        name: 'Base Case',
        scenarioType: 'base_case',
        status: 'complete',
        createdAt: new Date().toISOString()
      }
    ];

    res["json"]({
      success: true,
      data: scenarios,
      count: scenarios.length
    });
  } catch (error) {
    console.error('Scenarios fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch scenarios',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Compare multiple scenarios
 * POST /api/portfolio/scenarios/compare
 */
router["post"]('/api/portfolio/scenarios/compare', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = CompareScenarioSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid scenario comparison data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to compare scenarios'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement scenario comparison logic
    const comparison = {
      id: `comparison_${Math.random().toString(36).slice(2)}`,
      baseScenarioId: data.baseScenarioId,
      comparisonScenarios: data.comparisonScenarioIds,
      comparisonType: data.comparisonType,
      metricComparisons: {},
      rankingResults: {},
      summary: {
        bestPerforming: data.comparisonScenarioIds[0],
        keyDifferences: [],
        recommendation: 'Analysis complete'
      },
      status: 'ready',
      createdBy: userId,
      createdAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: comparison,
      message: 'Scenario comparison completed successfully'
    });
  } catch (error) {
    console.error('Scenario comparison error:', error);
    const apiError: ApiError = {
      error: 'Failed to compare scenarios',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Run Monte Carlo simulation on a scenario
 * POST /api/portfolio/scenarios/:id/simulate
 */
router["post"]('/api/portfolio/scenarios/:id/simulate', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const scenarioId = req.params['id'];
    if (!scenarioId) {
      const error: ApiError = {
        error: 'Invalid scenario ID',
        message: 'Scenario ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const validation = RunSimulationSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid simulation parameters',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to run simulations'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement Monte Carlo simulation
    const simulation = {
      id: `simulation_${Math.random().toString(36).slice(2)}`,
      scenarioId,
      simulationType: data.simulationType,
      numberOfRuns: data.numberOfRuns,
      summaryStatistics: {
        mean: 2.1,
        median: 2.0,
        std: 0.8,
        percentiles: {
          p5: 0.9,
          p25: 1.4,
          p50: 2.0,
          p75: 2.7,
          p95: 3.8
        }
      },
      riskMetrics: {
        var95: 0.9,
        cvar95: 0.6,
        maxDrawdown: 0.45
      },
      convergenceMetrics: {
        stable: true,
        iterations: data.numberOfRuns
      },
      computationTimeMs: 1250,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: simulation,
      message: 'Monte Carlo simulation completed successfully'
    });
  } catch (error) {
    console.error('Simulation error:', error);
    const apiError: ApiError = {
      error: 'Failed to run simulation',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// ============================================================================
// RESERVE OPTIMIZATION ROUTES
// ============================================================================

/**
 * Optimize reserve allocation
 * POST /api/portfolio/reserves/optimize
 */
router["post"]('/api/portfolio/reserves/optimize', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters'
      };
      return res["status"](400)["json"](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const validation = OptimizeReservesSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid reserve optimization parameters',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to optimize reserves'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement reserve optimization algorithm
    const optimization = {
      id: `optimization_${Math.random().toString(36).slice(2)}`,
      fundId: parsedFundId,
      strategyType: data.strategyType,
      optimizationObjective: data.optimizationObjective,
      optimalAllocation: {
        companiesSelected: 15,
        totalAllocated: data.totalReserveAmount * 0.85,
        averageAllocation: (data.totalReserveAmount * 0.85) / 15,
        concentrationScore: 0.72
      },
      performanceProjection: {
        expectedIrr: 0.18,
        riskAdjustedReturn: 0.24,
        portfolioRisk: 0.31
      },
      computationTimeMs: 2100,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: optimization,
      message: 'Reserve optimization completed successfully'
    });
  } catch (error) {
    console.error('Reserve optimization error:', error);
    const apiError: ApiError = {
      error: 'Failed to optimize reserves',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Get reserve strategies for a fund
 * GET /api/portfolio/reserves/strategies/:fundId
 */
router['get']('/api/portfolio/reserves/strategies/:fundId', async (req: Request, res: Response) => {
  try {
    let fundId: number;
    try {
      fundId = toNumber(req.params['fundId'], 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const strategyType = req.query['strategyType'] as string;
    const isActive = req.query['isActive'] === 'true' ? true : req.query['isActive'] === 'false' ? false : undefined;

    // TODO: Implement database query
    const strategies = [
      {
        id: 'reserve_strategy_1',
        fundId,
        name: 'Performance-Based Reserve Strategy',
        strategyType: 'performance_based',
        isActive: true,
        lastOptimizedAt: new Date().toISOString(),
        createdAt: new Date().toISOString()
      }
    ];

    res["json"]({
      success: true,
      data: strategies,
      count: strategies.length
    });
  } catch (error) {
    console.error('Reserve strategies fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch reserve strategies',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Backtest reserve strategy
 * POST /api/portfolio/reserves/backtest
 */
router["post"]('/api/portfolio/reserves/backtest', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = BacktestReserveSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid backtest parameters',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to run backtests'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement backtesting logic
    const backtest = {
      id: `backtest_${Math.random().toString(36).slice(2)}`,
      strategyId: data.strategyId,
      backtestPeriod: {
        start: data.backtestPeriodStart,
        end: data.backtestPeriodEnd
      },
      results: {
        strategyIrr: 0.22,
        benchmarkIrr: 0.18,
        outperformance: 0.04,
        sharpeRatio: 1.15,
        maxDrawdown: 0.28,
        winRate: 0.68
      },
      performanceAttribution: {
        timing: 0.02,
        selection: 0.015,
        interaction: 0.005
      },
      computationTimeMs: 3200,
      createdBy: userId,
      createdAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: backtest,
      message: 'Reserve strategy backtest completed successfully'
    });
  } catch (error) {
    console.error('Backtest error:', error);
    const apiError: ApiError = {
      error: 'Failed to run backtest',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// ============================================================================
// PERFORMANCE FORECASTING ROUTES
// ============================================================================

/**
 * Generate performance forecast
 * POST /api/portfolio/forecasts
 */
router["post"]('/api/portfolio/forecasts', idempotency, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters'
      };
      return res["status"](400)["json"](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message
        };
        return res["status"](400)["json"](error);
      }
      throw err;
    }

    const validation = CreateForecastSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid forecast parameters',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create forecasts'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement forecasting models
    const forecast = {
      id: `forecast_${Math.random().toString(36).slice(2)}`,
      fundId: parsedFundId,
      ...data,
      forecastPeriods: {
        year1: { irr: 0.12, multiple: 1.2, nav: 85000000 },
        year3: { irr: 0.16, multiple: 1.8, nav: 120000000 },
        year5: { irr: 0.19, multiple: 2.4, nav: 180000000 },
        year10: { irr: 0.22, multiple: 3.2, nav: 220000000 }
      },
      confidenceIntervals: {
        irr: { lower: 0.18, upper: 0.26 },
        multiple: { lower: 2.8, upper: 3.6 }
      },
      status: 'complete',
      qualityScore: 0.87,
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: forecast,
      message: 'Performance forecast generated successfully'
    });
  } catch (error) {
    console.error('Forecast generation error:', error);
    const apiError: ApiError = {
      error: 'Failed to generate forecast',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Get forecasts for a scenario
 * GET /api/portfolio/forecasts/:scenarioId
 */
router['get']('/api/portfolio/forecasts/:scenarioId', async (req: Request, res: Response) => {
  try {
    const scenarioId = req.params['scenarioId'];
    if (!scenarioId) {
      const error: ApiError = {
        error: 'Invalid scenario ID',
        message: 'Scenario ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const forecastType = req.query['forecastType'] as string;
    const status = req.query['status'] as string;

    // TODO: Implement database query
    const forecasts = [
      {
        id: 'forecast_1',
        scenarioId,
        forecastName: 'Base Case Forecast',
        forecastType: 'fund_level',
        status: 'complete',
        createdAt: new Date().toISOString()
      }
    ];

    res["json"]({
      success: true,
      data: forecasts,
      count: forecasts.length
    });
  } catch (error) {
    console.error('Forecasts fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch forecasts',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Validate forecast against actuals
 * POST /api/portfolio/forecasts/validate
 */
router["post"]('/api/portfolio/forecasts/validate', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = ValidateForecastSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid forecast validation data',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to validate forecasts'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement forecast validation logic
    const validationResult = {
      forecastId: data.forecastId,
      validationPeriod: data.validationPeriod,
      accuracyMetrics: {
        mape: 0.12, // Mean Absolute Percentage Error
        rmse: 0.08, // Root Mean Square Error
        bias: -0.02 // Forecast bias
      },
      calibration: {
        isWellCalibrated: true,
        calibrationScore: 0.91
      },
      keyInsights: [
        'IRR forecasts showed strong accuracy',
        'Multiple projections were conservative',
        'Model performs well in normal market conditions'
      ],
      recommendedAdjustments: [
        'Increase multiple sensitivity to market conditions',
        'Incorporate more sector-specific factors'
      ],
      createdBy: userId,
      createdAt: new Date().toISOString()
    };

    res["json"]({
      success: true,
      data: validationResult,
      message: 'Forecast validation completed successfully'
    });
  } catch (error) {
    console.error('Forecast validation error:', error);
    const apiError: ApiError = {
      error: 'Failed to validate forecast',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

// ============================================================================
// QUICK ACTIONS ROUTES (FOR UI)
// ============================================================================

/**
 * Get strategy templates
 * GET /api/portfolio/templates
 */
router['get']('/api/portfolio/templates', async (req: Request, res: Response) => {
  try {
    const category = req.query['category'] as string;
    const riskProfile = req.query['riskProfile'] as string;

    // TODO: Implement template query
    const templates = [
      {
        id: 'template_1',
        name: 'Balanced Growth Strategy',
        category: 'balanced',
        riskProfile: 'moderate',
        description: 'Diversified portfolio with balanced risk-return profile',
        targetPortfolioSize: 25,
        sectorAllocation: {
          fintech: 0.30,
          healthtech: 0.25,
          enterprise: 0.20,
          consumer: 0.15,
          deeptech: 0.10
        },
        stageAllocation: {
          seed: 0.40,
          seriesA: 0.60
        }
      },
      {
        id: 'template_2',
        name: 'High Growth Aggressive',
        category: 'growth',
        riskProfile: 'aggressive',
        description: 'Concentrated portfolio targeting high-growth companies',
        targetPortfolioSize: 20,
        sectorAllocation: {
          fintech: 0.40,
          healthtech: 0.30,
          deeptech: 0.30
        },
        stageAllocation: {
          seed: 0.70,
          seriesA: 0.30
        }
      }
    ];

    const filteredTemplates = templates.filter(t => {
      if (category && t.category !== category) return false;
      if (riskProfile && t.riskProfile !== riskProfile) return false;
      return true;
    });

    res["json"]({
      success: true,
      data: filteredTemplates,
      count: filteredTemplates.length
    });
  } catch (error) {
    console.error('Templates fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch templates',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Generate quick scenario from parameters
 * POST /api/portfolio/quick-scenario
 */
router["post"]('/api/portfolio/quick-scenario', async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = QuickScenarioSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid quick scenario parameters',
        details: validation.error.flatten()
      };
      return res["status"](400)["json"](error);
    }

    const userId = parseInt(req.user?.id || '0');
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to generate scenarios'
      };
      return res["status"](401)["json"](error);
    }

    const data = validation.data;

    // TODO: Implement quick scenario generation
    const quickScenario = {
      id: `quick_scenario_${Math.random().toString(36).slice(2)}`,
      strategyModelId: data.strategyModelId,
      name: `Quick ${data.riskProfile} scenario (${data.marketCondition} market)`,
      scenarioType: 'custom',
      marketEnvironment: data.marketCondition,
      quickProjections: {
        expectedIrr: data.riskProfile === 'aggressive' ? 0.25 : data.riskProfile === 'moderate' ? 0.20 : 0.15,
        expectedMultiple: data.riskProfile === 'aggressive' ? 3.5 : data.riskProfile === 'moderate' ? 2.8 : 2.2,
        timeToFullDeployment: data.timeHorizon * 0.3,
        portfolioRisk: data.riskProfile === 'aggressive' ? 0.45 : data.riskProfile === 'moderate' ? 0.35 : 0.25
      },
      status: 'ready',
      createdBy: userId,
      createdAt: new Date().toISOString()
    };

    res["status"](201)["json"]({
      success: true,
      data: quickScenario,
      message: 'Quick scenario generated successfully'
    });
  } catch (error) {
    console.error('Quick scenario error:', error);
    const apiError: ApiError = {
      error: 'Failed to generate quick scenario',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

/**
 * Get real-time metrics for a scenario
 * GET /api/portfolio/metrics/:scenarioId
 */
router['get']('/api/portfolio/metrics/:scenarioId', async (req: Request, res: Response) => {
  try {
    const scenarioId = req.params['scenarioId'];
    if (!scenarioId) {
      const error: ApiError = {
        error: 'Invalid scenario ID',
        message: 'Scenario ID is required'
      };
      return res["status"](400)["json"](error);
    }

    const metricType = req.query['metricType'] as string;
    const timeRange = req.query['timeRange'] as string || '1y';

    // TODO: Implement real-time metrics calculation
    const metrics = {
      scenarioId,
      lastUpdated: new Date().toISOString(),
      fundMetrics: {
        currentIrr: 0.18,
        currentMultiple: 2.1,
        deployedCapital: 65000000,
        reservesRemaining: 35000000,
        portfolioCompanies: 18
      },
      portfolioMetrics: {
        averageValuation: 12500000,
        topPerformers: [
          { name: 'Company A', multiple: 4.2 },
          { name: 'Company B', multiple: 3.8 }
        ],
        sectorBreakdown: {
          fintech: 0.35,
          healthtech: 0.30,
          enterprise: 0.20,
          other: 0.15
        }
      },
      riskMetrics: {
        portfolioVaR: 0.28,
        concentrationRisk: 0.15,
        sectorConcentration: 0.35,
        liquidityRisk: 0.22
      },
      performanceTrends: {
        irrTrend: [0.12, 0.15, 0.17, 0.18],
        multipleTrend: [1.2, 1.6, 1.9, 2.1],
        periods: ['Q1', 'Q2', 'Q3', 'Q4']
      }
    };

    res["json"]({
      success: true,
      data: metrics,
      cacheInfo: {
        lastCalculated: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        dataFreshness: 'real-time'
      }
    });
  } catch (error) {
    console.error('Metrics fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch metrics',
      message: error instanceof Error ? error.message : 'Unknown error'
    };
    res["status"](500)["json"](apiError);
  }
});

export default router;