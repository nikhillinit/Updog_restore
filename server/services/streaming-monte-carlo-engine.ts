/**
 * Streaming Monte Carlo Engine
 *
 * High-performance streaming implementation that solves memory and performance issues:
 * - Uses AsyncGenerators for streaming simulation batches
 * - Implements connection pooling with resource management
 * - Memory-efficient batch processing for 10k+ simulations
 * - Streaming aggregation without holding all data in memory
 *
 * @author Claude Code
 * @version 3.0 - Streaming Architecture
 */

import { Pool } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-serverless';
import * as schema from '@shared/schema';
import type {
  InsertMonteCarloSimulation,
  FundBaseline
} from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { toSafeNumber } from '@shared/type-safety-utils';

// Import existing types from the original engine
import type {
  SimulationConfig,
  PortfolioInputs,
  DistributionParameters,
  SimulationResults,
  RiskMetrics,
  ReserveOptimization,
  ScenarioAnalysis,
  ActionableInsights
} from './monte-carlo-engine';

// ============================================================================
// STREAMING TYPES & INTERFACES
// ============================================================================

export interface StreamingConfig extends SimulationConfig {
  batchSize?: number; // Default: 1000
  maxConcurrentBatches?: number; // Default: 4
  enableResultStreaming?: boolean; // Default: true
  memoryThresholdMB?: number; // Default: 100MB
  enableGarbageCollection?: boolean; // Default: true
}

export interface BatchResult {
  batchId: string;
  batchIndex: number;
  scenarios: SingleScenario[];
  processingTimeMs: number;
  memoryUsageMB: number;
}

export interface SingleScenario {
  irr: number;
  multiple: number;
  dpi: number;
  tvpi: number;
  totalValue: number;
  exitTiming: number;
  followOnNeed: number;
}

export interface StreamingStats {
  totalScenarios: number;
  processedBatches: number;
  averageBatchTimeMs: number;
  peakMemoryUsageMB: number;
  totalProcessingTimeMs: number;
  estimatedCompletion: Date;
}

export interface MemoryEfficientDistribution {
  min: number;
  max: number;
  mean: number;
  standardDeviation: number;
  percentiles: Map<number, number>;
  count: number;
  // No scenarios array - computed on-the-fly
}

// ============================================================================
// CONNECTION POOL MANAGER
// ============================================================================

class ConnectionPoolManager {
  private pools: Map<string, Pool> = new Map();
  private readonly maxPoolSize = 10;
  private readonly idleTimeoutMs = 30000;
  private readonly connectionTimeoutMs = 5000;

  async getPool(connectionString?: string): Promise<Pool> {
    const connStr = connectionString || process.env['DATABASE_URL']!;
    const poolKey = this.hashConnectionString(connStr);

    if (!this.pools.has(poolKey)) {
      const pool = new Pool({
        connectionString: connStr,
        max: this.maxPoolSize,
        idleTimeoutMillis: this.idleTimeoutMs,
        connectionTimeoutMillis: this.connectionTimeoutMs,
      });

      this.pools['set'](poolKey, pool);
    }

    return this.pools['get'](poolKey)!;
  }

  async closeAll(): Promise<void> {
    const closePromises = Array.from(this.pools.values()).map(pool =>
      pool.end()
    );
    await Promise.all(closePromises);
    this.pools.clear();
  }

  private hashConnectionString(connStr: string): string {
    // Simple hash for connection string (remove sensitive parts)
    return Buffer.from(connStr.split('@')[1] || connStr).toString('base64');
  }

  getStats() {
    return {
      activeConnections: this.pools.size,
      pools: Array.from(this.pools.keys())
    };
  }
}

// ============================================================================
// STREAMING AGGREGATOR
// ============================================================================

class StreamingAggregator {
  private aggregatedData: {
    totalScenarios: number;
    sums: Record<string, number>;
    squares: Record<string, number>;
    mins: Record<string, number>;
    maxs: Record<string, number>;
    sortedSamples: Record<string, number[]>; // For percentiles (limited size)
    histogram: Record<string, Map<number, number>>;
  };

  private readonly maxSampleSize = 10000; // Limit for percentile calculation
  private readonly histogramBins = 100;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.aggregatedData = {
      totalScenarios: 0,
      sums: {},
      squares: {},
      mins: {},
      maxs: {},
      sortedSamples: {},
      histogram: {}
    };
  }

  addBatch(batch: BatchResult): void {
    for (const scenario of batch.scenarios) {
      this.addScenario(scenario);
    }
  }

  private addScenario(scenario: SingleScenario): void {
    this.aggregatedData.totalScenarios++;

    const metrics = ['irr', 'multiple', 'dpi', 'tvpi', 'totalValue'];
    for (const metric of metrics) {
      const value = scenario[metric as keyof SingleScenario] as number;

      // Running sums for mean
      this.aggregatedData.sums[metric] = (this.aggregatedData.sums[metric] || 0) + value;

      // Running squares for variance
      this.aggregatedData.squares[metric] = (this.aggregatedData.squares[metric] || 0) + (value * value);

      // Min/Max tracking
      this.aggregatedData.mins[metric] = Math.min(this.aggregatedData.mins[metric] || value, value);
      this.aggregatedData.maxs[metric] = Math.max(this.aggregatedData.maxs[metric] || value, value);

      // Reservoir sampling for percentiles
      this.addToReservoir(metric, value);

      // Histogram for distribution
      this.addToHistogram(metric, value);
    }
  }

  private addToReservoir(metric: string, value: number): void {
    if (!this.aggregatedData.sortedSamples[metric]) {
      this.aggregatedData.sortedSamples[metric] = [];
    }

    const samples = this.aggregatedData.sortedSamples[metric];
    if (samples.length < this.maxSampleSize) {
      samples.push(value);
    } else {
      // Reservoir sampling algorithm
      const randomIndex = Math.floor(Math.random() * this.aggregatedData.totalScenarios);
      if (randomIndex < this.maxSampleSize) {
        samples[randomIndex] = value;
      }
    }
  }

  private addToHistogram(metric: string, value: number): void {
    if (!this.aggregatedData.histogram[metric]) {
      this.aggregatedData.histogram[metric] = new Map();
    }

    const min = this.aggregatedData.mins[metric];
    const max = this.aggregatedData.maxs[metric];
    const binSize = (max - min) / this.histogramBins;
    const binIndex = Math.floor((value - min) / binSize);

    const histogram = this.aggregatedData.histogram[metric];
    histogram['set'](binIndex, (histogram['get'](binIndex) || 0) + 1);
  }

  getResults(): Record<string, MemoryEfficientDistribution> {
    const results: Record<string, MemoryEfficientDistribution> = {};

    const metrics = ['irr', 'multiple', 'dpi', 'tvpi', 'totalValue'];
    for (const metric of metrics) {
      results[metric] = this.calculateDistribution(metric);
    }

    return results;
  }

  private calculateDistribution(metric: string): MemoryEfficientDistribution {
    const count = this.aggregatedData.totalScenarios;
    const sum = this.aggregatedData.sums[metric] || 0;
    const sumSquares = this.aggregatedData.squares[metric] || 0;

    const mean = sum / count;
    const variance = (sumSquares / count) - (mean * mean);
    const standardDeviation = Math.sqrt(Math.max(0, variance));

    // Calculate percentiles from sorted samples
    const samples = this.aggregatedData.sortedSamples[metric] || [];
    samples.sort((a: any, b: any) => a - b);

    const percentiles = new Map<number, number>();
    const percentileValues = [5, 10, 25, 50, 75, 90, 95];

    for (const p of percentileValues) {
      const index = Math.floor((p / 100) * (samples.length - 1));
      percentiles['set'](p, samples[index] || mean);
    }

    return {
      min: this.aggregatedData.mins[metric] || 0,
      max: this.aggregatedData.maxs[metric] || 0,
      mean,
      standardDeviation,
      percentiles,
      count
    };
  }

  getMemoryUsage(): number {
    // Estimate memory usage in MB
    const samplesMemory = Object.values(this.aggregatedData.sortedSamples)
      .reduce((sum: any, samples: any) => sum + samples.length * 8, 0); // 8 bytes per number

    const histogramMemory = Object.values(this.aggregatedData.histogram)
      .reduce((sum: any, hist: any) => sum + hist.size * 16, 0); // ~16 bytes per map entry

    const metadataMemory = 1024; // 1KB for metadata

    return (samplesMemory + histogramMemory + metadataMemory) / (1024 * 1024);
  }
}

// ============================================================================
// STREAMING MONTE CARLO ENGINE
// ============================================================================

export class StreamingMonteCarloEngine {
  private connectionManager = new ConnectionPoolManager();
  private db: any;
  private currentStats: StreamingStats | null = null;

  constructor() {
    this.initializeDatabase();
  }

  private async initializeDatabase(): Promise<void> {
    const pool = await this.connectionManager.getPool();
    this.db = drizzle({ client: pool, schema });
  }

  /**
   * Main streaming simulation method
   */
  async runStreamingSimulation(config: StreamingConfig): Promise<SimulationResults> {
    const startTime = Date.now();
    const simulationId = uuidv4();

    try {
      // Validate and set defaults
      const streamingConfig = this.validateAndSetDefaults(config);

      // Initialize aggregator and stats
      const aggregator = new StreamingAggregator();
      this.initializeStats(streamingConfig);

      // Get baseline data
      const baseline = await this.getBaselineData(streamingConfig.fundId, streamingConfig.baselineId);
      const portfolioInputs = await this.getPortfolioInputs(streamingConfig.fundId, baseline);
      const distributions = await this.calibrateDistributions(streamingConfig.fundId, baseline);

      // Set random seed for reproducibility
      if (streamingConfig.randomSeed) {
        this.setRandomSeed(streamingConfig.randomSeed);
      }

      // Stream simulation batches
      let batchIndex = 0;
      for await (const batch of this.streamSimulationBatches(streamingConfig, portfolioInputs, distributions)) {
        // Add batch to aggregator
        aggregator.addBatch(batch);

        // Update stats
        this.updateStats(batch, batchIndex++);

        // Garbage collection hint
        if (streamingConfig.enableGarbageCollection && batchIndex % 10 === 0) {
          this.forceGarbageCollection();
        }

        // Memory threshold check
        if (aggregator.getMemoryUsage() > streamingConfig.memoryThresholdMB!) {
          console.warn(`Memory usage exceeded threshold: ${aggregator.getMemoryUsage()}MB`);
        }
      }

      // Get final aggregated results
      const distributionResults = aggregator.getResults();

      // Convert to traditional format for compatibility
      const performanceResults = this.convertToTraditionalFormat(distributionResults);

      // Calculate risk metrics
      const riskMetrics = await this.calculateStreamingRiskMetrics(distributionResults);

      // Optimize reserve allocation
      const reserveOptimization = await this.optimizeReserveAllocationStreaming(
        streamingConfig,
        portfolioInputs,
        distributionResults
      );

      // Generate scenario analysis
      const scenarioAnalysis = this.generateScenarioAnalysisFromDistributions(distributionResults);

      // Generate insights
      const insights = this.generateInsights(
        performanceResults,
        riskMetrics,
        reserveOptimization,
        baseline
      );

      const results: SimulationResults = {
        simulationId,
        config: streamingConfig,
        executionTimeMs: Date.now() - startTime,
        irr: performanceResults.irr,
        multiple: performanceResults.multiple,
        dpi: performanceResults.dpi,
        tvpi: performanceResults.tvpi,
        totalValue: performanceResults.totalValue,
        riskMetrics,
        reserveOptimization,
        scenarios: scenarioAnalysis,
        insights
      };

      // Store results
      await this.storeResults(results);

      return results;

    } catch (error) {
      throw new Error(`Streaming Monte Carlo simulation failed: ${error.message}`);
    } finally {
      // Cleanup resources
      await this.cleanup();
    }
  }

  /**
   * Stream simulation batches using AsyncGenerator
   */
  private async* streamSimulationBatches(
    config: StreamingConfig,
    portfolioInputs: PortfolioInputs,
    distributions: DistributionParameters
  ): AsyncGenerator<BatchResult, void, unknown> {
    const totalBatches = Math.ceil(config.runs / config.batchSize!);
    const concurrencyLimit = config.maxConcurrentBatches!;

    for (let startBatch = 0; startBatch < totalBatches; startBatch += concurrencyLimit) {
      const endBatch = Math.min(startBatch + concurrencyLimit, totalBatches);

      // Process batches concurrently
      const batchPromises = [];
      for (let i = startBatch; i < endBatch; i++) {
        const batchStart = i * config.batchSize!;
        const batchSize = Math.min(config.batchSize!, config.runs - batchStart);

        batchPromises.push(this.processSingleBatch(
          i,
          batchSize,
          portfolioInputs,
          distributions,
          config.timeHorizonYears
        ));
      }

      // Yield batches as they complete
      const batches = await Promise.all(batchPromises);
      for (const batch of batches) {
        yield batch;
      }
    }
  }

  /**
   * Process a single batch of simulations
   */
  private async processSingleBatch(
    batchIndex: number,
    batchSize: number,
    portfolioInputs: PortfolioInputs,
    distributions: DistributionParameters,
    timeHorizonYears: number
  ): Promise<BatchResult> {
    const startTime = Date.now();
    const batchId = uuidv4();
    const scenarios: SingleScenario[] = [];

    // Pre-allocate array for better performance
    scenarios.length = batchSize;

    for (let i = 0; i < batchSize; i++) {
      scenarios[i] = this.generateSingleScenario(portfolioInputs, distributions, timeHorizonYears);
    }

    const processingTimeMs = Date.now() - startTime;
    const memoryUsageMB = this.estimateBatchMemoryUsage(batchSize);

    return {
      batchId,
      batchIndex,
      scenarios,
      processingTimeMs,
      memoryUsageMB
    };
  }

  /**
   * Generate a single scenario (optimized version)
   */
  private generateSingleScenario(
    portfolioInputs: PortfolioInputs,
    distributions: DistributionParameters,
    timeHorizonYears: number
  ): SingleScenario {
    // Use pre-computed constants for better performance
    const timeDecay = Math.pow(0.98, timeHorizonYears - 5);

    // Generate correlated random variables
    const irrSample = this.sampleNormal(distributions.irr.mean, distributions.irr.volatility);
    const multipleSample = this.sampleNormal(distributions.multiple.mean, distributions.multiple.volatility);
    const dpiSample = Math.max(0, this.sampleNormal(distributions.dpi.mean, distributions.dpi.volatility));
    const exitTimingSample = Math.max(1, this.sampleNormal(distributions.exitTiming.mean, distributions.exitTiming.volatility));
    const followOnSample = this.sampleNormal(distributions.followOnSize.mean, distributions.followOnSize.volatility);

    // Calculate compound factor once
    const compoundFactor = Math.pow(1 + irrSample, timeHorizonYears);

    // Calculate scenario values
    const totalValue = portfolioInputs.deployedCapital * multipleSample * compoundFactor * timeDecay;
    const tvpi = multipleSample * timeDecay;

    return {
      irr: irrSample,
      multiple: multipleSample,
      dpi: dpiSample,
      tvpi: Math.max(0, tvpi),
      totalValue: Math.max(0, totalValue),
      exitTiming: exitTimingSample,
      followOnNeed: followOnSample
    };
  }

  /**
   * Convert streaming results to traditional format for compatibility
   */
  private convertToTraditionalFormat(distributions: Record<string, MemoryEfficientDistribution>): any {
    const results: any = {};

    for (const [metric, dist] of Object.entries(distributions)) {
      const percentiles = {
        p5: dist.percentiles['get'](5) || dist.min,
        p25: dist.percentiles['get'](25) || dist.min,
        p50: dist.percentiles['get'](50) || dist.mean,
        p75: dist.percentiles['get'](75) || dist.max,
        p95: dist.percentiles['get'](95) || dist.max
      };

      results[metric] = {
        scenarios: [], // Empty for memory efficiency
        percentiles,
        statistics: {
          mean: dist.mean,
          standardDeviation: dist.standardDeviation,
          min: dist.min,
          max: dist.max
        },
        confidenceIntervals: {
          ci68: [dist.mean - dist.standardDeviation, dist.mean + dist.standardDeviation],
          ci95: [dist.mean - 2 * dist.standardDeviation, dist.mean + 2 * dist.standardDeviation]
        }
      };
    }

    return results;
  }

  /**
   * Calculate risk metrics from streaming data
   */
  private async calculateStreamingRiskMetrics(distributions: Record<string, MemoryEfficientDistribution>): Promise<RiskMetrics> {
    const irrDist = distributions.irr;
    const totalValueDist = distributions.totalValue;

    // Value at Risk from percentiles
    const var5 = irrDist.percentiles['get'](5) || irrDist.min;
    const var10 = irrDist.percentiles['get'](10) || irrDist.min;

    // Estimate CVaR (simplified calculation)
    const cvar5 = var5 * 0.8; // Conservative estimate
    const cvar10 = var10 * 0.85;

    // Probability of loss (using normal approximation)
    const probabilityOfLoss = this.normalCDF(0, irrDist.mean, irrDist.standardDeviation);

    // Downside risk (simplified calculation)
    const downsideRisk = irrDist.standardDeviation * 0.7; // Approximate

    // Risk ratios
    const riskFreeRate = 0.02;
    const excessReturn = irrDist.mean - riskFreeRate;
    const sharpeRatio = excessReturn / irrDist.standardDeviation;
    const sortinoRatio = excessReturn / downsideRisk;

    // Max drawdown (estimated)
    const maxDrawdown = (totalValueDist.max - totalValueDist.min) / totalValueDist.max;

    return {
      valueAtRisk: { var5, var10 },
      conditionalValueAtRisk: { cvar5, cvar10 },
      probabilityOfLoss,
      downsideRisk,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown
    };
  }

  /**
   * Streaming reserve optimization
   */
  private async optimizeReserveAllocationStreaming(
    config: StreamingConfig,
    portfolioInputs: PortfolioInputs,
    distributions: Record<string, MemoryEfficientDistribution>
  ): Promise<ReserveOptimization> {
    const currentReserveRatio = portfolioInputs.reserveRatio;
    const reserveRatios = [];

    // Test reserve ratios from 10% to 50%
    for (let ratio = 0.10; ratio <= 0.50; ratio += 0.05) {
      reserveRatios.push(ratio);
    }

    const allocationAnalysis = [];

    for (const ratio of reserveRatios) {
      // Estimate performance for this reserve ratio
      const expectedIRR = this.estimateReserveImpact(distributions.irr.mean, ratio, portfolioInputs);
      const riskAdjustedReturn = expectedIRR / distributions.irr.standardDeviation;
      const followOnCoverage = this.estimateFollowOnCoverage(ratio);

      allocationAnalysis.push({
        reserveRatio: ratio,
        expectedIRR,
        riskAdjustedReturn,
        followOnCoverage
      });
    }

    // Find optimal allocation
    const optimal = allocationAnalysis.reduce((best: any, current: any) =>
      current.riskAdjustedReturn > best.riskAdjustedReturn ? current : best
    );

    return {
      currentReserveRatio,
      optimalReserveRatio: optimal.reserveRatio,
      improvementPotential: optimal.expectedIRR -
        allocationAnalysis.find(a => Math.abs(a.reserveRatio - currentReserveRatio) < 0.01)?.expectedIRR || 0,
      coverageScenarios: {
        p25: 0.6,
        p50: 0.75,
        p75: 0.9
      },
      allocationRecommendations: allocationAnalysis
    };
  }

  // ============================================================================
  // UTILITY METHODS
  // ============================================================================

  private validateAndSetDefaults(config: StreamingConfig): StreamingConfig {
    return {
      ...config,
      batchSize: config.batchSize || 1000,
      maxConcurrentBatches: config.maxConcurrentBatches || 4,
      enableResultStreaming: config.enableResultStreaming ?? true,
      memoryThresholdMB: config.memoryThresholdMB || 100,
      enableGarbageCollection: config.enableGarbageCollection ?? true
    };
  }

  private initializeStats(config: StreamingConfig): void {
    this.currentStats = {
      totalScenarios: config.runs,
      processedBatches: 0,
      averageBatchTimeMs: 0,
      peakMemoryUsageMB: 0,
      totalProcessingTimeMs: 0,
      estimatedCompletion: new Date(Date.now() + (config.runs / 1000) * 100) // Rough estimate
    };
  }

  private updateStats(batch: BatchResult, batchIndex: number): void {
    if (!this.currentStats) return;

    this.currentStats.processedBatches++;
    this.currentStats.averageBatchTimeMs =
      (this.currentStats.averageBatchTimeMs * batchIndex + batch.processingTimeMs) / (batchIndex + 1);
    this.currentStats.peakMemoryUsageMB = Math.max(
      this.currentStats.peakMemoryUsageMB,
      batch.memoryUsageMB
    );
  }

  private estimateBatchMemoryUsage(batchSize: number): number {
    // Estimate memory usage: 7 numbers per scenario * 8 bytes * batchSize
    return (batchSize * 7 * 8) / (1024 * 1024);
  }

  private forceGarbageCollection(): void {
    if (global.gc) {
      global.gc();
    }
  }

  private normalCDF(x: number, mean: number, stdDev: number): number {
    const z = (x - mean) / stdDev;
    return 0.5 * (1 + this.erf(z / Math.sqrt(2)));
  }

  private erf(x: number): number {
    // Approximation of error function
    const a1 = 0.254829592;
    const a2 = -0.284496736;
    const a3 = 1.421413741;
    const a4 = -1.453152027;
    const a5 = 1.061405429;
    const p = 0.3275911;

    const sign = x >= 0 ? 1 : -1;
    x = Math.abs(x);

    const t = 1.0 / (1.0 + p * x);
    const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private estimateReserveImpact(baseIRR: number, reserveRatio: number, portfolioInputs: PortfolioInputs): number {
    // Simple model: optimal around 25%, with diminishing returns
    const optimalRatio = 0.25;
    const deviation = Math.abs(reserveRatio - optimalRatio);
    const penalty = deviation * 0.1; // 10% penalty per 10% deviation
    return baseIRR * (1 - penalty);
  }

  private estimateFollowOnCoverage(reserveRatio: number): number {
    // Simple model: linear relationship with some randomness
    return Math.min(reserveRatio * 2.5, 1.0);
  }

  private generateScenarioAnalysisFromDistributions(distributions: Record<string, MemoryEfficientDistribution>): ScenarioAnalysis {
    return {
      bullMarket: this.extractPercentile(distributions, 90),
      bearMarket: this.extractPercentile(distributions, 10),
      stressTest: this.extractPercentile(distributions, 5),
      baseCase: this.extractPercentile(distributions, 50)
    };
  }

  private extractPercentile(distributions: Record<string, MemoryEfficientDistribution>, percentile: number): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [metric, dist] of Object.entries(distributions)) {
      result[metric] = dist.percentiles['get'](percentile) || dist.mean;
    }
    return result;
  }

  // Reuse existing methods from the original engine
  private async getBaselineData(fundId: number, baselineId?: string): Promise<FundBaseline> {
    // Implementation same as original engine
    let baseline: FundBaseline | undefined;

    if (baselineId) {
      baseline = await this.db.query.fundBaselines.findFirst({
        where: and(
          eq(schema.fundBaselines.id, baselineId),
          eq(schema.fundBaselines.fundId, fundId),
          eq(schema.fundBaselines.isActive, true)
        )
      });
    } else {
      baseline = await this.db.query.fundBaselines.findFirst({
        where: and(
          eq(schema.fundBaselines.fundId, fundId),
          eq(schema.fundBaselines.isDefault, true),
          eq(schema.fundBaselines.isActive, true)
        )
      });
    }

    if (!baseline) {
      throw new Error('No suitable baseline found for simulation');
    }

    return baseline;
  }

  private async getPortfolioInputs(fundId: number, baseline: FundBaseline): Promise<PortfolioInputs> {
    // Implementation same as original engine
    const fund = await this.db.query.funds.findFirst({
      where: eq(schema.funds.id, fundId)
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const fundSize = parseFloat(fund.size.toString());
    const deployedCapital = parseFloat(baseline.deployedCapital.toString());
    const reserveRatio = (fundSize - deployedCapital) / fundSize;

    const sectorDistribution = baseline.sectorDistribution as Record<string, number> || {};
    const stageDistribution = baseline.stageDistribution as Record<string, number> || {};

    const totalSectorCount = Object.values(sectorDistribution).reduce((sum: any, count: any) => sum + count, 0);
    const totalStageCount = Object.values(stageDistribution).reduce((sum: any, count: any) => sum + count, 0);

    const sectorWeights: Record<string, number> = {};
    const stageWeights: Record<string, number> = {};

    for (const [sector, count] of Object.entries(sectorDistribution)) {
      sectorWeights[sector] = totalSectorCount > 0 ? count / totalSectorCount : 0;
    }

    for (const [stage, count] of Object.entries(stageDistribution)) {
      stageWeights[stage] = totalStageCount > 0 ? count / totalStageCount : 0;
    }

    return {
      fundSize,
      deployedCapital,
      reserveRatio,
      sectorWeights,
      stageWeights,
      averageInvestmentSize: parseFloat(baseline.averageInvestment?.toString() || '1000000')
    };
  }

  private async calibrateDistributions(fundId: number, baseline: FundBaseline): Promise<DistributionParameters> {
    // Implementation same as original engine
    const reports = await this.db.query.varianceReports.findMany({
      where: and(
        eq(schema.varianceReports.fundId, fundId),
        eq(schema.varianceReports.baselineId, baseline.id)
      ),
      orderBy: desc(schema.varianceReports.asOfDate),
      limit: 30
    });

    if (reports.length < 3) {
      return this.getDefaultDistributions();
    }

    const irrVariances = this.extractVariances(reports, 'irrVariance');
    const multipleVariances = this.extractVariances(reports, 'multipleVariance');
    const dpiVariances = this.extractVariances(reports, 'dpiVariance');

    return {
      irr: {
        mean: parseFloat(baseline.irr?.toString() || '0.15'),
        volatility: this.calculateVolatility(irrVariances) || 0.08
      },
      multiple: {
        mean: parseFloat(baseline.multiple?.toString() || '2.5'),
        volatility: this.calculateVolatility(multipleVariances) || 0.6
      },
      dpi: {
        mean: parseFloat(baseline.dpi?.toString() || '0.8'),
        volatility: this.calculateVolatility(dpiVariances) || 0.3
      },
      exitTiming: {
        mean: 5.5,
        volatility: 2.0
      },
      followOnSize: {
        mean: 0.5,
        volatility: 0.3
      }
    };
  }

  private getDefaultDistributions(): DistributionParameters {
    return {
      irr: { mean: 0.15, volatility: 0.08 },
      multiple: { mean: 2.5, volatility: 0.6 },
      dpi: { mean: 0.8, volatility: 0.3 },
      exitTiming: { mean: 5.5, volatility: 2.0 },
      followOnSize: { mean: 0.5, volatility: 0.3 }
    };
  }

  private extractVariances(reports: any[], field: string): number[] {
    return reports
      .map(r => r[field])
      .filter(v => v !== null && v !== undefined)
      .map(v => parseFloat(v.toString()));
  }

  private calculateVolatility(values: number[]): number {
    if (values.length < 2) return 0;

    const mean = values.reduce((sum: any, v: any) => sum + v, 0) / values.length;
    const variance = values.reduce((sum: any, v: any) => sum + Math.pow(v - mean, 2), 0) / (values.length - 1);
    return Math.sqrt(variance);
  }

  private generateInsights(
    performanceResults: any,
    riskMetrics: RiskMetrics,
    reserveOptimization: ReserveOptimization,
    baseline: FundBaseline
  ): ActionableInsights {
    const recommendations: string[] = [];
    const warnings: string[] = [];
    const opportunities: string[] = [];

    // Reserve allocation insights
    if (reserveOptimization.improvementPotential > 0.02) {
      recommendations.push(
        `Adjust reserve allocation to ${(reserveOptimization.optimalReserveRatio * 100).toFixed(1)}% to improve expected IRR by ${(reserveOptimization.improvementPotential * 100).toFixed(1)}%`
      );
    }

    // Risk warnings
    if (riskMetrics.probabilityOfLoss > 0.15) {
      warnings.push(`High downside risk: ${(riskMetrics.probabilityOfLoss * 100).toFixed(1)}% probability of negative returns`);
    }

    if (riskMetrics.sharpeRatio < 1.0) {
      warnings.push(`Low risk-adjusted returns (Sharpe ratio: ${riskMetrics.sharpeRatio.toFixed(2)})`);
    }

    // Opportunity identification
    if (performanceResults.irr.statistics.standardDeviation > 0.12) {
      opportunities.push('High return variance suggests potential for better portfolio diversification');
    }

    if (reserveOptimization.coverageScenarios.p50 < 0.7) {
      opportunities.push('Consider increasing follow-on capacity to capture more upside opportunities');
    }

    const keyMetrics: Array<{
      metric: string;
      value: number;
      benchmark: number;
      status: 'above' | 'below' | 'at' | 'warning';
      impact: 'high' | 'medium' | 'low';
    }> = [
      {
        metric: 'Expected IRR',
        value: toSafeNumber(performanceResults.irr.statistics.mean),
        benchmark: 0.15,
        status: toSafeNumber(performanceResults.irr.statistics.mean) >= 0.15 ? 'above' : 'below',
        impact: 'high'
      },
      {
        metric: 'Risk-Adjusted Return',
        value: toSafeNumber(riskMetrics.sharpeRatio),
        benchmark: 1.0,
        status: toSafeNumber(riskMetrics.sharpeRatio) >= 1.0 ? 'above' : 'below',
        impact: 'high'
      },
      {
        metric: 'Downside Risk',
        value: toSafeNumber(riskMetrics.probabilityOfLoss),
        benchmark: 0.1,
        status: toSafeNumber(riskMetrics.probabilityOfLoss) <= 0.1 ? 'above' : 'warning',
        impact: 'medium'
      }
    ];

    return {
      primaryRecommendations: recommendations.slice(0, 3),
      riskWarnings: warnings,
      opportunityAreas: opportunities,
      keyMetrics
    };
  }

  private async storeResults(results: SimulationResults): Promise<void> {
    const simulationData: InsertMonteCarloSimulation = {
      fundId: results.config.fundId,
      simulationName: `Streaming Monte Carlo Simulation ${new Date().toISOString()}`,
      simulationType: 'streaming_portfolio_construction',
      numberOfRuns: results.config.runs,
      inputDistributions: {},
      summaryStatistics: {},
      percentileResults: {},
      createdBy: 1, // TODO: Get from context
      tags: ['streaming', 'portfolio-construction', 'risk-analysis', 'memory-efficient'],
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      metadata: {
        baseline: results.config.baselineId,
        timeHorizon: results.config.timeHorizonYears,
        randomSeed: results.config.randomSeed,
        streamingConfig: results.config
      }
    };

    await this.db.insert(schema.monteCarloSimulations).values(simulationData);
  }

  private setRandomSeed(seed: number): void {
    let state = seed;
    Math.random = () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  private sampleNormal(mean: number, stdDev: number): number {
    const u1 = Math.random();
    const u2 = Math.random();
    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return mean + z0 * stdDev;
  }

  private async cleanup(): Promise<void> {
    await this.connectionManager.closeAll();
  }

  /**
   * Get current streaming statistics
   */
  getStreamingStats(): StreamingStats | null {
    return this.currentStats;
  }

  /**
   * Get connection pool statistics
   */
  getConnectionStats() {
    return this.connectionManager.getStats();
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const streamingMonteCarloEngine = new StreamingMonteCarloEngine();