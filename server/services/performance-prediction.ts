/**
 * Performance Prediction Models Service
 *
 * ML-powered predictive analytics for fund performance forecasting
 * Implements time-series analysis, regression models, and pattern recognition
 */

import { db } from '../db';
import {
  funds,
  fundMetrics,
  performancePredictions
} from '@shared/schema';
import { eq, and, desc, gte, sql, inArray } from 'drizzle-orm';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface PredictionConfig {
  fundId: number;
  predictionHorizon: number; // months into future
  modelType: 'linear' | 'exponential' | 'polynomial' | 'ensemble';
  confidenceLevel: number; // 0.68, 0.95, 0.99
  includeSeasonality?: boolean;
  includeTrendAnalysis?: boolean;
  includeMarketFactors?: boolean;
}

export interface TimeSeriesData {
  timestamp: Date;
  value: number;
  metadata?: Record<string, any>;
}

export interface PredictionResult {
  fundId: number;
  metric: string;
  predictions: Array<{
    timestamp: Date;
    value: number;
    lowerBound: number;
    upperBound: number;
    confidence: number;
  }>;
  accuracy: {
    mae: number; // Mean Absolute Error
    rmse: number; // Root Mean Square Error
    mape: number; // Mean Absolute Percentage Error
    r2Score: number; // R-squared score
  };
  modelMetadata: {
    type: string;
    parameters: Record<string, any>;
    trainingDataPoints: number;
    executionTimeMs: number;
  };
}

export interface TrendAnalysis {
  trendDirection: 'upward' | 'downward' | 'stable';
  trendStrength: number; // 0-1
  trendVelocity: number; // rate of change
  inflectionPoints: Date[];
  seasonalityDetected: boolean;
  cyclePeriod?: number; // in months
}

export interface AnomalyDetection {
  anomalies: Array<{
    timestamp: Date;
    value: number;
    expectedValue: number;
    deviation: number;
    severity: 'low' | 'medium' | 'high';
  }>;
  anomalyScore: number; // 0-1 overall anomaly level
}

export interface CohortAnalysis {
  vintageYear: number;
  cohortSize: number;
  performanceProfile: {
    jCurve: number[]; // Quarterly performance values
    peakIRR: number;
    timeToBreakeven: number; // months
    currentStage: 'investment' | 'growth' | 'harvest' | 'mature';
  };
  comparisons: {
    vsMedian: number; // performance vs median cohort
    vsTopQuartile: number;
    percentileRank: number;
  };
}

// ============================================================================
// PERFORMANCE PREDICTION ENGINE
// ============================================================================

export class PerformancePredictionEngine {

  /**
   * Generate comprehensive performance predictions
   */
  async generatePredictions(config: PredictionConfig): Promise<PredictionResult[]> {
    const startTime = Date.now();

    try {
      // Fetch historical data
      const historicalData = await this.fetchHistoricalData(config.fundId);

      if (historicalData.length < 3) {
        throw new Error('Insufficient historical data for predictions');
      }

      // Prepare time series for each metric
      const metrics = ['irr', 'multiple', 'dpi', 'tvpi', 'rvpi'];
      const predictions: PredictionResult[] = [];

      for (const metric of metrics) {
        const timeSeries = this.extractTimeSeries(historicalData, metric);

        if (timeSeries.length < 2) continue;

        // Generate predictions based on model type
        let prediction: PredictionResult;

        switch (config.modelType) {
          case 'linear':
            prediction = await this.linearRegression(timeSeries, metric, config);
            break;
          case 'exponential':
            prediction = await this.exponentialSmoothing(timeSeries, metric, config);
            break;
          case 'polynomial':
            prediction = await this.polynomialRegression(timeSeries, metric, config);
            break;
          case 'ensemble':
            prediction = await this.ensembleModel(timeSeries, metric, config);
            break;
          default:
            prediction = await this.linearRegression(timeSeries, metric, config);
        }

        prediction.fundId = config.fundId;
        prediction.modelMetadata.executionTimeMs = Date.now() - startTime;

        predictions.push(prediction);

        // Store prediction results
        await this.storePrediction(prediction, config);
      }

      return predictions;

    } catch (error) {
      throw new Error(`Performance prediction failed: ${error.message}`);
    }
  }

  /**
   * Analyze performance trends
   */
  async analyzeTrends(fundId: number, lookbackMonths: number = 12): Promise<TrendAnalysis> {
    const historicalData = await this.fetchHistoricalData(fundId, lookbackMonths);

    if (historicalData.length < 3) {
      throw new Error('Insufficient data for trend analysis');
    }

    // Extract IRR time series as primary metric
    const timeSeries = this.extractTimeSeries(historicalData, 'irr');

    // Calculate trend metrics
    const trendCoefficient = this.calculateTrendCoefficient(timeSeries);
    const volatility = this.calculateVolatility(timeSeries);
    const inflectionPoints = this.detectInflectionPoints(timeSeries);
    const seasonality = this.detectSeasonality(timeSeries);

    // Determine trend characteristics
    const trendDirection = trendCoefficient > 0.01 ? 'upward' :
                          trendCoefficient < -0.01 ? 'downward' : 'stable';

    const trendStrength = Math.min(Math.abs(trendCoefficient) * 10, 1);

    return {
      trendDirection,
      trendStrength,
      trendVelocity: trendCoefficient,
      inflectionPoints: inflectionPoints.map(idx => timeSeries[idx].timestamp),
      seasonalityDetected: seasonality.detected,
      cyclePeriod: seasonality.period
    };
  }

  /**
   * Detect anomalies in performance metrics
   */
  async detectAnomalies(fundId: number, sensitivity: number = 2): Promise<AnomalyDetection> {
    const historicalData = await this.fetchHistoricalData(fundId);
    const timeSeries = this.extractTimeSeries(historicalData, 'irr');

    // Calculate statistical boundaries
    const values = timeSeries.map(d => d.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const stdDev = Math.sqrt(
      values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length
    );

    // Detect anomalies using z-score
    const anomalies = timeSeries
      .map((point, idx) => {
        const zScore = Math.abs((point.value - mean) / stdDev);
        const isAnomaly = zScore > sensitivity;

        if (isAnomaly) {
          return {
            timestamp: point.timestamp,
            value: point.value,
            expectedValue: mean,
            deviation: zScore,
            severity: zScore > 3 ? 'high' : zScore > 2.5 ? 'medium' : 'low' as const
          };
        }
        return null;
      })
      .filter(a => a !== null);

    const anomalyScore = Math.min(anomalies.length / timeSeries.length, 1);

    return {
      anomalies,
      anomalyScore
    };
  }

  /**
   * Perform vintage cohort analysis
   */
  async analyzeCohort(fundId: number): Promise<CohortAnalysis> {
    // Get fund details
    const fund = await db.query.funds.findFirst({
      where: eq(funds.id, fundId)
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const vintageYear = new Date(fund.createdAt).getFullYear();

    // Get cohort funds (same vintage year)
    const cohortFunds = await db.query.funds.findMany({
      where: and(
        sql`EXTRACT(YEAR FROM ${funds.createdAt}) = ${vintageYear}`,
        eq(funds.isActive, true)
      )
    });

    // Calculate J-curve profile
    const monthlyPerformance = await this.calculateJCurve(fundId);

    // Determine current stage based on fund age and performance
    const fundAgeYears = (Date.now() - new Date(fund.createdAt).getTime()) / (1000 * 60 * 60 * 24 * 365);
    const currentStage = this.determineFundStage(fundAgeYears, monthlyPerformance);

    // Calculate comparative metrics
    const cohortPerformance = await this.getCohortPerformance(cohortFunds.map(f => f.id));
    const fundPerformance = monthlyPerformance[monthlyPerformance.length - 1] || 0;

    const percentileRank = this.calculatePercentileRank(fundPerformance, cohortPerformance);

    return {
      vintageYear,
      cohortSize: cohortFunds.length,
      performanceProfile: {
        jCurve: monthlyPerformance,
        peakIRR: Math.max(...monthlyPerformance),
        timeToBreakeven: monthlyPerformance.findIndex(v => v > 0) || -1,
        currentStage
      },
      comparisons: {
        vsMedian: fundPerformance - this.calculateMedian(cohortPerformance),
        vsTopQuartile: fundPerformance - this.calculatePercentile(cohortPerformance, 75),
        percentileRank
      }
    };
  }

  /**
   * Generate what-if scenarios for performance
   */
  async generateScenarios(
    fundId: number,
    scenarios: Array<{name: string; adjustments: Record<string, number>}>
  ): Promise<Map<string, PredictionResult[]>> {
    const results = new Map<string, PredictionResult[]>();

    for (const scenario of scenarios) {
      const adjustedConfig: PredictionConfig = {
        fundId,
        predictionHorizon: 36,
        modelType: 'ensemble',
        confidenceLevel: 0.95,
        includeMarketFactors: true
      };

      // Apply scenario adjustments
      const predictions = await this.generatePredictions(adjustedConfig);

      // Adjust predictions based on scenario parameters
      const adjustedPredictions = predictions.map(pred => ({
        ...pred,
        predictions: pred.predictions.map(p => ({
          ...p,
          value: p.value * (1 + (scenario.adjustments[pred.metric] || 0)),
          lowerBound: p.lowerBound * (1 + (scenario.adjustments[pred.metric] || 0)),
          upperBound: p.upperBound * (1 + (scenario.adjustments[pred.metric] || 0))
        }))
      }));

      results.set(scenario.name, adjustedPredictions);
    }

    return results;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async fetchHistoricalData(fundId: number, lookbackMonths?: number): Promise<any[]> {
    const cutoffDate = lookbackMonths
      ? new Date(Date.now() - lookbackMonths * 30 * 24 * 60 * 60 * 1000)
      : new Date(0);

    return await db.query.fundMetrics.findMany({
      where: and(
        eq(fundMetrics.fundId, fundId),
        gte(fundMetrics.asOfDate, cutoffDate)
      ),
      orderBy: fundMetrics.asOfDate
    });
  }

  private extractTimeSeries(data: any[], metric: string): TimeSeriesData[] {
    return data
      .filter(d => d[metric] !== null && d[metric] !== undefined)
      .map(d => ({
        timestamp: d.asOfDate,
        value: parseFloat(d[metric].toString()),
        metadata: { id: d.id }
      }));
  }

  private async linearRegression(
    timeSeries: TimeSeriesData[],
    metric: string,
    config: PredictionConfig
  ): Promise<PredictionResult> {
    const n = timeSeries.length;
    const x = timeSeries.map((_, i) => i);
    const y = timeSeries.map(d => d.value);

    // Calculate regression coefficients
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // Generate predictions
    const predictions = [];
    const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    for (let i = 1; i <= config.predictionHorizon; i++) {
      const futureX = n - 1 + i;
      const predictedValue = slope * futureX + intercept;
      const timestamp = new Date(lastTimestamp.getTime() + i * monthMs);

      // Calculate confidence intervals
      const stdError = this.calculateStandardError(y, x.map(xi => slope * xi + intercept));
      const confidenceMultiplier = config.confidenceLevel === 0.95 ? 1.96 :
                                   config.confidenceLevel === 0.99 ? 2.58 : 1;

      predictions.push({
        timestamp,
        value: predictedValue,
        lowerBound: predictedValue - confidenceMultiplier * stdError,
        upperBound: predictedValue + confidenceMultiplier * stdError,
        confidence: config.confidenceLevel
      });
    }

    // Calculate accuracy metrics
    const predicted = x.map(xi => slope * xi + intercept);
    const accuracy = this.calculateAccuracyMetrics(y, predicted);

    return {
      fundId: 0,
      metric,
      predictions,
      accuracy,
      modelMetadata: {
        type: 'linear',
        parameters: { slope, intercept },
        trainingDataPoints: n,
        executionTimeMs: 0
      }
    };
  }

  private async exponentialSmoothing(
    timeSeries: TimeSeriesData[],
    metric: string,
    config: PredictionConfig
  ): Promise<PredictionResult> {
    const alpha = 0.3; // Smoothing parameter
    const values = timeSeries.map(d => d.value);

    // Apply exponential smoothing
    const smoothed = [values[0]];
    for (let i = 1; i < values.length; i++) {
      smoothed.push(alpha * values[i] + (1 - alpha) * smoothed[i - 1]);
    }

    // Calculate trend
    const trend = (smoothed[smoothed.length - 1] - smoothed[0]) / smoothed.length;

    // Generate predictions
    const predictions = [];
    const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
    const lastValue = smoothed[smoothed.length - 1];
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    for (let i = 1; i <= config.predictionHorizon; i++) {
      const predictedValue = lastValue + trend * i;
      const timestamp = new Date(lastTimestamp.getTime() + i * monthMs);

      // Simple confidence intervals based on historical variance
      const variance = this.calculateVariance(values);
      const stdDev = Math.sqrt(variance);
      const confidenceMultiplier = config.confidenceLevel === 0.95 ? 1.96 : 1;

      predictions.push({
        timestamp,
        value: predictedValue,
        lowerBound: predictedValue - confidenceMultiplier * stdDev,
        upperBound: predictedValue + confidenceMultiplier * stdDev,
        confidence: config.confidenceLevel
      });
    }

    const accuracy = this.calculateAccuracyMetrics(values, smoothed);

    return {
      fundId: 0,
      metric,
      predictions,
      accuracy,
      modelMetadata: {
        type: 'exponential',
        parameters: { alpha, trend },
        trainingDataPoints: values.length,
        executionTimeMs: 0
      }
    };
  }

  private async polynomialRegression(
    timeSeries: TimeSeriesData[],
    metric: string,
    config: PredictionConfig
  ): Promise<PredictionResult> {
    // Simplified polynomial regression (quadratic)
    const n = timeSeries.length;
    const x = timeSeries.map((_, i) => i);
    const y = timeSeries.map(d => d.value);

    // Calculate coefficients for y = ax^2 + bx + c
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
    const sumX3 = x.reduce((sum, xi) => sum + xi * xi * xi, 0);
    const sumX4 = x.reduce((sum, xi) => sum + xi * xi * xi * xi, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2Y = x.reduce((sum, xi, i) => sum + xi * xi * y[i], 0);

    // Solve system of equations using Cramer's rule (simplified)
    const det = n * sumX2 * sumX4 + sumX * sumX3 * sumX2 + sumX2 * sumX * sumX3
               - sumX2 * sumX2 * sumX2 - n * sumX3 * sumX3 - sumX * sumX * sumX4;

    if (Math.abs(det) < 0.0001) {
      // Fall back to linear if determinant is too small
      return this.linearRegression(timeSeries, metric, config);
    }

    const a = (sumY * sumX2 * sumX4 + sumXY * sumX3 * sumX2 + sumX2Y * sumX * sumX3
             - sumX2Y * sumX2 * sumX2 - sumY * sumX3 * sumX3 - sumXY * sumX * sumX4) / det;
    const b = (n * sumXY * sumX4 + sumY * sumX3 * sumX2 + sumX2Y * sumX * sumX2
             - sumX2Y * sumX * sumX2 - n * sumX3 * sumX2Y - sumY * sumX * sumX4) / det;
    const c = (n * sumX2 * sumX2Y + sumX * sumXY * sumX2 + sumX2 * sumX * sumXY
             - sumX2 * sumX2 * sumY - n * sumXY * sumX3 - sumX * sumX * sumX2Y) / det;

    // Generate predictions
    const predictions = [];
    const lastTimestamp = timeSeries[timeSeries.length - 1].timestamp;
    const monthMs = 30 * 24 * 60 * 60 * 1000;

    for (let i = 1; i <= config.predictionHorizon; i++) {
      const futureX = n - 1 + i;
      const predictedValue = a * futureX * futureX + b * futureX + c;
      const timestamp = new Date(lastTimestamp.getTime() + i * monthMs);

      // Calculate confidence intervals
      const predicted = x.map(xi => a * xi * xi + b * xi + c);
      const stdError = this.calculateStandardError(y, predicted);
      const confidenceMultiplier = config.confidenceLevel === 0.95 ? 1.96 : 1;

      predictions.push({
        timestamp,
        value: predictedValue,
        lowerBound: predictedValue - confidenceMultiplier * stdError,
        upperBound: predictedValue + confidenceMultiplier * stdError,
        confidence: config.confidenceLevel
      });
    }

    const predicted = x.map(xi => a * xi * xi + b * xi + c);
    const accuracy = this.calculateAccuracyMetrics(y, predicted);

    return {
      fundId: 0,
      metric,
      predictions,
      accuracy,
      modelMetadata: {
        type: 'polynomial',
        parameters: { a, b, c, degree: 2 },
        trainingDataPoints: n,
        executionTimeMs: 0
      }
    };
  }

  private async ensembleModel(
    timeSeries: TimeSeriesData[],
    metric: string,
    config: PredictionConfig
  ): Promise<PredictionResult> {
    // Run multiple models and average their predictions
    const models = await Promise.all([
      this.linearRegression(timeSeries, metric, config),
      this.exponentialSmoothing(timeSeries, metric, config),
      this.polynomialRegression(timeSeries, metric, config)
    ]);

    // Combine predictions using weighted average based on accuracy
    const weights = models.map(m => m.accuracy.r2Score);
    const totalWeight = weights.reduce((sum, w) => sum + Math.max(0, w), 0);
    const normalizedWeights = weights.map(w => Math.max(0, w) / totalWeight);

    const ensemblePredictions = [];

    for (let i = 0; i < config.predictionHorizon; i++) {
      let value = 0;
      let lowerBound = 0;
      let upperBound = 0;

      models.forEach((model, mi) => {
        if (model.predictions[i]) {
          value += model.predictions[i].value * normalizedWeights[mi];
          lowerBound += model.predictions[i].lowerBound * normalizedWeights[mi];
          upperBound += model.predictions[i].upperBound * normalizedWeights[mi];
        }
      });

      ensemblePredictions.push({
        timestamp: models[0].predictions[i].timestamp,
        value,
        lowerBound,
        upperBound,
        confidence: config.confidenceLevel
      });
    }

    // Calculate ensemble accuracy (average of individual model accuracies)
    const ensembleAccuracy = {
      mae: models.reduce((sum, m) => sum + m.accuracy.mae, 0) / models.length,
      rmse: models.reduce((sum, m) => sum + m.accuracy.rmse, 0) / models.length,
      mape: models.reduce((sum, m) => sum + m.accuracy.mape, 0) / models.length,
      r2Score: models.reduce((sum, m) => sum + m.accuracy.r2Score, 0) / models.length
    };

    return {
      fundId: 0,
      metric,
      predictions: ensemblePredictions,
      accuracy: ensembleAccuracy,
      modelMetadata: {
        type: 'ensemble',
        parameters: { models: models.map(m => m.modelMetadata.type), weights: normalizedWeights },
        trainingDataPoints: timeSeries.length,
        executionTimeMs: 0
      }
    };
  }

  private calculateAccuracyMetrics(actual: number[], predicted: number[]): PredictionResult['accuracy'] {
    const n = actual.length;

    // Mean Absolute Error
    const mae = actual.reduce((sum, a, i) => sum + Math.abs(a - predicted[i]), 0) / n;

    // Root Mean Square Error
    const mse = actual.reduce((sum, a, i) => sum + Math.pow(a - predicted[i], 2), 0) / n;
    const rmse = Math.sqrt(mse);

    // Mean Absolute Percentage Error
    const mape = actual.reduce((sum, a, i) => {
      if (a !== 0) {
        return sum + Math.abs((a - predicted[i]) / a);
      }
      return sum;
    }, 0) / n;

    // R-squared
    const meanActual = actual.reduce((sum, a) => sum + a, 0) / n;
    const ssRes = actual.reduce((sum, a, i) => sum + Math.pow(a - predicted[i], 2), 0);
    const ssTot = actual.reduce((sum, a) => sum + Math.pow(a - meanActual, 2), 0);
    const r2Score = ssTot === 0 ? 0 : 1 - (ssRes / ssTot);

    return { mae, rmse, mape, r2Score };
  }

  private calculateStandardError(actual: number[], predicted: number[]): number {
    const n = actual.length;
    const residuals = actual.map((a, i) => a - predicted[i]);
    const sse = residuals.reduce((sum, r) => sum + r * r, 0);
    return Math.sqrt(sse / (n - 2));
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    return values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
  }

  private calculateTrendCoefficient(timeSeries: TimeSeriesData[]): number {
    const n = timeSeries.length;
    const x = timeSeries.map((_, i) => i);
    const y = timeSeries.map(d => d.value);

    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);

    return (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  private calculateVolatility(timeSeries: TimeSeriesData[]): number {
    const values = timeSeries.map(d => d.value);
    const returns = [];

    for (let i = 1; i < values.length; i++) {
      if (values[i - 1] !== 0) {
        returns.push((values[i] - values[i - 1]) / values[i - 1]);
      }
    }

    if (returns.length === 0) return 0;

    const variance = this.calculateVariance(returns);
    return Math.sqrt(variance);
  }

  private detectInflectionPoints(timeSeries: TimeSeriesData[]): number[] {
    const values = timeSeries.map(d => d.value);
    const inflectionPoints = [];

    for (let i = 1; i < values.length - 1; i++) {
      const prev = values[i - 1];
      const curr = values[i];
      const next = values[i + 1];

      // Check for local maxima or minima
      if ((curr > prev && curr > next) || (curr < prev && curr < next)) {
        inflectionPoints.push(i);
      }
    }

    return inflectionPoints;
  }

  private detectSeasonality(timeSeries: TimeSeriesData[]): { detected: boolean; period?: number } {
    if (timeSeries.length < 24) {
      return { detected: false };
    }

    const values = timeSeries.map(d => d.value);

    // Simple autocorrelation check for seasonality
    for (let lag = 3; lag <= 12; lag++) {
      const correlation = this.calculateAutocorrelation(values, lag);

      if (correlation > 0.7) {
        return { detected: true, period: lag };
      }
    }

    return { detected: false };
  }

  private calculateAutocorrelation(values: number[], lag: number): number {
    const n = values.length - lag;
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;

    let numerator = 0;
    let denominator = 0;

    for (let i = 0; i < n; i++) {
      numerator += (values[i] - mean) * (values[i + lag] - mean);
    }

    for (let i = 0; i < values.length; i++) {
      denominator += Math.pow(values[i] - mean, 2);
    }

    return denominator === 0 ? 0 : numerator / denominator;
  }

  private async calculateJCurve(fundId: number): Promise<number[]> {
    const metrics = await db.query.fundMetrics.findMany({
      where: eq(fundMetrics.fundId, fundId),
      orderBy: fundMetrics.asOfDate
    });

    return metrics.map(m => parseFloat(m.irr?.toString() || '0'));
  }

  private determineFundStage(ageYears: number, performance: number[]): 'investment' | 'growth' | 'harvest' | 'mature' {
    const currentPerformance = performance[performance.length - 1] || 0;

    if (ageYears < 2) return 'investment';
    if (ageYears < 5 && currentPerformance < 0.1) return 'investment';
    if (ageYears < 7) return 'growth';
    if (ageYears < 10) return 'harvest';
    return 'mature';
  }

  private async getCohortPerformance(fundIds: number[]): Promise<number[]> {
    const metrics = await db.query.fundMetrics.findMany({
      where: inArray(fundMetrics.fundId, fundIds),
      orderBy: desc(fundMetrics.asOfDate)
    });

    const latestByFund = new Map<number, number>();

    for (const metric of metrics) {
      if (!latestByFund.has(metric.fundId)) {
        latestByFund.set(metric.fundId, parseFloat(metric.irr?.toString() || '0'));
      }
    }

    return Array.from(latestByFund.values());
  }

  private calculateMedian(values: number[]): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  private calculatePercentile(values: number[], percentile: number): number {
    const sorted = values.slice().sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  private calculatePercentileRank(value: number, population: number[]): number {
    const below = population.filter(v => v < value).length;
    return (below / population.length) * 100;
  }

  private async storePrediction(result: PredictionResult, config: PredictionConfig): Promise<void> {
    await db.insert(performancePredictions).values({
      fundId: result.fundId,
      predictionEngine: 'performance-prediction-v1',
      predictionType: result.metric,
      predictionHorizon: config.predictionHorizon,
      predictions: result.predictions,
      confidence: config.confidenceLevel,
      metadata: {
        modelType: config.modelType,
        accuracy: result.accuracy,
        parameters: result.modelMetadata.parameters
      },
      createdAt: new Date()
    });
  }
}

// Export singleton instance
export const performancePredictionEngine = new PerformancePredictionEngine();