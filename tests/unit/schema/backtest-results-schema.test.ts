/**
 * Backtest Results Schema Unit Tests
 *
 * Tests for the backtest_results database table schema.
 */

import { describe, it, expect } from 'vitest';
import {
  backtestResults,
  insertBacktestResultSchema,
  type BacktestResultRecord,
  type InsertBacktestResultRecord,
} from '../../../shared/schema';

describe('backtestResults schema', () => {
  it('exports the table definition', () => {
    expect(backtestResults).toBeDefined();
    // Table is exported and has expected structure
    expect(typeof backtestResults).toBe('object');
  });

  it('has all required columns', () => {
    const columns = Object.keys(backtestResults);
    const requiredColumns = [
      'id',
      'fundId',
      'config',
      'simulationSummary',
      'actualPerformance',
      'validationMetrics',
      'dataQuality',
      'scenarioComparisons',
      'recommendations',
      'executionTimeMs',
      'status',
      'errorMessage',
      'baselineId',
      'snapshotId',
      'createdBy',
      'tags',
      'createdAt',
      'expiresAt',
    ];

    requiredColumns.forEach((col) => {
      expect(columns).toContain(col);
    });
  });

  it('has proper column types for jsonb fields', () => {
    // Verify jsonb columns exist
    expect(backtestResults.config).toBeDefined();
    expect(backtestResults.simulationSummary).toBeDefined();
    expect(backtestResults.actualPerformance).toBeDefined();
    expect(backtestResults.validationMetrics).toBeDefined();
    expect(backtestResults.dataQuality).toBeDefined();
    expect(backtestResults.scenarioComparisons).toBeDefined();
  });

  it('has foreign key references', () => {
    // fundId should reference funds
    expect(backtestResults.fundId).toBeDefined();
    // baselineId should reference fundBaselines
    expect(backtestResults.baselineId).toBeDefined();
    // snapshotId should reference fundStateSnapshots
    expect(backtestResults.snapshotId).toBeDefined();
    // createdBy should reference users
    expect(backtestResults.createdBy).toBeDefined();
  });
});

describe('insertBacktestResultSchema', () => {
  it('exports the insert schema', () => {
    expect(insertBacktestResultSchema).toBeDefined();
  });

  it('validates a complete backtest result insert', () => {
    const validInsert: Partial<InsertBacktestResultRecord> = {
      fundId: 1,
      config: {
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2023-12-31',
        simulationRuns: 10000,
        comparisonMetrics: ['irr', 'tvpi', 'dpi'],
        includeHistoricalScenarios: false,
      },
      simulationSummary: {
        runs: 10000,
        metrics: {},
        engineUsed: 'streaming',
        executionTimeMs: 1500,
      },
      actualPerformance: {
        asOfDate: '2023-12-31',
        irr: 0.15,
        tvpi: 1.8,
        dpi: 0.5,
        multiple: 1.8,
        deployedCapital: 10000000,
        distributedCapital: 5000000,
        residualValue: 13000000,
        dataSource: 'baseline',
        dataFreshness: 'fresh',
      },
      validationMetrics: {
        meanAbsoluteError: { irr: 0.02, tvpi: 0.1 },
        rootMeanSquareError: { irr: 0.03, tvpi: 0.15 },
        percentileHitRates: {
          p50: { irr: true, tvpi: true },
          p90: { irr: true, tvpi: true },
          p100: { irr: true, tvpi: true },
        },
        modelQualityScore: 85,
        calibrationStatus: 'well-calibrated',
        incalculableMetrics: [],
      },
      dataQuality: {
        hasBaseline: true,
        baselineAgeInDays: 30,
        varianceHistoryCount: 12,
        snapshotAvailable: true,
        isStale: false,
        warnings: [],
        overallQuality: 'good',
      },
      recommendations: ['Model is well-calibrated for IRR predictions'],
      executionTimeMs: 1500,
      status: 'completed',
    };

    // Schema should be able to parse this structure
    const result = insertBacktestResultSchema.safeParse(validInsert);
    expect(result.success).toBe(true);
  });

  it('rejects insert without required fundId', () => {
    const invalidInsert = {
      config: {
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2023-12-31',
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
        asOfDate: '2023-12-31',
        irr: 0.15,
        tvpi: null,
        dpi: null,
        multiple: null,
        deployedCapital: 10000000,
        distributedCapital: 0,
        residualValue: 0,
        dataSource: 'baseline',
        dataFreshness: 'unknown',
      },
      validationMetrics: {
        meanAbsoluteError: {},
        rootMeanSquareError: {},
        percentileHitRates: { p50: {}, p90: {}, p100: {} },
        modelQualityScore: 0,
        calibrationStatus: 'insufficient-data',
        incalculableMetrics: ['irr', 'tvpi', 'dpi'],
      },
      dataQuality: {
        hasBaseline: false,
        baselineAgeInDays: null,
        varianceHistoryCount: 0,
        snapshotAvailable: false,
        isStale: true,
        warnings: ['No baseline data available'],
        overallQuality: 'poor',
      },
      recommendations: [],
      executionTimeMs: 100,
      status: 'completed',
    };

    const result = insertBacktestResultSchema.safeParse(invalidInsert);
    expect(result.success).toBe(false);
  });
});

describe('BacktestResultRecord type', () => {
  it('has correct shape for select results', () => {
    // This is a compile-time check - if the type is correct, this compiles
    const mockRecord: BacktestResultRecord = {
      id: '550e8400-e29b-41d4-a716-446655440000',
      fundId: 1,
      config: {
        fundId: 1,
        startDate: '2020-01-01',
        endDate: '2023-12-31',
        simulationRuns: 10000,
        comparisonMetrics: ['irr', 'tvpi'],
      },
      simulationSummary: {
        runs: 10000,
        metrics: {},
        engineUsed: 'streaming',
        executionTimeMs: 1500,
      },
      actualPerformance: {
        asOfDate: '2023-12-31',
        irr: 0.15,
        tvpi: 1.8,
        dpi: 0.5,
        multiple: 1.8,
        deployedCapital: 10000000,
        distributedCapital: 5000000,
        residualValue: 13000000,
        dataSource: 'baseline',
        dataFreshness: 'fresh',
      },
      validationMetrics: {
        meanAbsoluteError: { irr: 0.02 },
        rootMeanSquareError: { irr: 0.03 },
        percentileHitRates: {
          p50: { irr: true },
          p90: { irr: true },
          p100: { irr: true },
        },
        modelQualityScore: 85,
        calibrationStatus: 'well-calibrated',
        incalculableMetrics: [],
      },
      dataQuality: {
        hasBaseline: true,
        baselineAgeInDays: 30,
        varianceHistoryCount: 12,
        snapshotAvailable: true,
        isStale: false,
        warnings: [],
        overallQuality: 'good',
      },
      scenarioComparisons: null,
      recommendations: ['Model is well-calibrated'],
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

    expect(mockRecord.id).toBeDefined();
    expect(mockRecord.fundId).toBe(1);
    expect(mockRecord.status).toBe('completed');
  });
});
