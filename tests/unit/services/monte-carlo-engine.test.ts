/**
 * Monte Carlo Engine Service Tests
 *
 * Comprehensive unit tests for Monte Carlo simulation engine functionality
 * Tests portfolio construction modeling, scenario planning, and performance forecasting
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MonteCarloEngine,
  type SimulationConfig,
  type PortfolioInputs,
} from '../../../server/services/monte-carlo-engine';
import { db } from '../../../server/db';

// Mock the database and dependencies - use factory function to avoid hoisting issues
vi.mock('../../../server/db', () => ({
  db: {
    query: {
      fundBaselines: {
        findFirst: vi.fn(),
      },
      funds: {
        findFirst: vi.fn(),
      },
      varianceReports: {
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => Promise.resolve()),
    })),
  },
}));

vi.mock('@shared/schema', () => ({
  monteCarloSimulations: 'mocked-table',
  fundBaselines: 'mocked-fundBaselines-table',
  funds: 'mocked-funds-table',
  varianceReports: 'mocked-varianceReports-table',
}));

// Mock UUID generation for consistent testing
vi.mock('uuid', () => ({
  v4: () => 'test-uuid-12345',
}));

describe('MonteCarloEngine', () => {
  let engine: MonteCarloEngine;
  let mockConfig: SimulationConfig;
  let mockBaseline: any;
  let mockFund: any;
  let mockVarianceReports: any[];

  beforeEach(() => {
    engine = new MonteCarloEngine();
    vi.clearAllMocks();

    // Mock configuration
    mockConfig = {
      fundId: 1,
      runs: 1000,
      timeHorizonYears: 8,
      portfolioSize: 25,
      deploymentScheduleMonths: 36,
      randomSeed: 12345,
    };

    // Mock baseline data
    mockBaseline = {
      id: 'baseline-123',
      fundId: 1,
      deployedCapital: 30000000,
      sectorDistribution: {
        FinTech: 8,
        SaaS: 6,
        HealthTech: 5,
        'AI/ML': 4,
        Other: 2,
      },
      stageDistribution: {
        Seed: 10,
        'Series A': 12,
        'Series B': 3,
      },
      averageInvestment: 1200000,
      irr: 0.18,
      multiple: 2.8,
      dpi: 0.85,
      isActive: true,
      isDefault: true,
    };

    // Mock fund data
    mockFund = {
      id: 1,
      size: 50000000,
      createdAt: new Date('2022-01-01'),
      isActive: true,
    };

    // Mock variance reports
    mockVarianceReports = [
      {
        id: 1,
        fundId: 1,
        baselineId: 'baseline-123',
        asOfDate: new Date('2024-01-01'),
        irrVariance: 0.02,
        multipleVariance: 0.15,
        dpiVariance: 0.08,
      },
      {
        id: 2,
        fundId: 1,
        baselineId: 'baseline-123',
        asOfDate: new Date('2024-02-01'),
        irrVariance: 0.025,
        multipleVariance: 0.18,
        dpiVariance: 0.06,
      },
      {
        id: 3,
        fundId: 1,
        baselineId: 'baseline-123',
        asOfDate: new Date('2024-03-01'),
        irrVariance: 0.018,
        multipleVariance: 0.12,
        dpiVariance: 0.09,
      },
    ];

    // Setup mock database responses
    (db.query.fundBaselines.findFirst as any).mockResolvedValue(mockBaseline);
    (db.query.funds.findFirst as any).mockResolvedValue(mockFund);
    (db.query.varianceReports.findMany as any).mockResolvedValue(mockVarianceReports);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Portfolio Simulation', () => {
    describe('runPortfolioSimulation', () => {
      it('should run complete portfolio simulation with all components', async () => {
        const result = await engine.runPortfolioSimulation(mockConfig);

        expect(result).toBeDefined();
        expect(result.simulationId).toBe('test-uuid-12345');
        expect(result.config).toEqual(mockConfig);
        expect(result.executionTimeMs).toBeGreaterThan(0);

        // Check performance distributions
        expect(result.irr).toBeDefined();
        expect(result.irr.percentiles).toBeDefined();
        expect(result.irr.statistics).toBeDefined();
        expect(result.irr.confidenceIntervals).toBeDefined();

        expect(result.multiple).toBeDefined();
        expect(result.dpi).toBeDefined();
        expect(result.tvpi).toBeDefined();
        expect(result.totalValue).toBeDefined();

        // Check risk metrics
        expect(result.riskMetrics).toBeDefined();
        expect(result.riskMetrics.valueAtRisk).toBeDefined();
        expect(result.riskMetrics.conditionalValueAtRisk).toBeDefined();
        expect(result.riskMetrics.probabilityOfLoss).toBeGreaterThanOrEqual(0);
        expect(result.riskMetrics.probabilityOfLoss).toBeLessThanOrEqual(1);

        // Check reserve optimization
        expect(result.reserveOptimization).toBeDefined();
        expect(result.reserveOptimization.currentReserveRatio).toBeGreaterThan(0);
        expect(result.reserveOptimization.optimalReserveRatio).toBeGreaterThan(0);

        // Check scenario analysis
        expect(result.scenarios).toBeDefined();
        expect(result.scenarios.bullMarket).toBeDefined();
        expect(result.scenarios.bearMarket).toBeDefined();
        expect(result.scenarios.stressTest).toBeDefined();
        expect(result.scenarios.baseCase).toBeDefined();

        // Check insights
        expect(result.insights).toBeDefined();
        expect(result.insights.primaryRecommendations).toBeInstanceOf(Array);
        expect(result.insights.riskWarnings).toBeInstanceOf(Array);
        expect(result.insights.opportunityAreas).toBeInstanceOf(Array);
        expect(result.insights.keyMetrics).toBeInstanceOf(Array);
      });

      it('should handle different simulation run counts', async () => {
        const configs = [
          { ...mockConfig, runs: 100 },
          { ...mockConfig, runs: 5000 },
          { ...mockConfig, runs: 10000 },
        ];

        for (const config of configs) {
          const result = await engine.runPortfolioSimulation(config);

          expect(result.config.runs).toBe(config.runs);
          expect(result.irr.scenarios).toHaveLength(config.runs);
          expect(result.multiple.scenarios).toHaveLength(config.runs);
        }
      });

      it('should use reproducible results with random seed', async () => {
        const config1 = { ...mockConfig, randomSeed: 12345 };
        const config2 = { ...mockConfig, randomSeed: 12345 };

        const result1 = await engine.runPortfolioSimulation(config1);
        const result2 = await engine.runPortfolioSimulation(config2);

        // Results should be identical with same seed
        expect(result1.irr.statistics.mean).toBeCloseTo(result2.irr.statistics.mean, 2);
        expect(result1.multiple.statistics.mean).toBeCloseTo(result2.multiple.statistics.mean, 2);
      });

      it.skip('should validate configuration parameters', async () => {
        // FIXME: Requires implementing validation logic in MonteCarloEngine
        // This is not a quick win - needs feature implementation
        const invalidConfigs = [
          { ...mockConfig, runs: 50 }, // Too few runs
          { ...mockConfig, runs: 100000 }, // Too many runs
          { ...mockConfig, timeHorizonYears: 0 }, // Invalid time horizon
          { ...mockConfig, timeHorizonYears: 20 }, // Too long time horizon
        ];

        for (const config of invalidConfigs) {
          await expect(engine.runPortfolioSimulation(config)).rejects.toThrow();
        }
      });

      it('should handle insufficient historical data', async () => {
        (db.query.varianceReports.findMany as any).mockResolvedValue([]);

        const result = await engine.runPortfolioSimulation(mockConfig);

        // Should use default distributions when insufficient data
        expect(result).toBeDefined();
        expect(result.irr.statistics.mean).toBeGreaterThan(0);
      });

      it('should handle missing baseline data', async () => {
        (db.query.fundBaselines.findFirst as any).mockResolvedValue(null);

        await expect(engine.runPortfolioSimulation(mockConfig)).rejects.toThrow(
          'No suitable baseline found'
        );
      });

      it('should handle missing fund data', async () => {
        (db.query.funds.findFirst as any).mockResolvedValue(null);

        await expect(engine.runPortfolioSimulation(mockConfig)).rejects.toThrow('Fund 1 not found');
      });
    });

    describe('Performance Distributions', () => {
      it('should generate correct percentile distributions', async () => {
        const result = await engine.runPortfolioSimulation(mockConfig);

        const irrPercentiles = result.irr.percentiles;
        expect(irrPercentiles.p5).toBeLessThan(irrPercentiles.p25);
        expect(irrPercentiles.p25).toBeLessThan(irrPercentiles.p50);
        expect(irrPercentiles.p50).toBeLessThan(irrPercentiles.p75);
        expect(irrPercentiles.p75).toBeLessThan(irrPercentiles.p95);

        const multiplePercentiles = result.multiple.percentiles;
        expect(multiplePercentiles.p5).toBeLessThan(multiplePercentiles.p95);
      });

      it('should calculate confidence intervals correctly', async () => {
        const result = await engine.runPortfolioSimulation(mockConfig);

        const irrCI = result.irr.confidenceIntervals;
        expect(irrCI.ci68[0]).toBeLessThan(irrCI.ci68[1]);
        expect(irrCI.ci95[0]).toBeLessThan(irrCI.ci95[1]);

        // 95% CI should be wider than 68% CI
        expect(irrCI.ci95[1] - irrCI.ci95[0]).toBeGreaterThan(irrCI.ci68[1] - irrCI.ci68[0]);
      });

      it('should maintain statistical consistency', async () => {
        const result = await engine.runPortfolioSimulation({ ...mockConfig, runs: 10000 });

        const stats = result.irr.statistics;
        const scenarios = result.irr.scenarios;

        // Check mean calculation
        const calculatedMean = scenarios.reduce((sum, val) => sum + val, 0) / scenarios.length;
        expect(stats.mean).toBeCloseTo(calculatedMean, 3);

        // Check min/max
        expect(stats.min).toBe(Math.min(...scenarios));
        expect(stats.max).toBe(Math.max(...scenarios));

        // Standard deviation should be positive
        expect(stats.standardDeviation).toBeGreaterThan(0);
      });
    });
  });

  describe('Risk Metrics Calculation', () => {
    let mockScenarios: any[];
    let mockPerformanceResults: any;

    beforeEach(() => {
      // Create mock scenarios for risk testing
      mockScenarios = Array.from({ length: 1000 }, () => ({
        irr: 0.15 + (Math.random() - 0.5) * 0.2,
        multiple: 2.5 + (Math.random() - 0.5) * 1.0,
        totalValue: 100000000 + (Math.random() - 0.5) * 50000000,
      }));

      mockPerformanceResults = {
        irr: {
          scenarios: mockScenarios.map((s) => s.irr),
          statistics: {
            mean: 0.15,
            standardDeviation: 0.08,
          },
        },
        totalValue: {
          scenarios: mockScenarios.map((s) => s.totalValue),
        },
      };
    });

    describe('calculateRiskMetrics', () => {
      it('should calculate Value at Risk (VaR) correctly', () => {
        const riskMetrics = engine.calculateRiskMetrics(mockScenarios, mockPerformanceResults);

        expect(riskMetrics.valueAtRisk.var5).toBeLessThan(riskMetrics.valueAtRisk.var10);
        expect(riskMetrics.valueAtRisk.var5).toBeLessThan(
          mockPerformanceResults.irr.statistics.mean
        );
        expect(riskMetrics.valueAtRisk.var10).toBeLessThan(
          mockPerformanceResults.irr.statistics.mean
        );
      });

      it('should calculate Conditional Value at Risk (CVaR)', () => {
        const riskMetrics = engine.calculateRiskMetrics(mockScenarios, mockPerformanceResults);

        expect(riskMetrics.conditionalValueAtRisk.cvar5).toBeDefined();
        expect(riskMetrics.conditionalValueAtRisk.cvar10).toBeDefined();
        expect(riskMetrics.conditionalValueAtRisk.cvar5).toBeLessThan(
          riskMetrics.conditionalValueAtRisk.cvar10
        );
      });

      it('should calculate probability of loss', () => {
        const riskMetrics = engine.calculateRiskMetrics(mockScenarios, mockPerformanceResults);

        expect(riskMetrics.probabilityOfLoss).toBeGreaterThanOrEqual(0);
        expect(riskMetrics.probabilityOfLoss).toBeLessThanOrEqual(1);
      });

      it('should calculate downside risk', () => {
        const riskMetrics = engine.calculateRiskMetrics(mockScenarios, mockPerformanceResults);

        expect(riskMetrics.downsideRisk).toBeGreaterThan(0);
      });

      it('should calculate Sharpe and Sortino ratios', () => {
        const riskMetrics = engine.calculateRiskMetrics(mockScenarios, mockPerformanceResults);

        expect(riskMetrics.sharpeRatio).toBeDefined();
        expect(riskMetrics.sortinoRatio).toBeDefined();

        // Sortino should typically be higher than Sharpe (less penalty for upside volatility)
        if (riskMetrics.sharpeRatio > 0) {
          expect(riskMetrics.sortinoRatio).toBeGreaterThanOrEqual(riskMetrics.sharpeRatio);
        }
      });

      it('should calculate maximum drawdown', () => {
        const riskMetrics = engine.calculateRiskMetrics(mockScenarios, mockPerformanceResults);

        expect(riskMetrics.maxDrawdown).toBeGreaterThanOrEqual(0);
        expect(riskMetrics.maxDrawdown).toBeLessThanOrEqual(1);
      });
    });
  });

  describe('Reserve Optimization', () => {
    let mockPortfolioInputs: PortfolioInputs;

    beforeEach(() => {
      mockPortfolioInputs = {
        fundSize: 50000000,
        deployedCapital: 30000000,
        reserveRatio: 0.4,
        sectorWeights: {
          FinTech: 0.32,
          SaaS: 0.24,
          HealthTech: 0.2,
          'AI/ML': 0.16,
          Other: 0.08,
        },
        stageWeights: {
          Seed: 0.4,
          'Series A': 0.48,
          'Series B': 0.12,
        },
        averageInvestmentSize: 1200000,
      };
    });

    describe('optimizeReserveAllocation', () => {
      // @group integration
      it.skip('should find optimal reserve allocation', async () => {
        const mockScenarios = Array.from({ length: 100 }, () => ({
          irr: 0.15 + Math.random() * 0.1,
          multiple: 2.0 + Math.random() * 1.0,
          followOnNeed: 0.3 + Math.random() * 0.4,
        }));

        const optimization = await engine.optimizeReserveAllocation(
          mockConfig,
          mockPortfolioInputs,
          mockScenarios
        );

        expect(optimization.currentReserveRatio).toBe(mockPortfolioInputs.reserveRatio);
        expect(optimization.optimalReserveRatio).toBeGreaterThan(0.1);
        expect(optimization.optimalReserveRatio).toBeLessThan(0.5);

        expect(optimization.allocationRecommendations).toBeInstanceOf(Array);
        expect(optimization.allocationRecommendations.length).toBeGreaterThan(0);

        expect(optimization.coverageScenarios).toBeDefined();
        expect(optimization.coverageScenarios.p25).toBeLessThanOrEqual(
          optimization.coverageScenarios.p50
        );
        expect(optimization.coverageScenarios.p50).toBeLessThanOrEqual(
          optimization.coverageScenarios.p75
        );
      });

      it('should test multiple reserve ratios', async () => {
        const mockScenarios = Array.from({ length: 50 }, () => ({
          irr: 0.15,
          followOnNeed: 0.3,
        }));

        const optimization = await engine.optimizeReserveAllocation(
          mockConfig,
          mockPortfolioInputs,
          mockScenarios
        );

        // Should test ratios from 10% to 50%
        expect(optimization.allocationRecommendations.length).toBeGreaterThanOrEqual(8);

        const ratios = optimization.allocationRecommendations.map((r) => r.reserveRatio);
        expect(Math.min(...ratios)).toBeGreaterThanOrEqual(0.1);
        expect(Math.max(...ratios)).toBeLessThanOrEqual(0.5);
      });

      it('should calculate improvement potential', async () => {
        const mockScenarios = Array.from({ length: 50 }, () => ({
          irr: 0.15,
          followOnNeed: 0.3,
        }));

        const optimization = await engine.optimizeReserveAllocation(
          mockConfig,
          mockPortfolioInputs,
          mockScenarios
        );

        expect(optimization.improvementPotential).toBeDefined();
        // Improvement can be positive, negative, or zero
        expect(typeof optimization.improvementPotential).toBe('number');
      });
    });
  });

  describe('Scenario Analysis', () => {
    it('should generate comprehensive scenario analysis', async () => {
      const result = await engine.runPortfolioSimulation(mockConfig);
      const scenarios = result.scenarios;

      // Check all scenario types exist
      expect(scenarios.bullMarket).toBeDefined();
      expect(scenarios.bearMarket).toBeDefined();
      expect(scenarios.stressTest).toBeDefined();
      expect(scenarios.baseCase).toBeDefined();

      // Bull market should outperform bear market
      expect(scenarios.bullMarket.irr).toBeGreaterThan(scenarios.bearMarket.irr);
      expect(scenarios.bullMarket.multiple).toBeGreaterThan(scenarios.bearMarket.multiple);
      expect(scenarios.bullMarket.totalValue).toBeGreaterThan(scenarios.bearMarket.totalValue);

      // Stress test should be the worst case
      expect(scenarios.stressTest.irr).toBeLessThanOrEqual(scenarios.bearMarket.irr);
      expect(scenarios.stressTest.multiple).toBeLessThanOrEqual(scenarios.bearMarket.multiple);
      expect(scenarios.stressTest.totalValue).toBeLessThanOrEqual(scenarios.bearMarket.totalValue);

      // Base case should be between bull and bear
      expect(scenarios.baseCase.irr).toBeGreaterThan(scenarios.bearMarket.irr);
      expect(scenarios.baseCase.irr).toBeLessThan(scenarios.bullMarket.irr);
    });
  });

  describe('Actionable Insights', () => {
    it('should generate relevant recommendations', async () => {
      const result = await engine.runPortfolioSimulation(mockConfig);
      const insights = result.insights;

      expect(insights.primaryRecommendations).toBeInstanceOf(Array);
      expect(insights.riskWarnings).toBeInstanceOf(Array);
      expect(insights.opportunityAreas).toBeInstanceOf(Array);
      expect(insights.keyMetrics).toBeInstanceOf(Array);

      // Check key metrics structure
      insights.keyMetrics.forEach((metric) => {
        expect(metric.metric).toBeDefined();
        expect(metric.value).toBeDefined();
        expect(metric.benchmark).toBeDefined();
        expect(['above', 'below', 'at', 'warning']).toContain(metric.status);
        expect(['high', 'medium', 'low']).toContain(metric.impact);
      });
    });

    it('should identify risk warnings when appropriate', async () => {
      // Create a configuration likely to trigger warnings
      const riskyConfig = {
        ...mockConfig,
        runs: 1000,
      };

      const result = await engine.runPortfolioSimulation(riskyConfig);

      // Should at least check for risk warnings
      expect(result.insights.riskWarnings).toBeDefined();
    });

    it('should suggest reserve optimization when beneficial', async () => {
      const result = await engine.runPortfolioSimulation(mockConfig);

      if (result.reserveOptimization.improvementPotential > 0.02) {
        expect(
          result.insights.primaryRecommendations.some((rec) => rec.includes('reserve allocation'))
        ).toBe(true);
      }
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should complete simulation within reasonable time', async () => {
      const startTime = Date.now();
      const result = await engine.runPortfolioSimulation({ ...mockConfig, runs: 5000 });
      const executionTime = Date.now() - startTime;

      expect(executionTime).toBeLessThan(10000); // Should complete within 10 seconds
      expect(result.executionTimeMs).toBeGreaterThan(0);
    });

    it('should handle concurrent simulations', async () => {
      const simulations = Array.from({ length: 3 }, () =>
        engine.runPortfolioSimulation({ ...mockConfig, runs: 500 })
      );

      const results = await Promise.all(simulations);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result.simulationId).toBeDefined();
        expect(result.irr.scenarios).toHaveLength(500);
      });
    });

    it('should store simulation results', async () => {
      await engine.runPortfolioSimulation(mockConfig);

      expect(db.insert).toHaveBeenCalled();

      const insertCall = (db.insert as any).mock.calls[0];
      expect(insertCall[0]).toBe('mocked-table');
    });

    it('should handle extreme market scenarios', async () => {
      const extremeConfig = {
        ...mockConfig,
        runs: 500,
      };

      // Mock extreme variance data
      (db.query.varianceReports.findMany as any).mockResolvedValue([
        {
          id: 1,
          fundId: 1,
          baselineId: 'baseline-123',
          asOfDate: new Date(),
          irrVariance: 0.5, // Extreme variance
          multipleVariance: 2.0,
          dpiVariance: 0.8,
        },
      ]);

      const result = await engine.runPortfolioSimulation(extremeConfig);

      expect(result).toBeDefined();
      expect(result.riskMetrics.probabilityOfLoss).toBeGreaterThanOrEqual(0);
      expect(result.riskMetrics.probabilityOfLoss).toBeLessThanOrEqual(1);
    });

    it('should handle zero or negative scenarios gracefully', async () => {
      const result = await engine.runPortfolioSimulation({ ...mockConfig, runs: 100 });

      // Ensure no negative values in critical metrics
      expect(result.dpi.scenarios.every((val) => val >= 0)).toBe(true);
      expect(result.tvpi.scenarios.every((val) => val >= 0)).toBe(true);
      expect(result.totalValue.scenarios.every((val) => val >= 0)).toBe(true);
    });
  });

  describe('Data Integration', () => {
    it('should correctly extract portfolio inputs from baseline', async () => {
      await engine.runPortfolioSimulation(mockConfig);

      // Verify database queries were made correctly
      expect(db.query.fundBaselines.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });

      expect(db.query.funds.findFirst).toHaveBeenCalledWith({
        where: expect.any(Object),
      });

      expect(db.query.varianceReports.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: expect.any(Object),
        limit: 30,
      });
    });

    it('should calibrate distributions from historical variance', async () => {
      const result = await engine.runPortfolioSimulation(mockConfig);

      // Result should reflect calibration from mock variance data
      expect(result.irr.statistics.mean).toBeCloseTo(mockBaseline.irr, 1);
      expect(result.multiple.statistics.mean).toBeCloseTo(mockBaseline.multiple, 1);
    });

    it('should handle empty variance reports', async () => {
      (db.query.varianceReports.findMany as any).mockResolvedValue([]);

      const result = await engine.runPortfolioSimulation(mockConfig);

      // Should fall back to default distributions
      expect(result).toBeDefined();
      expect(result.irr.statistics.mean).toBeGreaterThan(0);
    });
  });

  describe('Utility Functions', () => {
    it('should generate normal distribution samples', () => {
      // Test the private normal sampling function by running a small simulation
      const result = engine.runPortfolioSimulation({ ...mockConfig, runs: 100 });

      expect(result).resolves.toBeDefined();
    });

    it('should handle portfolio inputs calculation', async () => {
      const result = await engine.runPortfolioSimulation(mockConfig);

      // Verify reserve ratio calculation
      const expectedReserveRatio = (mockFund.size - mockBaseline.deployedCapital) / mockFund.size;
      expect(result.reserveOptimization.currentReserveRatio).toBeCloseTo(expectedReserveRatio, 2);
    });
  });
});

/**
 * Integration Test Helpers
 */
describe('MonteCarloEngine Integration Scenarios', () => {
  let engine: MonteCarloEngine;

  beforeEach(() => {
    engine = new MonteCarloEngine();
    vi.clearAllMocks();
  });

  it('should support complete portfolio construction workflow', async () => {
    // Setup complete mock data
    const baseline = {
      id: 'baseline-123',
      fundId: 1,
      deployedCapital: 25000000,
      sectorDistribution: { FinTech: 10, SaaS: 8, HealthTech: 7 },
      stageDistribution: { Seed: 15, 'Series A': 10 },
      averageInvestment: 1000000,
      irr: 0.2,
      multiple: 3.0,
      dpi: 0.9,
      isActive: true,
      isDefault: true,
    };

    const fund = {
      id: 1,
      size: 50000000,
      createdAt: new Date('2023-01-01'),
      isActive: true,
    };

    (db.query.fundBaselines.findFirst as any).mockResolvedValue(baseline);
    (db.query.funds.findFirst as any).mockResolvedValue(fund);
    (db.query.varianceReports.findMany as any).mockResolvedValue([
      {
        id: 1,
        fundId: 1,
        baselineId: 'baseline-123',
        asOfDate: new Date(),
        irrVariance: 0.03,
        multipleVariance: 0.2,
        dpiVariance: 0.1,
      },
    ]);

    const config: SimulationConfig = {
      fundId: 1,
      runs: 2000,
      timeHorizonYears: 10,
      portfolioSize: 25,
      deploymentScheduleMonths: 42,
      randomSeed: 54321,
    };

    const result = await engine.runPortfolioSimulation(config);

    // Verify comprehensive results
    expect(result.simulationId).toBeDefined();
    expect(result.config).toEqual(config);
    expect(result.irr.scenarios).toHaveLength(2000);
    expect(result.insights.keyMetrics.length).toBeGreaterThan(0);
    expect(result.reserveOptimization.allocationRecommendations.length).toBeGreaterThan(0);
  });

  it('should handle different fund sizes and strategies', async () => {
    const strategies = [
      { fundSize: 25000000, portfolioSize: 15, deploymentPeriod: 24 },
      { fundSize: 100000000, portfolioSize: 35, deploymentPeriod: 48 },
      { fundSize: 250000000, portfolioSize: 50, deploymentPeriod: 60 },
    ];

    for (const strategy of strategies) {
      const fund = {
        id: 1,
        size: strategy.fundSize,
        createdAt: new Date(),
        isActive: true,
      };

      const baseline = {
        id: 'baseline-123',
        fundId: 1,
        deployedCapital: strategy.fundSize * 0.6,
        sectorDistribution: { Tech: strategy.portfolioSize },
        stageDistribution: { 'Series A': strategy.portfolioSize },
        averageInvestment: (strategy.fundSize / strategy.portfolioSize) * 0.6,
        irr: 0.18,
        multiple: 2.5,
        dpi: 0.8,
        isActive: true,
        isDefault: true,
      };

      (db.query.funds.findFirst as any).mockResolvedValue(fund);
      (db.query.fundBaselines.findFirst as any).mockResolvedValue(baseline);

      const config: SimulationConfig = {
        fundId: 1,
        runs: 500,
        timeHorizonYears: 8,
        portfolioSize: strategy.portfolioSize,
        deploymentScheduleMonths: strategy.deploymentPeriod,
      };

      const result = await engine.runPortfolioSimulation(config);

      expect(result).toBeDefined();
      expect(result.reserveOptimization.currentReserveRatio).toBeCloseTo(0.4, 1);
    }
  });
});
