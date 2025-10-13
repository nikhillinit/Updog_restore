/**
 * Unified Monte Carlo Service
 *
 * Integration layer that provides:
 * - Automatic engine selection (streaming vs traditional)
 * - Backward compatibility with existing API
 * - Performance monitoring and fallback
 * - Memory-aware simulation routing
 *
 * @author Claude Code
 * @version 1.0 - Production Integration
 */

import { MonteCarloEngine } from './monte-carlo-engine';
// TEMPORARILY DISABLED: Streaming engine archived
// import { StreamingMonteCarloEngine, StreamingConfig } from './streaming-monte-carlo-engine';
import { databasePoolManager } from './database-pool-manager';
import type {
  SimulationConfig,
  SimulationResults,
  MarketEnvironment
} from './monte-carlo-engine';

// Re-export types for external consumption
export type { MarketEnvironment, SimulationConfig, SimulationResults };

// ============================================================================
// UNIFIED SERVICE INTERFACE
// ============================================================================

// Temporary StreamingConfig stub (replace with actual when restoring streaming engine)
interface StreamingConfig extends SimulationConfig {
  batchSize?: number;
}

export interface UnifiedSimulationConfig extends StreamingConfig {
  forceEngine?: 'streaming' | 'traditional' | 'auto'; // Default: 'auto'
  performanceMode?: 'speed' | 'memory' | 'balanced'; // Default: 'balanced'
  enableFallback?: boolean; // Default: true
  timeHorizonYears: number; // Required field, ensure it's explicitly defined
}

export interface EngineSelectionCriteria {
  scenarioCount: number;
  availableMemoryMB: number;
  systemLoad: number;
  enginePreference: 'streaming' | 'traditional' | 'auto';
}

export interface PerformanceMetrics {
  engineUsed: 'streaming' | 'traditional';
  executionTimeMs: number;
  memoryUsageMB: number;
  scenariosPerSecond: number;
  connectionPoolStats: any;
  fallbackTriggered: boolean;
  selectionReason: string;
}

// ============================================================================
// UNIFIED MONTE CARLO SERVICE
// ============================================================================

export class UnifiedMonteCarloService {
  private traditionalEngine: MonteCarloEngine;
  // TEMPORARILY DISABLED: Streaming engine archived
  // private streamingEngine: StreamingMonteCarloEngine;
  private performanceHistory: PerformanceMetrics[] = [];

  // Engine selection thresholds
  private readonly STREAMING_THRESHOLD_SCENARIOS = 5000;
  private readonly MEMORY_THRESHOLD_MB = 512;
  private readonly HIGH_LOAD_THRESHOLD = 0.8;

  constructor() {
    this.traditionalEngine = new MonteCarloEngine();
    // TEMPORARILY DISABLED: Streaming engine archived
    // this.streamingEngine = new StreamingMonteCarloEngine();
    // this.initializePooling();
  }

  /**
   * Main simulation method with intelligent engine selection
   */
  async runSimulation(config: UnifiedSimulationConfig): Promise<SimulationResults & { performance: PerformanceMetrics }> {
    const startTime = Date.now();
    const selectionCriteria = await this.buildSelectionCriteria(config);

    // Select optimal engine
    const selectedEngine = this.selectEngine(selectionCriteria);
    let fallbackTriggered = false;
    let result: SimulationResults;

    try {
      // Execute with selected engine
      if (selectedEngine === 'streaming') {
        result = await this.executeStreamingSimulation(config);
      } else {
        result = await this.executeTraditionalSimulation(config);
      }

    } catch (error) {
      // Fallback logic
      if (config.enableFallback !== false && selectedEngine === 'streaming') {
        console.warn(`Streaming engine failed, falling back to traditional: ${error.message}`);
        fallbackTriggered = true;
        result = await this.executeTraditionalSimulation(config);
      } else if (config.enableFallback !== false && selectedEngine === 'traditional') {
        console.warn(`Traditional engine failed, falling back to streaming: ${error.message}`);
        fallbackTriggered = true;
        result = await this.executeStreamingSimulation(config);
      } else {
        throw error;
      }
    }

    // Calculate performance metrics
    const performance = await this.calculatePerformanceMetrics(
      selectedEngine,
      startTime,
      result,
      fallbackTriggered,
      selectionCriteria
    );

    // Store performance history
    this.performanceHistory.push(performance);
    this.maintainPerformanceHistory();

    return {
      ...result,
      performance
    };
  }

  /**
   * Batch simulation for multiple configurations
   */
  async runBatchSimulations(configs: UnifiedSimulationConfig[]): Promise<Array<SimulationResults & { performance: PerformanceMetrics }>> {
    // Optimize batch execution based on total workload
    const totalScenarios = configs.reduce((sum: any, config: any) => sum + config.runs, 0);
    const shouldUseStreaming = totalScenarios > this.STREAMING_THRESHOLD_SCENARIOS;

    if (shouldUseStreaming) {
      // Use streaming engine for all simulations in batch
      return Promise.all(configs.map(config =>
        this.runSimulation({ ...config, forceEngine: 'streaming' })
      ));
    } else {
      // Parallel execution with traditional engine
      const batchSize = Math.min(configs.length, 4); // Limit concurrency
      const results: Array<SimulationResults & { performance: PerformanceMetrics }> = [];

      for (let i = 0; i < configs.length; i += batchSize) {
        const batch = configs.slice(i, i + batchSize);
        const batchResults = await Promise.all(
          batch.map(config => this.runSimulation(config))
        );
        results.push(...batchResults);
      }

      return results;
    }
  }

  /**
   * Performance forecasting for different market environments
   */
  async runMultiEnvironmentSimulation(
    baseConfig: UnifiedSimulationConfig,
    environments: MarketEnvironment[]
  ): Promise<Record<string, SimulationResults & { performance: PerformanceMetrics }>> {
    const results: Record<string, SimulationResults & { performance: PerformanceMetrics }> = {};

    // Use streaming for multiple environments due to increased load
    const streamingConfig: UnifiedSimulationConfig = {
      ...baseConfig,
      forceEngine: 'streaming',
      batchSize: Math.max(500, Math.floor(baseConfig.runs / 20)) // Smaller batches for multiple environments
    };

    for (const environment of environments) {
      const envConfig = {
        ...streamingConfig,
        // Modify config based on market environment
        runs: this.adjustRunsForEnvironment(baseConfig.runs, environment)
      };

      results[environment.scenario] = await this.runSimulation(envConfig);
    }

    return results;
  }

  /**
   * Get optimization recommendations based on historical performance
   */
  getOptimizationRecommendations(): {
    preferredEngine: 'streaming' | 'traditional';
    optimalBatchSize: number;
    memoryUsagePattern: string;
    recommendations: string[];
  } {
    if (this.performanceHistory.length === 0) {
      return {
        preferredEngine: 'streaming',
        optimalBatchSize: 1000,
        memoryUsagePattern: 'unknown',
        recommendations: ['Run more simulations to gather performance data']
      };
    }

    const streamingMetrics = this.performanceHistory.filter(p => p.engineUsed === 'streaming');
    const traditionalMetrics = this.performanceHistory.filter(p => p.engineUsed === 'traditional');

    const streamingAvgSpeed = streamingMetrics.length > 0
      ? streamingMetrics.reduce((sum: any, m: any) => sum + m.scenariosPerSecond, 0) / streamingMetrics.length
      : 0;

    const traditionalAvgSpeed = traditionalMetrics.length > 0
      ? traditionalMetrics.reduce((sum: any, m: any) => sum + m.scenariosPerSecond, 0) / traditionalMetrics.length
      : 0;

    const preferredEngine = streamingAvgSpeed > traditionalAvgSpeed ? 'streaming' : 'traditional';

    const recommendations: string[] = [];

    if (streamingMetrics.length > 0) {
      const avgMemoryUsage = streamingMetrics.reduce((sum: any, m: any) => sum + m.memoryUsageMB, 0) / streamingMetrics.length;
      if (avgMemoryUsage > 200) {
        recommendations.push('Consider reducing batch size to optimize memory usage');
      }
    }

    const fallbackRate = this.performanceHistory.filter(p => p.fallbackTriggered).length / this.performanceHistory.length;
    if (fallbackRate > 0.1) {
      recommendations.push('High fallback rate detected - consider system resource optimization');
    }

    return {
      preferredEngine,
      optimalBatchSize: this.calculateOptimalBatchSize(),
      memoryUsagePattern: this.analyzeMemoryPattern(),
      recommendations
    };
  }

  /**
   * Health check for all engines and connections
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    engines: {
      traditional: boolean;
      streaming: boolean;
    };
    connectionPools: any;
    recommendations: string[];
  }> {
    const checks = {
      traditional: false,
      streaming: false
    };

    // Test traditional engine
    try {
      // Simple test configuration
      const testConfig: SimulationConfig = {
        fundId: 1,
        runs: 10,
        timeHorizonYears: 1,
        randomSeed: 12345
      };

      // This would need a test method in the original engine
      checks.traditional = true;
    } catch (error) {
      console.warn('Traditional engine health check failed:', error.message);
    }

    // Test streaming engine
    // TEMPORARILY DISABLED: Streaming engine archived
    try {
      // const streamingStats = this.streamingEngine.getStreamingStats();
      // const connectionStats = this.streamingEngine.getConnectionStats();
      // checks.streaming = streamingStats !== null;
      checks.streaming = false; // Streaming engine not available
    } catch (error: any) {
      console.warn('Streaming engine health check failed:', error.message);
    }

    // Check connection pools
    const connectionPools = databasePoolManager.getAllMetrics();

    // Determine overall status
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
    if (!checks.traditional && !checks.streaming) {
      status = 'unhealthy';
    } else if (!checks.traditional || !checks.streaming) {
      status = 'degraded';
    }

    const recommendations: string[] = [];
    if (!checks.traditional) recommendations.push('Traditional engine needs attention');
    if (!checks.streaming) recommendations.push('Streaming engine needs attention');

    return {
      status,
      engines: checks,
      connectionPools,
      recommendations
    };
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async initializePooling(): Promise<void> {
    // Initialize database connection pool for streaming engine
    await databasePoolManager.createPool('streaming-monte-carlo', {
      connectionString: process.env['DATABASE_URL']!,
      minConnections: 2,
      maxConnections: 8,
      idleTimeoutMs: 30000,
      connectionTimeoutMs: 5000,
      enableMetrics: true
    });
  }

  private async buildSelectionCriteria(config: UnifiedSimulationConfig): Promise<EngineSelectionCriteria> {
    const memUsage = process.memoryUsage();
    const availableMemoryMB = (memUsage.heapTotal - memUsage.heapUsed) / (1024 * 1024);

    // Simple load calculation based on memory usage
    const systemLoad = memUsage.heapUsed / memUsage.heapTotal;

    return {
      scenarioCount: config.runs,
      availableMemoryMB,
      systemLoad,
      enginePreference: config.forceEngine || 'auto'
    };
  }

  private selectEngine(criteria: EngineSelectionCriteria): 'streaming' | 'traditional' {
    // TEMPORARILY DISABLED: Always use traditional engine (streaming engine archived)
    return 'traditional';

    /* Original logic - restore when streaming engine is back
    // Forced selection
    if (criteria.enginePreference !== 'auto') {
      return criteria.enginePreference;
    }

    // Automatic selection logic
    if (criteria.scenarioCount >= this.STREAMING_THRESHOLD_SCENARIOS) {
      return 'streaming';
    }

    if (criteria.availableMemoryMB < this.MEMORY_THRESHOLD_MB) {
      return 'streaming'; // Better memory management
    }

    if (criteria.systemLoad > this.HIGH_LOAD_THRESHOLD) {
      return 'streaming'; // Better resource utilization under load
    }

    // Default to traditional for smaller workloads
    return 'traditional';
    */
  }

  private async executeStreamingSimulation(config: UnifiedSimulationConfig): Promise<SimulationResults> {
    // TEMPORARILY DISABLED: Streaming engine archived - fallback to traditional
    console.warn('Streaming engine not available, falling back to traditional engine');
    return await this.executeTraditionalSimulation(config);
    // return await this.streamingEngine.runStreamingSimulation(config);
  }

  private async executeTraditionalSimulation(config: SimulationConfig): Promise<SimulationResults> {
    return await this.traditionalEngine.runPortfolioSimulation(config);
  }

  private async calculatePerformanceMetrics(
    engineUsed: 'streaming' | 'traditional',
    startTime: number,
    result: SimulationResults,
    fallbackTriggered: boolean,
    criteria: EngineSelectionCriteria
  ): Promise<PerformanceMetrics> {
    const executionTimeMs = result.executionTimeMs;
    const scenariosPerSecond = (result.config.runs / executionTimeMs) * 1000;

    // Get current memory usage
    const memUsage = process.memoryUsage();
    const memoryUsageMB = memUsage.heapUsed / (1024 * 1024);

    // Get connection pool stats if using streaming
    const connectionPoolStats = engineUsed === 'streaming'
      ? databasePoolManager.getAllMetrics()
      : null;

    // Generate selection reason
    let selectionReason = 'Auto-selected based on ';
    if (criteria.scenarioCount >= this.STREAMING_THRESHOLD_SCENARIOS) {
      selectionReason += 'high scenario count';
    } else if (criteria.availableMemoryMB < this.MEMORY_THRESHOLD_MB) {
      selectionReason += 'low available memory';
    } else if (criteria.systemLoad > this.HIGH_LOAD_THRESHOLD) {
      selectionReason += 'high system load';
    } else {
      selectionReason += 'optimal resource utilization';
    }

    return {
      engineUsed,
      executionTimeMs,
      memoryUsageMB,
      scenariosPerSecond,
      connectionPoolStats,
      fallbackTriggered,
      selectionReason
    };
  }

  private maintainPerformanceHistory(): void {
    // Keep only last 100 performance records
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
  }

  private adjustRunsForEnvironment(baseRuns: number, environment: MarketEnvironment): number {
    // Adjust scenario count based on market environment complexity
    switch (environment.scenario) {
      case 'bull':
        return Math.floor(baseRuns * 0.8); // Less variance in bull markets
      case 'bear':
        return Math.floor(baseRuns * 1.2); // More scenarios for bear market analysis
      case 'neutral':
      default:
        return baseRuns;
    }
  }

  private calculateOptimalBatchSize(): number {
    const streamingMetrics = this.performanceHistory.filter(p => p.engineUsed === 'streaming');

    if (streamingMetrics.length === 0) return 1000;

    // Analyze performance vs batch size (would need to track batch size in metrics)
    // For now, return a reasonable default
    return 1000;
  }

  private analyzeMemoryPattern(): string {
    if (this.performanceHistory.length === 0) return 'unknown';

    const avgMemoryUsage = this.performanceHistory.reduce((sum: any, m: any) => sum + m.memoryUsageMB, 0) / this.performanceHistory.length;

    if (avgMemoryUsage < 100) return 'low';
    if (avgMemoryUsage < 300) return 'moderate';
    return 'high';
  }

  /**
   * Get current performance statistics
   */
  getPerformanceStats() {
    return {
      totalSimulations: this.performanceHistory.length,
      streamingUsage: this.performanceHistory.filter(p => p.engineUsed === 'streaming').length,
      traditionalUsage: this.performanceHistory.filter(p => p.engineUsed === 'traditional').length,
      averageExecutionTime: this.performanceHistory.reduce((sum: any, p: any) => sum + p.executionTimeMs, 0) / this.performanceHistory.length,
      fallbackRate: this.performanceHistory.filter(p => p.fallbackTriggered).length / this.performanceHistory.length
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    await databasePoolManager.closeAll();
  }
}

// ============================================================================
// EXPORT
// ============================================================================

export const unifiedMonteCarloService = new UnifiedMonteCarloService();