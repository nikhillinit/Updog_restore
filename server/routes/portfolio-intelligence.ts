/**
 * Portfolio Intelligence API Routes
 *
 * RESTful endpoints for portfolio construction modeling, scenario planning,
 * reserve optimization, and performance forecasting. Built for internal VC tools
 * with comprehensive simulation and analysis capabilities.
 */

import { Router } from 'express';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import idempotency from '../middleware/idempotency';
import { securityMiddlewareStack } from '../middleware/security';
import { positiveInt, bounded01, nonNegative } from '@shared/schema-helpers';
import { toNumber, NumberParseError } from '@shared/number';
import type { ApiError } from '@shared/types';
import { portfolioIntelligenceService } from '../services/portfolio-intelligence-service';
// Stage normalization and validation
import { parseStageDistribution, CANONICAL_STAGES } from '@shared/schemas/parse-stage-distribution';
import { getStageValidationMode } from '../lib/stage-validation-mode';
import {
  recordValidationDuration,
  recordValidationSuccess,
  recordUnknownStage,
} from '../observability/stage-metrics';
import { setStageWarningHeaders } from '../middleware/deprecation-headers';

// Type for portfolio storage
type PortfolioStorage = {
  strategies: Map<string, unknown>;
  scenarios: Map<string, unknown>;
  forecasts: Map<string, unknown>;
  reserveStrategies: Map<string, unknown>;
  comparisons: Map<string, unknown>;
  simulations: Map<string, unknown>;
  optimizations: Map<string, unknown>;
  backtests: Map<string, unknown>;
  validations: Map<string, unknown>;
  quickScenarios: Map<string, unknown>;
};

// Helper to get storage from request
const getPortfolioStorage = (req: Request): PortfolioStorage => {
  const locals = req.app.locals as { portfolioStorage?: PortfolioStorage };
  if (!locals.portfolioStorage) {
    locals.portfolioStorage = {
      strategies: new Map(),
      scenarios: new Map(),
      forecasts: new Map(),
      reserveStrategies: new Map(),
      comparisons: new Map(),
      simulations: new Map(),
      optimizations: new Map(),
      backtests: new Map(),
      validations: new Map(),
      quickScenarios: new Map(),
    };
  }
  return locals.portfolioStorage;
};

// Error handling helpers
const isErrorWithMessage = (error: unknown): error is { message: string } => {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message?: unknown }).message === 'string'
  );
};

const getErrorMessage = (error: unknown): string => {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  return 'Unknown error';
};

// Helper to safely extract user ID from request
const getUserId = (req: Request): number => {
  const user = req.user as { id?: string } | undefined;
  if (!user?.id) {
    return 0;
  }
  const parsed = parseInt(user.id, 10);
  return isNaN(parsed) ? 0 : parsed;
};

const router = Router();
router.use(securityMiddlewareStack);

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
    target: nonNegative(),
  }),
  sectorAllocation: z.record(z.string(), bounded01()),
  stageAllocation: z.record(z.string(), bounded01()),
  geographicAllocation: z.record(z.string(), bounded01()).optional(),
  initialReservePercentage: bounded01().default(0.5),
  followOnStrategy: z.record(z.any()),
  concentrationLimits: z.record(z.any()),
  riskTolerance: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  targetIrr: bounded01().optional(),
  targetMultiple: nonNegative().optional(),
  targetDpi: nonNegative().optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
});

const UpdateStrategySchema = CreateStrategySchema.partial();

// Portfolio Scenario Schemas
const CreateScenarioSchema = z.object({
  strategyModelId: z.string().uuid(),
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  scenarioType: z.enum(['base_case', 'optimistic', 'pessimistic', 'stress_test', 'custom']),
  marketEnvironment: z.enum(['bull', 'normal', 'bear', 'recession']).default('normal'),
  dealFlowAssumption: nonNegative().default(1.0),
  valuationEnvironment: nonNegative().default(1.0),
  exitEnvironment: nonNegative().default(1.0),
  plannedInvestments: z.array(z.record(z.any())),
  deploymentSchedule: z.record(z.any()),
});

// Scenario Comparison Schema
const CompareScenarioSchema = z.object({
  baseScenarioId: z.string().uuid(),
  comparisonScenarioIds: z.array(z.string().uuid()).min(1).max(5),
  comparisonType: z.enum([
    'strategy_comparison',
    'scenario_analysis',
    'sensitivity_test',
    'optimization_study',
  ]),
  comparisonMetrics: z.array(z.string()).min(1),
  weightScheme: z.record(z.string(), nonNegative()).optional(),
});

// Monte Carlo Simulation Schema
const RunSimulationSchema = z.object({
  simulationType: z.enum([
    'portfolio_construction',
    'performance_forecast',
    'risk_analysis',
    'optimization',
  ]),
  numberOfRuns: positiveInt().min(100, 'Minimum 100 simulation runs required').default(10000),
  inputDistributions: z.record(z.any()),
  correlationMatrix: z.record(z.any()).optional(),
  constraints: z.record(z.any()).optional(),
});

// Reserve Optimization Schemas
const OptimizeReservesSchema = z.object({
  strategyType: z.enum([
    'proportional',
    'milestone_based',
    'performance_based',
    'opportunistic',
    'hybrid',
  ]),
  totalReserveAmount: nonNegative(),
  maxPerCompanyPct: bounded01().default(0.2),
  allocationRules: z.record(z.any()),
  optimizationObjective: z
    .enum(['irr_maximization', 'risk_minimization', 'risk_adjusted_return', 'portfolio_balance'])
    .default('risk_adjusted_return'),
  monteCarloIterations: positiveInt().default(5000),
});

const BacktestReserveSchema = z.object({
  strategyId: z.string().uuid(),
  backtestPeriodStart: z.string().datetime(),
  backtestPeriodEnd: z.string().datetime(),
  benchmarkStrategy: z.enum(['equal_weight', 'market_cap', 'custom']),
});

// Performance Forecast Schemas
const CreateForecastSchema = z.object({
  scenarioId: z.string().uuid().optional(),
  baselineId: z.string().uuid().optional(),
  forecastName: z.string().min(1).max(100),
  forecastType: z.enum(['fund_level', 'portfolio_level', 'company_level', 'sector_level']),
  forecastHorizonYears: positiveInt()
    .min(1)
    .max(20, 'Forecast horizon must be between 1 and 20 years'),
  methodology: z.enum([
    'historical_extrapolation',
    'monte_carlo',
    'machine_learning',
    'hybrid',
    'expert_judgment',
  ]),
  assumptions: z.record(z.any()).optional(),
});

const ValidateForecastSchema = z.object({
  forecastId: z.string().uuid(),
  actualMetrics: z.record(z.any()),
  validationPeriod: z.string().datetime(),
});

// Quick Action Schemas
const QuickScenarioSchema = z.object({
  strategyModelId: z.string().uuid(),
  marketCondition: z.enum(['bull', 'normal', 'bear']).default('normal'),
  riskProfile: z.enum(['conservative', 'moderate', 'aggressive']).default('moderate'),
  timeHorizon: positiveInt().default(10),
});

// ============================================================================
// STRATEGY MANAGEMENT ROUTES
// ============================================================================

/**
 * Create a new fund strategy model
 * POST /api/portfolio/strategies
 */
router['post']('/api/portfolio/strategies', idempotency, async (req: Request, res: Response) => {
  try {
    // Get fund ID from query parameter
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters',
      };
      return res['status'](400)['json'](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    // Validate request body
    const validation = CreateStrategySchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid strategy data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const validatedData = validation.data;

    // Validate stage allocation using stage normalization
    let normalizedStageAllocation = validatedData.stageAllocation;
    if (validatedData.stageAllocation && Object.keys(validatedData.stageAllocation).length > 0) {
      const validationStart = performance.now();
      // Convert stageAllocation to percentage format for parseStageDistribution
      const stagePercentages: Record<string, number> = {};
      for (const [stage, weight] of Object.entries(validatedData.stageAllocation)) {
        stagePercentages[stage] = (weight as number) * 100; // Convert 0-1 to 0-100
      }
      const { normalized, invalidInputs, suggestions } = parseStageDistribution(stagePercentages);
      const duration = (performance.now() - validationStart) / 1000;
      recordValidationDuration('POST /api/portfolio/strategies', duration);

      if (invalidInputs.length > 0) {
        const mode = await getStageValidationMode();
        recordUnknownStage('POST /api/portfolio/strategies', mode);
        setStageWarningHeaders(res, invalidInputs);

        if (mode === 'enforce') {
          const error: ApiError = {
            error: 'Invalid stage allocation',
            message: 'Unknown investment stage(s) in stageAllocation.',
            details: {
              code: 'INVALID_STAGE',
              invalid: invalidInputs,
              suggestions,
              validStages: [...CANONICAL_STAGES],
            },
          };
          return res['status'](400)['json'](error);
        }
      } else {
        // Use normalized stage allocation if validation passed
        normalizedStageAllocation = normalized;
        recordValidationSuccess('POST /api/portfolio/strategies');
      }
    }

    const userId = getUserId(req);

    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create strategies',
      };
      return res['status'](401)['json'](error);
    }

    // Persist strategy to database
    const strategy = await portfolioIntelligenceService.strategies.create({
      fundId: parsedFundId,
      name: validatedData.name,
      description: validatedData.description,
      modelType: validatedData.modelType,
      targetPortfolioSize: validatedData.targetPortfolioSize,
      maxPortfolioSize: validatedData.maxPortfolioSize,
      targetDeploymentPeriodMonths: validatedData.targetDeploymentPeriodMonths,
      checkSizeRange: validatedData.checkSizeRange,
      sectorAllocation: validatedData.sectorAllocation,
      stageAllocation: normalizedStageAllocation,
      geographicAllocation: validatedData.geographicAllocation,
      initialReservePercentage: String(validatedData.initialReservePercentage),
      followOnStrategy: validatedData.followOnStrategy,
      concentrationLimits: validatedData.concentrationLimits,
      riskTolerance: validatedData.riskTolerance,
      targetIrr: validatedData.targetIrr ? String(validatedData.targetIrr) : undefined,
      targetMultiple: validatedData.targetMultiple
        ? String(validatedData.targetMultiple)
        : undefined,
      targetDpi: validatedData.targetDpi ? String(validatedData.targetDpi) : undefined,
      tags: validatedData.tags,
      createdBy: userId,
      isActive: true,
    });

    res['status'](201)['json']({
      success: true,
      data: strategy,
      message: 'Strategy model created successfully',
    });
  } catch (error: unknown) {
    console.error('Strategy creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create strategy',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
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
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    // Parse query parameters
    const isActive =
      req.query['isActive'] === 'true'
        ? true
        : req.query['isActive'] === 'false'
          ? false
          : undefined;
    const modelType = req.query['modelType'] as string | undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    // Fetch strategies from database
    const strategies = await portfolioIntelligenceService.strategies.getByFund(fundId, {
      ...(isActive !== undefined && { isActive }),
      ...(modelType && { modelType }),
      ...(limit && { limit }),
    });

    res['json']({
      success: true,
      data: strategies,
      count: strategies.length,
    });
  } catch (error: unknown) {
    console.error('Strategies fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch strategies',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Update a strategy
 * PUT /api/portfolio/strategies/:id
 */
router['put']('/api/portfolio/strategies/:id', async (req: Request, res: Response) => {
  try {
    const strategyId = req.params['id'];
    if (!strategyId) {
      const error: ApiError = {
        error: 'Invalid strategy ID',
        message: 'Strategy ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const validation = UpdateStrategySchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid strategy update data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to update strategies',
      };
      return res['status'](401)['json'](error);
    }

    // Update strategy via service
    const validatedUpdate = validation.data;
    const updatedStrategy = await portfolioIntelligenceService.strategies.update(strategyId, {
      ...(validatedUpdate.name && { name: validatedUpdate.name }),
      ...(validatedUpdate.description && { description: validatedUpdate.description }),
      ...(validatedUpdate.modelType && { modelType: validatedUpdate.modelType }),
      ...(validatedUpdate.targetPortfolioSize && { targetPortfolioSize: validatedUpdate.targetPortfolioSize }),
      ...(validatedUpdate.maxPortfolioSize && { maxPortfolioSize: validatedUpdate.maxPortfolioSize }),
      ...(validatedUpdate.targetDeploymentPeriodMonths && { targetDeploymentPeriodMonths: validatedUpdate.targetDeploymentPeriodMonths }),
      ...(validatedUpdate.checkSizeRange && { checkSizeRange: validatedUpdate.checkSizeRange }),
      ...(validatedUpdate.sectorAllocation && { sectorAllocation: validatedUpdate.sectorAllocation }),
      ...(validatedUpdate.stageAllocation && { stageAllocation: validatedUpdate.stageAllocation }),
      ...(validatedUpdate.geographicAllocation && { geographicAllocation: validatedUpdate.geographicAllocation }),
      ...(validatedUpdate.initialReservePercentage !== undefined && { initialReservePercentage: String(validatedUpdate.initialReservePercentage) }),
      ...(validatedUpdate.followOnStrategy && { followOnStrategy: validatedUpdate.followOnStrategy }),
      ...(validatedUpdate.concentrationLimits && { concentrationLimits: validatedUpdate.concentrationLimits }),
      ...(validatedUpdate.riskTolerance && { riskTolerance: validatedUpdate.riskTolerance }),
      ...(validatedUpdate.targetIrr !== undefined && { targetIrr: String(validatedUpdate.targetIrr) }),
      ...(validatedUpdate.targetMultiple !== undefined && { targetMultiple: String(validatedUpdate.targetMultiple) }),
      ...(validatedUpdate.targetDpi !== undefined && { targetDpi: String(validatedUpdate.targetDpi) }),
      ...(validatedUpdate.tags && { tags: validatedUpdate.tags }),
    });

    if (!updatedStrategy) {
      const error: ApiError = {
        error: 'Strategy not found',
        message: `Strategy ${strategyId} does not exist`,
      };
      return res['status'](404)['json'](error);
    }

    res['json']({
      success: true,
      data: updatedStrategy,
      message: 'Strategy updated successfully',
    });
  } catch (error: unknown) {
    console.error('Strategy update error:', error);
    const apiError: ApiError = {
      error: 'Failed to update strategy',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Delete a strategy
 * DELETE /api/portfolio/strategies/:id
 */
router['delete']('/api/portfolio/strategies/:id', async (req: Request, res: Response) => {
  try {
    const strategyId = req.params['id'];
    if (!strategyId) {
      const error: ApiError = {
        error: 'Invalid strategy ID',
        message: 'Strategy ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to delete strategies',
      };
      return res['status'](401)['json'](error);
    }

    // Soft delete (set isActive: false) via service
    const deactivated = await portfolioIntelligenceService.strategies.deactivate(strategyId);

    if (!deactivated) {
      const error: ApiError = {
        error: 'Strategy not found',
        message: `Strategy ${strategyId} does not exist`,
      };
      return res['status'](404)['json'](error);
    }

    res['json']({
      success: true,
      message: 'Strategy deactivated successfully',
    });
  } catch (error: unknown) {
    console.error('Strategy deletion error:', error);
    const apiError: ApiError = {
      error: 'Failed to delete strategy',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

// ============================================================================
// SCENARIO OPERATIONS ROUTES
// ============================================================================

/**
 * Create a portfolio scenario
 * POST /api/portfolio/scenarios
 */
router['post']('/api/portfolio/scenarios', idempotency, async (req: Request, res: Response) => {
  try {
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters',
      };
      return res['status'](400)['json'](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const validation = CreateScenarioSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid scenario data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const validatedData = validation.data;

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create scenarios',
      };
      return res['status'](401)['json'](error);
    }

    // Persist scenario to database
    const scenario = await portfolioIntelligenceService.scenarios.create({
      fundId: parsedFundId,
      strategyModelId: validatedData.strategyModelId,
      name: validatedData.name,
      description: validatedData.description,
      scenarioType: validatedData.scenarioType,
      marketEnvironment: validatedData.marketEnvironment,
      dealFlowAssumption: String(validatedData.dealFlowAssumption),
      valuationEnvironment: String(validatedData.valuationEnvironment),
      exitEnvironment: String(validatedData.exitEnvironment),
      plannedInvestments: validatedData.plannedInvestments,
      deploymentSchedule: validatedData.deploymentSchedule,
      projectedFundMetrics: {}, // Will be populated by simulation
      status: 'draft',
      createdBy: userId,
    });

    res['status'](201)['json']({
      success: true,
      data: scenario,
      message: 'Portfolio scenario created successfully',
    });
  } catch (error: unknown) {
    console.error('Scenario creation error:', error);
    const apiError: ApiError = {
      error: 'Failed to create scenario',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
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
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const scenarioType = req.query['scenarioType'] as string | undefined;
    const status = req.query['status'] as string | undefined;
    const limit = req.query['limit'] ? parseInt(req.query['limit'] as string) : undefined;

    // Fetch scenarios from database
    const scenarios = await portfolioIntelligenceService.scenarios.getByFund(fundId, {
      ...(scenarioType && { scenarioType }),
      ...(status && { status }),
      ...(limit && { limit }),
    });

    res['json']({
      success: true,
      data: scenarios,
      count: scenarios.length,
    });
  } catch (error: unknown) {
    console.error('Scenarios fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch scenarios',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Compare multiple scenarios
 * POST /api/portfolio/scenarios/compare
 */
router['post'](
  '/api/portfolio/scenarios/compare',
  idempotency,
  async (req: Request, res: Response) => {
    try {
      const validation = CompareScenarioSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid scenario comparison data',
          details: validation.error.flatten(),
        };
        return res['status'](400)['json'](error);
      }

      const validatedData = validation.data;

      const userId = getUserId(req);
      if (!userId) {
        const error: ApiError = {
          error: 'Authentication required',
          message: 'User must be authenticated to compare scenarios',
        };
        return res['status'](401)['json'](error);
      }

      const storage = getPortfolioStorage(req);
      const item = {
        id: randomUUID(),
        ...validatedData,
        status: 'ready',
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      storage.comparisons.set(item.id, item);
      res['status'](201)['json']({
        success: true,
        data: item,
        message: 'Scenario comparison completed successfully',
      });
    } catch (error: unknown) {
      console.error('Scenario comparison error:', error);
      const apiError: ApiError = {
        error: 'Failed to compare scenarios',
        message: getErrorMessage(error),
      };
      res['status'](500)['json'](apiError);
    }
  }
);

/**
 * Run Monte Carlo simulation on a scenario
 * POST /api/portfolio/scenarios/:id/simulate
 */
router['post'](
  '/api/portfolio/scenarios/:id/simulate',
  idempotency,
  async (req: Request, res: Response) => {
    try {
      const scenarioId = req.params['id'];
      if (!scenarioId) {
        const error: ApiError = {
          error: 'Invalid scenario ID',
          message: 'Scenario ID is required',
        };
        return res['status'](400)['json'](error);
      }

      const validation = RunSimulationSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid simulation parameters',
          details: validation.error.flatten(),
        };
        return res['status'](400)['json'](error);
      }

      const validatedData = validation.data;

      const userId = getUserId(req);
      if (!userId) {
        const error: ApiError = {
          error: 'Authentication required',
          message: 'User must be authenticated to run simulations',
        };
        return res['status'](401)['json'](error);
      }

      // Verify scenario exists
      const scenario = await portfolioIntelligenceService.scenarios.getById(scenarioId);
      if (!scenario) {
        const error: ApiError = {
          error: 'Scenario not found',
          message: `Scenario ${scenarioId} does not exist`,
        };
        return res['status'](404)['json'](error);
      }

      // MVP STUB: Monte Carlo simulation returns placeholder results
      // Integration with actual simulation engine deferred to Phase 2
      // See: client/src/core/simulation/MonteCarloEngine.ts for engine reference
      const simulationResults = {
        mean: { irr: 0.2, multiple: 2.5, dpi: 1.8 },
        median: { irr: 0.18, multiple: 2.3, dpi: 1.6 },
        percentiles: { p10: 0.12, p25: 0.15, p75: 0.25, p90: 0.3 },
      };
      const riskMetrics = {
        volatility: 0.08,
        var95: 0.1,
        cvar95: 0.12,
        sharpeRatio: 1.8,
      };

      // Persist simulation to database
      const simulation = await portfolioIntelligenceService.simulations.create({
        fundId: scenario.fundId,
        scenarioId,
        simulationName: `${scenario.name ?? 'Scenario'} Simulation`,
        simulationType: validatedData.simulationType,
        numberOfRuns: validatedData.numberOfRuns,
        inputDistributions: validatedData.inputDistributions,
        correlationMatrix: validatedData.correlationMatrix,
        constraints: validatedData.constraints,
        summaryStatistics: simulationResults,
        percentileResults: simulationResults.percentiles,
        varCalculations: { var95: riskMetrics.var95 },
        cvarCalculations: { cvar95: riskMetrics.cvar95 },
        downsideRisk: { volatility: riskMetrics.volatility },
        tailRiskAnalysis: { sharpeRatio: riskMetrics.sharpeRatio },
        createdBy: userId,
      });

      res['status'](201)['json']({
        success: true,
        data: {
          ...simulation,
          summaryStatistics: simulationResults,
          riskMetrics,
        },
        message: 'Monte Carlo simulation completed successfully',
      });
    } catch (error: unknown) {
      console.error('Simulation error:', error);
      const apiError: ApiError = {
        error: 'Failed to run simulation',
        message: getErrorMessage(error),
      };
      res['status'](500)['json'](apiError);
    }
  }
);

// ============================================================================
// RESERVE OPTIMIZATION ROUTES
// ============================================================================

/**
 * Optimize reserve allocation
 * POST /api/portfolio/reserves/optimize
 */
router['post'](
  '/api/portfolio/reserves/optimize',
  idempotency,
  async (req: Request, res: Response) => {
    try {
      const fundId = req.query['fundId'];
      if (!fundId) {
        const error: ApiError = {
          error: 'Missing fund ID',
          message: 'Fund ID is required in query parameters',
        };
        return res['status'](400)['json'](error);
      }

      let parsedFundId: number;
      try {
        parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
      } catch (err) {
        if (err instanceof NumberParseError) {
          const error: ApiError = {
            error: 'Invalid fund ID',
            message: err.message,
          };
          return res['status'](400)['json'](error);
        }
        throw err;
      }

      const validation = OptimizeReservesSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid reserve optimization parameters',
          details: validation.error.flatten(),
        };
        return res['status'](400)['json'](error);
      }

      const validatedData = validation.data;

      const userId = getUserId(req);
      if (!userId) {
        const error: ApiError = {
          error: 'Authentication required',
          message: 'User must be authenticated to optimize reserves',
        };
        return res['status'](401)['json'](error);
      }

      // MVP STUB: Reserve optimization returns placeholder allocation
      // Integration with DeterministicReserveEngine deferred to Phase 2
      // See: client/src/core/reserves/ReserveEngine.ts for engine reference
      const optimalAllocation = {
        initialReserve: 0.5,
        followOnReserve: 0.5,
        allocationByCompany: {},
      };
      const performanceProjection = {
        expectedIrr: 0.22,
        expectedMultiple: 2.8,
        riskAdjustedReturn: 0.18,
      };

      // Persist reserve strategy to database
      const reserveStrategy = await portfolioIntelligenceService.reserves.create({
        fundId: parsedFundId,
        name: `Optimization ${new Date().toISOString().split('T')[0]}`,
        strategyType: validatedData.strategyType,
        allocationRules: {
          ...validatedData.allocationRules,
          optimalAllocation,
          performanceProjection,
        },
        triggerConditions: validatedData.allocationRules,
        totalReserveAmount: String(validatedData.totalReserveAmount),
        reserveTranches: {
          base: {
            amount: validatedData.totalReserveAmount,
            maxPerCompanyPct: validatedData.maxPerCompanyPct,
          },
        },
        maxPerCompanyPct: String(validatedData.maxPerCompanyPct),
        optimizationObjective: validatedData.optimizationObjective,
        monteCarloIterations: validatedData.monteCarloIterations,
        isActive: true,
        createdBy: userId,
      });

      res['status'](201)['json']({
        success: true,
        data: {
          ...reserveStrategy,
          optimalAllocation,
          performanceProjection,
        },
        message: 'Reserve optimization completed successfully',
      });
    } catch (error: unknown) {
      console.error('Reserve optimization error:', error);
      const apiError: ApiError = {
        error: 'Failed to optimize reserves',
        message: getErrorMessage(error),
      };
      res['status'](500)['json'](apiError);
    }
  }
);

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
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const strategyType = req.query['strategyType'] as string | undefined;
    const isActive =
      req.query['isActive'] === 'true'
        ? true
        : req.query['isActive'] === 'false'
          ? false
          : undefined;

    // Fetch reserve strategies from database
    const strategies = await portfolioIntelligenceService.reserves.getByFund(fundId, {
      ...(strategyType && { strategyType }),
      ...(isActive !== undefined && { isActive }),
    });

    res['json']({
      success: true,
      data: strategies,
      count: strategies.length,
    });
  } catch (error: unknown) {
    console.error('Reserve strategies fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch reserve strategies',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Backtest reserve strategy
 * POST /api/portfolio/reserves/backtest
 */
router['post'](
  '/api/portfolio/reserves/backtest',
  idempotency,
  async (req: Request, res: Response) => {
    try {
      const validation = BacktestReserveSchema.safeParse(req.body);
      if (!validation.success) {
        const error: ApiError = {
          error: 'Validation failed',
          message: 'Invalid backtest parameters',
          details: validation.error.flatten(),
        };
        return res['status'](400)['json'](error);
      }

      const validatedData = validation.data;

      const userId = getUserId(req);
      if (!userId) {
        const error: ApiError = {
          error: 'Authentication required',
          message: 'User must be authenticated to run backtests',
        };
        return res['status'](401)['json'](error);
      }

      const storage = getPortfolioStorage(req);
      const item = {
        id: randomUUID(),
        strategyId: validatedData.strategyId,
        backtestPeriod: {
          start: validatedData.backtestPeriodStart,
          end: validatedData.backtestPeriodEnd,
        },
        benchmarkStrategy: validatedData.benchmarkStrategy,
        results: {
          totalReturn: 0.22,
          annualizedReturn: 0.18,
          sharpeRatio: 1.5,
        },
        performanceAttribution: {
          selectionEffect: 0.05,
          timingEffect: 0.03,
          interactionEffect: 0.02,
        },
        createdBy: userId,
        createdAt: new Date().toISOString(),
      };
      storage.backtests.set(item.id, item);
      res['status'](201)['json']({
        success: true,
        data: item,
        message: 'Reserve strategy backtest completed successfully',
      });
    } catch (error: unknown) {
      console.error('Backtest error:', error);
      const apiError: ApiError = {
        error: 'Failed to run backtest',
        message: getErrorMessage(error),
      };
      res['status'](500)['json'](apiError);
    }
  }
);

// ============================================================================
// PERFORMANCE FORECASTING ROUTES
// ============================================================================

/**
 * Generate performance forecast
 * POST /api/portfolio/forecasts
 */
router['post']('/api/portfolio/forecasts', idempotency, async (req: Request, res: Response) => {
  try {
    const fundId = req.query['fundId'];
    if (!fundId) {
      const error: ApiError = {
        error: 'Missing fund ID',
        message: 'Fund ID is required in query parameters',
      };
      return res['status'](400)['json'](error);
    }

    let parsedFundId: number;
    try {
      parsedFundId = toNumber(fundId as string, 'fund ID', { integer: true, min: 1 });
    } catch (err) {
      if (err instanceof NumberParseError) {
        const error: ApiError = {
          error: 'Invalid fund ID',
          message: err.message,
        };
        return res['status'](400)['json'](error);
      }
      throw err;
    }

    const validation = CreateForecastSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid forecast parameters',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const validatedData = validation.data;

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to create forecasts',
      };
      return res['status'](401)['json'](error);
    }

    const storage = getPortfolioStorage(req);
    const item = {
      id: randomUUID(),
      fundId: parsedFundId,
      ...validatedData,
      forecastPeriods: [
        { year: 1, expectedValue: 1.2, confidence: { low: 1.0, high: 1.4 } },
        { year: 2, expectedValue: 1.5, confidence: { low: 1.2, high: 1.8 } },
        { year: 3, expectedValue: 1.8, confidence: { low: 1.4, high: 2.2 } },
      ],
      confidenceIntervals: {
        p10: 0.8,
        p25: 1.0,
        p50: 1.5,
        p75: 2.0,
        p90: 2.5,
      },
      status: 'complete',
      createdBy: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    storage.forecasts.set(item.id, item);
    res['status'](201)['json']({
      success: true,
      data: item,
      message: 'Performance forecast generated successfully',
    });
  } catch (error: unknown) {
    console.error('Forecast generation error:', error);
    const apiError: ApiError = {
      error: 'Failed to generate forecast',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
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
        message: 'Scenario ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const forecastType = req.query['forecastType'] as string | undefined;
    const status = req.query['status'] as string | undefined;

    // Fetch forecasts from database
    const forecasts = await portfolioIntelligenceService.forecasts.getByScenario(scenarioId, {
      ...(forecastType && { forecastType }),
      ...(status && { status }),
    });

    res['json']({
      success: true,
      data: forecasts,
      count: forecasts.length,
    });
  } catch (error: unknown) {
    console.error('Forecasts fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch forecasts',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Validate forecast against actuals
 * POST /api/portfolio/forecasts/validate
 */
router['post']('/api/portfolio/forecasts/validate', async (req: Request, res: Response) => {
  try {
    const validation = ValidateForecastSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid forecast validation data',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const validatedData = validation.data;

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to validate forecasts',
      };
      return res['status'](401)['json'](error);
    }

    // Verify forecast exists
    const forecast = await portfolioIntelligenceService.forecasts.getById(validatedData.forecastId);
    if (!forecast) {
      const error: ApiError = {
        error: 'Forecast not found',
        message: `Forecast ${validatedData.forecastId} does not exist`,
      };
      return res['status'](404)['json'](error);
    }

    // MVP STUB: Forecast validation returns placeholder accuracy metrics
    // Actual MAPE/RMSE calculation requires historical data comparison - Phase 2
    const accuracyMetrics = {
      mape: 0.12,
      rmse: 0.08,
      mae: 0.06,
    };
    const calibration = {
      inRange: 0.85,
      overconfident: 0.1,
      underconfident: 0.05,
    };
    const keyInsights = [
      'Forecast accuracy is within acceptable range',
      'Model shows slight overconfidence in tail events',
      'Calibration could be improved for extreme scenarios',
    ];

    // Update forecast with validation results
    const updatedForecast = await portfolioIntelligenceService.forecasts.update(
      validatedData.forecastId,
      {
        status: 'validated',
        validationResults: {
          accuracyMetrics,
          calibration,
          keyInsights,
          validatedBy: userId,
          validatedAt: new Date().toISOString(),
          actualData: validatedData.actualMetrics,
          comparisonPeriod: validatedData.validationPeriod,
        },
      }
    );

    res['json']({
      success: true,
      data: {
        forecastId: validatedData.forecastId,
        accuracyMetrics,
        calibration,
        keyInsights,
        forecast: updatedForecast,
      },
      message: 'Forecast validation completed successfully',
    });
  } catch (error: unknown) {
    console.error('Forecast validation error:', error);
    const apiError: ApiError = {
      error: 'Failed to validate forecast',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
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

    // MVP: Static strategy templates - database-backed templates deferred to Phase 2
    const templates = [
      {
        id: 'template_1',
        name: 'Balanced Growth Strategy',
        category: 'balanced',
        riskProfile: 'moderate',
        description: 'Diversified portfolio with balanced risk-return profile',
        targetPortfolioSize: 25,
        sectorAllocation: {
          fintech: 0.3,
          healthtech: 0.25,
          enterprise: 0.2,
          consumer: 0.15,
          deeptech: 0.1,
        },
        stageAllocation: {
          seed: 0.4,
          seriesA: 0.6,
        },
      },
      {
        id: 'template_2',
        name: 'High Growth Aggressive',
        category: 'growth',
        riskProfile: 'aggressive',
        description: 'Concentrated portfolio targeting high-growth companies',
        targetPortfolioSize: 20,
        sectorAllocation: {
          fintech: 0.4,
          healthtech: 0.3,
          deeptech: 0.3,
        },
        stageAllocation: {
          seed: 0.7,
          seriesA: 0.3,
        },
      },
    ];

    const filteredTemplates = templates.filter((t) => {
      if (category && t.category !== category) return false;
      if (riskProfile && t.riskProfile !== riskProfile) return false;
      return true;
    });

    res['json']({
      success: true,
      data: filteredTemplates,
      count: filteredTemplates.length,
    });
  } catch (error: unknown) {
    console.error('Templates fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch templates',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

/**
 * Generate quick scenario from parameters
 * POST /api/portfolio/quick-scenario
 */
router['post']('/api/portfolio/quick-scenario', async (req: Request, res: Response) => {
  try {
    const validation = QuickScenarioSchema.safeParse(req.body);
    if (!validation.success) {
      const error: ApiError = {
        error: 'Validation failed',
        message: 'Invalid quick scenario parameters',
        details: validation.error.flatten(),
      };
      return res['status'](400)['json'](error);
    }

    const validatedData = validation.data;

    const userId = getUserId(req);
    if (!userId) {
      const error: ApiError = {
        error: 'Authentication required',
        message: 'User must be authenticated to generate scenarios',
      };
      return res['status'](401)['json'](error);
    }

    const storage = getPortfolioStorage(req);
    const item = {
      id: randomUUID(),
      ...validatedData,
      name: `Quick scenario (${validatedData.riskProfile} / ${validatedData.marketCondition} market)`,
      scenarioType: 'custom',
      status: 'ready',
      quickProjections: {
        expectedIrr:
          validatedData.riskProfile === 'aggressive'
            ? 0.25
            : validatedData.riskProfile === 'conservative'
              ? 0.15
              : 0.2,
        expectedMultiple:
          validatedData.riskProfile === 'aggressive'
            ? 3.0
            : validatedData.riskProfile === 'conservative'
              ? 2.0
              : 2.5,
        timeToExit: 5,
      },
      createdBy: userId,
      createdAt: new Date().toISOString(),
    };
    storage.quickScenarios.set(item.id, item);
    res['status'](201)['json']({
      success: true,
      data: item,
      message: 'Quick scenario generated successfully',
    });
  } catch (error: unknown) {
    console.error('Quick scenario error:', error);
    const apiError: ApiError = {
      error: 'Failed to generate quick scenario',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
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
        message: 'Scenario ID is required',
      };
      return res['status'](400)['json'](error);
    }

    const _metricType = req.query['metricType'] as string;
    const _timeRange = (req.query['timeRange'] as string) || '1y';

    // MVP STUB: Scenario metrics returns sample data
    // Real-time calculation from portfolio data deferred to Phase 2
    // Use SSE endpoint /api/events/fund/:fundId for live updates
    const metrics = {
      scenarioId,
      lastUpdated: new Date().toISOString(),
      fundMetrics: {
        currentIrr: 0.18,
        currentMultiple: 2.1,
        deployedCapital: 65000000,
        reservesRemaining: 35000000,
        portfolioCompanies: 18,
      },
      portfolioMetrics: {
        averageValuation: 12500000,
        topPerformers: [
          { name: 'Company A', multiple: 4.2 },
          { name: 'Company B', multiple: 3.8 },
        ],
        sectorBreakdown: {
          fintech: 0.35,
          healthtech: 0.3,
          enterprise: 0.2,
          other: 0.15,
        },
      },
      riskMetrics: {
        portfolioVaR: 0.28,
        concentrationRisk: 0.15,
        sectorConcentration: 0.35,
        liquidityRisk: 0.22,
      },
      performanceTrends: {
        irrTrend: [0.12, 0.15, 0.17, 0.18],
        multipleTrend: [1.2, 1.6, 1.9, 2.1],
        periods: ['Q1', 'Q2', 'Q3', 'Q4'],
      },
    };

    res['json']({
      success: true,
      data: metrics,
      cacheInfo: {
        lastCalculated: new Date().toISOString(),
        nextUpdate: new Date(Date.now() + 3600000).toISOString(), // 1 hour
        dataFreshness: 'real-time',
      },
    });
  } catch (error: unknown) {
    console.error('Metrics fetch error:', error);
    const apiError: ApiError = {
      error: 'Failed to fetch metrics',
      message: getErrorMessage(error),
    };
    res['status'](500)['json'](apiError);
  }
});

export default router;
