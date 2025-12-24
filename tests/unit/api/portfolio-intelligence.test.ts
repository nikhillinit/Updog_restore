/**
 * Portfolio Intelligence API Routes Tests
 *
 * Comprehensive unit tests for Portfolio Intelligence RESTful API endpoints
 * Tests portfolio construction modeling, scenario planning, reserve optimization, and performance forecasting
 *
 * FIXME: Route handlers in server/routes/portfolio-intelligence.ts are incomplete.
 * All POST routes are missing res.send() calls, causing tests to timeout.
 * Need to implement actual route handler logic for:
 * - POST /api/portfolio/strategies
 * - POST /api/portfolio/scenarios
 * - POST /api/portfolio/scenarios/compare
 * - POST /api/portfolio/scenarios/:id/simulate
 * - POST /api/portfolio/reserves/optimize
 * - POST /api/portfolio/reserves/backtest
 * - POST /api/portfolio/forecasts
 * And error handling routes
 * @group integration
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import request from 'supertest';
import express, { type Request, type Response, type NextFunction } from 'express';
import router from '../../../server/routes/portfolio-intelligence';

// Mock idempotency middleware BEFORE importing router
vi.mock('../../../server/middleware/idempotency', () => ({
  idempotency: () => (req: Request, res: Response, next: NextFunction) => next(),
  clearIdempotencyCache: vi.fn(),
  default: (req: Request, res: Response, next: NextFunction) => next(),
}));

// In-memory storage for test data
const testStorage = {
  strategies: new Map<string, unknown>(),
  scenarios: new Map<string, unknown>(),
  forecasts: new Map<string, unknown>(),
  reserveStrategies: new Map<string, unknown>(),
  comparisons: new Map<string, unknown>(),
  simulations: new Map<string, unknown>(),
  optimizations: new Map<string, unknown>(),
  backtests: new Map<string, unknown>(),
  validations: new Map<string, unknown>(),
  quickScenarios: new Map<string, unknown>(),
};

// Create test Express app
const createTestApp = () => {
  const app = express();
  app.use(express.json());

  // Mock authentication middleware
  app.use((req: Request & { user?: { id: string } }, _res: Response, next: NextFunction) => {
    req.user = { id: '1' };
    next();
  });

  app.use(router);

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    void _next;
    res.status(500).json({ error: 'Internal server error', message: err.message });
  });

  return app;
};

describe('Portfolio Intelligence API Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    // Clear all storage
    testStorage.strategies.clear();
    testStorage.scenarios.clear();
    testStorage.forecasts.clear();
    testStorage.reserveStrategies.clear();
    testStorage.comparisons.clear();
    testStorage.simulations.clear();
    testStorage.optimizations.clear();
    testStorage.backtests.clear();
    testStorage.validations.clear();
    testStorage.quickScenarios.clear();

    app = createTestApp();
    app.locals.portfolioStorage = testStorage;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Strategy Management Routes', () => {
    describe('POST /api/portfolio/strategies', () => {
      const validStrategyData = {
        name: 'Test Strategy',
        description: 'A test portfolio strategy',
        modelType: 'strategic',
        targetPortfolioSize: 25,
        maxPortfolioSize: 30,
        targetDeploymentPeriodMonths: 36,
        checkSizeRange: {
          min: 500000,
          max: 2000000,
          target: 1000000,
        },
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
        geographicAllocation: {
          north_america: 0.7,
          europe: 0.2,
          asia_pacific: 0.1,
        },
        initialReservePercentage: 0.5,
        followOnStrategy: {
          strategy: 'performance_based',
        },
        concentrationLimits: {
          max_per_company: 0.15,
        },
        riskTolerance: 'moderate',
        targetIrr: 0.2,
        targetMultiple: 2.5,
        targetDpi: 1.8,
        tags: ['growth', 'balanced'],
      };

      it('should create a new strategy with valid data', async () => {
        const response = await request(app)
          .post('/api/portfolio/strategies?fundId=1')
          .send(validStrategyData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
        expect(response.body.data.name).toBe(validStrategyData.name);
        expect(response.body.data.fundId).toBe(1);
        expect(response.body.data.modelType).toBe(validStrategyData.modelType);
        expect(response.body.data.createdBy).toBe(1);
        expect(response.body.data.isActive).toBe(true);
        expect(response.body.message).toBe('Strategy model created successfully');
      });

      it('should require fundId in query parameters', async () => {
        const response = await request(app)
          .post('/api/portfolio/strategies')
          .send(validStrategyData)
          .expect(400);

        expect(response.body.error).toBe('Missing fund ID');
        expect(response.body.message).toBe('Fund ID is required in query parameters');
      });

      it('should validate fundId as positive integer', async () => {
        const response = await request(app)
          .post('/api/portfolio/strategies?fundId=-1')
          .send(validStrategyData)
          .expect(400);

        expect(response.body.error).toBe('Invalid fund ID');
      });

      it('should validate strategy name is required', async () => {
        const invalidData = { ...validStrategyData, name: '' };

        const response = await request(app)
          .post('/api/portfolio/strategies?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
        expect(response.body.message).toBe('Invalid strategy data');
      });

      it('should validate sector allocation percentages', async () => {
        const invalidData = {
          ...validStrategyData,
          sectorAllocation: {
            fintech: 1.5, // Invalid percentage > 1
            healthtech: 0.3,
          },
        };

        const response = await request(app)
          .post('/api/portfolio/strategies?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate model type enum values', async () => {
        const invalidData = { ...validStrategyData, modelType: 'invalid_type' };

        const response = await request(app)
          .post('/api/portfolio/strategies?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should handle missing required fields', async () => {
        const incompleteData = {
          name: 'Test Strategy',
          // Missing required fields
        };

        const response = await request(app)
          .post('/api/portfolio/strategies?fundId=1')
          .send(incompleteData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should require authentication', async () => {
        // Create app without authentication
        const unauthenticatedApp = express();
        unauthenticatedApp.use(express.json());
        unauthenticatedApp.use(router);

        const response = await request(unauthenticatedApp)
          .post('/api/portfolio/strategies?fundId=1')
          .send(validStrategyData)
          .expect(401);

        expect(response.body.error).toBe('Authentication required');
      });
    });

    describe('GET /api/portfolio/strategies/:fundId', () => {
      it('should retrieve strategies for a fund', async () => {
        const response = await request(app).get('/api/portfolio/strategies/1').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeDefined();
      });

      it('should validate fundId parameter', async () => {
        const response = await request(app).get('/api/portfolio/strategies/invalid').expect(400);

        expect(response.body.error).toBe('Invalid fund ID');
      });

      it('should support query filters', async () => {
        const response = await request(app)
          .get('/api/portfolio/strategies/1?isActive=true&modelType=strategic&limit=10')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
      });

      it('should handle negative fundId', async () => {
        const response = await request(app).get('/api/portfolio/strategies/-1').expect(400);

        expect(response.body.error).toBe('Invalid fund ID');
      });
    });

    describe('PUT /api/portfolio/strategies/:id', () => {
      const updateData = {
        name: 'Updated Strategy',
        targetPortfolioSize: 30,
        riskTolerance: 'aggressive',
      };

      it('should update a strategy', async () => {
        const response = await request(app)
          .put('/api/portfolio/strategies/strategy_123')
          .send(updateData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe(updateData.name);
        expect(response.body.message).toBe('Strategy updated successfully');
      });

      it('should require strategy ID', async () => {
        await request(app).put('/api/portfolio/strategies/').send(updateData).expect(404);
      });

      it('should validate update data', async () => {
        const invalidUpdate = {
          modelType: 'invalid_type',
        };

        const response = await request(app)
          .put('/api/portfolio/strategies/strategy_123')
          .send(invalidUpdate)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('DELETE /api/portfolio/strategies/:id', () => {
      it('should delete (deactivate) a strategy', async () => {
        const response = await request(app)
          .delete('/api/portfolio/strategies/strategy_123')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.message).toBe('Strategy deactivated successfully');
      });

      it('should require strategy ID', async () => {
        await request(app).delete('/api/portfolio/strategies/').expect(404);
      });
    });
  });

  describe('Scenario Operations Routes', () => {
    describe('POST /api/portfolio/scenarios', () => {
      const validScenarioData = {
        strategyModelId: '550e8400-e29b-41d4-a716-446655440000',
        name: 'Test Scenario',
        description: 'A test portfolio scenario',
        scenarioType: 'base_case',
        marketEnvironment: 'normal',
        dealFlowAssumption: 1.0,
        valuationEnvironment: 1.0,
        exitEnvironment: 1.0,
        plannedInvestments: [{ company: 'TestCorp', amount: 1000000, stage: 'Series A' }],
        deploymentSchedule: {
          q1: 5000000,
          q2: 6000000,
          q3: 7000000,
          q4: 8000000,
        },
      };

      it('should create a new scenario', async () => {
        const response = await request(app)
          .post('/api/portfolio/scenarios?fundId=1')
          .send(validScenarioData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.name).toBe(validScenarioData.name);
        expect(response.body.data.scenarioType).toBe(validScenarioData.scenarioType);
        expect(response.body.data.status).toBe('draft');
        expect(response.body.message).toBe('Portfolio scenario created successfully');
      });

      it('should validate UUID format for strategyModelId', async () => {
        const invalidData = { ...validScenarioData, strategyModelId: 'invalid-uuid' };

        const response = await request(app)
          .post('/api/portfolio/scenarios?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate scenario type enum', async () => {
        const invalidData = { ...validScenarioData, scenarioType: 'invalid_type' };

        const response = await request(app)
          .post('/api/portfolio/scenarios?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate market environment enum', async () => {
        const invalidData = { ...validScenarioData, marketEnvironment: 'invalid_market' };

        const response = await request(app)
          .post('/api/portfolio/scenarios?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/portfolio/scenarios/:fundId', () => {
      it('should retrieve scenarios for a fund', async () => {
        const response = await request(app).get('/api/portfolio/scenarios/1').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeDefined();
      });

      it('should support scenario type filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/scenarios/1?scenarioType=base_case')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should support status filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/scenarios/1?status=complete&limit=5')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('POST /api/portfolio/scenarios/compare', () => {
      const validComparisonData = {
        baseScenarioId: '550e8400-e29b-41d4-a716-446655440000',
        comparisonScenarioIds: [
          '550e8400-e29b-41d4-a716-446655440001',
          '550e8400-e29b-41d4-a716-446655440002',
        ],
        comparisonType: 'strategy_comparison',
        comparisonMetrics: ['irr', 'multiple', 'dpi'],
        weightScheme: {
          irr: 0.5,
          multiple: 0.3,
          dpi: 0.2,
        },
      };

      it('should compare multiple scenarios', async () => {
        const response = await request(app)
          .post('/api/portfolio/scenarios/compare')
          .send(validComparisonData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.baseScenarioId).toBe(validComparisonData.baseScenarioId);
        expect(response.body.data.comparisonType).toBe(validComparisonData.comparisonType);
        expect(response.body.data.status).toBe('ready');
        expect(response.body.message).toBe('Scenario comparison completed successfully');
      });

      it('should validate UUID formats', async () => {
        const invalidData = { ...validComparisonData, baseScenarioId: 'invalid-uuid' };

        const response = await request(app)
          .post('/api/portfolio/scenarios/compare')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should require at least one comparison scenario', async () => {
        const invalidData = { ...validComparisonData, comparisonScenarioIds: [] };

        const response = await request(app)
          .post('/api/portfolio/scenarios/compare')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should limit number of comparison scenarios', async () => {
        const tooManyScenarios = Array.from(
          { length: 10 },
          (_, i) => `550e8400-e29b-41d4-a716-44665544000${i}`
        );
        const invalidData = { ...validComparisonData, comparisonScenarioIds: tooManyScenarios };

        const response = await request(app)
          .post('/api/portfolio/scenarios/compare')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('POST /api/portfolio/scenarios/:id/simulate', () => {
      const validSimulationData = {
        simulationType: 'portfolio_construction',
        numberOfRuns: 10000,
        inputDistributions: {
          irr: { mean: 0.18, volatility: 0.08 },
          multiple: { mean: 2.5, volatility: 0.6 },
        },
        correlationMatrix: {
          irr_multiple: 0.7,
        },
        constraints: {
          max_concentration: 0.25,
        },
      };

      it('should run Monte Carlo simulation on scenario', async () => {
        const response = await request(app)
          .post('/api/portfolio/scenarios/scenario_123/simulate')
          .send(validSimulationData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.scenarioId).toBe('scenario_123');
        expect(response.body.data.simulationType).toBe(validSimulationData.simulationType);
        expect(response.body.data.numberOfRuns).toBe(validSimulationData.numberOfRuns);
        expect(response.body.data.summaryStatistics).toBeDefined();
        expect(response.body.data.riskMetrics).toBeDefined();
        expect(response.body.message).toBe('Monte Carlo simulation completed successfully');
      });

      it('should validate simulation type', async () => {
        const invalidData = { ...validSimulationData, simulationType: 'invalid_type' };

        const response = await request(app)
          .post('/api/portfolio/scenarios/scenario_123/simulate')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate number of runs', async () => {
        const invalidData = { ...validSimulationData, numberOfRuns: 50 };

        const response = await request(app)
          .post('/api/portfolio/scenarios/scenario_123/simulate')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should require scenario ID', async () => {
        await request(app)
          .post('/api/portfolio/scenarios//simulate')
          .send(validSimulationData)
          .expect(404);
      });
    });
  });

  describe('Reserve Optimization Routes', () => {
    describe('POST /api/portfolio/reserves/optimize', () => {
      const validOptimizationData = {
        strategyType: 'performance_based',
        totalReserveAmount: 25000000,
        maxPerCompanyPct: 0.2,
        allocationRules: {
          follow_on_threshold: 0.15,
          performance_trigger: 2.0,
        },
        optimizationObjective: 'risk_adjusted_return',
        monteCarloIterations: 5000,
      };

      it('should optimize reserve allocation', async () => {
        const response = await request(app)
          .post('/api/portfolio/reserves/optimize?fundId=1')
          .send(validOptimizationData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.fundId).toBe(1);
        expect(response.body.data.strategyType).toBe(validOptimizationData.strategyType);
        expect(response.body.data.optimalAllocation).toBeDefined();
        expect(response.body.data.performanceProjection).toBeDefined();
        expect(response.body.message).toBe('Reserve optimization completed successfully');
      });

      it('should validate strategy type enum', async () => {
        const invalidData = { ...validOptimizationData, strategyType: 'invalid_strategy' };

        const response = await request(app)
          .post('/api/portfolio/reserves/optimize?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate percentage constraints', async () => {
        const invalidData = { ...validOptimizationData, maxPerCompanyPct: 1.5 };

        const response = await request(app)
          .post('/api/portfolio/reserves/optimize?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate optimization objective', async () => {
        const invalidData = {
          ...validOptimizationData,
          optimizationObjective: 'invalid_objective',
        };

        const response = await request(app)
          .post('/api/portfolio/reserves/optimize?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/portfolio/reserves/strategies/:fundId', () => {
      it('should retrieve reserve strategies for a fund', async () => {
        const response = await request(app).get('/api/portfolio/reserves/strategies/1').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeDefined();
      });

      it('should support strategy type filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/reserves/strategies/1?strategyType=performance_based')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should support active status filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/reserves/strategies/1?isActive=true')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('POST /api/portfolio/reserves/backtest', () => {
      const validBacktestData = {
        strategyId: '550e8400-e29b-41d4-a716-446655440000',
        backtestPeriodStart: '2022-01-01T00:00:00.000Z',
        backtestPeriodEnd: '2023-12-31T23:59:59.999Z',
        benchmarkStrategy: 'market_cap',
      };

      it('should run reserve strategy backtest', async () => {
        const response = await request(app)
          .post('/api/portfolio/reserves/backtest')
          .send(validBacktestData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.strategyId).toBe(validBacktestData.strategyId);
        expect(response.body.data.backtestPeriod.start).toBe(validBacktestData.backtestPeriodStart);
        expect(response.body.data.results).toBeDefined();
        expect(response.body.data.performanceAttribution).toBeDefined();
        expect(response.body.message).toBe('Reserve strategy backtest completed successfully');
      });

      it('should validate date formats', async () => {
        const invalidData = { ...validBacktestData, backtestPeriodStart: 'invalid-date' };

        const response = await request(app)
          .post('/api/portfolio/reserves/backtest')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate benchmark strategy', async () => {
        const invalidData = { ...validBacktestData, benchmarkStrategy: 'invalid_benchmark' };

        const response = await request(app)
          .post('/api/portfolio/reserves/backtest')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });
  });

  describe('Performance Forecasting Routes', () => {
    describe('POST /api/portfolio/forecasts', () => {
      const validForecastData = {
        scenarioId: '550e8400-e29b-41d4-a716-446655440000',
        baselineId: '550e8400-e29b-41d4-a716-446655440001',
        forecastName: 'Q4 2024 Forecast',
        forecastType: 'fund_level',
        forecastHorizonYears: 10,
        methodology: 'monte_carlo',
        assumptions: {
          marketConditions: 'normal',
          exitMultiple: 2.5,
          timeToExit: 5,
        },
      };

      it('should generate performance forecast', async () => {
        const response = await request(app)
          .post('/api/portfolio/forecasts?fundId=1')
          .send(validForecastData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.fundId).toBe(1);
        expect(response.body.data.forecastName).toBe(validForecastData.forecastName);
        expect(response.body.data.forecastPeriods).toBeDefined();
        expect(response.body.data.confidenceIntervals).toBeDefined();
        expect(response.body.data.status).toBe('complete');
        expect(response.body.message).toBe('Performance forecast generated successfully');
      });

      it('should validate forecast type', async () => {
        const invalidData = { ...validForecastData, forecastType: 'invalid_type' };

        const response = await request(app)
          .post('/api/portfolio/forecasts?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate methodology', async () => {
        const invalidData = { ...validForecastData, methodology: 'invalid_method' };

        const response = await request(app)
          .post('/api/portfolio/forecasts?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate forecast horizon', async () => {
        const invalidData = { ...validForecastData, forecastHorizonYears: -1 };

        const response = await request(app)
          .post('/api/portfolio/forecasts?fundId=1')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });

    describe('GET /api/portfolio/forecasts/:scenarioId', () => {
      it('should retrieve forecasts for a scenario', async () => {
        const response = await request(app)
          .get('/api/portfolio/forecasts/550e8400-e29b-41d4-a716-446655440000')
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeDefined();
      });

      it('should support forecast type filtering', async () => {
        const response = await request(app)
          .get(
            '/api/portfolio/forecasts/550e8400-e29b-41d4-a716-446655440000?forecastType=fund_level'
          )
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should support status filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/forecasts/550e8400-e29b-41d4-a716-446655440000?status=complete')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should require scenario ID', async () => {
        await request(app).get('/api/portfolio/forecasts/').expect(404);
      });
    });

    describe('POST /api/portfolio/forecasts/validate', () => {
      const validValidationData = {
        forecastId: '550e8400-e29b-41d4-a716-446655440000',
        actualMetrics: {
          irr: 0.22,
          multiple: 2.8,
          dpi: 1.5,
        },
        validationPeriod: '2024-12-31T23:59:59.999Z',
      };

      it('should validate forecast against actuals', async () => {
        const response = await request(app)
          .post('/api/portfolio/forecasts/validate')
          .send(validValidationData)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.forecastId).toBe(validValidationData.forecastId);
        expect(response.body.data.accuracyMetrics).toBeDefined();
        expect(response.body.data.calibration).toBeDefined();
        expect(response.body.data.keyInsights).toBeInstanceOf(Array);
        expect(response.body.message).toBe('Forecast validation completed successfully');
      });

      it('should validate UUID format for forecastId', async () => {
        const invalidData = { ...validValidationData, forecastId: 'invalid-uuid' };

        const response = await request(app)
          .post('/api/portfolio/forecasts/validate')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate date format', async () => {
        const invalidData = { ...validValidationData, validationPeriod: 'invalid-date' };

        const response = await request(app)
          .post('/api/portfolio/forecasts/validate')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });
    });
  });

  describe('Quick Actions Routes', () => {
    describe('GET /api/portfolio/templates', () => {
      it('should retrieve strategy templates', async () => {
        const response = await request(app).get('/api/portfolio/templates').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeInstanceOf(Array);
        expect(response.body.count).toBeDefined();

        // Check template structure
        if (response.body.data.length > 0) {
          const template = response.body.data[0];
          expect(template.id).toBeDefined();
          expect(template.name).toBeDefined();
          expect(template.category).toBeDefined();
          expect(template.riskProfile).toBeDefined();
          expect(template.sectorAllocation).toBeDefined();
          expect(template.stageAllocation).toBeDefined();
        }
      });

      it('should support category filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/templates?category=balanced')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should support risk profile filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/templates?riskProfile=aggressive')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should support combined filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/templates?category=growth&riskProfile=moderate')
          .expect(200);

        expect(response.body.success).toBe(true);
      });
    });

    describe('POST /api/portfolio/quick-scenario', () => {
      const validQuickScenarioData = {
        strategyModelId: '550e8400-e29b-41d4-a716-446655440000',
        marketCondition: 'bull',
        riskProfile: 'moderate',
        timeHorizon: 10,
      };

      it('should generate quick scenario', async () => {
        const response = await request(app)
          .post('/api/portfolio/quick-scenario')
          .send(validQuickScenarioData)
          .expect(201);

        expect(response.body.success).toBe(true);
        expect(response.body.data.strategyModelId).toBe(validQuickScenarioData.strategyModelId);
        expect(response.body.data.name).toContain(validQuickScenarioData.riskProfile);
        expect(response.body.data.name).toContain(validQuickScenarioData.marketCondition);
        expect(response.body.data.quickProjections).toBeDefined();
        expect(response.body.data.status).toBe('ready');
        expect(response.body.message).toBe('Quick scenario generated successfully');
      });

      it('should validate market condition', async () => {
        const invalidData = { ...validQuickScenarioData, marketCondition: 'invalid_condition' };

        const response = await request(app)
          .post('/api/portfolio/quick-scenario')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should validate risk profile', async () => {
        const invalidData = { ...validQuickScenarioData, riskProfile: 'invalid_profile' };

        const response = await request(app)
          .post('/api/portfolio/quick-scenario')
          .send(invalidData)
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      });

      it('should generate different projections for different risk profiles', async () => {
        const aggressiveData = { ...validQuickScenarioData, riskProfile: 'aggressive' };
        const conservativeData = { ...validQuickScenarioData, riskProfile: 'conservative' };

        const aggressiveResponse = await request(app)
          .post('/api/portfolio/quick-scenario')
          .send(aggressiveData);

        const conservativeResponse = await request(app)
          .post('/api/portfolio/quick-scenario')
          .send(conservativeData);

        expect(aggressiveResponse.body.data.quickProjections.expectedIrr).toBeGreaterThan(
          conservativeResponse.body.data.quickProjections.expectedIrr
        );
      });
    });

    describe('GET /api/portfolio/metrics/:scenarioId', () => {
      it('should retrieve real-time metrics for scenario', async () => {
        const response = await request(app).get('/api/portfolio/metrics/scenario_123').expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data.scenarioId).toBe('scenario_123');
        expect(response.body.data.fundMetrics).toBeDefined();
        expect(response.body.data.portfolioMetrics).toBeDefined();
        expect(response.body.data.riskMetrics).toBeDefined();
        expect(response.body.data.performanceTrends).toBeDefined();
        expect(response.body.cacheInfo).toBeDefined();
      });

      it('should support metric type filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/metrics/scenario_123?metricType=risk')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should support time range filtering', async () => {
        const response = await request(app)
          .get('/api/portfolio/metrics/scenario_123?timeRange=6m')
          .expect(200);

        expect(response.body.success).toBe(true);
      });

      it('should require scenario ID', async () => {
        await request(app).get('/api/portfolio/metrics/').expect(404);
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle internal server errors gracefully', async () => {
      // This would require mocking a database failure or similar
      // For now, we test with malformed data that causes processing errors
      const response = await request(app)
        .post('/api/portfolio/strategies?fundId=abc')
        .send({ invalid: 'data' })
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle missing content-type header', async () => {
      const response = await request(app)
        .post('/api/portfolio/strategies?fundId=1')
        .set('Content-Type', 'text/plain')
        .send('invalid data')
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should handle extremely large request bodies', async () => {
      const largeData = {
        name: 'A'.repeat(10000), // Very long string
        sectorAllocation: Object.fromEntries(
          Array.from({ length: 1000 }, (_, i) => [`sector_${i}`, 0.001])
        ),
      };

      const response = await request(app)
        .post('/api/portfolio/strategies?fundId=1')
        .send(largeData)
        .expect(400);

      expect(response.body.error).toBeDefined();
    });

    it('should validate negative numbers where inappropriate', async () => {
      const invalidData = {
        name: 'Test Strategy',
        targetPortfolioSize: -10,
        checkSizeRange: {
          min: -500000,
          max: 2000000,
          target: 1000000,
        },
      };

      const response = await request(app)
        .post('/api/portfolio/strategies?fundId=1')
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should handle concurrent requests properly', async () => {
      const requests = Array.from({ length: 5 }, () =>
        request(app).get('/api/portfolio/strategies/1')
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });

  describe('Performance and Rate Limiting', () => {
    // @group integration
    // FIXME: Security middleware not applied to portfolio-intelligence routes
    // Requires: Import and apply securityMiddlewareStack from server/middleware/security.ts
    // See: server/middleware/security.ts lines 463-470 for middleware stack
    it.skip('should enforce rate limiting', async () => {
      // TODO: Re-enable when test infrastructure supports rate limiting
      // Requires: Mock time control, request isolation, dedicated Redis instance
      // Blocked by: Test environment lacks rate limit mocking infrastructure
      const requests = Array.from({ length: 20 }, () =>
        request(app).get('/api/portfolio/strategies/1')
      );

      const responses = await Promise.all(requests);

      expect(responses.some((response) => response.status === 429)).toBe(true);
    });

    // @group integration
    it('should handle multiple simultaneous strategy creation requests', async () => {
      const validData = {
        name: 'Concurrent Strategy',
        modelType: 'strategic',
        targetPortfolioSize: 25,
        checkSizeRange: { min: 500000, max: 2000000, target: 1000000 },
        sectorAllocation: { tech: 1.0 },
        stageAllocation: { seriesA: 1.0 },
        followOnStrategy: { strategy: 'performance_based' },
        concentrationLimits: { max_per_company: 0.15 },
      };

      const requests = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post(`/api/portfolio/strategies?fundId=${i + 1}`)
          .send({ ...validData, name: `Strategy ${i}` })
      );

      const responses = await Promise.all(requests);

      responses.forEach((response) => {
        expect(response.status).toBe(201);
        expect(response.body.success).toBe(true);
      });
    });

    it('should respond within reasonable time limits', async () => {
      const startTime = Date.now();

      await request(app).get('/api/portfolio/strategies/1').expect(200);

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(1000); // Should respond within 1 second
    });
  });

  describe('Security and Input Validation', () => {
    // @group integration
    // FIXME: Security middleware not applied to portfolio-intelligence routes
    // Requires: Import and apply securityMiddlewareStack from server/middleware/security.ts
    // See: server/middleware/security.ts lines 463-470 for middleware stack
    it('should reject HTML in request body', async () => {
      const maliciousData = {
        name: '<script>alert("xss")</script>Malicious Strategy',
        description: '<img src="x" onerror="alert(1)">',
        modelType: 'strategic',
        targetPortfolioSize: 25,
        checkSizeRange: { min: 500000, max: 2000000, target: 1000000 },
        sectorAllocation: { tech: 1.0 },
        stageAllocation: { seriesA: 1.0 },
      };

      const response = await request(app)
        .post('/api/portfolio/strategies?fundId=1')
        .send(maliciousData);

      // Should reject malicious HTML input with 400
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    // @group integration
    // FIXME: Security middleware not applied to portfolio-intelligence routes
    // Requires: Import and apply securityMiddlewareStack from server/middleware/security.ts
    // See: server/middleware/security.ts lines 463-470 for middleware stack
    it('should reject SQL injection in query params', async () => {
      const sqlInjectionAttempt = {
        name: "'; DROP TABLE strategies; --",
        modelType: 'strategic',
        targetPortfolioSize: 25,
        checkSizeRange: { min: 500000, max: 2000000, target: 1000000 },
        sectorAllocation: { tech: 1.0 },
        stageAllocation: { seriesA: 1.0 },
      };

      const response = await request(app)
        .post('/api/portfolio/strategies?fundId=1')
        .send(sqlInjectionAttempt);

      // Should reject SQL injection attempt with 400
      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    // @group integration
    // FIXME: Security middleware not applied to portfolio-intelligence routes
    // Requires: Import and apply securityMiddlewareStack from server/middleware/security.ts
    // See: server/middleware/security.ts lines 463-470 for middleware stack
    it('should reject invalid UUIDs in path params', async () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '123-456-789',
        'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        '550e8400-e29b-41d4-a716', // Too short
        '550e8400-e29b-41d4-a716-446655440000-extra', // Too long
      ];

      for (const invalidUUID of invalidUUIDs) {
        const response = await request(app)
          .post('/api/portfolio/scenarios/compare')
          .send({
            baseScenarioId: invalidUUID,
            comparisonScenarioIds: ['550e8400-e29b-41d4-a716-446655440000'],
            comparisonType: 'strategy_comparison',
            comparisonMetrics: ['irr'],
          })
          .expect(400);

        expect(response.body.error).toBe('Validation failed');
      }
    });
  });
});
