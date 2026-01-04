/**
 * Backtesting Schemas Unit Tests
 *
 * Tests for Zod validation schemas used in backtesting operations.
 */

import { describe, it, expect } from 'vitest';
import {
  BacktestConfigSchema,
  HistoricalScenarioSchema,
  DistributionSummarySchema,
  ValidationMetricsSchema,
  MarketParametersSchema,
  ScenarioCompareRequestSchema,
  BacktestHistoryQuerySchema,
  validateBacktestConfig,
  calculateNormalizedError,
  safeDivide,
} from '@shared/validation/backtesting-schemas';

describe('BacktestConfigSchema', () => {
  it('validates a valid backtest configuration', () => {
    const config = {
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2025-01-01',
      simulationRuns: 10000,
      comparisonMetrics: ['irr', 'tvpi', 'dpi'],
      includeHistoricalScenarios: true,
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.fundId).toBe(1);
      expect(result.data.simulationRuns).toBe(10000);
    }
  });

  it('applies default values correctly', () => {
    const config = {
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.simulationRuns).toBe(10000);
      expect(result.data.comparisonMetrics).toEqual(['irr', 'tvpi', 'dpi']);
      expect(result.data.includeHistoricalScenarios).toBe(false);
    }
  });

  it('rejects invalid date ranges (end before start)', () => {
    const config = {
      fundId: 1,
      startDate: '2025-01-01',
      endDate: '2020-01-01',
      simulationRuns: 10000,
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path.includes('startDate'))).toBe(true);
    }
  });

  it('rejects date range exceeding 20 years', () => {
    const config = {
      fundId: 1,
      startDate: '2000-01-01',
      endDate: '2025-01-01', // 25 years
      simulationRuns: 10000,
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects simulation runs below minimum', () => {
    const config = {
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
      simulationRuns: 50, // Below 100 minimum
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects simulation runs above maximum', () => {
    const config = {
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
      simulationRuns: 100000, // Above 50000 maximum
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects invalid date format', () => {
    const config = {
      fundId: 1,
      startDate: '01-01-2020', // Wrong format
      endDate: '2024-01-01',
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });

  it('rejects negative fund ID', () => {
    const config = {
      fundId: -1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    };

    const result = BacktestConfigSchema.safeParse(config);
    expect(result.success).toBe(false);
  });
});

describe('HistoricalScenarioSchema', () => {
  it('validates predefined historical scenarios', () => {
    const scenarios = [
      { name: 'financial_crisis_2008', startDate: '2008-01-01', endDate: '2009-12-31' },
      { name: 'covid_2020', startDate: '2020-02-01', endDate: '2020-12-31' },
      { name: 'bull_market_2021', startDate: '2021-01-01', endDate: '2021-12-31' },
    ];

    scenarios.forEach((scenario) => {
      const result = HistoricalScenarioSchema.safeParse(scenario);
      expect(result.success).toBe(true);
    });
  });

  it('validates scenario with market parameters', () => {
    const scenario = {
      name: 'financial_crisis_2008',
      startDate: '2008-01-01',
      endDate: '2009-12-31',
      description: 'Global financial crisis',
      marketParameters: {
        exitMultiplierMean: 1.2,
        exitMultiplierVolatility: 1.5,
        failureRate: 0.45,
        followOnProbability: 0.3,
        holdPeriodYears: 8.0,
      },
    };

    const result = HistoricalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(true);
  });

  it('rejects invalid scenario name', () => {
    const scenario = {
      name: 'unknown_scenario',
      startDate: '2020-01-01',
      endDate: '2021-01-01',
    };

    const result = HistoricalScenarioSchema.safeParse(scenario);
    expect(result.success).toBe(false);
  });
});

describe('MarketParametersSchema', () => {
  it('validates valid market parameters', () => {
    const params = {
      exitMultiplierMean: 2.5,
      exitMultiplierVolatility: 0.8,
      failureRate: 0.25,
      followOnProbability: 0.6,
      holdPeriodYears: 5.5,
    };

    const result = MarketParametersSchema.safeParse(params);
    expect(result.success).toBe(true);
  });

  it('rejects failure rate above 1', () => {
    const params = {
      exitMultiplierMean: 2.5,
      exitMultiplierVolatility: 0.8,
      failureRate: 1.5, // Invalid: > 1
      followOnProbability: 0.6,
      holdPeriodYears: 5.5,
    };

    const result = MarketParametersSchema.safeParse(params);
    expect(result.success).toBe(false);
  });

  it('rejects negative volatility', () => {
    const params = {
      exitMultiplierMean: 2.5,
      exitMultiplierVolatility: -0.5, // Invalid: negative
      failureRate: 0.25,
      followOnProbability: 0.6,
      holdPeriodYears: 5.5,
    };

    const result = MarketParametersSchema.safeParse(params);
    expect(result.success).toBe(false);
  });
});

describe('DistributionSummarySchema', () => {
  it('validates valid distribution summary', () => {
    const summary = {
      mean: 0.18,
      median: 0.17,
      p5: 0.05,
      p25: 0.12,
      p75: 0.24,
      p95: 0.35,
      min: 0.02,
      max: 0.5,
      standardDeviation: 0.08,
    };

    const result = DistributionSummarySchema.safeParse(summary);
    expect(result.success).toBe(true);
  });

  it('rejects percentiles out of order', () => {
    const summary = {
      mean: 0.18,
      median: 0.17,
      p5: 0.35, // Higher than p25
      p25: 0.12,
      p75: 0.24,
      p95: 0.35,
      min: 0.02,
      max: 0.5,
      standardDeviation: 0.08,
    };

    const result = DistributionSummarySchema.safeParse(summary);
    expect(result.success).toBe(false);
  });

  it('rejects min greater than p5', () => {
    const summary = {
      mean: 0.18,
      median: 0.17,
      p5: 0.05,
      p25: 0.12,
      p75: 0.24,
      p95: 0.35,
      min: 0.1, // Greater than p5
      max: 0.5,
      standardDeviation: 0.08,
    };

    const result = DistributionSummarySchema.safeParse(summary);
    expect(result.success).toBe(false);
  });

  it('rejects negative standard deviation', () => {
    const summary = {
      mean: 0.18,
      median: 0.17,
      p5: 0.05,
      p25: 0.12,
      p75: 0.24,
      p95: 0.35,
      min: 0.02,
      max: 0.5,
      standardDeviation: -0.08, // Negative
    };

    const result = DistributionSummarySchema.safeParse(summary);
    expect(result.success).toBe(false);
  });
});

describe('ValidationMetricsSchema', () => {
  it('validates valid validation metrics', () => {
    const metrics = {
      meanAbsoluteError: { irr: 0.03 },
      rootMeanSquareError: { irr: 0.035 },
      percentileHitRates: {
        p50: { irr: true },
        p90: { irr: true },
        p100: { irr: true },
      },
      modelQualityScore: 85,
      calibrationStatus: 'well-calibrated',
      incalculableMetrics: [],
    };

    const result = ValidationMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(true);
  });

  it('rejects model quality score above 100', () => {
    const metrics = {
      meanAbsoluteError: {},
      rootMeanSquareError: {},
      percentileHitRates: { p50: {}, p90: {}, p100: {} },
      modelQualityScore: 150, // Above 100
      calibrationStatus: 'well-calibrated',
      incalculableMetrics: [],
    };

    const result = ValidationMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(false);
  });

  it('rejects invalid calibration status', () => {
    const metrics = {
      meanAbsoluteError: {},
      rootMeanSquareError: {},
      percentileHitRates: { p50: {}, p90: {}, p100: {} },
      modelQualityScore: 85,
      calibrationStatus: 'invalid-status',
      incalculableMetrics: [],
    };

    const result = ValidationMetricsSchema.safeParse(metrics);
    expect(result.success).toBe(false);
  });
});

describe('ScenarioCompareRequestSchema', () => {
  it('validates scenario comparison request', () => {
    const request = {
      fundId: 1,
      scenarios: ['financial_crisis_2008', 'covid_2020'],
      simulationRuns: 5000,
    };

    const result = ScenarioCompareRequestSchema.safeParse(request);
    expect(result.success).toBe(true);
  });

  it('rejects custom scenario in comparison', () => {
    const request = {
      fundId: 1,
      scenarios: ['custom'], // Custom not allowed in comparison
    };

    const result = ScenarioCompareRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });

  it('rejects more than 5 scenarios', () => {
    const request = {
      fundId: 1,
      scenarios: [
        'financial_crisis_2008',
        'dotcom_bust_2000',
        'covid_2020',
        'bull_market_2021',
        'rate_hikes_2022',
        'financial_crisis_2008', // 6th
      ],
    };

    const result = ScenarioCompareRequestSchema.safeParse(request);
    expect(result.success).toBe(false);
  });
});

describe('BacktestHistoryQuerySchema', () => {
  it('validates history query parameters', () => {
    const query = {
      limit: 20,
      offset: 10,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    };

    const result = BacktestHistoryQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
  });

  it('applies defaults for missing parameters', () => {
    const query = {};

    const result = BacktestHistoryQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(10);
      expect(result.data.offset).toBe(0);
    }
  });

  it('coerces string numbers to integers', () => {
    const query = {
      limit: '25',
      offset: '5',
    };

    const result = BacktestHistoryQuerySchema.safeParse(query);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.limit).toBe(25);
      expect(result.data.offset).toBe(5);
    }
  });

  it('rejects limit above 100', () => {
    const query = {
      limit: 200,
    };

    const result = BacktestHistoryQuerySchema.safeParse(query);
    expect(result.success).toBe(false);
  });
});

describe('validateBacktestConfig utility', () => {
  it('returns success for valid config', () => {
    const result = validateBacktestConfig({
      fundId: 1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    });

    expect(result.success).toBe(true);
  });

  it('returns error for invalid config', () => {
    const result = validateBacktestConfig({
      fundId: -1,
      startDate: '2020-01-01',
      endDate: '2024-01-01',
    });

    expect(result.success).toBe(false);
  });
});

describe('safeDivide utility', () => {
  it('performs normal division', () => {
    expect(safeDivide(10, 2)).toBe(5);
  });

  it('returns null for division by zero', () => {
    expect(safeDivide(10, 0)).toBeNull();
  });

  it('returns null for near-zero divisor', () => {
    expect(safeDivide(10, 1e-15)).toBeNull();
  });

  it('returns null for null divisor', () => {
    expect(safeDivide(10, null)).toBeNull();
  });

  it('handles negative numbers', () => {
    expect(safeDivide(-10, 2)).toBe(-5);
  });
});

describe('calculateNormalizedError utility', () => {
  it('calculates normalized error correctly', () => {
    const result = calculateNormalizedError(0.2, 0.15);
    expect(result).toBeCloseTo(0.333, 2); // |0.20 - 0.15| / |0.15| = 0.333
  });

  it('returns null for null actual value', () => {
    expect(calculateNormalizedError(0.2, null)).toBeNull();
  });

  it('returns null for zero actual value', () => {
    expect(calculateNormalizedError(0.2, 0)).toBeNull();
  });

  it('handles negative actual values', () => {
    const result = calculateNormalizedError(0.1, -0.2);
    expect(result).toBeCloseTo(1.5, 2); // |0.10 - (-0.20)| / |-0.20| = 1.5
  });
});
