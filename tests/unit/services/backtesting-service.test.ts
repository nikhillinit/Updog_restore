/**
 * Backtesting Service Unit Tests
 *
 * Tests for Monte Carlo simulation backtesting and validation.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const { mockDb } = vi.hoisted(() => {
  const mockDb = {
    query: {
      backtestResults: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      fundBaselines: {
        findFirst: vi.fn(),
      },
      fundStateSnapshots: {
        findFirst: vi.fn(),
      },
      varianceReports: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn().mockReturnValue({
      values: vi.fn(),
    }),
  };
  return { mockDb };
});

vi.mock('../../../server/db', () => ({
  db: mockDb,
}));

// Mock the unified monte carlo service
vi.mock('../../../server/services/monte-carlo-service-unified', () => ({
  unifiedMonteCarloService: {
    runSimulation: vi.fn().mockResolvedValue({
      simulationId: 'sim-123',
      config: { runs: 10000 },
      executionTimeMs: 1500,
      irr: {
        statistics: { mean: 0.18, standardDeviation: 0.08, min: -0.1, max: 0.5 },
        percentiles: { p5: 0.05, p25: 0.12, p50: 0.18, p75: 0.25, p95: 0.35 },
        scenarios: [],
        confidenceIntervals: { ci68: [0.1, 0.26], ci95: [0.02, 0.34] },
      },
      tvpi: {
        statistics: { mean: 2.2, standardDeviation: 0.5, min: 0.5, max: 4.0 },
        percentiles: { p5: 1.2, p25: 1.8, p50: 2.2, p75: 2.8, p95: 3.5 },
        scenarios: [],
        confidenceIntervals: { ci68: [1.7, 2.7], ci95: [1.2, 3.2] },
      },
      dpi: {
        statistics: { mean: 1.0, standardDeviation: 0.3, min: 0.0, max: 2.5 },
        percentiles: { p5: 0.3, p25: 0.7, p50: 1.0, p75: 1.3, p95: 1.8 },
        scenarios: [],
        confidenceIntervals: { ci68: [0.7, 1.3], ci95: [0.4, 1.6] },
      },
      multiple: {
        statistics: { mean: 2.0, standardDeviation: 0.4, min: 0.8, max: 3.5 },
        percentiles: { p5: 1.3, p25: 1.7, p50: 2.0, p75: 2.3, p95: 2.7 },
        scenarios: [],
        confidenceIntervals: { ci68: [1.6, 2.4], ci95: [1.2, 2.8] },
      },
      totalValue: {
        statistics: { mean: 100000000, standardDeviation: 20000000, min: 50000000, max: 200000000 },
        percentiles: {
          p5: 65000000,
          p25: 85000000,
          p50: 100000000,
          p75: 115000000,
          p95: 135000000,
        },
        scenarios: [],
        confidenceIntervals: { ci68: [80000000, 120000000], ci95: [60000000, 140000000] },
      },
      riskMetrics: { valueAtRisk: { var5: 0.05, var10: 0.08 } },
      reserveOptimization: {},
      scenarios: {},
      insights: {},
      performance: {
        engineUsed: 'streaming' as const,
        executionTimeMs: 1500,
        memoryUsageMB: 256,
        scenariosPerSecond: 6666,
        connectionPoolStats: null,
        fallbackTriggered: false,
        selectionReason: 'auto',
      },
    }),
    healthCheck: vi.fn().mockResolvedValue({ status: 'healthy' }),
  },
}));

import { BacktestingService } from '../../../server/services/backtesting-service';
import { unifiedMonteCarloService } from '../../../server/services/monte-carlo-service-unified';
import type { BacktestConfig } from '@shared/types/backtesting';
import { db } from '../../../server/db';

const mockSimulationResult = {
  simulationId: 'sim-123',
  config: { runs: 10000 },
  executionTimeMs: 1500,
  irr: {
    statistics: { mean: 0.18, standardDeviation: 0.08, min: -0.1, max: 0.5 },
    percentiles: { p5: 0.05, p25: 0.12, p50: 0.18, p75: 0.25, p95: 0.35 },
    scenarios: [],
    confidenceIntervals: { ci68: [0.1, 0.26], ci95: [0.02, 0.34] },
  },
  tvpi: {
    statistics: { mean: 2.2, standardDeviation: 0.5, min: 0.5, max: 4.0 },
    percentiles: { p5: 1.2, p25: 1.8, p50: 2.2, p75: 2.8, p95: 3.5 },
    scenarios: [],
    confidenceIntervals: { ci68: [1.7, 2.7], ci95: [1.2, 3.2] },
  },
  dpi: {
    statistics: { mean: 1.0, standardDeviation: 0.3, min: 0.0, max: 2.5 },
    percentiles: { p5: 0.3, p25: 0.7, p50: 1.0, p75: 1.3, p95: 1.8 },
    scenarios: [],
    confidenceIntervals: { ci68: [0.7, 1.3], ci95: [0.4, 1.6] },
  },
  multiple: {
    statistics: { mean: 2.0, standardDeviation: 0.4, min: 0.8, max: 3.5 },
    percentiles: { p5: 1.3, p25: 1.7, p50: 2.0, p75: 2.3, p95: 2.7 },
    scenarios: [],
    confidenceIntervals: { ci68: [1.6, 2.4], ci95: [1.2, 2.8] },
  },
  totalValue: {
    statistics: { mean: 100000000, standardDeviation: 20000000, min: 50000000, max: 200000000 },
    percentiles: {
      p5: 65000000,
      p25: 85000000,
      p50: 100000000,
      p75: 115000000,
      p95: 135000000,
    },
    scenarios: [],
    confidenceIntervals: { ci68: [80000000, 120000000], ci95: [60000000, 140000000] },
  },
  riskMetrics: { valueAtRisk: { var5: 0.05, var10: 0.08 } },
  reserveOptimization: {},
  scenarios: {},
  insights: {},
  performance: {
    engineUsed: 'streaming' as const,
    executionTimeMs: 1500,
    memoryUsageMB: 256,
    scenariosPerSecond: 6666,
    connectionPoolStats: null,
    fallbackTriggered: false,
    selectionReason: 'auto',
  },
};

describe('BacktestingService', () => {
  let service: BacktestingService;

  beforeEach(() => {
    service = new BacktestingService();
    // Reset mocks before each test
    vi.clearAllMocks();
    // Restore default mock implementations
    mockDb.query.backtestResults.findMany.mockResolvedValue([]);
    mockDb.query.backtestResults.findFirst.mockResolvedValue(null);
    mockDb.query.fundBaselines.findFirst.mockResolvedValue(null);
    mockDb.query.fundStateSnapshots.findFirst.mockResolvedValue(null);
    mockDb.query.varianceReports.findMany.mockResolvedValue([]);
    mockDb.query.varianceReports.findFirst.mockResolvedValue(null);
    mockDb.insert.mockReturnValue({ values: vi.fn().mockResolvedValue([]) });
    // Ensure simulation returns proper result
    vi.mocked(unifiedMonteCarloService.runSimulation).mockResolvedValue(mockSimulationResult);
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('runBacktest', () => {
    const baseConfig: BacktestConfig = {
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
      simulationRuns: 10000,
      comparisonMetrics: ['irr', 'tvpi', 'dpi'],
    };

    it('runs a backtest and returns validation metrics', async () => {
      const result = await service.runBacktest(baseConfig);

      expect(result.backtestId).toBeDefined();
      expect(result.backtestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
      );
      expect(result.config).toEqual(baseConfig);
      expect(result.simulationSummary).toBeDefined();
      expect(result.validationMetrics).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('calculates simulation summary from MC results', async () => {
      const result = await service.runBacktest(baseConfig);

      expect(result.simulationSummary.runs).toBe(10000);
      expect(result.simulationSummary.engineUsed).toBe('streaming');
      expect(result.simulationSummary.metrics.irr).toBeDefined();
      expect(result.simulationSummary.metrics.irr?.mean).toBe(0.18);
      expect(result.simulationSummary.metrics.irr?.median).toBe(0.18);
      expect(result.simulationSummary.metrics.irr?.p5).toBe(0.05);
      expect(result.simulationSummary.metrics.irr?.p95).toBe(0.35);
    });

    it('handles missing actual performance gracefully', async () => {
      const result = await service.runBacktest(baseConfig);

      // Should have data quality warnings when no baseline found
      expect(result.dataQuality.hasBaseline).toBe(false);
      expect(result.dataQuality.warnings.length).toBeGreaterThan(0);
      expect(result.dataQuality.overallQuality).toBe('poor');
    });

    it('includes scenario comparisons when requested', async () => {
      const configWithScenarios: BacktestConfig = {
        ...baseConfig,
        simulationRuns: 5000,
        comparisonMetrics: ['irr', 'tvpi'],
        includeHistoricalScenarios: true,
        historicalScenarios: ['financial_crisis_2008', 'covid_2020'],
      };

      const result = await service.runBacktest(configWithScenarios);

      expect(result.scenarioComparisons).toBeDefined();
      expect(result.scenarioComparisons?.length).toBe(2);
      expect(
        result.scenarioComparisons?.find((s) => s.scenario === 'financial_crisis_2008')
      ).toBeDefined();
      expect(result.scenarioComparisons?.find((s) => s.scenario === 'covid_2020')).toBeDefined();
    });

    it('generates recommendations based on validation', async () => {
      const result = await service.runBacktest(baseConfig);

      expect(result.recommendations).toBeInstanceOf(Array);
      expect(result.recommendations.length).toBeGreaterThan(0);
      // Should have data quality recommendation since no baseline
      expect(
        result.recommendations.some(
          (r) => r.includes('baseline') || r.includes('data') || r.includes('quality')
        )
      ).toBe(true);
    });

    it('persists result to database', async () => {
      await service.runBacktest(baseConfig);

      expect(db.insert).toHaveBeenCalled();
    });
  });

  describe('validation metrics calculation', () => {
    it('calculates percentile hit rates correctly', async () => {
      // Mock baseline with actual performance data
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-123',
        fundId: 1,
        name: 'Q4 2023',
        baselineType: 'quarterly',
        irr: '0.17', // Within p25-p75 range (0.12-0.25)
        tvpi: '2.0', // Within p25-p75 range (1.8-2.8)
        dpi: '0.8', // Within p25-p75 range (0.7-1.3)
        multiple: null,
        totalValue: '90000000',
        deployedCapital: '50000000',
        createdAt: new Date(),
        isActive: true,
      } as never);

      const result = await service.runBacktest({
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        simulationRuns: 10000,
        comparisonMetrics: ['irr', 'tvpi', 'dpi'],
      });

      // With actual IRR of 0.17, should be within 50% CI (p25=0.12, p75=0.25)
      expect(result.validationMetrics.percentileHitRates.p50.irr).toBe(true);
      // Should also be within 90% CI (p5=0.05, p95=0.35)
      expect(result.validationMetrics.percentileHitRates.p90.irr).toBe(true);
      // Should be within full range (min=-0.1, max=0.5)
      expect(result.validationMetrics.percentileHitRates.p100.irr).toBe(true);
    });

    it('marks incalculable metrics when actual data is null', async () => {
      // Mock baseline with partial data
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-123',
        fundId: 1,
        name: 'Q4 2023',
        baselineType: 'quarterly',
        irr: '0.17',
        tvpi: null, // Missing
        dpi: null, // Missing
        multiple: null,
        totalValue: '90000000',
        deployedCapital: '50000000',
        createdAt: new Date(),
        isActive: true,
      } as never);

      const result = await service.runBacktest({
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        simulationRuns: 10000,
        comparisonMetrics: ['irr', 'tvpi', 'dpi'],
      });

      expect(result.validationMetrics.incalculableMetrics).toContain('tvpi');
      expect(result.validationMetrics.incalculableMetrics).toContain('dpi');
      expect(result.validationMetrics.percentileHitRates.p50.tvpi).toBeNull();
      expect(result.validationMetrics.percentileHitRates.p50.dpi).toBeNull();
    });

    it('calculates model quality score based on error', async () => {
      // Mock baseline with close prediction
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-123',
        fundId: 1,
        name: 'Q4 2023',
        baselineType: 'quarterly',
        irr: '0.18', // Exactly matching the mean
        tvpi: '2.2', // Exactly matching the mean
        dpi: '1.0', // Exactly matching the mean
        multiple: null,
        totalValue: '90000000',
        deployedCapital: '50000000',
        createdAt: new Date(),
        isActive: true,
      } as never);

      const result = await service.runBacktest({
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        simulationRuns: 10000,
        comparisonMetrics: ['irr', 'tvpi', 'dpi'],
      });

      // With exact match, should have high quality score
      expect(result.validationMetrics.modelQualityScore).toBeGreaterThanOrEqual(90);
    });

    it('determines calibration status correctly', async () => {
      // Mock baseline with over-predicted values
      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-123',
        fundId: 1,
        name: 'Q4 2023',
        baselineType: 'quarterly',
        irr: '0.10', // Lower than mean of 0.18
        tvpi: '1.5', // Lower than mean of 2.2
        dpi: '0.5', // Lower than mean of 1.0
        multiple: null,
        totalValue: '70000000',
        deployedCapital: '50000000',
        createdAt: new Date(),
        isActive: true,
      } as never);

      const result = await service.runBacktest({
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        simulationRuns: 10000,
        comparisonMetrics: ['irr', 'tvpi', 'dpi'],
      });

      // Model predicts higher than actual = over-predicting
      expect(result.validationMetrics.calibrationStatus).toBe('over-predicting');
    });
  });

  describe('getBacktestHistory', () => {
    it('retrieves empty history when no backtests exist', async () => {
      const history = await service.getBacktestHistory(1);

      expect(history).toEqual([]);
    });

    it('retrieves backtest history for a fund', async () => {
      const mockRecord = {
        id: 'bt-123',
        fundId: 1,
        config: {
          fundId: 1,
          startDate: '2020-01-01',
          endDate: '2024-01-01',
          simulationRuns: 10000,
          comparisonMetrics: ['irr'],
        },
        simulationSummary: {
          runs: 10000,
          metrics: {},
          engineUsed: 'streaming',
          executionTimeMs: 1500,
        },
        actualPerformance: {
          asOfDate: '2024-01-01',
          irr: 0.15,
          tvpi: null,
          dpi: null,
          multiple: null,
          deployedCapital: 50000000,
          distributedCapital: 0,
          residualValue: 50000000,
          dataSource: 'baseline',
          dataFreshness: 'fresh',
        },
        validationMetrics: {
          meanAbsoluteError: {},
          rootMeanSquareError: {},
          percentileHitRates: { p50: {}, p90: {}, p100: {} },
          modelQualityScore: 85,
          calibrationStatus: 'well-calibrated',
          incalculableMetrics: [],
        },
        dataQuality: {
          hasBaseline: true,
          baselineAgeInDays: 30,
          varianceHistoryCount: 5,
          snapshotAvailable: false,
          isStale: false,
          warnings: [],
          overallQuality: 'good',
        },
        scenarioComparisons: null,
        recommendations: ['Model performing within expected parameters'],
        executionTimeMs: 1500,
        status: 'completed',
        errorMessage: null,
        baselineId: null,
        snapshotId: null,
        createdBy: null,
        tags: [],
        createdAt: new Date(),
        expiresAt: null,
      };

      mockDb.query.backtestResults.findMany.mockResolvedValue([mockRecord] as never);

      const history = await service.getBacktestHistory(1, { limit: 10 });

      expect(history.length).toBe(1);
      expect(history[0].backtestId).toBe('bt-123');
      expect(history[0].config.fundId).toBe(1);
    });
  });

  describe('compareScenarios', () => {
    it('compares multiple historical scenarios', async () => {
      const result = await service.compareScenarios(1, [
        'financial_crisis_2008',
        'bull_market_2021',
      ]);

      expect(result.length).toBe(2);
      expect(result.find((s) => s.scenario === 'financial_crisis_2008')).toBeDefined();
      expect(result.find((s) => s.scenario === 'bull_market_2021')).toBeDefined();
    });

    it('includes market parameters in comparisons', async () => {
      const result = await service.compareScenarios(1, ['financial_crisis_2008']);

      expect(result[0].marketParameters).toBeDefined();
      expect(result[0].marketParameters.failureRate).toBe(0.45);
      expect(result[0].marketParameters.exitMultiplierMean).toBe(1.2);
    });

    it('generates scenario-specific insights', async () => {
      const result = await service.compareScenarios(1, ['financial_crisis_2008']);

      expect(result[0].keyInsights).toBeInstanceOf(Array);
      expect(result[0].keyInsights.length).toBeGreaterThan(0);
      // Should have insight about high failure rate
      expect(result[0].keyInsights.some((i) => i.includes('failure'))).toBe(true);
    });

    it('skips custom scenario', async () => {
      const result = await service.compareScenarios(1, ['financial_crisis_2008', 'custom']);

      expect(result.length).toBe(1);
      expect(result[0].scenario).toBe('financial_crisis_2008');
    });
  });

  describe('getAvailableScenariosList', () => {
    it('returns all available historical scenarios', () => {
      const scenarios = service.getAvailableScenariosList();

      expect(scenarios).toContain('financial_crisis_2008');
      expect(scenarios).toContain('dotcom_bust_2000');
      expect(scenarios).toContain('covid_2020');
      expect(scenarios).toContain('bull_market_2021');
      expect(scenarios).toContain('rate_hikes_2022');
      expect(scenarios).not.toContain('custom');
    });
  });

  describe('data quality assessment', () => {
    it('marks quality as poor when no baseline exists', async () => {
      const result = await service.runBacktest({
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        simulationRuns: 1000,
        comparisonMetrics: ['irr'],
      });

      expect(result.dataQuality.hasBaseline).toBe(false);
      expect(result.dataQuality.overallQuality).toBe('poor');
    });

    it('marks data as stale when baseline is old', async () => {
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 100); // 100 days ago

      mockDb.query.fundBaselines.findFirst.mockResolvedValue({
        id: 'baseline-123',
        fundId: 1,
        name: 'Old Baseline',
        baselineType: 'quarterly',
        irr: '0.15',
        tvpi: '1.8',
        dpi: '0.9',
        multiple: null,
        totalValue: '90000000',
        deployedCapital: '50000000',
        createdAt: oldDate,
        isActive: true,
      } as never);

      const result = await service.runBacktest({
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2024-01-01',
        simulationRuns: 1000,
        comparisonMetrics: ['irr'],
      });

      expect(result.dataQuality.isStale).toBe(true);
      expect(result.dataQuality.baselineAgeInDays).toBeGreaterThan(90);
      expect(
        result.dataQuality.warnings.some((w) => w.includes('stale') || w.includes('days old'))
      ).toBe(true);
    });
  });
});
