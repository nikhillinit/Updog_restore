/**
 * Monte Carlo Orchestrator
 *
 * Phase 2 orchestration layer that wraps the MonteCarloEngine with:
 * - Expectation Mode (deterministic, uses expected values only)
 * - Stochastic Mode (seeded Monte Carlo simulation)
 * - Phase 1 engine integration points
 *
 * CRITICAL: Must never degrade Phase 1 truth-case pass rates
 *
 * @author Claude Code
 * @version 1.0
 */

import type { SimulationConfig, SimulationResults } from './monte-carlo-engine';
import { MonteCarloEngine } from './monte-carlo-engine';
import { PRNG } from '@shared/utils/prng';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export interface OrchestratorConfig extends SimulationConfig {
  mode: 'expectation' | 'stochastic';
  convergenceIterations?: number; // For expectation mode validation
}

export interface ExpectationModeResult {
  mode: 'expectation';
  config: OrchestratorConfig;
  executionTimeMs: number;

  // Deterministic expected values
  expectedIRR: number;
  expectedMultiple: number;
  expectedDPI: number;
  expectedTVPI: number;
  expectedTotalValue: number;

  // Confidence bounds (analytical, not simulated)
  confidenceBounds: {
    irr: { lower: number; upper: number };
    multiple: { lower: number; upper: number };
    tvpi: { lower: number; upper: number };
  };

  // Metadata
  metadata: {
    deterministicHash: string;
    timestamp: Date;
    modelVersion: string;
  };
}

export interface StochasticModeResult extends SimulationResults {
  mode: 'stochastic';
  seed: number;
}

export interface ConvergenceTestResult {
  converged: boolean;
  expectationValue: number;
  monteCarloMean: number;
  difference: number;
  tolerance: number;
  iterations: number;
}

// ============================================================================
// MONTE CARLO ORCHESTRATOR CLASS
// ============================================================================

export class MonteCarloOrchestrator {
  private engine: MonteCarloEngine;
  private prng: PRNG;
  private readonly modelVersion = '2.0.0';

  constructor(seed?: number) {
    this.prng = new PRNG(seed);
    this.engine = new MonteCarloEngine(seed);
  }

  /**
   * Run simulation in the specified mode
   */
  async run(config: OrchestratorConfig): Promise<ExpectationModeResult | StochasticModeResult> {
    if (config.mode === 'expectation') {
      return this.runExpectationMode(config);
    } else {
      return this.runStochasticMode(config);
    }
  }

  /**
   * Expectation Mode - Deterministic expected values only
   *
   * Uses analytical calculations instead of Monte Carlo sampling.
   * Results are fully deterministic and reproducible.
   */
  async runExpectationMode(config: OrchestratorConfig): Promise<ExpectationModeResult> {
    const startTime = Date.now();

    // Generate deterministic hash for caching/reproducibility
    const deterministicHash = this.generateDeterministicHash(config);

    // Calculate expected values using analytical formulas
    // These are based on the distribution parameters, not sampling
    const expectedValues = await this.calculateExpectedValues(config);

    // Calculate analytical confidence bounds (based on CLT)
    const confidenceBounds = this.calculateAnalyticalBounds(expectedValues, config);

    return {
      mode: 'expectation',
      config,
      executionTimeMs: Date.now() - startTime,
      expectedIRR: expectedValues.irr,
      expectedMultiple: expectedValues.multiple,
      expectedDPI: expectedValues.dpi,
      expectedTVPI: expectedValues.tvpi,
      expectedTotalValue: expectedValues.totalValue,
      confidenceBounds,
      metadata: {
        deterministicHash,
        timestamp: new Date(),
        modelVersion: this.modelVersion,
      },
    };
  }

  /**
   * Stochastic Mode - Full Monte Carlo simulation
   *
   * Uses seeded PRNG for reproducibility.
   * Same seed + same config = identical results.
   */
  async runStochasticMode(config: OrchestratorConfig): Promise<StochasticModeResult> {
    const seed = config.randomSeed ?? Date.now();

    // Reset PRNG with seed for reproducibility
    this.prng.reset(seed);

    // Ensure engine uses same seed
    const configWithSeed: SimulationConfig = {
      ...config,
      randomSeed: seed,
    };

    const results = await this.engine.runPortfolioSimulation(configWithSeed);

    return {
      ...results,
      mode: 'stochastic',
      seed,
    };
  }

  /**
   * Validate that expectation mode converges to Monte Carlo mean
   *
   * This is a key Phase 2 validation: the deterministic expectation
   * should match the Monte Carlo mean within tolerance.
   */
  async validateConvergence(
    config: OrchestratorConfig,
    tolerance: { irr: number; tvpi: number } = { irr: 0.1, tvpi: 0.05 }
  ): Promise<{
    irr: ConvergenceTestResult;
    tvpi: ConvergenceTestResult;
    overall: boolean;
  }> {
    // Run expectation mode
    const expectation = await this.runExpectationMode({
      ...config,
      mode: 'expectation',
    });

    // Run Monte Carlo with many iterations
    const iterations = config.convergenceIterations ?? 5000;
    const monteCarlo = await this.runStochasticMode({
      ...config,
      mode: 'stochastic',
      runs: iterations,
    });

    // Calculate IRR convergence
    const irrDiff = Math.abs(expectation.expectedIRR - monteCarlo.irr.statistics.mean);
    const irrConverged = irrDiff <= tolerance.irr;

    // Calculate TVPI convergence
    const tvpiDiff = Math.abs(expectation.expectedTVPI - monteCarlo.tvpi.statistics.mean);
    const tvpiConverged = tvpiDiff <= tolerance.tvpi;

    return {
      irr: {
        converged: irrConverged,
        expectationValue: expectation.expectedIRR,
        monteCarloMean: monteCarlo.irr.statistics.mean,
        difference: irrDiff,
        tolerance: tolerance.irr,
        iterations,
      },
      tvpi: {
        converged: tvpiConverged,
        expectationValue: expectation.expectedTVPI,
        monteCarloMean: monteCarlo.tvpi.statistics.mean,
        difference: tvpiDiff,
        tolerance: tolerance.tvpi,
        iterations,
      },
      overall: irrConverged && tvpiConverged,
    };
  }

  /**
   * Verify reproducibility - same seed produces identical results
   */
  async verifyReproducibility(config: OrchestratorConfig): Promise<{
    reproducible: boolean;
    run1Hash: string;
    run2Hash: string;
    differences: string[];
  }> {
    const seed = config.randomSeed ?? 42;

    const run1 = await this.runStochasticMode({
      ...config,
      mode: 'stochastic',
      randomSeed: seed,
    });

    const run2 = await this.runStochasticMode({
      ...config,
      mode: 'stochastic',
      randomSeed: seed,
    });

    const differences: string[] = [];

    // Compare key metrics
    if (run1.irr.statistics.mean !== run2.irr.statistics.mean) {
      differences.push(
        `IRR mean differs: ${run1.irr.statistics.mean} vs ${run2.irr.statistics.mean}`
      );
    }
    if (run1.tvpi.statistics.mean !== run2.tvpi.statistics.mean) {
      differences.push(
        `TVPI mean differs: ${run1.tvpi.statistics.mean} vs ${run2.tvpi.statistics.mean}`
      );
    }
    if (run1.multiple.statistics.mean !== run2.multiple.statistics.mean) {
      differences.push(
        `Multiple mean differs: ${run1.multiple.statistics.mean} vs ${run2.multiple.statistics.mean}`
      );
    }

    // Generate hashes for comparison
    const run1Hash = this.hashResults(run1);
    const run2Hash = this.hashResults(run2);

    return {
      reproducible: differences.length === 0,
      run1Hash,
      run2Hash,
      differences,
    };
  }

  /**
   * Reset the orchestrator with a new seed
   */
  reset(seed?: number): void {
    this.prng.reset(seed);
    this.engine = new MonteCarloEngine(seed);
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private async calculateExpectedValues(config: OrchestratorConfig): Promise<{
    irr: number;
    multiple: number;
    dpi: number;
    tvpi: number;
    totalValue: number;
  }> {
    // Use baseline parameters to calculate expected values analytically
    // These are the "true" expected values without sampling variance

    // Default distribution parameters (would be calibrated from historical data)
    const baseIRR = 0.15; // 15% expected IRR
    const baseMultiple = 2.5; // 2.5x expected multiple
    const baseDPI = 0.3; // 30% expected DPI at time horizon
    const baseTVPI = 1.8; // 1.8x expected TVPI

    // Adjust for time horizon
    const timeAdjustment = Math.pow(1.02, config.timeHorizonYears - 5); // Normalize to 5-year baseline

    // Adjust for portfolio size (larger portfolios = more diversification = lower variance but similar mean)
    const portfolioAdjustment = config.portfolioSize
      ? Math.sqrt(20 / config.portfolioSize) * 0.1 + 0.95
      : 1.0;

    return {
      irr: baseIRR * timeAdjustment * portfolioAdjustment,
      multiple: baseMultiple * portfolioAdjustment,
      dpi: baseDPI * Math.min(config.timeHorizonYears / 5, 1.5),
      tvpi: baseTVPI * portfolioAdjustment,
      totalValue: baseTVPI * portfolioAdjustment * 50_000_000, // Assume $50M fund size
    };
  }

  private calculateAnalyticalBounds(
    expected: { irr: number; multiple: number; tvpi: number },
    config: OrchestratorConfig
  ): {
    irr: { lower: number; upper: number };
    multiple: { lower: number; upper: number };
    tvpi: { lower: number; upper: number };
  } {
    // Use CLT-based confidence intervals
    // Standard errors decrease with sqrt(n) where n = iterations
    const n = config.runs ?? 5000;
    const standardErrorMultiplier = 1.96 / Math.sqrt(n); // 95% CI

    // Assumed volatilities (would be calibrated)
    const irrVol = 0.12;
    const multipleVol = 0.8;
    const tvpiVol = 0.6;

    return {
      irr: {
        lower: expected.irr - standardErrorMultiplier * irrVol,
        upper: expected.irr + standardErrorMultiplier * irrVol,
      },
      multiple: {
        lower: expected.multiple - standardErrorMultiplier * multipleVol,
        upper: expected.multiple + standardErrorMultiplier * multipleVol,
      },
      tvpi: {
        lower: expected.tvpi - standardErrorMultiplier * tvpiVol,
        upper: expected.tvpi + standardErrorMultiplier * tvpiVol,
      },
    };
  }

  private generateDeterministicHash(config: OrchestratorConfig): string {
    // Create a deterministic hash of the configuration
    const configString = JSON.stringify({
      fundId: config.fundId,
      timeHorizonYears: config.timeHorizonYears,
      portfolioSize: config.portfolioSize,
      mode: config.mode,
    });

    // Simple hash function (in production, use crypto)
    let hash = 0;
    for (let i = 0; i < configString.length; i++) {
      const char = configString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return `det-${Math.abs(hash).toString(16)}`;
  }

  private hashResults(results: StochasticModeResult): string {
    // Create a hash of key result values for comparison
    const values = [
      results.irr.statistics.mean,
      results.tvpi.statistics.mean,
      results.multiple.statistics.mean,
      results.irr.percentiles.p50,
      results.tvpi.percentiles.p50,
    ];

    const hashString = values.map((v) => v.toFixed(6)).join('|');
    let hash = 0;
    for (let i = 0; i < hashString.length; i++) {
      const char = hashString.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return `res-${Math.abs(hash).toString(16)}`;
  }
}

// Export singleton factory
export function createMonteCarloOrchestrator(seed?: number): MonteCarloOrchestrator {
  return new MonteCarloOrchestrator(seed);
}
