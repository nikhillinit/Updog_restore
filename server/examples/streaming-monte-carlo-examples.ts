/**
 * Streaming Monte Carlo Engine Examples
 *
 * Complete examples showing how to use the new streaming Monte Carlo engine
 * for different scenarios and performance requirements.
 *
 * @author Claude Code
 * @version 1.0 - Production Examples
 */

import { unifiedMonteCarloService } from '../services/monte-carlo-service-unified';
import type { UnifiedSimulationConfig, MarketEnvironment } from '../services/monte-carlo-service-unified';

// ============================================================================
// BASIC USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Basic streaming simulation for a fund
 */
export async function basicStreamingSimulation() {
  console.log('=== Basic Streaming Simulation ===');

  const config: UnifiedSimulationConfig = {
    fundId: 1,
    runs: 10000,
    timeHorizonYears: 8,

    // Streaming configuration
    batchSize: 1000,
    maxConcurrentBatches: 4,
    enableResultStreaming: true,
    memoryThresholdMB: 100,

    // Engine selection
    forceEngine: 'streaming', // Force streaming engine
    performanceMode: 'balanced',
    enableFallback: true
  };

  try {
    const startTime = Date.now();
    const result = await unifiedMonteCarloService.runSimulation(config);

    console.log(`✅ Simulation completed in ${result.executionTimeMs}ms`);
    console.log(`🔧 Engine used: ${result.performance.engineUsed}`);
    console.log(`💾 Memory usage: ${result.performance.memoryUsageMB.toFixed(2)}MB`);
    console.log(`⚡ Scenarios/second: ${result.performance.scenariosPerSecond.toFixed(0)}`);
    console.log(`📊 Expected IRR: ${(result.irr.statistics.mean * 100).toFixed(2)}%`);
    console.log(`📈 Expected Multiple: ${result.multiple.statistics.mean.toFixed(2)}x`);
    console.log(`🎯 95% VaR: ${(result.riskMetrics.valueAtRisk.var5 * 100).toFixed(2)}%`);

    if (result.performance.fallbackTriggered) {
      console.log('⚠️  Fallback was triggered during execution');
    }

    return result;

  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Simulation failed:', error.message);
    } else {
      console.error('❌ Simulation failed:', String(error));
    }
    throw error;
  }
}

/**
 * Example 2: Auto engine selection based on workload
 */
export async function autoEngineSelection() {
  console.log('\n=== Auto Engine Selection ===');

  // Small workload - should use traditional engine
  const smallConfig: UnifiedSimulationConfig = {
    fundId: 1,
    runs: 1000,
    timeHorizonYears: 5,
    forceEngine: 'auto', // Let system decide
    performanceMode: 'speed'
  };

  // Large workload - should use streaming engine
  const largeConfig: UnifiedSimulationConfig = {
    fundId: 1,
    runs: 25000,
    timeHorizonYears: 10,
    forceEngine: 'auto', // Let system decide
    performanceMode: 'memory'
  };

  console.log('Running small workload (1K scenarios)...');
  const smallResult = await unifiedMonteCarloService.runSimulation(smallConfig);
  console.log(`Small workload used: ${smallResult.performance.engineUsed} engine`);

  console.log('Running large workload (25K scenarios)...');
  const largeResult = await unifiedMonteCarloService.runSimulation(largeConfig);
  console.log(`Large workload used: ${largeResult.performance.engineUsed} engine`);

  // Compare performance
  console.log('\n📊 Performance Comparison:');
  console.log(`Small (${smallResult.performance.engineUsed}): ${smallResult.performance.scenariosPerSecond.toFixed(0)} scenarios/sec`);
  console.log(`Large (${largeResult.performance.engineUsed}): ${largeResult.performance.scenariosPerSecond.toFixed(0)} scenarios/sec`);

  return { smallResult, largeResult };
}

/**
 * Example 3: Batch processing multiple funds
 */
export async function batchProcessingExample() {
  console.log('\n=== Batch Processing Example ===');

  const batchConfigs: UnifiedSimulationConfig[] = [
    {
      fundId: 1,
      runs: 5000,
      timeHorizonYears: 8,
      randomSeed: 12345
    },
    {
      fundId: 2,
      runs: 5000,
      timeHorizonYears: 10,
      randomSeed: 12346
    },
    {
      fundId: 3,
      runs: 5000,
      timeHorizonYears: 7,
      randomSeed: 12347
    }
  ];

  console.log(`Processing ${batchConfigs.length} funds in batch...`);
  const startTime = Date.now();

  const results = await unifiedMonteCarloService.runBatchSimulations(batchConfigs);

  const totalTime = Date.now() - startTime;
  console.log(`✅ Batch completed in ${totalTime}ms`);

  // Analyze results
  results.forEach((result: any, index: any) => {
    console.log(`\nFund ${batchConfigs[index].fundId}:`);
    console.log(`  Expected IRR: ${(result.irr.statistics.mean * 100).toFixed(2)}%`);
    console.log(`  Expected Multiple: ${result.multiple.statistics.mean.toFixed(2)}x`);
    console.log(`  Engine used: ${result.performance.engineUsed}`);
    console.log(`  Execution time: ${result.executionTimeMs}ms`);
  });

  return results;
}

/**
 * Example 4: Multi-environment scenario analysis
 */
export async function multiEnvironmentAnalysis() {
  console.log('\n=== Multi-Environment Analysis ===');

  const baseConfig: UnifiedSimulationConfig = {
    fundId: 1,
    runs: 8000,
    timeHorizonYears: 8,
    batchSize: 800,
    forceEngine: 'streaming'
  };

  const environments: MarketEnvironment[] = [
    {
      scenario: 'bull',
      exitMultipliers: { mean: 3.5, volatility: 1.2 },
      failureRate: 0.1,
      followOnProbability: 0.8
    },
    {
      scenario: 'neutral',
      exitMultipliers: { mean: 2.5, volatility: 0.8 },
      failureRate: 0.2,
      followOnProbability: 0.6
    },
    {
      scenario: 'bear',
      exitMultipliers: { mean: 1.5, volatility: 0.6 },
      failureRate: 0.4,
      followOnProbability: 0.3
    }
  ];

  console.log('Running scenarios across multiple market environments...');
  const results = await unifiedMonteCarloService.runMultiEnvironmentSimulation(baseConfig, environments);

  // Analyze environment impact
  console.log('\n📊 Environment Analysis:');
  Object.entries(results).forEach(([scenario, result]) => {
    console.log(`\n${scenario.toUpperCase()} Market:`);
    console.log(`  Expected IRR: ${(result.irr.statistics.mean * 100).toFixed(2)}%`);
    console.log(`  Expected Multiple: ${result.multiple.statistics.mean.toFixed(2)}x`);
    console.log(`  95% Confidence IRR: ${(result.irr.percentiles.p5 * 100).toFixed(2)}% - ${(result.irr.percentiles.p95 * 100).toFixed(2)}%`);
    console.log(`  Probability of Loss: ${(result.riskMetrics.probabilityOfLoss * 100).toFixed(1)}%`);
    console.log(`  Execution Time: ${result.executionTimeMs}ms`);
  });

  return results;
}

// ============================================================================
// PERFORMANCE OPTIMIZATION EXAMPLES
// ============================================================================

/**
 * Example 5: Memory-optimized simulation for large workloads
 */
export async function memoryOptimizedSimulation() {
  console.log('\n=== Memory-Optimized Simulation ===');

  const config: UnifiedSimulationConfig = {
    fundId: 1,
    runs: 50000, // Very large workload
    timeHorizonYears: 10,

    // Memory optimization settings
    batchSize: 500, // Smaller batches for memory efficiency
    maxConcurrentBatches: 2, // Limit concurrency
    enableResultStreaming: true,
    memoryThresholdMB: 50, // Low memory threshold
    enableGarbageCollection: true,

    forceEngine: 'streaming',
    performanceMode: 'memory'
  };

  console.log('Running memory-optimized simulation for 50K scenarios...');

  const result = await unifiedMonteCarloService.runSimulation(config);

  console.log(`✅ Large simulation completed successfully`);
  console.log(`💾 Peak memory usage: ${result.performance.memoryUsageMB.toFixed(2)}MB`);
  console.log(`⏱️  Total execution time: ${result.executionTimeMs}ms`);
  console.log(`⚡ Processing rate: ${result.performance.scenariosPerSecond.toFixed(0)} scenarios/sec`);

  // Memory efficiency metrics
  const memoryPerScenario = result.performance.memoryUsageMB / (config.runs / 1000);
  console.log(`📊 Memory efficiency: ${memoryPerScenario.toFixed(3)}MB per 1K scenarios`);

  return result;
}

/**
 * Example 6: Speed-optimized simulation
 */
export async function speedOptimizedSimulation() {
  console.log('\n=== Speed-Optimized Simulation ===');

  const config: UnifiedSimulationConfig = {
    fundId: 1,
    runs: 20000,
    timeHorizonYears: 8,

    // Speed optimization settings
    batchSize: 2000, // Larger batches for throughput
    maxConcurrentBatches: 6, // Higher concurrency
    enableResultStreaming: true,
    memoryThresholdMB: 200, // Higher memory allowance
    enableGarbageCollection: false, // Disable GC for speed

    forceEngine: 'streaming',
    performanceMode: 'speed'
  };

  console.log('Running speed-optimized simulation...');
  const startTime = Date.now();

  const result = await unifiedMonteCarloService.runSimulation(config);

  const actualTime = Date.now() - startTime;
  console.log(`✅ Speed simulation completed in ${actualTime}ms`);
  console.log(`⚡ Achieved rate: ${result.performance.scenariosPerSecond.toFixed(0)} scenarios/sec`);
  console.log(`🎯 Target vs Actual: ${result.executionTimeMs}ms vs ${actualTime}ms`);

  return result;
}

// ============================================================================
// MONITORING AND DIAGNOSTICS EXAMPLES
// ============================================================================

/**
 * Example 7: Performance monitoring and optimization
 */
export async function performanceMonitoringExample() {
  console.log('\n=== Performance Monitoring ===');

  // Run several simulations to build performance history
  const configs = [
    { fundId: 1, runs: 1000, forceEngine: 'traditional' as const, timeHorizonYears: 8 },
    { fundId: 1, runs: 5000, forceEngine: 'streaming' as const, timeHorizonYears: 8 },
    { fundId: 1, runs: 10000, forceEngine: 'auto' as const, timeHorizonYears: 8 },
    { fundId: 1, runs: 2000, forceEngine: 'auto' as const, timeHorizonYears: 8 }
  ];

  console.log('Building performance history...');
  for (const config of configs) {
    await unifiedMonteCarloService.runSimulation(config);
  }

  // Get performance statistics
  const stats = unifiedMonteCarloService.getPerformanceStats();
  console.log('\n📊 Performance Statistics:');
  console.log(`Total simulations: ${stats.totalSimulations}`);
  console.log(`Streaming usage: ${stats.streamingUsage} (${(stats.streamingUsage / stats.totalSimulations * 100).toFixed(1)}%)`);
  console.log(`Traditional usage: ${stats.traditionalUsage} (${(stats.traditionalUsage / stats.totalSimulations * 100).toFixed(1)}%)`);
  console.log(`Average execution time: ${stats.averageExecutionTime.toFixed(0)}ms`);
  console.log(`Fallback rate: ${(stats.fallbackRate * 100).toFixed(1)}%`);

  // Get optimization recommendations
  const recommendations = unifiedMonteCarloService.getOptimizationRecommendations();
  console.log('\n🎯 Optimization Recommendations:');
  console.log(`Preferred engine: ${recommendations.preferredEngine}`);
  console.log(`Optimal batch size: ${recommendations.optimalBatchSize}`);
  console.log(`Memory usage pattern: ${recommendations.memoryUsagePattern}`);

  if (recommendations.recommendations.length > 0) {
    console.log('\n💡 Specific recommendations:');
    recommendations.recommendations.forEach((rec: any, i: any) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  return { stats, recommendations };
}

/**
 * Example 8: Health monitoring
 */
export async function healthMonitoringExample() {
  console.log('\n=== Health Monitoring ===');

  const health = await unifiedMonteCarloService.healthCheck();

  console.log(`System status: ${health.status.toUpperCase()}`);
  console.log('\n🔧 Engine Status:');
  console.log(`  Traditional engine: ${health.engines.traditional ? '✅ Healthy' : '❌ Unhealthy'}`);
  console.log(`  Streaming engine: ${health.engines.streaming ? '✅ Healthy' : '❌ Unhealthy'}`);

  if (health.connectionPools && Object.keys(health.connectionPools).length > 0) {
    console.log('\n🔗 Connection Pool Status:');
    Object.entries(health.connectionPools).forEach(([poolId, metrics]: [string, any]) => {
      console.log(`  ${poolId}:`);
      console.log(`    Active connections: ${metrics.activeConnections}`);
      console.log(`    Total connections: ${metrics.totalConnections}`);
      console.log(`    Connection errors: ${metrics.connectionErrors}`);
      console.log(`    Average query time: ${metrics.averageQueryTime.toFixed(2)}ms`);
    });
  }

  if (health.recommendations.length > 0) {
    console.log('\n⚠️  Health Recommendations:');
    health.recommendations.forEach((rec: any, i: any) => {
      console.log(`  ${i + 1}. ${rec}`);
    });
  }

  return health;
}

// ============================================================================
// MAIN EXAMPLE RUNNER
// ============================================================================

/**
 * Run all examples in sequence
 */
export async function runAllExamples() {
  console.log('🚀 Starting Streaming Monte Carlo Engine Examples\n');

  try {
    // Basic functionality
    await basicStreamingSimulation();
    await autoEngineSelection();

    // Advanced features
    await batchProcessingExample();
    await multiEnvironmentAnalysis();

    // Performance optimization
    await memoryOptimizedSimulation();
    await speedOptimizedSimulation();

    // Monitoring and diagnostics
    await performanceMonitoringExample();
    await healthMonitoringExample();

    console.log('\n✅ All examples completed successfully!');

  } catch (error) {
    console.error('\n❌ Example execution failed:', error);
    throw error;
  } finally {
    // Cleanup resources
    await unifiedMonteCarloService.cleanup();
    console.log('\n🧹 Resources cleaned up');
  }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Compare engine performance for a specific workload
 */
export async function compareEnginePerformance(fundId: number, runs: number) {
  console.log(`\n=== Engine Performance Comparison (${runs} scenarios) ===`);

  const baseConfig = {
    fundId,
    runs,
    timeHorizonYears: 8,
    randomSeed: 12345 // Same seed for fair comparison
  };

  // Test traditional engine
  console.log('Testing traditional engine...');
  const traditionalResult = await unifiedMonteCarloService.runSimulation({
    ...baseConfig,
    forceEngine: 'traditional'
  });

  // Test streaming engine
  console.log('Testing streaming engine...');
  const streamingResult = await unifiedMonteCarloService.runSimulation({
    ...baseConfig,
    forceEngine: 'streaming'
  });

  // Compare results
  console.log('\n📊 Performance Comparison:');
  console.log(`Traditional: ${traditionalResult.executionTimeMs}ms (${traditionalResult.performance.scenariosPerSecond.toFixed(0)} scenarios/sec)`);
  console.log(`Streaming: ${streamingResult.executionTimeMs}ms (${streamingResult.performance.scenariosPerSecond.toFixed(0)} scenarios/sec)`);

  const speedup = traditionalResult.executionTimeMs / streamingResult.executionTimeMs;
  console.log(`Speedup: ${speedup.toFixed(2)}x ${speedup > 1 ? '(streaming faster)' : '(traditional faster)'}`);

  console.log('\n💾 Memory Usage:');
  console.log(`Traditional: ${traditionalResult.performance.memoryUsageMB.toFixed(2)}MB`);
  console.log(`Streaming: ${streamingResult.performance.memoryUsageMB.toFixed(2)}MB`);

  return { traditionalResult, streamingResult };
}

/**
 * Stress test with increasing workloads
 */
export async function stressTest(fundId: number, startRuns: number = 1000, maxRuns: number = 50000, step: number = 5000) {
  console.log(`\n=== Stress Test (${startRuns} to ${maxRuns} scenarios) ===`);

  const results = [];

  for (let runs = startRuns; runs <= maxRuns; runs += step) {
    console.log(`Testing ${runs} scenarios...`);

    try {
      const result = await unifiedMonteCarloService.runSimulation({
        fundId,
        runs,
        timeHorizonYears: 8,
        forceEngine: 'auto',
        performanceMode: 'balanced'
      });

      results.push({
        runs,
        executionTimeMs: result.executionTimeMs,
        scenariosPerSecond: result.performance.scenariosPerSecond,
        memoryUsageMB: result.performance.memoryUsageMB,
        engineUsed: result.performance.engineUsed,
        fallbackTriggered: result.performance.fallbackTriggered
      });

      console.log(`  ✅ ${runs}: ${result.executionTimeMs}ms (${result.performance.engineUsed})`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.log(`  ❌ ${runs}: Failed - ${errorMessage}`);
      results.push({
        runs,
        error: errorMessage
      });
    }
  }

  // Analyze stress test results
  console.log('\n📊 Stress Test Summary:');
  const successful = results.filter(r => !r.error);
  if (successful.length > 0) {
    const avgThroughput = successful.reduce((sum: any, r: any) => sum + r.scenariosPerSecond, 0) / successful.length;
    const peakMemory = Math.max(...successful.map(r => r.memoryUsageMB));
    console.log(`Average throughput: ${avgThroughput.toFixed(0)} scenarios/sec`);
    console.log(`Peak memory usage: ${peakMemory.toFixed(2)}MB`);
    console.log(`Engine transitions: ${successful.filter((r: any, i: any) => i > 0 && r.engineUsed !== successful[i-1].engineUsed).length}`);
  }

  return results;
}

// Export for direct execution
if (import.meta.url === `file://${process.argv[1]!}`) {
  runAllExamples().catch(console.error);
}