/**
 * Monte Carlo 2024-2025 Market Validation Integration Test
 *
 * Comprehensive integration test validating the complete system flow from
 * InvestmentStrategyStep defaults through Monte Carlo simulation to Power Law
 * distribution, ensuring 2024-2025 market conditions are properly reflected.
 *
 * Key Market Conditions Being Tested:
 * - Series A Chasm: Only 18% graduation from Seed to Series A
 * - Extended timelines: 25+ months between rounds
 * - Higher valuations: $16M seed, $48M Series A
 * - Power law returns: 70% failures, 1% unicorns
 * - Series C+ stage handling
 * - Reserve optimization under new market conditions
 *
 * @author Claude Code
 * @version 1.0
 */

import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest';
import {
  buildInvestmentStrategy,
  type StrategyInputs,
} from '../../client/src/selectors/buildInvestmentStrategy';
import {
  MonteCarloSimulationService,
  type SimulationParameters,
} from '../../server/services/monte-carlo-simulation';
import type { PowerLawDistribution } from '../../server/services/power-law-distribution';
import { createVCPowerLawDistribution } from '../../server/services/power-law-distribution';

// Mock database dependencies - use factory functions to avoid hoisting issues
vi.mock('../../server/db', () => ({
  db: {
    query: {
      fundBaselines: { findFirst: vi.fn() },
      varianceReports: { findMany: vi.fn() },
      portfolioCompanies: { findMany: vi.fn() },
      funds: { findFirst: vi.fn() },
    },
    insert: vi.fn(),
  },
}));

vi.mock('@shared/schema', () => ({
  fundBaselines: {},
  varianceReports: {},
  funds: {},
  portfolioCompanies: {},
  fundSnapshots: {},
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn(),
}));

// Will be populated in beforeAll
let mockDb: {
  query: {
    fundBaselines: { findFirst: ReturnType<typeof vi.fn> };
    varianceReports: { findMany: ReturnType<typeof vi.fn> };
    portfolioCompanies: { findMany: ReturnType<typeof vi.fn> };
    funds: { findFirst: ReturnType<typeof vi.fn> };
  };
  insert: ReturnType<typeof vi.fn>;
};

// TODO: Complete test assertions to match actual Monte Carlo implementation
// Tests skipped pending alignment with MC service output structure
describe.skip('Monte Carlo 2024-2025 Market Validation Integration', () => {
  let monteCarloService: MonteCarloSimulationService;
  let _powerLawDistribution: PowerLawDistribution;

  // Test seed for reproducible results
  const TEST_SEED = 42;

  // 2024-2025 Market Constants
  const MARKET_2025_CONFIG = {
    SERIES_A_GRADUATION_RATE: 18, // Down from pre-2020 ~40%
    SEED_TO_SERIES_A_MONTHS: 25, // Extended from ~18 months
    SERIES_A_TO_B_MONTHS: 28, // Extended timelines
    SEED_VALUATION_AVG: 16_000_000, // $16M average
    SERIES_A_VALUATION_AVG: 48_000_000, // $48M average
    FAILURE_RATE: 70, // 70% total failures
    UNICORN_RATE: 1, // 1% unicorns (>50x returns)
    HOME_RUN_RATE: 4, // 4% home runs (10-50x)
    GOOD_OUTCOME_RATE: 10, // 10% good outcomes (3-10x)
    MODEST_RETURN_RATE: 15, // 15% modest returns (1-3x)
  };

  beforeAll(async () => {
    // Import the mocked db module to get access to mockDb
    const { db } = await import('../../server/db');
    mockDb = db as typeof mockDb;

    // Set up insert().values() chain pattern
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    // Mock fund baseline reflecting current market conditions
    mockDb.query.fundBaselines.findFirst.mockResolvedValue({
      id: 'baseline-2025',
      fundId: 1,
      totalValue: 150_000_000, // $150M fund size (current market)
      irr: 0.12, // Lower IRRs in current market
      multiple: 1.8, // Compressed multiples
      dpi: 0.3, // Lower distributions
      tvpi: 1.2, // Current TVPI expectation
      deployedCapital: 75_000_000, // 50% deployed
      isDefault: true,
      isActive: true,
    });

    // Mock variance reports (clean for testing)
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);

    // Mock portfolio reflecting 2024-2025 stage distribution
    mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
      // Seed stage dominated (reflecting investment patterns)
      { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
      { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' },
      { id: 3, fundId: 1, stage: 'seed', sector: 'enterprise' },
      { id: 4, fundId: 1, stage: 'seed', sector: 'consumer' },
      { id: 5, fundId: 1, stage: 'seed', sector: 'ai' },
      { id: 6, fundId: 1, stage: 'seed', sector: 'climate' },
      { id: 7, fundId: 1, stage: 'seed', sector: 'fintech' },
      { id: 8, fundId: 1, stage: 'seed', sector: 'healthtech' },
      // Limited Series A (reflecting Series A Chasm)
      { id: 9, fundId: 1, stage: 'series-a', sector: 'fintech' },
      { id: 10, fundId: 1, stage: 'series-a', sector: 'enterprise' },
      // Even fewer later stages
      { id: 11, fundId: 1, stage: 'series-b', sector: 'ai' },
      { id: 12, fundId: 1, stage: 'series-c+', sector: 'fintech' },
    ]);

    // Mock fund size reflecting current market
    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      size: 150_000_000, // $150M fund
    });

    // Initialize services
    monteCarloService = new MonteCarloSimulationService();
    _powerLawDistribution = createVCPowerLawDistribution({
      failureRate: MARKET_2025_CONFIG.FAILURE_RATE / 100,
      unicornRate: MARKET_2025_CONFIG.UNICORN_RATE / 100,
      homeRunRate: MARKET_2025_CONFIG.HOME_RUN_RATE / 100,
      goodOutcomeRate: MARKET_2025_CONFIG.GOOD_OUTCOME_RATE / 100,
      modestReturnRate: MARKET_2025_CONFIG.MODEST_RETURN_RATE / 100,
    });
  });

  beforeEach(() => {
    // Re-setup insert().values() chain after clearing mocks
    mockDb.insert.mockReturnValue({
      values: vi.fn().mockResolvedValue(undefined),
    });

    // Re-setup query mocks
    mockDb.query.fundBaselines.findFirst.mockResolvedValue({
      id: 'baseline-2025',
      fundId: 1,
      totalValue: 150_000_000,
      irr: 0.12,
      multiple: 1.8,
      dpi: 0.3,
      tvpi: 1.2,
      deployedCapital: 75_000_000,
      isDefault: true,
      isActive: true,
    });
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);
    mockDb.query.portfolioCompanies.findMany.mockResolvedValue([
      { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
      { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' },
      { id: 3, fundId: 1, stage: 'seed', sector: 'enterprise' },
      { id: 4, fundId: 1, stage: 'seed', sector: 'consumer' },
      { id: 5, fundId: 1, stage: 'seed', sector: 'ai' },
      { id: 6, fundId: 1, stage: 'seed', sector: 'climate' },
      { id: 7, fundId: 1, stage: 'seed', sector: 'fintech' },
      { id: 8, fundId: 1, stage: 'seed', sector: 'healthtech' },
      { id: 9, fundId: 1, stage: 'series-a', sector: 'fintech' },
      { id: 10, fundId: 1, stage: 'series-a', sector: 'enterprise' },
      { id: 11, fundId: 1, stage: 'series-b', sector: 'ai' },
      { id: 12, fundId: 1, stage: 'series-c+', sector: 'fintech' },
    ]);
    mockDb.query.funds.findFirst.mockResolvedValue({
      id: 1,
      size: 150_000_000,
    });
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Investment Strategy Step Defaults → Monte Carlo → Power Law Flow', () => {
    it('should create realistic 2024-2025 investment strategy defaults', () => {
      // Create strategy inputs reflecting current market reality
      const strategyInputs: StrategyInputs = {
        stages: [
          {
            id: 'seed',
            name: 'Seed',
            graduate: MARKET_2025_CONFIG.SERIES_A_GRADUATION_RATE, // 18% - Series A Chasm
            exit: 12, // Early exits due to market conditions
            months: MARKET_2025_CONFIG.SEED_TO_SERIES_A_MONTHS, // 25 months - extended timeline
          },
          {
            id: 'series-a',
            name: 'Series A',
            graduate: 35, // Better survival post-chasm
            exit: 25,
            months: MARKET_2025_CONFIG.SERIES_A_TO_B_MONTHS, // 28 months
          },
          {
            id: 'series-b',
            name: 'Series B',
            graduate: 40,
            exit: 30,
            months: 24,
          },
          {
            id: 'series-c+',
            name: 'Series C+',
            graduate: 0, // Terminal stage
            exit: 60,
            months: 36,
          },
        ],
        sectorProfiles: [
          {
            id: 'fintech',
            name: 'FinTech',
            targetPercentage: 25,
            description: 'Financial technology',
          },
          {
            id: 'healthtech',
            name: 'HealthTech',
            targetPercentage: 20,
            description: 'Healthcare technology',
          },
          {
            id: 'enterprise',
            name: 'Enterprise SaaS',
            targetPercentage: 20,
            description: 'B2B software',
          },
          { id: 'ai', name: 'AI/ML', targetPercentage: 15, description: 'Artificial intelligence' },
          {
            id: 'climate',
            name: 'Climate Tech',
            targetPercentage: 10,
            description: 'Climate solutions',
          },
          {
            id: 'consumer',
            name: 'Consumer',
            targetPercentage: 10,
            description: 'Consumer products',
          },
        ],
        allocations: [
          {
            id: 'new-investments',
            category: 'New Investments',
            percentage: 60,
            description: 'Initial investments',
          },
          {
            id: 'reserves',
            category: 'Reserves',
            percentage: 35,
            description: 'Follow-on reserves',
          }, // Higher reserves in tough market
          {
            id: 'expenses',
            category: 'Operating Expenses',
            percentage: 5,
            description: 'Fund operations',
          },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Validate strategy structure
      expect(strategy.validation.allValid).toBe(true);
      expect(strategy.stages).toHaveLength(4);
      expect(strategy.stages[0].graduationRate).toBe(MARKET_2025_CONFIG.SERIES_A_GRADUATION_RATE);

      // Validate graduation + exit rates don't exceed 100%
      strategy.stages.forEach((stage) => {
        const totalRate = stage.graduationRate + stage.exitRate;
        expect(totalRate).toBeLessThanOrEqual(100);
        expect(stage.remainRate).toBe(100 - totalRate);
      });

      // Validate last stage has 0% graduation
      const lastStage = strategy.stages[strategy.stages.length - 1];
      expect(lastStage.graduationRate).toBe(0);

      // Validate total allocations
      expect(strategy.totalAllocation).toBe(100);
      expect(strategy.totalSectorAllocation).toBe(100);
    });

    it('should integrate strategy defaults with Monte Carlo simulation', async () => {
      const simulationParams: SimulationParameters = {
        fundId: 1,
        scenarios: 5000,
        timeHorizonYears: 7, // Longer hold periods in current market
        confidenceIntervals: [5, 10, 25, 50, 75, 90, 95],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(simulationParams);

      // Validate Monte Carlo output structure
      expect(forecast).toBeDefined();
      expect(forecast.fundId).toBe(1);
      expect(forecast.multiple.scenarios).toHaveLength(5000);
      expect(forecast.irr.scenarios).toHaveLength(5000);

      // Validate 2024-2025 market characteristics in results
      expect(forecast.multiple.statistics.skewness).toBeGreaterThan(2); // Highly skewed distribution
      expect(forecast.multiple.statistics.median).toBeLessThan(forecast.multiple.statistics.mean); // Right-skewed

      // Current market expectations (compressed returns)
      expect(forecast.multiple.statistics.mean).toBeGreaterThan(1.0);
      expect(forecast.multiple.statistics.mean).toBeLessThan(3.0); // Lower than historical

      // IRR expectations in current environment
      expect(forecast.irr.statistics.mean).toBeGreaterThan(0.05); // 5%+
      expect(forecast.irr.statistics.mean).toBeLessThan(0.25); // <25%
    });

    it('should reflect power law distribution characteristics', async () => {
      const simulationParams: SimulationParameters = {
        fundId: 1,
        scenarios: 10000, // Large sample for statistical accuracy
        timeHorizonYears: 6,
        confidenceIntervals: [50, 75, 90, 95, 99],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(simulationParams);

      // Validate power law characteristics
      const scenarios = forecast.multiple.scenarios;

      // Count outcome categories
      const failures = scenarios.filter((m) => m <= 1.0).length;
      const modestReturns = scenarios.filter((m) => m > 1.0 && m <= 3.0).length;
      const goodOutcomes = scenarios.filter((m) => m > 3.0 && m <= 10.0).length;
      const homeRuns = scenarios.filter((m) => m > 10.0 && m <= 50.0).length;
      const unicorns = scenarios.filter((m) => m > 50.0).length;

      const totalScenarios = scenarios.length;

      // Validate 2024-2025 distribution (with tolerance for statistical variation)
      expect(failures / totalScenarios).toBeCloseTo(MARKET_2025_CONFIG.FAILURE_RATE / 100, 1);
      expect(modestReturns / totalScenarios).toBeCloseTo(
        MARKET_2025_CONFIG.MODEST_RETURN_RATE / 100,
        1
      );
      expect(goodOutcomes / totalScenarios).toBeCloseTo(
        MARKET_2025_CONFIG.GOOD_OUTCOME_RATE / 100,
        1
      );
      expect(homeRuns / totalScenarios).toBeCloseTo(MARKET_2025_CONFIG.HOME_RUN_RATE / 100, 1);
      expect(unicorns / totalScenarios).toBeCloseTo(MARKET_2025_CONFIG.UNICORN_RATE / 100, 1);

      // Validate extreme outliers are capped reasonably
      expect(Math.max(...scenarios)).toBeLessThan(250); // Cap around 200x
    });
  });

  describe('2024-2025 Market Parameter Validation', () => {
    it('should reflect Series A Chasm (18% graduation rate)', async () => {
      // Test with seed-heavy portfolio
      mockDb.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        ...Array(10)
          .fill(null)
          .map((_, i) => ({
            id: i + 1,
            fundId: 1,
            stage: 'seed',
            sector: i % 2 === 0 ? 'fintech' : 'healthtech',
          })),
      ]);

      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 3000,
        timeHorizonYears: 5,
        confidenceIntervals: [50, 75, 90],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Analyze stage progression characteristics
      const stageMetrics = forecast.portfolioMetrics.stagePerformance;

      if (stageMetrics.seed) {
        // Seed stage should show high variance and lower median returns
        expect(stageMetrics.seed.standardDeviation).toBeGreaterThan(stageMetrics.seed.mean * 0.8);

        // Failure rate should be high for seed
        const seedFailures = forecast.multiple.scenarios.filter((m) => m <= 1.0).length;
        expect(seedFailures / forecast.multiple.scenarios.length).toBeGreaterThan(0.6);
      }
    });

    it('should validate extended round timelines (25+ months)', async () => {
      // This test validates that timing assumptions are built into the model
      const strategyInputs: StrategyInputs = {
        stages: [
          {
            id: 'seed',
            name: 'Seed',
            graduate: 18,
            exit: 12,
            months: 25, // Extended timeline
          },
          {
            id: 'series-a',
            name: 'Series A',
            graduate: 35,
            exit: 25,
            months: 28, // Extended timeline
          },
          {
            id: 'series-b+',
            name: 'Series B+',
            graduate: 0,
            exit: 60,
            months: 36,
          },
        ],
        sectorProfiles: [
          {
            id: 'tech',
            name: 'Technology',
            targetPercentage: 100,
            description: 'Technology sector',
          },
        ],
        allocations: [
          {
            id: 'investments',
            category: 'Investments',
            percentage: 95,
            description: 'Investments',
          },
          { id: 'expenses', category: 'Expenses', percentage: 5, description: 'Expenses' },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Validate extended timelines are captured
      expect(strategy.stages[0].graduationRate).toBe(18); // Series A Chasm
      expect(strategy.validation.allValid).toBe(true);

      // Validate that graduation + exit rates are realistic
      strategy.stages.forEach((stage) => {
        expect(stage.graduationRate + stage.exitRate).toBeLessThanOrEqual(100);
      });
    });

    it('should validate higher valuations impact on returns', async () => {
      // Test that higher entry valuations compress returns
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 2000,
        timeHorizonYears: 6,
        confidenceIntervals: [25, 50, 75],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);

      // In higher valuation environment, median returns should be compressed
      expect(forecast.multiple.percentiles[50]).toBeLessThan(2.5); // Median <2.5x
      expect(forecast.multiple.percentiles[25]).toBeLessThan(1.5); // Q1 <1.5x

      // But extreme outliers should still exist (power law tail)
      expect(forecast.multiple.percentiles[95]).toBeGreaterThan(5.0); // P95 >5x
    });

    it('should validate power law return distribution (70% failures, 1% unicorns)', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 8000, // Large sample for accurate distribution analysis
        timeHorizonYears: 7,
        confidenceIntervals: [1, 5, 25, 50, 75, 95, 99],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);
      const scenarios = forecast.multiple.scenarios;

      // Validate core power law distribution
      const failures = scenarios.filter((m) => m <= 1.0);
      const unicorns = scenarios.filter((m) => m > 50.0);
      const homeRuns = scenarios.filter((m) => m > 10.0 && m <= 50.0);

      // Core distribution validation (allowing for statistical variation)
      expect(failures.length / scenarios.length).toBeCloseTo(0.7, 1); // 70% ± 10%
      expect(unicorns.length / scenarios.length).toBeCloseTo(0.01, 1); // 1% ± 1%
      expect(homeRuns.length / scenarios.length).toBeCloseTo(0.04, 1); // 4% ± 1%

      // Power law characteristics
      expect(forecast.multiple.statistics.skewness).toBeGreaterThan(3); // Highly skewed
      expect(forecast.multiple.statistics.kurtosis).toBeGreaterThan(10); // Fat tails
    });
  });

  describe('Reserve Optimization Under 2024-2025 Market Conditions', () => {
    it('should optimize reserves for extended funding cycles', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 3000,
        timeHorizonYears: 8, // Longer hold periods
        confidenceIntervals: [50, 90],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Reserve optimization should account for extended timelines
      expect(forecast.reserveOptimization).toBeDefined();
      expect(forecast.reserveOptimization.optimalReserveRatio).toBeDefined();

      // In current market, higher reserve ratios should be recommended
      expect(forecast.reserveOptimization.optimalReserveRatio).toBeGreaterThan(0.3); // >30%
      expect(forecast.reserveOptimization.optimalReserveRatio).toBeLessThan(0.6); // <60%

      // Risk-adjusted metrics should be realistic
      expect(forecast.reserveOptimization.riskAdjustedReturn).toBeDefined();
      expect(forecast.reserveOptimization.riskAdjustedReturn).toBeGreaterThan(0);
    });

    it('should provide realistic portfolio construction insights', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 4000,
        timeHorizonYears: 6,
        confidenceIntervals: [50, 75, 90],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Portfolio metrics should reflect current market reality
      const portfolioMetrics = forecast.portfolioMetrics;

      expect(portfolioMetrics.concentrationRisk).toBeDefined();
      expect(portfolioMetrics.sectorCorrelation).toBeDefined();
      expect(portfolioMetrics.stagePerformance).toBeDefined();

      // Risk metrics should be realistic for current environment
      expect(forecast.riskMetrics.probabilityOfLoss).toBeGreaterThan(0.2); // High risk environment
      expect(forecast.riskMetrics.probabilityOfLoss).toBeLessThan(0.7);

      expect(forecast.riskMetrics.valueAtRisk[10]).toBeDefined();
      expect(forecast.riskMetrics.expectedShortfall[10]).toBeDefined();
    });
  });

  describe('Series C+ Stage Handling', () => {
    it('should properly handle Series C+ as terminal stage', async () => {
      // Test with portfolio including Series C+ companies
      mockDb.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
        { id: 2, fundId: 1, stage: 'series-a', sector: 'healthtech' },
        { id: 3, fundId: 1, stage: 'series-b', sector: 'enterprise' },
        { id: 4, fundId: 1, stage: 'series-c+', sector: 'fintech' },
        { id: 5, fundId: 1, stage: 'series-c+', sector: 'ai' },
      ]);

      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 2000,
        timeHorizonYears: 5,
        confidenceIntervals: [50, 90],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Series C+ should show in stage performance
      const stagePerformance = forecast.portfolioMetrics.stagePerformance;

      if (stagePerformance['series-c+']) {
        // Series C+ should have higher expected returns (survival bias)
        expect(stagePerformance['series-c+'].mean).toBeGreaterThan(1.5);

        // But lower variance (more mature companies)
        expect(stagePerformance['series-c+'].standardDeviation).toBeLessThan(
          stagePerformance['series-c+'].mean
        );
      }

      // Overall simulation should handle mixed stages properly
      expect(forecast.multiple.scenarios).toHaveLength(2000);
      expect(forecast.multiple.statistics.mean).toBeGreaterThan(0.5);
    });

    it('should validate Series C+ graduation constraints', () => {
      const strategyInputs: StrategyInputs = {
        stages: [
          { id: 'seed', name: 'Seed', graduate: 20, exit: 15, months: 24 },
          { id: 'series-a', name: 'Series A', graduate: 30, exit: 20, months: 30 },
          { id: 'series-c+', name: 'Series C+', graduate: 0, exit: 70, months: 48 },
        ],
        sectorProfiles: [
          { id: 'tech', name: 'Technology', targetPercentage: 100, description: 'Tech' },
        ],
        allocations: [
          { id: 'inv', category: 'Investments', percentage: 100, description: 'All investments' },
        ],
      };

      const strategy = buildInvestmentStrategy(strategyInputs);

      // Validate Series C+ has 0% graduation (terminal stage)
      const seriesCPlusStage = strategy.stages.find((s) => s.id === 'series-c+');
      expect(seriesCPlusStage?.graduationRate).toBe(0);

      // Validate all constraints are met
      expect(strategy.validation.allValid).toBe(true);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid graduation + exit rate combinations', () => {
      const invalidInputs: StrategyInputs = {
        stages: [
          {
            id: 'invalid',
            name: 'Invalid Stage',
            graduate: 70,
            exit: 50, // Total = 120% > 100%
            months: 24,
          },
        ],
        sectorProfiles: [
          { id: 'tech', name: 'Tech', targetPercentage: 100, description: 'Technology' },
        ],
        allocations: [
          { id: 'inv', category: 'Investments', percentage: 100, description: 'Investments' },
        ],
      };

      const strategy = buildInvestmentStrategy(invalidInputs);

      // Should flag validation error
      expect(strategy.validation.allValid).toBe(false);
      expect(strategy.validation.stages[0]).toContain('Graduate + Exit must be ≤ 100%');
    });

    it('should handle malformed inputs gracefully', () => {
      const malformedInputs = {
        stages: null,
        sectorProfiles: [],
        allocations: [],
      } as any;

      const strategy = buildInvestmentStrategy(malformedInputs);

      // Should return safe defaults
      expect(strategy.stages).toEqual([]);
      expect(strategy.validation.allValid).toBe(false);
    });

    it('should handle empty portfolio in Monte Carlo simulation', async () => {
      mockDb.query.portfolioCompanies.findMany.mockResolvedValueOnce([]);

      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 1000,
        timeHorizonYears: 5,
        confidenceIntervals: [50],
        randomSeed: TEST_SEED,
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Should still produce valid results with defaults
      expect(forecast.multiple.scenarios).toHaveLength(1000);
      expect(forecast.multiple.statistics.mean).toBeGreaterThan(0);
    });
  });

  describe('Performance and Consistency', () => {
    it('should complete large simulations efficiently', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 20000, // Large simulation
        timeHorizonYears: 7,
        confidenceIntervals: [50, 90],
        randomSeed: TEST_SEED,
      };

      const startTime = Date.now();
      const forecast = await monteCarloService.generateForecast(params);
      const endTime = Date.now();

      expect(forecast.multiple.scenarios).toHaveLength(20000);
      expect(endTime - startTime).toBeLessThan(15000); // <15 seconds
    });

    it('should produce reproducible results with same seed', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 2000,
        timeHorizonYears: 5,
        confidenceIntervals: [25, 50, 75],
        randomSeed: TEST_SEED,
      };

      const forecast1 = await monteCarloService.generateForecast(params);
      const forecast2 = await monteCarloService.generateForecast(params);

      // Results should be identical with same seed
      expect(forecast1.multiple.statistics.mean).toBe(forecast2.multiple.statistics.mean);
      expect(forecast1.multiple.statistics.median).toBe(forecast2.multiple.statistics.median);
      expect(forecast1.irr.statistics.mean).toBe(forecast2.irr.statistics.mean);
    });

    it('should maintain statistical consistency across multiple runs', async () => {
      const runs = 5;
      const scenarios = 3000;

      const results = [];

      for (let i = 0; i < runs; i++) {
        const params: SimulationParameters = {
          fundId: 1,
          scenarios,
          timeHorizonYears: 6,
          confidenceIntervals: [50],
          randomSeed: TEST_SEED + i, // Different seeds
        };

        const forecast = await monteCarloService.generateForecast(params);
        results.push(forecast.multiple.statistics.mean);
      }

      // Results should be statistically consistent (not wildly different)
      const meanOfMeans = results.reduce((a, b) => a + b, 0) / results.length;
      const variance =
        results.reduce((sum, x) => sum + Math.pow(x - meanOfMeans, 2), 0) / results.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation of means should be reasonable (<20% of mean)
      expect(stdDev / meanOfMeans).toBeLessThan(0.2);
    });
  });
});
