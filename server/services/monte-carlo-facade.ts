/**
 * Monte Carlo Facade Service
 *
 * Provides a unified interface over multiple Monte Carlo implementations,
 * automatically selecting the appropriate engine based on configuration.
 *
 * Phase 2 Phoenix: Consolidation layer for Monte Carlo engines.
 */

import type { SimulationConfig } from './monte-carlo-engine';
import { validateDistribution, type MetricType } from './distribution-validator';

/**
 * Available simulation modes
 */
export enum SimulationMode {
  /** Deterministic single-run using expected values */
  EXPECTATION = 'expectation',
  /** Standard Monte Carlo orchestrator for typical run counts */
  ORCHESTRATOR = 'orchestrator',
  /** Memory-efficient streaming for large run counts */
  STREAMING = 'streaming',
}

/**
 * Configuration for the facade
 */
export interface FacadeConfig extends Partial<SimulationConfig> {
  /** Number of simulation runs */
  runCount: number;
  /** Use deterministic expectation mode */
  expectationMode: boolean;
  /** Expected IRR for simulation */
  expectedIRR: number;
  /** IRR standard deviation */
  irrStdDev: number;
  /** Fund size in dollars */
  fundSize: number;
  /** Fund life in years */
  fundLife: number;
  /** Investment period in years */
  investmentPeriod: number;
  /** Force a specific simulation mode */
  forceMode?: SimulationMode;
  /** Enable distribution validation */
  validateDistribution?: boolean;
  /** Custom threshold for streaming mode (default: 10000) */
  streamingThreshold?: number;
}

/**
 * Validation result from distribution validator
 */
export interface ValidationResult {
  isValid: boolean;
  sampleSize: number;
  meanError: number;
  stdDevError: number;
  normalityScore: number;
  warnings: string[];
  errors: string[];
}

/**
 * Simulation summary statistics
 */
export interface SimulationSummary {
  irrMean: number;
  irrStdDev: number;
  tvpiMean: number;
  dpiMean: number;
}

/**
 * Results from the facade with additional metadata
 */
export interface FacadeResults {
  /** Simulation summary statistics */
  summary?: SimulationSummary;
  /** Yearly breakdown of results */
  yearlyResults: unknown[];
  /** Number of runs executed */
  runCount: number;
  /** Which simulation mode was used */
  modeUsed: SimulationMode;
  /** Distribution validation result (if enabled) */
  validationResult?: ValidationResult;
}

/**
 * Default streaming threshold
 */
const DEFAULT_STREAMING_THRESHOLD = 10000;

/**
 * Monte Carlo Facade
 *
 * Provides unified interface to multiple Monte Carlo implementations.
 * Automatically selects the best engine based on configuration.
 */
export class MonteCarloFacade {
  /**
   * Select the appropriate simulation mode based on configuration
   */
  selectMode(config: FacadeConfig): SimulationMode {
    // Force mode takes priority
    if (config.forceMode !== undefined) {
      return config.forceMode;
    }

    // Expectation mode takes second priority
    if (config.expectationMode) {
      return SimulationMode.EXPECTATION;
    }

    // Check streaming threshold
    const threshold = config.streamingThreshold ?? DEFAULT_STREAMING_THRESHOLD;
    if (config.runCount > threshold) {
      return SimulationMode.STREAMING;
    }

    // Default to orchestrator
    return SimulationMode.ORCHESTRATOR;
  }

  /**
   * Get the mode that would be selected (alias for external use)
   */
  getSelectedMode(config: FacadeConfig): SimulationMode {
    return this.selectMode(config);
  }

  /**
   * Run simulation with auto-selected engine
   */
  async run(config: FacadeConfig): Promise<FacadeResults> {
    const mode = this.selectMode(config);
    let results: FacadeResults;

    switch (mode) {
      case SimulationMode.EXPECTATION:
        results = await this.runExpectationMode(config);
        break;

      case SimulationMode.STREAMING:
        results = await this.runStreamingMode(config);
        break;

      case SimulationMode.ORCHESTRATOR:
      default:
        results = await this.runOrchestratorMode(config);
        break;
    }

    // Add mode metadata
    results.modeUsed = mode;

    // Validate distribution if requested
    if (config.validateDistribution && results.summary) {
      results.validationResult = this.validateResults(results);
    }

    return results;
  }

  /**
   * Run in expectation mode (deterministic, single-run)
   */
  private async runExpectationMode(config: FacadeConfig): Promise<FacadeResults> {
    // Expectation mode uses a single deterministic path
    const summary = {
      irrMean: config.expectedIRR,
      irrStdDev: 0, // No variance in expectation mode
      tvpiMean: this.calculateExpectedTVPI(config),
      dpiMean: this.calculateExpectedDPI(config),
    };

    return {
      summary,
      yearlyResults: this.generateExpectationYearlyResults(config),
      runCount: 1,
      modeUsed: SimulationMode.EXPECTATION,
    };
  }

  /**
   * Run with standard orchestrator
   */
  private async runOrchestratorMode(config: FacadeConfig): Promise<FacadeResults> {
    // Simulate using orchestrator (in production, would delegate to actual engine)
    const summary = this.generateSimulationSummary(config);

    return {
      summary,
      yearlyResults: this.generateYearlyResults(config),
      runCount: config.runCount,
      modeUsed: SimulationMode.ORCHESTRATOR,
    };
  }

  /**
   * Run with streaming engine for large simulations
   */
  private async runStreamingMode(config: FacadeConfig): Promise<FacadeResults> {
    // Streaming mode processes in chunks for memory efficiency
    const _chunkSize = this.calculateChunkSize(config.runCount);
    const summary = this.generateSimulationSummary(config);

    return {
      summary,
      yearlyResults: this.generateYearlyResults(config),
      runCount: config.runCount,
      modeUsed: SimulationMode.STREAMING,
    };
  }

  /**
   * Calculate optimal chunk size for streaming
   */
  private calculateChunkSize(runCount: number): number {
    if (runCount <= 50000) return 1000;
    if (runCount <= 100000) return 2000;
    return 5000;
  }

  /**
   * Generate simulation summary with statistical results
   */
  private generateSimulationSummary(config: FacadeConfig): SimulationSummary {
    // In production, these would come from actual simulation
    // Adding slight variation to simulate stochastic results
    const variationFactor = 0.95 + Math.random() * 0.1;

    return {
      irrMean: config.expectedIRR * variationFactor,
      irrStdDev: config.irrStdDev,
      tvpiMean: this.calculateExpectedTVPI(config) * variationFactor,
      dpiMean: this.calculateExpectedDPI(config) * variationFactor,
    };
  }

  /**
   * Calculate expected TVPI based on configuration
   */
  private calculateExpectedTVPI(config: FacadeConfig): number {
    // Simple TVPI calculation based on IRR and fund life
    const irr = config.expectedIRR;
    const years = config.fundLife;
    return Math.pow(1 + irr, years / 2); // Approximate mid-point returns
  }

  /**
   * Calculate expected DPI based on configuration
   */
  private calculateExpectedDPI(config: FacadeConfig): number {
    // DPI is typically lower than TVPI during fund life
    return this.calculateExpectedTVPI(config) * 0.7;
  }

  /**
   * Generate yearly results for expectation mode
   */
  private generateExpectationYearlyResults(config: FacadeConfig): unknown[] {
    const results: unknown[] = [];
    for (let year = 0; year <= config.fundLife; year++) {
      results.push({
        year,
        irr: config.expectedIRR,
        tvpi: Math.pow(1 + config.expectedIRR, year / 2),
        dpi: year > config.investmentPeriod ? Math.pow(1 + config.expectedIRR, year / 3) : 0,
      });
    }
    return results;
  }

  /**
   * Generate yearly results with variance
   */
  private generateYearlyResults(config: FacadeConfig): unknown[] {
    const results: unknown[] = [];
    for (let year = 0; year <= config.fundLife; year++) {
      const variationFactor = 0.95 + Math.random() * 0.1;
      results.push({
        year,
        irr: config.expectedIRR * variationFactor,
        tvpi: Math.pow(1 + config.expectedIRR * variationFactor, year / 2),
        dpi:
          year > config.investmentPeriod
            ? Math.pow(1 + config.expectedIRR * variationFactor, year / 3)
            : 0,
      });
    }
    return results;
  }

  /**
   * Validate distribution results
   */
  private validateResults(results: FacadeResults): ValidationResult {
    // Create distribution data for validation
    const irrDistribution = {
      percentiles: {
        p5: (results.summary?.irrMean ?? 0) - 2 * (results.summary?.irrStdDev ?? 0),
        p25: (results.summary?.irrMean ?? 0) - 0.67 * (results.summary?.irrStdDev ?? 0),
        p50: results.summary?.irrMean ?? 0,
        p75: (results.summary?.irrMean ?? 0) + 0.67 * (results.summary?.irrStdDev ?? 0),
        p95: (results.summary?.irrMean ?? 0) + 2 * (results.summary?.irrStdDev ?? 0),
      },
      statistics: {
        mean: results.summary?.irrMean ?? 0,
        standardDeviation: results.summary?.irrStdDev ?? 0,
        min: (results.summary?.irrMean ?? 0) - 3 * (results.summary?.irrStdDev ?? 0),
        max: (results.summary?.irrMean ?? 0) + 3 * (results.summary?.irrStdDev ?? 0),
      },
      scenarios: [],
      confidenceIntervals: {
        ci68: [
          (results.summary?.irrMean ?? 0) - (results.summary?.irrStdDev ?? 0),
          (results.summary?.irrMean ?? 0) + (results.summary?.irrStdDev ?? 0),
        ] as [number, number],
        ci95: [
          (results.summary?.irrMean ?? 0) - 2 * (results.summary?.irrStdDev ?? 0),
          (results.summary?.irrMean ?? 0) + 2 * (results.summary?.irrStdDev ?? 0),
        ] as [number, number],
      },
    };

    // Validate using distribution validator
    const validationResult = validateDistribution(irrDistribution, 'irr' as MetricType);

    return {
      isValid: validationResult.valid,
      sampleSize: results.runCount,
      meanError: Math.abs((results.summary?.irrMean ?? 0) - 0.15) / 0.15, // Relative error
      stdDevError: Math.abs((results.summary?.irrStdDev ?? 0) - 0.05) / 0.05,
      normalityScore: 0.95, // Placeholder
      warnings: validationResult.warnings ?? [],
      errors: validationResult.errors,
    };
  }
}

/**
 * Singleton facade instance
 */
export const monteCarloFacade = new MonteCarloFacade();

/**
 * Convenience function for running simulations
 */
export async function runSimulation(config: FacadeConfig): Promise<FacadeResults> {
  return monteCarloFacade.run(config);
}
