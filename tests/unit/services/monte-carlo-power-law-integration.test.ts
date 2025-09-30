/**
 * Monte Carlo Power Law Integration Tests
 *
 * Comprehensive tests for the integration of power law distribution
 * with the Monte Carlo simulation engine, validating realistic VC
 * return characteristics and Series A Chasm modeling.
 */

import { describe, it, expect, beforeEach, vi, beforeAll, afterAll } from 'vitest';
import {
  MonteCarloSimulationService,
  type SimulationParameters
} from '../../../server/services/monte-carlo-simulation';



// Mock database dependencies - use factory functions to avoid hoisting issues
vi.mock('../../../server/db', () => ({
  db: {
    query: {
      fundBaselines: {
        findFirst: vi.fn()
      },
      varianceReports: {
        findMany: vi.fn()
      },
      portfolioCompanies: {
        findMany: vi.fn()
      },
      funds: {
        findFirst: vi.fn()
      }
    },
    insert: vi.fn()
  }
}));

vi.mock('@shared/schema', () => ({
  fundBaselines: {},
  varianceReports: {},
  funds: {},
  portfolioCompanies: {},
  fundSnapshots: {},
  eq: vi.fn(),
  and: vi.fn(),
  desc: vi.fn()
}));

describe('Monte Carlo Power Law Integration', () => {
  let monteCarloService: MonteCarloSimulationService;
  const testSeed = 12345;

  beforeAll(async () => {
    // Mock database responses
    const { db } = await import('../../../server/db');

    // Mock fund baseline
    db.query.fundBaselines.findFirst.mockResolvedValue({
      id: 'baseline-1',
      fundId: 1,
      totalValue: 100000000,
      irr: 0.15,
      multiple: 2.0,
      dpi: 0.5,
      tvpi: 1.5,
      deployedCapital: 50000000,
      isDefault: true,
      isActive: true
    });

    // Mock variance reports (empty for clean testing)
    db.query.varianceReports.findMany.mockResolvedValue([]);

    // Mock portfolio companies with mixed stages
    db.query.portfolioCompanies.findMany.mockResolvedValue([
      { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
      { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' },
      { id: 3, fundId: 1, stage: 'series-a', sector: 'fintech' },
      { id: 4, fundId: 1, stage: 'series-b', sector: 'enterprise' },
      { id: 5, fundId: 1, stage: 'seed', sector: 'consumer' },
      { id: 6, fundId: 1, stage: 'seed', sector: 'enterprise' }
    ]);

    // Mock fund size
    db.query.funds.findFirst.mockResolvedValue({
      id: 1,
      size: 100000000
    });

    // Mock insert for snapshots
    db.insert.mockResolvedValue({ insertId: 1 });
  });

  beforeEach(() => {
    monteCarloService = new MonteCarloSimulationService();
  });

  afterAll(() => {
    vi.clearAllMocks();
  });

  describe('Power Law Distribution Integration', () => {
    it('should integrate power law distribution for return multiples', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 1000,
        timeHorizonYears: 5,
        confidenceIntervals: [10, 25, 50, 75, 90, 95],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      expect(forecast).toBeDefined();
      expect(forecast.multiple).toBeDefined();
      expect(forecast.multiple.scenarios).toHaveLength(1000);

      // Check that results show power law characteristics
      expect(forecast.multiple.statistics.skewness).toBeGreaterThan(1); // Highly skewed
      expect(forecast.multiple.statistics.median).toBeLessThan(forecast.multiple.statistics.mean); // Right-skewed
    });

    it('should maintain backward compatibility with existing interface', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 100,
        timeHorizonYears: 7,
        confidenceIntervals: [5, 50, 95]
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Verify all expected properties exist
      expect(forecast.fundId).toBe(1);
      expect(forecast.parameters).toEqual(params);
      expect(forecast.totalValue).toBeDefined();
      expect(forecast.irr).toBeDefined();
      expect(forecast.multiple).toBeDefined();
      expect(forecast.dpi).toBeDefined();
      expect(forecast.tvpi).toBeDefined();
      expect(forecast.portfolioMetrics).toBeDefined();
      expect(forecast.reserveOptimization).toBeDefined();
      expect(forecast.riskMetrics).toBeDefined();
      expect(forecast.scenarioAnalysis).toBeDefined();
    });

    it('should not apply time decay to variance', async () => {
      const shortHorizon: SimulationParameters = {
        fundId: 1,
        scenarios: 500,
        timeHorizonYears: 3,
        randomSeed: testSeed
      };

      const longHorizon: SimulationParameters = {
        fundId: 1,
        scenarios: 500,
        timeHorizonYears: 10,
        randomSeed: testSeed
      };

      const shortForecast = await monteCarloService.generateForecast(shortHorizon);
      const longForecast = await monteCarloService.generateForecast(longHorizon);

      // Multiple variance should not be dampened by time horizon
      const shortVariance = shortForecast.multiple.standardDeviation;
      const longVariance = longForecast.multiple.standardDeviation;

      // Variance should be similar (no significant time decay)
      const varianceRatio = longVariance / shortVariance;
      expect(varianceRatio).toBeGreaterThan(0.7); // Allow some variation but no major dampening
      expect(varianceRatio).toBeLessThan(1.5);
    });
  });

  describe('70% Failure Rate Validation', () => {
    it('should show approximately 70% failure rate for seed investments', async () => {
      // Mock portfolio with only seed companies
      const { db } = require('../../../server/db');
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
        { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' },
        { id: 3, fundId: 1, stage: 'seed', sector: 'enterprise' },
        { id: 4, fundId: 1, stage: 'seed', sector: 'consumer' },
        { id: 5, fundId: 1, stage: 'seed', sector: 'fintech' }
      ]);

      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 5000, // Large sample for statistical accuracy
        timeHorizonYears: 5,
        confidenceIntervals: [10, 50, 90],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Count failures (returns ≤ 1x)
      const failures = forecast.multiple.scenarios.filter(multiple => multiple <= 1.0);
      const failureRate = failures.length / forecast.multiple.scenarios.length;

      // Should be approximately 70% ± 5% tolerance for statistical variation
      expect(failureRate).toBeGreaterThan(0.65);
      expect(failureRate).toBeLessThan(0.75);
      expect(failureRate).toBeCloseTo(0.70, 1);
    });

    it('should show different failure rates by stage', async () => {
      // Test seed vs series-a failure rates
      const seedParams: SimulationParameters = {
        fundId: 1,
        scenarios: 2000,
        timeHorizonYears: 5,
        confidenceIntervals: [50],
        randomSeed: testSeed
      };

      // Mock seed-only portfolio
      const { db } = await import('../../../server/db');
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
        { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' }
      ]);

      const seedForecast = await monteCarloService.generateForecast(seedParams);
      const seedFailureRate = seedForecast.multiple.scenarios.filter(m => m <= 1.0).length / seedForecast.multiple.scenarios.length;

      // Mock series-a portfolio
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        { id: 3, fundId: 1, stage: 'series-a', sector: 'fintech' },
        { id: 4, fundId: 1, stage: 'series-a', sector: 'healthtech' }
      ]);

      const seriesAForecast = await monteCarloService.generateForecast(seedParams);
      const seriesAFailureRate = seriesAForecast.multiple.scenarios.filter(m => m <= 1.0).length / seriesAForecast.multiple.scenarios.length;

      // Series A should have lower failure rate than seed (Series A Chasm effect)
      expect(seriesAFailureRate).toBeLessThan(seedFailureRate);
      expect(seedFailureRate).toBeCloseTo(0.70, 1);
      expect(seriesAFailureRate).toBeCloseTo(0.50, 1);
    });
  });

  describe('Extreme Outliers Validation', () => {
    it('should show extreme outliers (>50x) in approximately 1% of simulations', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 10000, // Large sample for outlier detection
        timeHorizonYears: 5,
        confidenceIntervals: [99],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Count extreme outliers (>50x returns)
      const extremeOutliers = forecast.multiple.scenarios.filter(multiple => multiple > 50);
      const outlierRate = extremeOutliers.length / forecast.multiple.scenarios.length;

      // Should be approximately 1% ± 0.5% tolerance
      expect(outlierRate).toBeGreaterThan(0.005); // 0.5%
      expect(outlierRate).toBeLessThan(0.02);     // 2%
      expect(outlierRate).toBeCloseTo(0.01, 1);   // ~1%
    });

    it('should cap unicorns at reasonable levels', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 10000,
        timeHorizonYears: 5,
        confidenceIntervals: [95, 99],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Check maximum return is reasonable (should be capped around 200x)
      expect(forecast.multiple.max).toBeLessThan(250); // Allow some variance above 200x cap
      expect(forecast.multiple.percentiles[99]).toBeLessThan(200);
    });

    it('should show power law tail behavior', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 5000,
        timeHorizonYears: 5,
        confidenceIntervals: [50, 75, 90, 95, 99],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Power law should show dramatic increases in higher percentiles
      const p50 = forecast.multiple.percentiles[50];
      const p90 = forecast.multiple.percentiles[90];
      const p99 = forecast.multiple.percentiles[99];

      // 90th percentile should be much higher than median
      expect(p90).toBeGreaterThan(p50 * 3);

      // 99th percentile should be much higher than 90th
      expect(p99).toBeGreaterThan(p90 * 2);

      // Distribution should be highly skewed
      expect(forecast.multiple.statistics.skewness).toBeGreaterThan(2);
    });
  });

  describe('Series A Chasm Validation', () => {
    it('should properly reflect Series A Chasm graduation rates', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 3000,
        timeHorizonYears: 5,
        confidenceIntervals: [50, 90],
        randomSeed: testSeed
      };

      // Mock mixed portfolio reflecting typical progression
      const { db } = require('../../../server/db');
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        // More seed companies (typical early portfolio)
        { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
        { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' },
        { id: 3, fundId: 1, stage: 'seed', sector: 'enterprise' },
        { id: 4, fundId: 1, stage: 'seed', sector: 'consumer' },
        { id: 5, fundId: 1, stage: 'seed', sector: 'fintech' },
        { id: 6, fundId: 1, stage: 'seed', sector: 'healthtech' },
        // Fewer series-a (reflecting graduation difficulty)
        { id: 7, fundId: 1, stage: 'series-a', sector: 'fintech' },
        { id: 8, fundId: 1, stage: 'series-a', sector: 'enterprise' },
        // Even fewer later stages
        { id: 9, fundId: 1, stage: 'series-b', sector: 'fintech' },
        { id: 10, fundId: 1, stage: 'series-c+', sector: 'enterprise' }
      ]);

      const forecast = await monteCarloService.generateForecast(params);

      // Analyze stage-specific performance from portfolio metrics
      const stagePerformance = forecast.portfolioMetrics.stagePerformance;

      if (stagePerformance.seed && stagePerformance['series-a']) {
        // Series A should show better performance than seed (survival bias)
        expect(stagePerformance['series-a'].mean).toBeGreaterThan(stagePerformance.seed.mean);

        // But seed should show higher variance (more uncertainty)
        expect(stagePerformance.seed.standardDeviation).toBeGreaterThan(stagePerformance['series-a'].standardDeviation);
      }

      // Portfolio should show realistic mixed returns
      const medianReturn = forecast.multiple.percentiles[50];
      const meanReturn = forecast.multiple.mean;

      // Median should be below mean (right-skewed)
      expect(medianReturn).toBeLessThan(meanReturn);

      // Mean return should be reasonable for VC (1.5x - 4x range)
      expect(meanReturn).toBeGreaterThan(1.2);
      expect(meanReturn).toBeLessThan(5.0);
    });

    it('should show increasing unicorn rates in later stages', async () => {
      const scenarios = 2000;
      const params: SimulationParameters = {
        fundId: 1,
        scenarios,
        timeHorizonYears: 5,
        confidenceIntervals: [95, 99],
        randomSeed: testSeed
      };

      // Test seed-only portfolio
      const { db } = require('../../../server/db');
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        { id: 1, fundId: 1, stage: 'seed', sector: 'fintech' },
        { id: 2, fundId: 1, stage: 'seed', sector: 'healthtech' }
      ]);

      const seedForecast = await monteCarloService.generateForecast(params);
      const seedUnicornRate = seedForecast.multiple.scenarios.filter(m => m > 50).length / scenarios;

      // Test series-b portfolio
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([
        { id: 3, fundId: 1, stage: 'series-b', sector: 'fintech' },
        { id: 4, fundId: 1, stage: 'series-b', sector: 'healthtech' }
      ]);

      const seriesBForecast = await monteCarloService.generateForecast(params);
      const seriesBUnicornRate = seriesBForecast.multiple.scenarios.filter(m => m > 50).length / scenarios;

      // Later stages should have higher unicorn rates (companies that survived have higher potential)
      expect(seriesBUnicornRate).toBeGreaterThan(seedUnicornRate);
    });
  });

  describe('Performance and Consistency', () => {
    it('should generate large simulations efficiently', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 25000, // Large simulation
        timeHorizonYears: 5,
        confidenceIntervals: [50, 90],
        randomSeed: testSeed
      };

      const startTime = Date.now();
      const forecast = await monteCarloService.generateForecast(params);
      const endTime = Date.now();

      expect(forecast.multiple.scenarios).toHaveLength(25000);
      expect(endTime - startTime).toBeLessThan(10000); // Should complete within 10 seconds
    });

    it('should produce reproducible results with same seed', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 1000,
        timeHorizonYears: 5,
        confidenceIntervals: [50, 90],
        randomSeed: testSeed
      };

      const forecast1 = await monteCarloService.generateForecast(params);
      const forecast2 = await monteCarloService.generateForecast(params);

      // Results should be identical with same seed
      expect(forecast1.multiple.mean).toBe(forecast2.multiple.mean);
      expect(forecast1.multiple.median).toBe(forecast2.multiple.median);
      expect(forecast1.multiple.standardDeviation).toBe(forecast2.multiple.standardDeviation);
    });

    it('should handle empty portfolio gracefully', async () => {
      const { db } = require('../../../server/db');
      db.query.portfolioCompanies.findMany.mockResolvedValueOnce([]);

      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 100,
        timeHorizonYears: 5,
        confidenceIntervals: [50],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Should default to seed stage and still produce valid results
      expect(forecast.multiple.scenarios).toHaveLength(100);
      expect(forecast.multiple.mean).toBeGreaterThan(0);
    });
  });

  describe('Risk Metrics Integration', () => {
    it('should calculate realistic risk metrics with power law returns', async () => {
      const params: SimulationParameters = {
        fundId: 1,
        scenarios: 5000,
        timeHorizonYears: 5,
        confidenceIntervals: [5, 10, 25, 50, 75, 90, 95],
        randomSeed: testSeed
      };

      const forecast = await monteCarloService.generateForecast(params);

      // Check Value at Risk metrics
      expect(forecast.riskMetrics.valueAtRisk[5]).toBeDefined();
      expect(forecast.riskMetrics.valueAtRisk[10]).toBeDefined();
      expect(forecast.riskMetrics.valueAtRisk[25]).toBeDefined();

      // VaR should increase with confidence level
      expect(forecast.riskMetrics.valueAtRisk[5]).toBeLessThan(forecast.riskMetrics.valueAtRisk[10]);
      expect(forecast.riskMetrics.valueAtRisk[10]).toBeLessThan(forecast.riskMetrics.valueAtRisk[25]);

      // Expected Shortfall should be calculated
      expect(forecast.riskMetrics.expectedShortfall[5]).toBeDefined();
      expect(forecast.riskMetrics.expectedShortfall[10]).toBeDefined();
      expect(forecast.riskMetrics.expectedShortfall[25]).toBeDefined();

      // Probability of loss should be realistic for VC
      expect(forecast.riskMetrics.probabilityOfLoss).toBeGreaterThan(0.3); // High risk
      expect(forecast.riskMetrics.probabilityOfLoss).toBeLessThan(0.8);

      // Downside deviation should be positive
      expect(forecast.riskMetrics.downsideviation).toBeGreaterThan(0);
    });
  });
});