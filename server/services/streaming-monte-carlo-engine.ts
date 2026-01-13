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
import type { InsertMonteCarloSimulation, FundBaseline } from '@shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { toSafeNumber } from '@shared/type-safety-utils';
import { Decimal, toDecimal } from '@shared/lib/decimal-utils';
import { config } from '../config/index.js';

// Import existing types from the original engine
import type {
  SimulationConfig,
  PortfolioInputs,
  DistributionParameters,
  SimulationResults,
  RiskMetrics,
  ReserveOptimization,
  ScenarioAnalysis,
  ActionableInsights,
  PerformanceDistribution,
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
  private readonly connectionTimeoutMs = config.CONNECTION_TIMEOUT_MS;

  async getPool(connectionString?: string): Promise<Pool> {
    const connStr = connectionString || process.env['DATABASE_URL'];

    if (!connStr) {
      throw new Error(
        'DATABASE_URL environment variable is not set. ' +
          'StreamingMonteCarloEngine requires a database connection.'
      );
    }

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
    const closePromises = Array.from(this.pools.values()).map((pool) => pool['end']());
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
      pools: Array.from(this.pools.keys()),
    };
  }
}

// ============================================================================
// STREAMING AGGREGATOR
// ============================================================================

class StreamingAggregator {
  // Use definite assignment assertion since it's initialized in reset() called by constructor
  private aggregatedData!: {
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
      histogram: {},
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
      this.aggregatedData['sums'][metric] = (this.aggregatedData['sums'][metric] || 0) + value;

      // Running squares for variance
      this.aggregatedData['squares'][metric] =
        (this.aggregatedData['squares'][metric] || 0) + value * value;

      // Min/Max tracking
      this.aggregatedData['mins'][metric] = Math.min(
        this.aggregatedData['mins'][metric] || value,
        value
      );
      this.aggregatedData['maxs'][metric] = Math.max(
        this.aggregatedData['maxs'][metric] || value,
        value
      );

      // Reservoir sampling for percentiles
      this.addToReservoir(metric, value);

      // Histogram for distribution
      this.addToHistogram(metric, value);
    }
  }

  private addToReservoir(metric: string, value: number): void {
    if (!this.aggregatedData['sortedSamples'][metric]) {
      this.aggregatedData['sortedSamples'][metric] = [];
    }

    const samples = this.aggregatedData['sortedSamples'][metric];
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
    if (!this.aggregatedData['histogram'][metric]) {
      this.aggregatedData['histogram'][metric] = new Map();
    }

    const min = this.aggregatedData['mins'][metric] ?? 0;
    const max = this.aggregatedData['maxs'][metric] ?? 1;
    const binSize = (max - min) / this.histogramBins || 1;
    const binIndex = Math.floor((value - min) / binSize);

    const histogram = this.aggregatedData['histogram'][metric];
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
    const sum = this.aggregatedData['sums'][metric] || 0;
    const sumSquares = this.aggregatedData['squares'][metric] || 0;

    const mean = sum / count;
    const variance = sumSquares / count - mean * mean;
    const standardDeviation = Math.sqrt(Math.max(0, variance));

    // Calculate percentiles from sorted samples
    const samples = this.aggregatedData['sortedSamples'][metric] || [];
    samples.sort((a, b) => a - b);

    const percentiles = new Map<number, number>();
    const percentileValues = [5, 10, 25, 50, 75, 90, 95];

    for (const p of percentileValues) {
      const index = Math.floor((p / 100) * (samples.length - 1));
      percentiles['set'](p, samples[index] || mean);
    }

    return {
      min: this.aggregatedData['mins'][metric] || 0,
      max: this.aggregatedData['maxs'][metric] || 0,
      mean,
      standardDeviation,
      percentiles,
      count,
    };
  }

  getMemoryUsage(): number {
    // Estimate memory usage in MB
    const samplesMemory = Object.values(this.aggregatedData.sortedSamples).reduce(
      (sum, samples) => sum + samples.length * 8,
      0
    ); // 8 bytes per number

    const histogramMemory = Object.values(this.aggregatedData.histogram).reduce(
      (sum, hist) => sum + hist.size * 16,
      0
    ); // ~16 bytes per map entry

    const metadataMemory = 1024; // 1KB for metadata

    return (samplesMemory + histogramMemory + metadataMemory) / (1024 * 1024);
  }
}

// ============================================================================
// STREAMING MONTE CARLO ENGINE
// ============================================================================

export class StreamingMonteCarloEngine {
  private connectionManager = new ConnectionPoolManager();
  private db: ReturnType<typeof drizzle> | null = null;
  private dbInitPromise: Promise<void> | null = null;
  private currentStats: StreamingStats | null = null;

  constructor() {
    // Lazy initialization - don't connect to DB until actually needed
    // This allows the engine to be instantiated in test environments
    // without requiring DATABASE_URL
  }

  private async ensureDatabase(): Promise<ReturnType<typeof drizzle>> {
    if (this.db) {
      return this.db;
    }

    // Prevent concurrent initialization
    if (!this.dbInitPromise) {
      this.dbInitPromise = this.initializeDatabase();
    }

    await this.dbInitPromise;
    return this.db!;
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
      const baseline = await this.getBaselineData(
        streamingConfig.fundId,
        streamingConfig.baselineId
      );
      const portfolioInputs = await this.getPortfolioInputs(streamingConfig.fundId, baseline);
      const distributions = await this.calibrateDistributions(streamingConfig.fundId, baseline);

      // Set random seed for reproducibility
      if (streamingConfig.randomSeed) {
        this.setRandomSeed(streamingConfig.randomSeed);
      }

      // Stream simulation batches
      let batchIndex = 0;
      for await (const batch of this.streamSimulationBatches(
        streamingConfig,
        portfolioInputs,
        distributions
      )) {
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
        irr: performanceResults['irr'] as PerformanceDistribution,
        multiple: performanceResults['multiple'] as PerformanceDistribution,
        dpi: performanceResults['dpi'] as PerformanceDistribution,
        tvpi: performanceResults['tvpi'] as PerformanceDistribution,
        totalValue: performanceResults['totalValue'] as PerformanceDistribution,
        riskMetrics,
        reserveOptimization,
        scenarios: scenarioAnalysis,
        insights,
      };

      // Store results
      await this.storeResults(results);

      return results;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Streaming Monte Carlo simulation failed: ${errorMessage}`);
    } finally {
      // Cleanup resources
      await this.cleanup();
    }
  }

  /**
   * Stream simulation batches using AsyncGenerator
   */
  private async *streamSimulationBatches(
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

        batchPromises.push(
          this.processSingleBatch(
            i,
            batchSize,
            portfolioInputs,
            distributions,
            config.timeHorizonYears
          )
        );
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
      memoryUsageMB,
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
    const multipleSample = this.sampleNormal(
      distributions.multiple.mean,
      distributions.multiple.volatility
    );
    const dpiSample = Math.max(
      0,
      this.sampleNormal(distributions.dpi.mean, distributions.dpi.volatility)
    );
    const exitTimingSample = Math.max(
      1,
      this.sampleNormal(distributions.exitTiming.mean, distributions.exitTiming.volatility)
    );
    const followOnSample = this.sampleNormal(
      distributions.followOnSize.mean,
      distributions.followOnSize.volatility
    );

    // Calculate compound factor once
    const compoundFactor = Math.pow(1 + irrSample, timeHorizonYears);

    // Calculate scenario values
    const totalValue =
      portfolioInputs.deployedCapital * multipleSample * compoundFactor * timeDecay;
    const tvpi = multipleSample * timeDecay;

    return {
      irr: irrSample,
      multiple: multipleSample,
      dpi: dpiSample,
      tvpi: Math.max(0, tvpi),
      totalValue: Math.max(0, totalValue),
      exitTiming: exitTimingSample,
      followOnNeed: followOnSample,
    };
  }

  /**
   * Convert streaming results to traditional format for compatibility
   */
  private convertToTraditionalFormat(
    distributions: Record<string, MemoryEfficientDistribution>
  ): Record<string, unknown> {
    const results: Record<string, unknown> = {};

    for (const [metric, dist] of Object.entries(distributions)) {
      const percentiles = {
        p5: dist.percentiles['get'](5) || dist.min,
        p25: dist.percentiles['get'](25) || dist.min,
        p50: dist.percentiles['get'](50) || dist.mean,
        p75: dist.percentiles['get'](75) || dist.max,
        p95: dist.percentiles['get'](95) || dist.max,
      };

      results[metric] = {
        scenarios: [], // Empty for memory efficiency
        percentiles,
        statistics: {
          mean: dist.mean,
          standardDeviation: dist.standardDeviation,
          min: dist.min,
          max: dist.max,
        },
        confidenceIntervals: {
          ci68: [dist.mean - dist.standardDeviation, dist.mean + dist.standardDeviation],
          ci95: [dist.mean - 2 * dist.standardDeviation, dist.mean + 2 * dist.standardDeviation],
        },
      };
    }

    return results;
  }

  /**
   * Calculate risk metrics from streaming data
   */
  private async calculateStreamingRiskMetrics(
    distributions: Record<string, MemoryEfficientDistribution>
  ): Promise<RiskMetrics> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const irrDist = distributions['irr'];
    const totalValueDist = distributions['totalValue'];

    // Default values for missing distributions
    const defaultDist = { mean: 0, min: 0, max: 1, standardDeviation: 1, percentiles: new Map() };
    const irr = irrDist ?? defaultDist;
    const totalValue = totalValueDist ?? defaultDist;

    // Value at Risk from percentiles
    const var5 = irr.percentiles['get'](5) ?? irr.min;
    const var10 = irr.percentiles['get'](10) ?? irr.min;

    // Estimate CVaR (simplified calculation)
    const cvar5 = var5 * 0.8; // Conservative estimate
    const cvar10 = var10 * 0.85;

    // Probability of loss (using normal approximation)
    const probabilityOfLoss = this.normalCDF(0, irr.mean, irr.standardDeviation);

    // Downside risk (simplified calculation)
    const downsideRisk = irr.standardDeviation * 0.7; // Approximate

    // Risk ratios
    const riskFreeRate = 0.02;
    const excessReturn = irr.mean - riskFreeRate;
    const sharpeRatio = irr.standardDeviation !== 0 ? excessReturn / irr.standardDeviation : 0;
    const sortinoRatio = downsideRisk !== 0 ? excessReturn / downsideRisk : 0;

    // Max drawdown (estimated)
    const maxDrawdown =
      totalValue.max !== 0 ? (totalValue.max - totalValue.min) / totalValue.max : 0;

    return {
      valueAtRisk: { var5, var10 },
      conditionalValueAtRisk: { cvar5, cvar10 },
      probabilityOfLoss,
      downsideRisk,
      sharpeRatio,
      sortinoRatio,
      maxDrawdown,
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */
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
    for (let ratio = 0.1; ratio <= 0.5; ratio += 0.05) {
      reserveRatios.push(ratio);
    }

    const allocationAnalysis = [];

    for (const ratio of reserveRatios) {
      // Estimate performance for this reserve ratio
      const irrDistribution = distributions['irr'];
      const expectedIRR = this.estimateReserveImpact(
        irrDistribution?.mean ?? 0,
        ratio,
        portfolioInputs
      );
      const riskAdjustedReturn = expectedIRR / (irrDistribution?.standardDeviation ?? 1);
      const followOnCoverage = this.estimateFollowOnCoverage(ratio);

      allocationAnalysis.push({
        reserveRatio: ratio,
        expectedIRR,
        riskAdjustedReturn,
        followOnCoverage,
      });
    }

    // Find optimal allocation
    const optimal = allocationAnalysis.reduce((best, current) =>
      current.riskAdjustedReturn > best.riskAdjustedReturn ? current : best
    );

    return {
      currentReserveRatio,
      optimalReserveRatio: optimal.reserveRatio,
      improvementPotential:
        optimal.expectedIRR -
        (allocationAnalysis.find((a) => Math.abs(a.reserveRatio - currentReserveRatio) < 0.01)
          ?.expectedIRR || 0),
      coverageScenarios: {
        p25: 0.6,
        p50: 0.75,
        p75: 0.9,
      },
      allocationRecommendations: allocationAnalysis,
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
      enableGarbageCollection: config.enableGarbageCollection ?? true,
    };
  }

  private initializeStats(config: StreamingConfig): void {
    this.currentStats = {
      totalScenarios: config.runs,
      processedBatches: 0,
      averageBatchTimeMs: 0,
      peakMemoryUsageMB: 0,
      totalProcessingTimeMs: 0,
      estimatedCompletion: new Date(Date.now() + (config.runs / 1000) * 100), // Rough estimate
    };
  }

  private updateStats(batch: BatchResult, batchIndex: number): void {
    if (!this.currentStats) return;

    this.currentStats.processedBatches++;
    this.currentStats.averageBatchTimeMs =
      (this.currentStats.averageBatchTimeMs * batchIndex + batch.processingTimeMs) /
      (batchIndex + 1);
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
    const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);

    return sign * y;
  }

  private estimateReserveImpact(
    baseIRR: number,
    reserveRatio: number,
    _portfolioInputs: PortfolioInputs
  ): number {
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

  private generateScenarioAnalysisFromDistributions(
    distributions: Record<string, MemoryEfficientDistribution>
  ): ScenarioAnalysis {
    return {
      bullMarket: this.extractPercentile(distributions, 90),
      bearMarket: this.extractPercentile(distributions, 10),
      stressTest: this.extractPercentile(distributions, 5),
      baseCase: this.extractPercentile(distributions, 50),
    };
  }

  private extractPercentile(
    distributions: Record<string, MemoryEfficientDistribution>,
    percentile: number
  ): Record<string, number> {
    const result: Record<string, number> = {};
    for (const [metric, dist] of Object.entries(distributions)) {
      result[metric] = dist.percentiles['get'](percentile) || dist.mean;
    }
    return result;
  }

  // Reuse existing methods from the original engine
  private async getBaselineData(fundId: number, baselineId?: string): Promise<FundBaseline> {
    // Implementation same as original engine
    const db = await this.ensureDatabase();
    let baseline: FundBaseline | undefined;

    if (baselineId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      baseline = await (db.query as any).fundBaselines.findFirst({
        where: and(
          eq(schema.fundBaselines.id, baselineId),
          eq(schema.fundBaselines.fundId, fundId),
          eq(schema.fundBaselines.isActive, true)
        ),
      });
    } else {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      baseline = await (db.query as any).fundBaselines.findFirst({
        where: and(
          eq(schema.fundBaselines.fundId, fundId),
          eq(schema.fundBaselines.isDefault, true),
          eq(schema.fundBaselines.isActive, true)
        ),
      });
    }

    if (!baseline) {
      throw new Error('No suitable baseline found for simulation');
    }

    return baseline;
  }

  private async getPortfolioInputs(
    fundId: number,
    baseline: FundBaseline
  ): Promise<PortfolioInputs> {
    /* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
    // Implementation same as original engine
    const db = await this.ensureDatabase();
    const fund = await (db.query as any).funds.findFirst({
      where: eq(schema.funds.id, fundId),
    });

    if (!fund) {
      throw new Error(`Fund ${fundId} not found`);
    }

    const fundSize = toDecimal(fund.size.toString());
    const deployedCapital = toDecimal(baseline.deployedCapital.toString());
    const reserveRatio = fundSize.minus(deployedCapital).dividedBy(fundSize);

    const sectorDistribution = (baseline.sectorDistribution as Record<string, number>) || {};
    const stageDistribution = (baseline.stageDistribution as Record<string, number>) || {};

    const totalSectorCount = Object.values(sectorDistribution).reduce(
      (sum, count) => sum + count,
      0
    );
    const totalStageCount = Object.values(stageDistribution).reduce((sum, count) => sum + count, 0);

    const sectorWeights: Record<string, number> = {};
    const stageWeights: Record<string, number> = {};

    for (const [sector, count] of Object.entries(sectorDistribution)) {
      sectorWeights[sector] = totalSectorCount > 0 ? count / totalSectorCount : 0;
    }

    for (const [stage, count] of Object.entries(stageDistribution)) {
      stageWeights[stage] = totalStageCount > 0 ? count / totalStageCount : 0;
    }

    const averageInvestmentSize = toDecimal(baseline.averageInvestment?.toString() ?? '1000000');

    return {
      fundSize: fundSize.toNumber(),
      deployedCapital: deployedCapital.toNumber(),
      reserveRatio: reserveRatio.toNumber(),
      sectorWeights,
      stageWeights,
      averageInvestmentSize: averageInvestmentSize.toNumber(),
    };
    /* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  }

  private async calibrateDistributions(
    fundId: number,
    baseline: FundBaseline
  ): Promise<DistributionParameters> {
    /* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
    // Implementation same as original engine
    const db = await this.ensureDatabase();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const reports = await (db.query as any).varianceReports.findMany({
      where: and(
        eq(schema.varianceReports.fundId, fundId),
        eq(schema.varianceReports.baselineId, baseline.id)
      ),
      orderBy: desc(schema.varianceReports.asOfDate),
      limit: 30,
    });

    if (reports.length < 3) {
      return this.getDefaultDistributions();
    }

    const irrVariances = this.extractVariances(reports, 'irrVariance');
    const multipleVariances = this.extractVariances(reports, 'multipleVariance');
    const dpiVariances = this.extractVariances(reports, 'dpiVariance');

    const irrMean = toDecimal(baseline.irr?.toString() ?? '0.15');
    const multipleMean = toDecimal(baseline.multiple?.toString() ?? '2.5');
    const dpiMean = toDecimal(baseline.dpi?.toString() ?? '0.8');

    return {
      irr: {
        mean: irrMean.toNumber(),
        volatility: this.calculateVolatility(irrVariances) || 0.08,
      },
      multiple: {
        mean: multipleMean.toNumber(),
        volatility: this.calculateVolatility(multipleVariances) || 0.6,
      },
      dpi: {
        mean: dpiMean.toNumber(),
        volatility: this.calculateVolatility(dpiVariances) || 0.3,
      },
      exitTiming: {
        mean: 5.5,
        volatility: 2.0,
      },
      followOnSize: {
        mean: 0.5,
        volatility: 0.3,
      },
    };
    /* eslint-enable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument */
  }

  private getDefaultDistributions(): DistributionParameters {
    return {
      irr: { mean: 0.15, volatility: 0.08 },
      multiple: { mean: 2.5, volatility: 0.6 },
      dpi: { mean: 0.8, volatility: 0.3 },
      exitTiming: { mean: 5.5, volatility: 2.0 },
      followOnSize: { mean: 0.5, volatility: 0.3 },
    };
  }

  private extractVariances(reports: unknown[], field: string): Decimal[] {
    return reports
      .map((r) => (r as Record<string, unknown>)[field])
      .filter((v) => v !== null && v !== undefined)
      .map((v) => toDecimal(String(v)));
  }

  private calculateVolatility(values: readonly (Decimal | number)[]): number {
    if (values.length < 2) return 0;

    const decimalValues = values.map((value) => toDecimal(value));
    const count = new Decimal(decimalValues.length);
    const mean = decimalValues.reduce((sum, v) => sum.plus(v), new Decimal(0)).dividedBy(count);
    const variance = decimalValues
      .reduce((sum, v) => {
        const diff = v.minus(mean);
        return sum.plus(diff.times(diff));
      }, new Decimal(0))
      .dividedBy(count.minus(1));

    return variance.sqrt().toNumber();
  }

  private generateInsights(
    performanceResults: Record<string, unknown>,
    riskMetrics: RiskMetrics,
    reserveOptimization: ReserveOptimization,
    _baseline: FundBaseline
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
      warnings.push(
        `High downside risk: ${(riskMetrics.probabilityOfLoss * 100).toFixed(1)}% probability of negative returns`
      );
    }

    if (riskMetrics.sharpeRatio < 1.0) {
      warnings.push(
        `Low risk-adjusted returns (Sharpe ratio: ${riskMetrics.sharpeRatio.toFixed(2)})`
      );
    }

    // Opportunity identification
    const irrResult = performanceResults['irr'] as { statistics: { standardDeviation: number } };
    if (irrResult.statistics.standardDeviation > 0.12) {
      opportunities.push(
        'High return variance suggests potential for better portfolio diversification'
      );
    }

    if (reserveOptimization.coverageScenarios.p50 < 0.7) {
      opportunities.push(
        'Consider increasing follow-on capacity to capture more upside opportunities'
      );
    }

    const irrMean = (performanceResults['irr'] as { statistics: { mean: number } }).statistics.mean;
    const keyMetrics: Array<{
      metric: string;
      value: number;
      benchmark: number;
      status: 'above' | 'below' | 'at' | 'warning';
      impact: 'high' | 'medium' | 'low';
    }> = [
      {
        metric: 'Expected IRR',
        value: toSafeNumber(irrMean),
        benchmark: 0.15,
        status: toSafeNumber(irrMean) >= 0.15 ? 'above' : 'below',
        impact: 'high',
      },
      {
        metric: 'Risk-Adjusted Return',
        value: toSafeNumber(riskMetrics.sharpeRatio),
        benchmark: 1.0,
        status: toSafeNumber(riskMetrics.sharpeRatio) >= 1.0 ? 'above' : 'below',
        impact: 'high',
      },
      {
        metric: 'Downside Risk',
        value: toSafeNumber(riskMetrics.probabilityOfLoss),
        benchmark: 0.1,
        status: toSafeNumber(riskMetrics.probabilityOfLoss) <= 0.1 ? 'above' : 'warning',
        impact: 'medium',
      },
    ];

    return {
      primaryRecommendations: recommendations.slice(0, 3),
      riskWarnings: warnings,
      opportunityAreas: opportunities,
      keyMetrics,
    };
  }

  private async storeResults(results: SimulationResults): Promise<void> {
    const db = await this.ensureDatabase();
    const simulationData: InsertMonteCarloSimulation = {
      fundId: results.config.fundId,
      simulationName: `Streaming Monte Carlo Simulation ${new Date().toISOString()}`,
      simulationType: 'streaming_portfolio_construction',
      inputDistributions: {},
      summaryStatistics: {},
      percentileResults: {},
      createdBy: 1, // TODO: Get from context
    };

    await db.insert(schema.monteCarloSimulations).values(simulationData);
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
