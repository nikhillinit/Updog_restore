/**
 * Backtesting Service
 *
 * Validates Monte Carlo simulation accuracy against historical fund performance
 * and enables scenario replay analysis using the StreamingMonteCarloEngine.
 *
 * Key features:
 * - Runs simulations and compares against actual fund performance
 * - Calculates validation metrics (MAE, RMSE, percentile hit rates)
 * - Persists results to database for historical analysis
 * - Supports scenario comparisons with historical market conditions
 *
 * @author Claude Code
 * @version 1.0 - Initial Implementation
 */

import { v4 as uuidv4 } from 'uuid';
import { db } from '../db';
import { eq, desc, and, gte, lte } from 'drizzle-orm';
import { unifiedMonteCarloService } from './monte-carlo-service-unified';
import {
  getScenarioByName,
  getScenarioMarketParameters,
  getAvailableScenarios,
  getDefaultMarketParameters,
} from '../data/historical-scenarios';
import {
  backtestResults,
  fundBaselines,
  varianceReports,
  fundStateSnapshots,
} from '@shared/schema';
import type { BacktestResultRecord, InsertBacktestResultRecord } from '@shared/schema';
import { safeDivide, calculateNormalizedError } from '@shared/validation/backtesting-schemas';
import type {
  BacktestConfig,
  BacktestResult,
  BacktestMetric,
  DistributionSummary,
  ActualPerformance,
  ValidationMetrics,
  ScenarioComparison,
  HistoricalScenarioName,
  SimulationSummary,
  DataQualityResult,
  CalibrationStatus,
  MarketParameters,
} from '@shared/types/backtesting';

// ============================================================================
// BACKTESTING SERVICE
// ============================================================================

export class BacktestingService {
  private readonly MAX_HISTORY_PER_FUND = 100;
  private readonly STALE_BASELINE_DAYS = 90;

  /**
   * Run a Monte Carlo backtest against historical fund performance
   */
  async runBacktest(config: BacktestConfig): Promise<BacktestResult> {
    const startTime = Date.now();
    const backtestId = uuidv4();

    // Run Monte Carlo simulation
    const simulationResult = await this.runSimulation(config);

    // Extract simulation summary
    const simulationSummary = this.extractSimulationSummary(simulationResult, config);

    // Get actual fund performance from database
    const actualPerformance = await this.getActualPerformance(
      config.fundId,
      config.endDate,
      config.baselineId,
      config.snapshotId
    );

    // Assess data quality
    const dataQuality = await this.assessDataQuality(config.fundId, config.baselineId);

    // Calculate validation metrics with safe division
    const validationMetrics = this.calculateValidationMetrics(
      simulationSummary,
      actualPerformance,
      config.comparisonMetrics
    );

    // Run scenario comparisons if requested
    let scenarioComparisons: ScenarioComparison[] | undefined;
    if (config.includeHistoricalScenarios && config.historicalScenarios?.length) {
      scenarioComparisons = await this.runScenarioComparisons(
        config.fundId,
        config.historicalScenarios,
        config.simulationRuns
      );
    }

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      validationMetrics,
      simulationSummary,
      actualPerformance,
      dataQuality
    );

    const executionTimeMs = Date.now() - startTime;

    const result: BacktestResult = {
      backtestId,
      config,
      executionTimeMs,
      timestamp: new Date().toISOString(),
      simulationSummary,
      actualPerformance,
      validationMetrics,
      dataQuality,
      recommendations,
      ...(scenarioComparisons && scenarioComparisons.length > 0 ? { scenarioComparisons } : {}),
    };

    // Persist to database
    await this.persistBacktestResult(result);

    return result;
  }

  /**
   * Get backtest history for a fund from database
   */
  async getBacktestHistory(
    fundId: number,
    options: { limit?: number; offset?: number; startDate?: string; endDate?: string } = {}
  ): Promise<BacktestResult[]> {
    const { limit = 10, offset = 0, startDate, endDate } = options;

    const conditions = [eq(backtestResults.fundId, fundId)];

    if (startDate) {
      conditions.push(gte(backtestResults.createdAt, new Date(startDate)));
    }
    if (endDate) {
      conditions.push(lte(backtestResults.createdAt, new Date(endDate)));
    }

    const records = await db.query.backtestResults.findMany({
      where: and(...conditions),
      orderBy: desc(backtestResults.createdAt),
      limit,
      offset,
    });

    return records.map((record) => this.recordToBacktestResult(record));
  }

  /**
   * Get a specific backtest result by ID
   */
  async getBacktestById(backtestId: string): Promise<BacktestResult | null> {
    const record = await db.query.backtestResults.findFirst({
      where: eq(backtestResults.id, backtestId),
    });

    return record ? this.recordToBacktestResult(record) : null;
  }

  /**
   * Compare multiple historical scenarios
   */
  async compareScenarios(
    fundId: number,
    scenarios: HistoricalScenarioName[],
    simulationRuns: number = 5000
  ): Promise<ScenarioComparison[]> {
    return this.runScenarioComparisons(fundId, scenarios, simulationRuns);
  }

  /**
   * Get available historical scenarios
   */
  getAvailableScenariosList(): HistoricalScenarioName[] {
    return getAvailableScenarios();
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async runSimulation(config: BacktestConfig) {
    const simulationConfig = {
      fundId: config.fundId,
      runs: config.simulationRuns,
      timeHorizonYears: this.calculateTimeHorizon(config.startDate, config.endDate),
      forceEngine: 'auto' as const,
      ...(config.baselineId ? { baselineId: config.baselineId } : {}),
      ...(config.randomSeed !== undefined ? { randomSeed: config.randomSeed } : {}),
    };

    return unifiedMonteCarloService.runSimulation(simulationConfig);
  }

  private extractSimulationSummary(
    result: Awaited<ReturnType<typeof unifiedMonteCarloService.runSimulation>>,
    config: BacktestConfig
  ): SimulationSummary {
    const metrics: Partial<Record<BacktestMetric, DistributionSummary>> = {};

    for (const metric of config.comparisonMetrics) {
      const data = result[metric as keyof typeof result];
      if (data && typeof data === 'object' && 'statistics' in data && 'percentiles' in data) {
        const typedData = data as {
          statistics: { mean: number; standardDeviation: number; min: number; max: number };
          percentiles: { p5: number; p25: number; p50: number; p75: number; p95: number };
        };
        metrics[metric] = {
          mean: typedData.statistics.mean,
          median: typedData.percentiles.p50,
          p5: typedData.percentiles.p5,
          p25: typedData.percentiles.p25,
          p75: typedData.percentiles.p75,
          p95: typedData.percentiles.p95,
          min: typedData.statistics.min,
          max: typedData.statistics.max,
          standardDeviation: typedData.statistics.standardDeviation,
        };
      }
    }

    return {
      runs: config.simulationRuns,
      metrics,
      engineUsed: result.performance.engineUsed,
      executionTimeMs: result.performance.executionTimeMs,
    };
  }

  private async getActualPerformance(
    fundId: number,
    asOfDate: string,
    baselineId?: string,
    snapshotId?: string
  ): Promise<ActualPerformance> {
    let dataSource: 'baseline' | 'variance_report' | 'snapshot' = 'baseline';
    let dataFreshness: 'fresh' | 'stale' | 'unknown' = 'unknown';

    // Try to get data from specified sources
    if (snapshotId) {
      const snapshot = await db.query.fundStateSnapshots.findFirst({
        where: eq(fundStateSnapshots.id, snapshotId),
      });
      if (snapshot) {
        dataSource = 'snapshot';
        const snapshotDate = snapshot.createdAt ?? snapshot.snapshotTime;
        const ageInDays = (Date.now() - snapshotDate.getTime()) / (1000 * 60 * 60 * 24);
        dataFreshness = ageInDays <= this.STALE_BASELINE_DAYS ? 'fresh' : 'stale';

        // Extract performance metrics from metricsState
        const metricsData = snapshot.metricsState as Record<string, unknown> | null;
        return {
          asOfDate,
          irr: (metricsData?.['irr'] as number) ?? null,
          tvpi: (metricsData?.['tvpi'] as number) ?? null,
          dpi: (metricsData?.['dpi'] as number) ?? null,
          multiple: (metricsData?.['multiple'] as number) ?? null,
          deployedCapital: Number(metricsData?.['deployedCapital'] ?? 0),
          distributedCapital: Number(metricsData?.['distributedCapital'] ?? 0),
          residualValue: Number(metricsData?.['residualValue'] ?? 0),
          dataSource,
          dataFreshness,
        };
      }
    }

    if (baselineId) {
      const baseline = await db.query.fundBaselines.findFirst({
        where: eq(fundBaselines.id, baselineId),
      });
      if (baseline) {
        dataSource = 'baseline';
        const ageInDays = (Date.now() - baseline.createdAt!.getTime()) / (1000 * 60 * 60 * 24);
        dataFreshness = ageInDays <= this.STALE_BASELINE_DAYS ? 'fresh' : 'stale';

        return {
          asOfDate,
          irr: baseline.irr ? Number(baseline.irr) : null,
          tvpi: baseline.tvpi ? Number(baseline.tvpi) : null,
          dpi: baseline.dpi ? Number(baseline.dpi) : null,
          multiple: baseline.multiple ? Number(baseline.multiple) : null,
          deployedCapital: Number(baseline.deployedCapital),
          distributedCapital: 0, // Not stored in baseline
          residualValue: Number(baseline.totalValue),
          dataSource,
          dataFreshness,
        };
      }
    }

    // Try to find the most recent baseline
    const latestBaseline = await db.query.fundBaselines.findFirst({
      where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.isActive, true)),
      orderBy: desc(fundBaselines.createdAt),
    });

    if (latestBaseline) {
      const ageInDays = (Date.now() - latestBaseline.createdAt!.getTime()) / (1000 * 60 * 60 * 24);
      dataFreshness = ageInDays <= this.STALE_BASELINE_DAYS ? 'fresh' : 'stale';

      return {
        asOfDate,
        irr: latestBaseline.irr ? Number(latestBaseline.irr) : null,
        tvpi: latestBaseline.tvpi ? Number(latestBaseline.tvpi) : null,
        dpi: latestBaseline.dpi ? Number(latestBaseline.dpi) : null,
        multiple: latestBaseline.multiple ? Number(latestBaseline.multiple) : null,
        deployedCapital: Number(latestBaseline.deployedCapital),
        distributedCapital: 0,
        residualValue: Number(latestBaseline.totalValue),
        dataSource: 'baseline',
        dataFreshness,
      };
    }

    // Check variance reports
    const latestVariance = await db.query.varianceReports.findFirst({
      where: eq(varianceReports.fundId, fundId),
      orderBy: desc(varianceReports.createdAt),
    });

    if (latestVariance) {
      const ageInDays = (Date.now() - latestVariance.createdAt!.getTime()) / (1000 * 60 * 60 * 24);
      dataFreshness = ageInDays <= this.STALE_BASELINE_DAYS ? 'fresh' : 'stale';

      const currentMetrics = latestVariance.currentMetrics as Record<string, unknown>;
      return {
        asOfDate,
        irr: (currentMetrics?.['irr'] as number) ?? null,
        tvpi: (currentMetrics?.['tvpi'] as number) ?? null,
        dpi: (currentMetrics?.['dpi'] as number) ?? null,
        multiple: (currentMetrics?.['multiple'] as number) ?? null,
        deployedCapital: Number(currentMetrics?.['deployedCapital'] ?? 0),
        distributedCapital: Number(currentMetrics?.['distributedCapital'] ?? 0),
        residualValue: Number(currentMetrics?.['residualValue'] ?? 0),
        dataSource: 'variance_report',
        dataFreshness,
      };
    }

    // No data available - return nulls
    return {
      asOfDate,
      irr: null,
      tvpi: null,
      dpi: null,
      multiple: null,
      deployedCapital: 0,
      distributedCapital: 0,
      residualValue: 0,
      dataSource: 'baseline',
      dataFreshness: 'unknown',
    };
  }

  private async assessDataQuality(fundId: number, baselineId?: string): Promise<DataQualityResult> {
    const warnings: string[] = [];

    // Check for baseline
    const baseline = baselineId
      ? await db.query.fundBaselines.findFirst({ where: eq(fundBaselines.id, baselineId) })
      : await db.query.fundBaselines.findFirst({
          where: and(eq(fundBaselines.fundId, fundId), eq(fundBaselines.isActive, true)),
          orderBy: desc(fundBaselines.createdAt),
        });

    const hasBaseline = !!baseline;
    let baselineAgeInDays: number | null = null;
    let isStale = false;

    if (baseline) {
      baselineAgeInDays = Math.floor(
        (Date.now() - baseline.createdAt!.getTime()) / (1000 * 60 * 60 * 24)
      );
      isStale = baselineAgeInDays > this.STALE_BASELINE_DAYS;

      if (isStale) {
        warnings.push(
          `Baseline is ${baselineAgeInDays} days old - consider creating a fresh baseline`
        );
      }
    } else {
      warnings.push('No baseline data available for fund');
    }

    // Count variance history
    const varianceHistory = await db.query.varianceReports.findMany({
      where: eq(varianceReports.fundId, fundId),
      columns: { id: true },
    });
    const varianceHistoryCount = varianceHistory.length;

    if (varianceHistoryCount === 0) {
      warnings.push('No variance history available - limited validation accuracy');
    }

    // Check for snapshots
    const snapshot = await db.query.fundStateSnapshots.findFirst({
      where: eq(fundStateSnapshots.fundId, fundId),
      orderBy: desc(fundStateSnapshots.createdAt),
    });
    const snapshotAvailable = !!snapshot;

    // Determine overall quality
    let overallQuality: 'good' | 'acceptable' | 'poor' = 'good';
    if (!hasBaseline || varianceHistoryCount === 0) {
      overallQuality = 'poor';
    } else if (isStale || varianceHistoryCount < 3) {
      overallQuality = 'acceptable';
    }

    return {
      hasBaseline,
      baselineAgeInDays,
      varianceHistoryCount,
      snapshotAvailable,
      isStale,
      warnings,
      overallQuality,
    };
  }

  private calculateValidationMetrics(
    simulation: SimulationSummary,
    actual: ActualPerformance,
    comparisonMetrics: BacktestMetric[]
  ): ValidationMetrics {
    const mae: Partial<Record<BacktestMetric, number | null>> = {};
    const rmse: Partial<Record<BacktestMetric, number | null>> = {};
    const hitRates: {
      p50: Partial<Record<BacktestMetric, boolean | null>>;
      p90: Partial<Record<BacktestMetric, boolean | null>>;
      p100: Partial<Record<BacktestMetric, boolean | null>>;
    } = {
      p50: {},
      p90: {},
      p100: {},
    };
    const incalculableMetrics: BacktestMetric[] = [];

    let totalScore = 0;
    let validMetricCount = 0;

    for (const metric of comparisonMetrics) {
      const simulated = simulation.metrics[metric];
      const actualValue = actual[metric as keyof ActualPerformance] as number | null;

      if (!simulated || actualValue === null || actualValue === undefined) {
        // Mark as incalculable
        incalculableMetrics.push(metric);
        mae[metric] = null;
        rmse[metric] = null;
        hitRates.p50[metric] = null;
        hitRates.p90[metric] = null;
        hitRates.p100[metric] = null;
        continue;
      }

      // Calculate MAE and RMSE using safe division for normalization
      const error = Math.abs(simulated.mean - actualValue);
      mae[metric] = error;
      rmse[metric] = Math.sqrt(error * error);

      // Percentile hit rates (CORRECTED from ultrathink review):
      // p50: Within 50% CI = p25 to p75
      // p90: Within 90% CI = p5 to p95
      // p100: Within full range = min to max
      hitRates.p50[metric] = actualValue >= simulated.p25 && actualValue <= simulated.p75;
      hitRates.p90[metric] = actualValue >= simulated.p5 && actualValue <= simulated.p95;
      hitRates.p100[metric] = actualValue >= simulated.min && actualValue <= simulated.max;

      // Score contribution using safe normalized error
      const normalizedError = calculateNormalizedError(simulated.mean, actualValue);
      if (normalizedError !== null) {
        const metricScore = Math.max(0, 100 - normalizedError * 100);
        totalScore += metricScore;
        validMetricCount++;
      }
    }

    const modelQualityScore = validMetricCount > 0 ? Math.round(totalScore / validMetricCount) : 0;

    // Determine calibration status
    const calibrationStatus = this.determineCalibrationStatus(
      simulation,
      actual,
      comparisonMetrics,
      incalculableMetrics
    );

    return {
      meanAbsoluteError: mae,
      rootMeanSquareError: rmse,
      percentileHitRates: hitRates,
      modelQualityScore,
      calibrationStatus,
      incalculableMetrics,
    };
  }

  private determineCalibrationStatus(
    simulation: SimulationSummary,
    actual: ActualPerformance,
    comparisonMetrics: BacktestMetric[],
    incalculableMetrics: BacktestMetric[]
  ): CalibrationStatus {
    const calculableMetrics = comparisonMetrics.filter((m) => !incalculableMetrics.includes(m));

    if (calculableMetrics.length === 0) {
      return 'insufficient-data';
    }

    let overPredictCount = 0;
    let underPredictCount = 0;
    let totalError = 0;
    let errorCount = 0;

    for (const metric of calculableMetrics) {
      const sim = simulation.metrics[metric];
      const act = actual[metric as keyof ActualPerformance] as number | null;

      if (!sim || act === null) continue;

      const error = Math.abs(sim.mean - act);
      const normalizedError = safeDivide(error, Math.abs(act));

      if (normalizedError !== null) {
        totalError += normalizedError;
        errorCount++;
      }

      if (sim.mean > act) {
        overPredictCount++;
      } else if (sim.mean < act) {
        underPredictCount++;
      }
    }

    const avgNormalizedError = errorCount > 0 ? totalError / errorCount : 0;

    // Well-calibrated if average normalized error < 10%
    if (avgNormalizedError < 0.1) {
      return 'well-calibrated';
    }

    // Determine bias direction
    if (overPredictCount > calculableMetrics.length / 2) {
      return 'over-predicting';
    } else if (underPredictCount > calculableMetrics.length / 2) {
      return 'under-predicting';
    }

    // Mixed bias but high error - use the majority direction
    return overPredictCount >= underPredictCount ? 'over-predicting' : 'under-predicting';
  }

  private async runScenarioComparisons(
    fundId: number,
    scenarios: HistoricalScenarioName[],
    simulationRuns: number
  ): Promise<ScenarioComparison[]> {
    const comparisons: ScenarioComparison[] = [];

    for (const scenarioName of scenarios) {
      if (scenarioName === 'custom') continue;

      const scenario = getScenarioByName(scenarioName);
      if (!scenario) continue;

      const marketParams = getScenarioMarketParameters(scenarioName);

      // Run simulation for this scenario
      const runsPerScenario = Math.max(1000, Math.floor(simulationRuns / scenarios.length));

      try {
        const result = await unifiedMonteCarloService.runSimulation({
          fundId,
          runs: runsPerScenario,
          timeHorizonYears: 5,
          forceEngine: 'auto',
        });

        // Apply market parameter adjustments to simulated results
        const adjustedPerformance = this.applyMarketAdjustment(result, marketParams);

        comparisons.push({
          scenario: scenarioName,
          simulatedPerformance: adjustedPerformance,
          description: scenario.description || `Scenario: ${scenarioName}`,
          keyInsights: this.generateScenarioInsights(
            scenarioName,
            adjustedPerformance,
            marketParams
          ),
          marketParameters: marketParams,
        });
      } catch (error) {
        console.error(`Failed to run scenario comparison for ${scenarioName}:`, error);
        // Continue with other scenarios
      }
    }

    return comparisons;
  }

  private applyMarketAdjustment(
    result: Awaited<ReturnType<typeof unifiedMonteCarloService.runSimulation>>,
    marketParams: MarketParameters
  ): DistributionSummary {
    const defaultParams = getDefaultMarketParameters();

    // Get base IRR from result
    const baseIRR =
      result.irr && typeof result.irr === 'object' && 'statistics' in result.irr
        ? (result.irr as { statistics: { mean: number } }).statistics.mean
        : 0.15;

    // Adjust based on market parameters relative to defaults
    const exitMultiplierRatio =
      safeDivide(marketParams.exitMultiplierMean, defaultParams.exitMultiplierMean) ?? 1;
    const adjustedMean = baseIRR * exitMultiplierRatio;

    // Scale volatility
    const volatilityRatio =
      safeDivide(marketParams.exitMultiplierVolatility, defaultParams.exitMultiplierVolatility) ??
      1;
    const adjustedStdDev = Math.abs(adjustedMean) * 0.3 * volatilityRatio;

    return {
      mean: adjustedMean,
      median: adjustedMean * 0.95,
      p5: adjustedMean - 1.645 * adjustedStdDev,
      p25: adjustedMean - 0.675 * adjustedStdDev,
      p75: adjustedMean + 0.675 * adjustedStdDev,
      p95: adjustedMean + 1.645 * adjustedStdDev,
      min: adjustedMean - 2.5 * adjustedStdDev,
      max: adjustedMean + 2.5 * adjustedStdDev,
      standardDeviation: adjustedStdDev,
    };
  }

  private generateScenarioInsights(
    scenario: HistoricalScenarioName,
    performance: DistributionSummary,
    marketParams: MarketParameters
  ): string[] {
    const insights: string[] = [];

    if (marketParams.failureRate > 0.3) {
      insights.push(
        `High failure rate (${(marketParams.failureRate * 100).toFixed(0)}%) - expect more write-offs`
      );
    }

    if (marketParams.exitMultiplierMean < 2.0) {
      insights.push(
        `Compressed exit multiples (${marketParams.exitMultiplierMean.toFixed(1)}x) - lower returns expected`
      );
    }

    if (marketParams.holdPeriodYears > 6) {
      insights.push(
        `Extended hold periods (${marketParams.holdPeriodYears.toFixed(1)} years) - delayed liquidity`
      );
    }

    if (marketParams.followOnProbability < 0.4) {
      insights.push('Reduced follow-on activity - capital constraints likely');
    }

    const spread = performance.p95 - performance.p5;
    if (spread > Math.abs(performance.mean) * 2) {
      insights.push('High outcome dispersion - significant uncertainty in returns');
    }

    if (insights.length === 0) {
      insights.push('Market conditions within normal ranges');
    }

    return insights;
  }

  private generateRecommendations(
    validation: ValidationMetrics,
    simulation: SimulationSummary,
    actual: ActualPerformance,
    dataQuality: DataQualityResult
  ): string[] {
    const recommendations: string[] = [];

    // Data quality recommendations
    if (dataQuality.overallQuality === 'poor') {
      recommendations.push('Improve data quality: create a baseline and track variance history');
    } else if (dataQuality.isStale) {
      recommendations.push('Baseline is stale - create a fresh baseline for accurate validation');
    }

    // Model quality recommendations
    if (validation.modelQualityScore < 50) {
      recommendations.push(
        'Low model quality score - consider recalibrating simulation parameters'
      );
    } else if (validation.modelQualityScore < 70) {
      recommendations.push('Model quality could be improved - review distribution assumptions');
    }

    // Calibration recommendations
    if (validation.calibrationStatus === 'over-predicting') {
      recommendations.push(
        'Model tends to over-predict returns - consider more conservative assumptions'
      );
    } else if (validation.calibrationStatus === 'under-predicting') {
      recommendations.push(
        'Model tends to under-predict returns - fund may be outperforming expectations'
      );
    } else if (validation.calibrationStatus === 'insufficient-data') {
      recommendations.push(
        'Insufficient data for calibration - run backtest after adding performance data'
      );
    }

    // Variance recommendations
    const irrSim = simulation.metrics.irr;
    if (irrSim && irrSim.standardDeviation > 0.15) {
      recommendations.push('High IRR variance detected - consider additional scenario analysis');
    }

    // Percentile hit rate recommendations
    if (validation.percentileHitRates.p50.irr === false) {
      recommendations.push(
        'Actual IRR outside 50% confidence interval - validate baseline assumptions'
      );
    }

    // Incalculable metrics
    if (validation.incalculableMetrics.length > 0) {
      recommendations.push(
        `Missing data for metrics: ${validation.incalculableMetrics.join(', ')} - add performance data`
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('Model performing within expected parameters - continue monitoring');
    }

    return recommendations;
  }

  private async persistBacktestResult(result: BacktestResult): Promise<void> {
    const insertData: InsertBacktestResultRecord = {
      fundId: result.config.fundId,
      config: result.config,
      simulationSummary: {
        runs: result.simulationSummary.runs,
        metrics: result.simulationSummary.metrics as Record<string, unknown>,
        engineUsed: result.simulationSummary.engineUsed,
        executionTimeMs: result.simulationSummary.executionTimeMs,
      },
      actualPerformance: result.actualPerformance,
      validationMetrics: {
        meanAbsoluteError: result.validationMetrics.meanAbsoluteError as Record<
          string,
          number | null
        >,
        rootMeanSquareError: result.validationMetrics.rootMeanSquareError as Record<
          string,
          number | null
        >,
        percentileHitRates: result.validationMetrics.percentileHitRates as {
          p50: Record<string, boolean | null>;
          p90: Record<string, boolean | null>;
          p100: Record<string, boolean | null>;
        },
        modelQualityScore: result.validationMetrics.modelQualityScore,
        calibrationStatus: result.validationMetrics.calibrationStatus,
        incalculableMetrics: result.validationMetrics.incalculableMetrics,
      },
      dataQuality: result.dataQuality,
      scenarioComparisons: result.scenarioComparisons?.map((sc) => ({
        scenario: sc.scenario,
        simulatedPerformance: sc.simulatedPerformance as unknown as Record<string, unknown>,
        description: sc.description,
        keyInsights: sc.keyInsights,
        marketParameters: sc.marketParameters as unknown as Record<string, unknown>,
      })),
      recommendations: result.recommendations,
      executionTimeMs: result.executionTimeMs,
      status: 'completed',
      baselineId: result.config.baselineId,
      snapshotId: result.config.snapshotId,
    };

    await db.insert(backtestResults).values(insertData);
  }

  private recordToBacktestResult(record: BacktestResultRecord): BacktestResult {
    const baseResult = {
      backtestId: record.id,
      config: record.config as BacktestConfig,
      executionTimeMs: record.executionTimeMs,
      timestamp: record.createdAt.toISOString(),
      simulationSummary: record.simulationSummary as SimulationSummary,
      actualPerformance: record.actualPerformance as ActualPerformance,
      validationMetrics: record.validationMetrics as ValidationMetrics,
      dataQuality: record.dataQuality as DataQualityResult,
      recommendations: record.recommendations,
    };

    // Only add scenarioComparisons if present
    if (record.scenarioComparisons && Array.isArray(record.scenarioComparisons)) {
      return {
        ...baseResult,
        scenarioComparisons: record.scenarioComparisons as unknown as ScenarioComparison[],
      };
    }

    return baseResult;
  }

  private calculateTimeHorizon(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const years = (end.getTime() - start.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    return Math.max(1, Math.min(15, Math.round(years)));
  }
}

// Export singleton instance
export const backtestingService = new BacktestingService();
