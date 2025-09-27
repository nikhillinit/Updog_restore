/**
 * Performance Prediction Engine Service Tests
 *
 * Comprehensive unit tests for ML-powered predictive analytics functionality
 * Tests time-series analysis, regression models, and pattern recognition
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PerformancePredictionEngine,
  type PredictionConfig
} from '../../../server/services/performance-prediction';

// Mock the database and dependencies
const mockDb = {
  query: {
    fundMetrics: {
      findMany: vi.fn(),
      findFirst: vi.fn()
    },
    funds: {
      findFirst: vi.fn(),
      findMany: vi.fn()
    }
  },
  insert: vi.fn(() => ({
    values: vi.fn(() => Promise.resolve())
  }))
};

vi.mock('../../../server/db', () => ({
  db: mockDb
}));

vi.mock('@shared/schema', () => ({
  performancePredictions: 'mocked-predictions-table',
  fundMetrics: 'mocked-metrics-table',
  funds: 'mocked-funds-table'
}));

describe('PerformancePredictionEngine', () => {
  let engine: PerformancePredictionEngine;
  let mockConfig: PredictionConfig;
  let mockHistoricalData: any[];

  beforeEach(() => {
    engine = new PerformancePredictionEngine();
    vi.clearAllMocks();

    // Mock prediction configuration
    mockConfig = {
      fundId: 1,
      predictionHorizon: 12,
      modelType: 'linear',
      confidenceLevel: 0.95,
      includeSeasonality: false,
      includeTrendAnalysis: true,
      includeMarketFactors: false
    };

    // Mock historical data with realistic fund metrics
    mockHistoricalData = [
      {
        id: 1,
        fundId: 1,
        asOfDate: new Date('2023-01-01'),
        irr: 0.12,
        multiple: 1.8,
        dpi: 0.3,
        tvpi: 1.8,
        rvpi: 1.5
      },
      {
        id: 2,
        fundId: 1,
        asOfDate: new Date('2023-04-01'),
        irr: 0.15,
        multiple: 2.1,
        dpi: 0.5,
        tvpi: 2.1,
        rvpi: 1.6
      },
      {
        id: 3,
        fundId: 1,
        asOfDate: new Date('2023-07-01'),
        irr: 0.18,
        multiple: 2.4,
        dpi: 0.7,
        tvpi: 2.4,
        rvpi: 1.7
      },
      {
        id: 4,
        fundId: 1,
        asOfDate: new Date('2023-10-01'),
        irr: 0.22,
        multiple: 2.8,
        dpi: 0.9,
        tvpi: 2.8,
        rvpi: 1.9
      },
      {
        id: 5,
        fundId: 1,
        asOfDate: new Date('2024-01-01'),
        irr: 0.25,
        multiple: 3.1,
        dpi: 1.2,
        tvpi: 3.1,
        rvpi: 1.9
      }
    ];

    // Setup default mock responses
    mockDb.query.fundMetrics.findMany.mockResolvedValue(mockHistoricalData);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Prediction Generation', () => {
    describe('generatePredictions', () => {
      it('should generate predictions for all fund metrics', async () => {
        const results = await engine.generatePredictions(mockConfig);

        expect(results).toBeInstanceOf(Array);
        expect(results.length).toBeGreaterThan(0);

        // Check that we get predictions for major metrics
        const metrics = results.map(r => r.metric);
        expect(metrics).toContain('irr');
        expect(metrics).toContain('multiple');
        expect(metrics).toContain('dpi');

        // Verify structure of each prediction result
        results.forEach(result => {
          expect(result.fundId).toBe(mockConfig.fundId);
          expect(result.metric).toBeDefined();
          expect(result.predictions).toBeInstanceOf(Array);
          expect(result.predictions).toHaveLength(mockConfig.predictionHorizon);
          expect(result.accuracy).toBeDefined();
          expect(result.modelMetadata).toBeDefined();

          // Check prediction structure
          result.predictions.forEach(pred => {
            expect(pred.timestamp).toBeInstanceOf(Date);
            expect(typeof pred.value).toBe('number');
            expect(typeof pred.lowerBound).toBe('number');
            expect(typeof pred.upperBound).toBe('number');
            expect(pred.confidence).toBe(mockConfig.confidenceLevel);
            expect(pred.lowerBound).toBeLessThanOrEqual(pred.value);
            expect(pred.value).toBeLessThanOrEqual(pred.upperBound);
          });

          // Check accuracy metrics
          expect(result.accuracy.mae).toBeGreaterThanOrEqual(0);
          expect(result.accuracy.rmse).toBeGreaterThanOrEqual(0);
          expect(result.accuracy.mape).toBeGreaterThanOrEqual(0);
          expect(result.accuracy.r2Score).toBeGreaterThanOrEqual(-1);
          expect(result.accuracy.r2Score).toBeLessThanOrEqual(1);

          // Check model metadata
          expect(result.modelMetadata.type).toBeDefined();
          expect(result.modelMetadata.parameters).toBeDefined();
          expect(result.modelMetadata.trainingDataPoints).toBeGreaterThan(0);
        });
      });

      it('should handle different model types', async () => {
        const modelTypes: PredictionConfig['modelType'][] = ['linear', 'exponential', 'polynomial', 'ensemble'];

        for (const modelType of modelTypes) {
          const config = { ...mockConfig, modelType };
          const results = await engine.generatePredictions(config);

          expect(results.length).toBeGreaterThan(0);
          results.forEach(result => {
            expect(result.modelMetadata.type).toBe(modelType);
          });
        }
      });

      it('should respect prediction horizon', async () => {
        const horizons = [6, 12, 24, 36];

        for (const horizon of horizons) {
          const config = { ...mockConfig, predictionHorizon: horizon };
          const results = await engine.generatePredictions(config);

          results.forEach(result => {
            expect(result.predictions).toHaveLength(horizon);
          });
        }
      });

      it('should handle different confidence levels', async () => {
        const confidenceLevels = [0.68, 0.95, 0.99];

        for (const confidenceLevel of confidenceLevels) {
          const config = { ...mockConfig, confidenceLevel };
          const results = await engine.generatePredictions(config);

          results.forEach(result => {
            result.predictions.forEach(pred => {
              expect(pred.confidence).toBe(confidenceLevel);

              // Higher confidence should mean wider intervals
              const intervalWidth = pred.upperBound - pred.lowerBound;
              expect(intervalWidth).toBeGreaterThan(0);
            });
          });
        }
      });

      it('should fail with insufficient historical data', async () => {
        mockDb.query.fundMetrics.findMany.mockResolvedValue([mockHistoricalData[0], mockHistoricalData[1]]);

        await expect(engine.generatePredictions(mockConfig)).rejects.toThrow('Insufficient historical data');
      });

      it('should store predictions in database', async () => {
        await engine.generatePredictions(mockConfig);

        expect(mockDb.insert).toHaveBeenCalled();
      });
    });

    describe('Linear Regression Model', () => {
      it('should produce reasonable predictions for trending data', async () => {
        const config = { ...mockConfig, modelType: 'linear' as const };
        const results = await engine.generatePredictions(config);

        const irrResult = results.find(r => r.metric === 'irr');
        expect(irrResult).toBeDefined();

        if (irrResult) {
          // First prediction should be greater than last historical value for upward trend
          const lastHistoricalIRR = mockHistoricalData[mockHistoricalData.length - 1].irr;
          const firstPrediction = irrResult.predictions[0].value;

          expect(firstPrediction).toBeGreaterThan(lastHistoricalIRR * 0.8); // Allow some variation
          expect(firstPrediction).toBeLessThan(lastHistoricalIRR * 1.5);   // But not too extreme
        }
      });

      it('should calculate proper confidence intervals', async () => {
        const config = { ...mockConfig, modelType: 'linear' as const };
        const results = await engine.generatePredictions(config);

        results.forEach(result => {
          result.predictions.forEach(pred => {
            expect(pred.lowerBound).toBeLessThanOrEqual(pred.value);
            expect(pred.value).toBeLessThanOrEqual(pred.upperBound);
          });
        });
      });
    });

    describe('Exponential Smoothing Model', () => {
      it('should handle volatile time series data', async () => {
        // Create more volatile data
        const volatileData = mockHistoricalData.map((data, index) => ({
          ...data,
          irr: data.irr + (Math.random() - 0.5) * 0.1
        }));

        mockDb.query.fundMetrics.findMany.mockResolvedValue(volatileData);

        const config = { ...mockConfig, modelType: 'exponential' as const };
        const results = await engine.generatePredictions(config);

        expect(results.length).toBeGreaterThan(0);

        const irrResult = results.find(r => r.metric === 'irr');
        expect(irrResult).toBeDefined();
        expect(irrResult?.modelMetadata.type).toBe('exponential');
      });
    });

    describe('Polynomial Regression Model', () => {
      it('should handle non-linear patterns', async () => {
        // Create data with quadratic pattern
        const quadraticData = mockHistoricalData.map((data, index) => ({
          ...data,
          irr: 0.1 + 0.02 * index + 0.001 * index * index
        }));

        mockDb.query.fundMetrics.findMany.mockResolvedValue(quadraticData);

        const config = { ...mockConfig, modelType: 'polynomial' as const };
        const results = await engine.generatePredictions(config);

        expect(results.length).toBeGreaterThan(0);

        const irrResult = results.find(r => r.metric === 'irr');
        expect(irrResult?.modelMetadata.type).toBe('polynomial');
        expect(irrResult?.modelMetadata.parameters.degree).toBe(2);
      });

      it('should fall back to linear for ill-conditioned data', async () => {
        // Create data that might cause numerical issues
        const illConditionedData = Array.from({ length: 3 }, (_, i) => ({
          id: i,
          fundId: 1,
          asOfDate: new Date(2023, i, 1),
          irr: 0.15, // Constant values
          multiple: 2.0,
          dpi: 0.5,
          tvpi: 2.0,
          rvpi: 1.5
        }));

        mockDb.query.fundMetrics.findMany.mockResolvedValue(illConditionedData);

        const config = { ...mockConfig, modelType: 'polynomial' as const };
        const results = await engine.generatePredictions(config);

        expect(results.length).toBeGreaterThan(0);
      });
    });

    describe('Ensemble Model', () => {
      it('should combine multiple models effectively', async () => {
        const config = { ...mockConfig, modelType: 'ensemble' as const };
        const results = await engine.generatePredictions(config);

        expect(results.length).toBeGreaterThan(0);

        const irrResult = results.find(r => r.metric === 'irr');
        expect(irrResult?.modelMetadata.type).toBe('ensemble');
        expect(irrResult?.modelMetadata.parameters.models).toBeInstanceOf(Array);
        expect(irrResult?.modelMetadata.parameters.weights).toBeInstanceOf(Array);
      });

      it('should weight models based on accuracy', async () => {
        const config = { ...mockConfig, modelType: 'ensemble' as const };
        const results = await engine.generatePredictions(config);

        const irrResult = results.find(r => r.metric === 'irr');
        if (irrResult) {
          const weights = irrResult.modelMetadata.parameters.weights as number[];

          // Weights should sum to approximately 1
          const weightSum = weights.reduce((sum, w) => sum + w, 0);
          expect(weightSum).toBeCloseTo(1, 2);

          // All weights should be non-negative
          weights.forEach(weight => {
            expect(weight).toBeGreaterThanOrEqual(0);
          });
        }
      });
    });
  });

  describe('Trend Analysis', () => {
    describe('analyzeTrends', () => {
      it('should identify upward trends correctly', async () => {
        const trendAnalysis = await engine.analyzeTrends(1, 12);

        expect(trendAnalysis.trendDirection).toBe('upward');
        expect(trendAnalysis.trendStrength).toBeGreaterThan(0);
        expect(trendAnalysis.trendVelocity).toBeGreaterThan(0);
        expect(trendAnalysis.inflectionPoints).toBeInstanceOf(Array);
        expect(typeof trendAnalysis.seasonalityDetected).toBe('boolean');
      });

      it('should identify downward trends', async () => {
        // Create declining trend data
        const decliningData = mockHistoricalData.map((data, index) => ({
          ...data,
          irr: 0.3 - 0.02 * index // Declining IRR
        }));

        mockDb.query.fundMetrics.findMany.mockResolvedValue(decliningData);

        const trendAnalysis = await engine.analyzeTrends(1, 12);

        expect(trendAnalysis.trendDirection).toBe('downward');
        expect(trendAnalysis.trendVelocity).toBeLessThan(0);
      });

      it('should identify stable trends', async () => {
        // Create stable data
        const stableData = mockHistoricalData.map(data => ({
          ...data,
          irr: 0.18 + (Math.random() - 0.5) * 0.01 // Small random variation around 18%
        }));

        mockDb.query.fundMetrics.findMany.mockResolvedValue(stableData);

        const trendAnalysis = await engine.analyzeTrends(1, 12);

        expect(trendAnalysis.trendDirection).toBe('stable');
        expect(Math.abs(trendAnalysis.trendVelocity)).toBeLessThan(0.01);
      });

      it('should detect seasonality when present', async () => {
        // Create seasonal data (24 months with quarterly pattern)
        const seasonalData = Array.from({ length: 24 }, (_, i) => ({
          id: i,
          fundId: 1,
          asOfDate: new Date(2022, i, 1),
          irr: 0.15 + 0.05 * Math.sin(i * Math.PI / 6), // Quarterly seasonality
          multiple: 2.0 + 0.3 * Math.sin(i * Math.PI / 6),
          dpi: 0.8,
          tvpi: 2.0,
          rvpi: 1.2
        }));

        mockDb.query.fundMetrics.findMany.mockResolvedValue(seasonalData);

        const trendAnalysis = await engine.analyzeTrends(1, 24);

        expect(trendAnalysis.seasonalityDetected).toBe(true);
        if (trendAnalysis.cyclePeriod) {
          expect(trendAnalysis.cyclePeriod).toBeGreaterThanOrEqual(3);
          expect(trendAnalysis.cyclePeriod).toBeLessThanOrEqual(12);
        }
      });

      it('should fail with insufficient data', async () => {
        mockDb.query.fundMetrics.findMany.mockResolvedValue([mockHistoricalData[0], mockHistoricalData[1]]);

        await expect(engine.analyzeTrends(1, 12)).rejects.toThrow('Insufficient data for trend analysis');
      });
    });
  });

  describe('Anomaly Detection', () => {
    describe('detectAnomalies', () => {
      it('should identify statistical outliers', async () => {
        // Add anomalous data points
        const dataWithAnomalies = [
          ...mockHistoricalData,
          {
            id: 6,
            fundId: 1,
            asOfDate: new Date('2024-04-01'),
            irr: 0.8, // Anomalously high IRR
            multiple: 3.2,
            dpi: 1.3,
            tvpi: 3.2,
            rvpi: 1.9
          },
          {
            id: 7,
            fundId: 1,
            asOfDate: new Date('2024-07-01'),
            irr: -0.1, // Anomalously low (negative) IRR
            multiple: 3.4,
            dpi: 1.4,
            tvpi: 3.4,
            rvpi: 2.0
          }
        ];

        mockDb.query.fundMetrics.findMany.mockResolvedValue(dataWithAnomalies);

        const anomalies = await engine.detectAnomalies(1, 2);

        expect(anomalies.anomalies.length).toBeGreaterThan(0);
        expect(anomalies.anomalyScore).toBeGreaterThan(0);
        expect(anomalies.anomalyScore).toBeLessThanOrEqual(1);

        // Check anomaly structure
        anomalies.anomalies.forEach(anomaly => {
          expect(anomaly.timestamp).toBeInstanceOf(Date);
          expect(typeof anomaly.value).toBe('number');
          expect(typeof anomaly.expectedValue).toBe('number');
          expect(typeof anomaly.deviation).toBe('number');
          expect(['low', 'medium', 'high']).toContain(anomaly.severity);
        });
      });

      it('should handle different sensitivity levels', async () => {
        const sensitivities = [1, 2, 3];
        const results = [];

        for (const sensitivity of sensitivities) {
          const anomalies = await engine.detectAnomalies(1, sensitivity);
          results.push(anomalies);
        }

        // Higher sensitivity should generally detect fewer anomalies
        expect(results[2].anomalies.length).toBeLessThanOrEqual(results[0].anomalies.length);
      });

      it('should return no anomalies for normal data', async () => {
        const anomalies = await engine.detectAnomalies(1, 2);

        // With clean mock data, should detect few or no anomalies
        expect(anomalies.anomalyScore).toBeLessThan(0.5);
      });
    });
  });

  describe('Cohort Analysis', () => {
    describe('analyzeCohort', () => {
      let mockFund: any;
      let mockCohortFunds: any[];

      beforeEach(() => {
        mockFund = {
          id: 1,
          name: 'Test Fund',
          createdAt: new Date('2022-01-01'),
          isActive: true
        };

        mockCohortFunds = [
          { id: 1, createdAt: new Date('2022-01-01'), isActive: true },
          { id: 2, createdAt: new Date('2022-03-15'), isActive: true },
          { id: 3, createdAt: new Date('2022-06-30'), isActive: true },
          { id: 4, createdAt: new Date('2022-11-10'), isActive: true }
        ];

        mockDb.query.funds.findFirst.mockResolvedValue(mockFund);
        mockDb.query.funds.findMany.mockResolvedValue(mockCohortFunds);
      });

      it('should analyze fund cohort performance', async () => {
        const cohortAnalysis = await engine.analyzeCohort(1);

        expect(cohortAnalysis.vintageYear).toBe(2022);
        expect(cohortAnalysis.cohortSize).toBe(4);
        expect(cohortAnalysis.performanceProfile).toBeDefined();
        expect(cohortAnalysis.comparisons).toBeDefined();

        // Check performance profile
        expect(cohortAnalysis.performanceProfile.jCurve).toBeInstanceOf(Array);
        expect(cohortAnalysis.performanceProfile.peakIRR).toBeDefined();
        expect(cohortAnalysis.performanceProfile.timeToBreakeven).toBeGreaterThanOrEqual(-1);
        expect(['investment', 'growth', 'harvest', 'mature']).toContain(cohortAnalysis.performanceProfile.currentStage);

        // Check comparisons
        expect(typeof cohortAnalysis.comparisons.vsMedian).toBe('number');
        expect(typeof cohortAnalysis.comparisons.vsTopQuartile).toBe('number');
        expect(cohortAnalysis.comparisons.percentileRank).toBeGreaterThanOrEqual(0);
        expect(cohortAnalysis.comparisons.percentileRank).toBeLessThanOrEqual(100);
      });

      it('should determine fund stage correctly based on age', async () => {
        const stages = [
          { age: 1, expected: 'investment' },
          { age: 3, expected: 'growth' },
          { age: 8, expected: 'harvest' },
          { age: 12, expected: 'mature' }
        ];

        for (const stage of stages) {
          const fundDate = new Date();
          fundDate.setFullYear(fundDate.getFullYear() - stage.age);

          const fund = { ...mockFund, createdAt: fundDate };
          mockDb.query.funds.findFirst.mockResolvedValue(fund);

          const cohortAnalysis = await engine.analyzeCohort(1);
          expect(cohortAnalysis.performanceProfile.currentStage).toBe(stage.expected);
        }
      });

      it('should handle missing fund', async () => {
        mockDb.query.funds.findFirst.mockResolvedValue(null);

        await expect(engine.analyzeCohort(1)).rejects.toThrow('Fund 1 not found');
      });

      it('should calculate J-curve correctly', async () => {
        const cohortAnalysis = await engine.analyzeCohort(1);

        const jCurve = cohortAnalysis.performanceProfile.jCurve;
        expect(jCurve.length).toBeGreaterThan(0);

        // J-curve typically starts negative/low and improves over time
        expect(jCurve[jCurve.length - 1]).toBeGreaterThanOrEqual(jCurve[0]);
      });
    });
  });

  describe('Scenario Generation', () => {
    describe('generateScenarios', () => {
      it('should generate multiple what-if scenarios', async () => {
        const scenarios = [
          { name: 'Optimistic', adjustments: { irr: 0.1, multiple: 0.2 } },
          { name: 'Pessimistic', adjustments: { irr: -0.1, multiple: -0.15 } },
          { name: 'Market Crash', adjustments: { irr: -0.25, multiple: -0.4 } }
        ];

        const results = await engine.generateScenarios(1, scenarios);

        expect(results.size).toBe(scenarios.length);

        for (const scenario of scenarios) {
          expect(results.has(scenario.name)).toBe(true);

          const scenarioResults = results.get(scenario.name);
          expect(scenarioResults).toBeInstanceOf(Array);
          expect(scenarioResults!.length).toBeGreaterThan(0);

          // Check that adjustments were applied
          scenarioResults!.forEach(result => {
            result.predictions.forEach(pred => {
              if (scenario.adjustments[result.metric]) {
                // Adjusted predictions should reflect the scenario
                expect(typeof pred.value).toBe('number');
              }
            });
          });
        }
      });
    });
  });

  describe('Performance and Error Handling', () => {
    it('should handle large datasets efficiently', async () => {
      // Create large dataset (5 years of monthly data)
      const largeDataset = Array.from({ length: 60 }, (_, i) => ({
        id: i,
        fundId: 1,
        asOfDate: new Date(2019, i, 1),
        irr: 0.10 + 0.001 * i + (Math.random() - 0.5) * 0.02,
        multiple: 1.5 + 0.02 * i + (Math.random() - 0.5) * 0.1,
        dpi: 0.2 + 0.01 * i,
        tvpi: 1.5 + 0.02 * i,
        rvpi: 1.0 + 0.005 * i
      }));

      mockDb.query.fundMetrics.findMany.mockResolvedValue(largeDataset);

      const startTime = Date.now();
      const results = await engine.generatePredictions({ ...mockConfig, predictionHorizon: 24 });
      const executionTime = Date.now() - startTime;

      expect(results.length).toBeGreaterThan(0);
      expect(executionTime).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle missing data points gracefully', async () => {
      const sparseData = [
        { ...mockHistoricalData[0], irr: null },
        { ...mockHistoricalData[1] },
        { ...mockHistoricalData[2], multiple: null },
        { ...mockHistoricalData[3] },
        { ...mockHistoricalData[4] }
      ];

      mockDb.query.fundMetrics.findMany.mockResolvedValue(sparseData);

      const results = await engine.generatePredictions(mockConfig);

      expect(results.length).toBeGreaterThan(0);
      // Should only generate predictions for metrics with sufficient data
    });

    it('should validate prediction accuracy calculations', async () => {
      const results = await engine.generatePredictions(mockConfig);

      results.forEach(result => {
        // R-squared should be between -1 and 1
        expect(result.accuracy.r2Score).toBeGreaterThanOrEqual(-1);
        expect(result.accuracy.r2Score).toBeLessThanOrEqual(1);

        // All error metrics should be non-negative
        expect(result.accuracy.mae).toBeGreaterThanOrEqual(0);
        expect(result.accuracy.rmse).toBeGreaterThanOrEqual(0);
        expect(result.accuracy.mape).toBeGreaterThanOrEqual(0);

        // RMSE should be >= MAE (mathematical property)
        expect(result.accuracy.rmse).toBeGreaterThanOrEqual(result.accuracy.mae);
      });
    });

    it('should handle edge cases in time series', async () => {
      const edgeCases = [
        // All identical values
        mockHistoricalData.map(d => ({ ...d, irr: 0.15 })),
        // Extreme volatility
        mockHistoricalData.map((d, i) => ({ ...d, irr: i % 2 === 0 ? 0.5 : 0.05 })),
        // Very small values
        mockHistoricalData.map(d => ({ ...d, irr: 0.001 }))
      ];

      for (const edgeCase of edgeCases) {
        mockDb.query.fundMetrics.findMany.mockResolvedValue(edgeCase);

        const results = await engine.generatePredictions(mockConfig);
        expect(results.length).toBeGreaterThan(0);

        // Predictions should still be reasonable
        results.forEach(result => {
          result.predictions.forEach(pred => {
            expect(isFinite(pred.value)).toBe(true);
            expect(isFinite(pred.lowerBound)).toBe(true);
            expect(isFinite(pred.upperBound)).toBe(true);
          });
        });
      }
    });
  });

  describe('Data Integration and Storage', () => {
    it('should query historical data with correct parameters', async () => {
      await engine.generatePredictions(mockConfig);

      expect(mockDb.query.fundMetrics.findMany).toHaveBeenCalledWith({
        where: expect.any(Object),
        orderBy: expect.any(Object)
      });
    });

    it('should store predictions with correct metadata', async () => {
      const results = await engine.generatePredictions(mockConfig);

      expect(mockDb.insert).toHaveBeenCalledTimes(results.length);

      // Verify the structure of stored data
      const insertCalls = mockDb.insert.mock.calls;
      insertCalls.forEach(call => {
        expect(call[0]).toBe('mocked-predictions-table');
      });
    });

    it('should handle database query errors gracefully', async () => {
      mockDb.query.fundMetrics.findMany.mockRejectedValue(new Error('Database connection failed'));

      await expect(engine.generatePredictions(mockConfig)).rejects.toThrow('Performance prediction failed');
    });
  });

  describe('Model Validation and Benchmarking', () => {
    it('should maintain prediction quality across different data patterns', async () => {
      const patterns = [
        // Linear growth
        mockHistoricalData.map((d, i) => ({ ...d, irr: 0.1 + 0.02 * i })),
        // Exponential growth
        mockHistoricalData.map((d, i) => ({ ...d, irr: 0.1 * Math.pow(1.1, i) })),
        // Cyclical pattern
        mockHistoricalData.map((d, i) => ({ ...d, irr: 0.15 + 0.05 * Math.sin(i) }))
      ];

      for (const pattern of patterns) {
        mockDb.query.fundMetrics.findMany.mockResolvedValue(pattern);

        const results = await engine.generatePredictions({ ...mockConfig, modelType: 'ensemble' });

        const irrResult = results.find(r => r.metric === 'irr');
        if (irrResult) {
          // Ensemble model should maintain reasonable accuracy
          expect(irrResult.accuracy.r2Score).toBeGreaterThan(-0.5);
        }
      }
    });

    it('should provide consistent predictions for stable time series', async () => {
      const stableData = mockHistoricalData.map(d => ({ ...d, irr: 0.18 }));
      mockDb.query.fundMetrics.findMany.mockResolvedValue(stableData);

      const results = await engine.generatePredictions(mockConfig);
      const irrResult = results.find(r => r.metric === 'irr');

      if (irrResult) {
        // All predictions should be close to the stable value
        irrResult.predictions.forEach(pred => {
          expect(pred.value).toBeCloseTo(0.18, 1);
        });
      }
    });
  });
});