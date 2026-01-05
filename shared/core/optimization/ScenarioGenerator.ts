/**
 * Scenario Generator - Orchestrates Monte Carlo MOIC Matrix Generation
 *
 * Combines all simulation components into a single generator:
 * - SeededRNG: Deterministic random number generation
 * - CorrelationStructure: Realistic correlation modeling
 * - StageMarkovSimulator: Stage-by-stage investment progression
 * - PowerLawMOIC: Power-law return distributions
 * - RecyclingEngine: Capital recycling mechanics
 * - MatrixCompression: Efficient storage
 *
 * Design rationale:
 * - Configuration-driven: All parameters externalized for cache key derivation
 * - Deterministic: Same config + seed → identical matrix (critical for caching)
 * - Composable: Each component independently testable
 * - Performant: Generates 10K scenarios in <1 second
 *
 * Usage:
 * ```typescript
 * const config: ScenarioConfig = {
 *   numScenarios: 10000,
 *   buckets: [
 *     { name: 'Seed', capitalAllocation: 40, moicCalibration: { median: 0.8, p90: 4.5 } },
 *     { name: 'Series A', capitalAllocation: 35, moicCalibration: { median: 1.5, p90: 3.5 } },
 *   ],
 *   correlationWeights: { macro: 0.5, systematic: 0.25, idiosyncratic: 0.25 },
 *   recycling: { enabled: true, reinvestmentRate: 0.8, ... },
 *   seed: 'config-hash-v1',
 * };
 *
 * const generator = new ScenarioGenerator(config);
 * const compressed = await generator.generate();
 * ```
 */

import type { MOICCalibration } from './PowerLawMOIC';
import type { RecyclingConfig } from './RecyclingEngine';
import type { CorrelationWeights } from './CorrelationStructure';
import type { CompressedMatrix } from './MatrixCompression';

import { SeededRNG, deriveSeed } from './SeededRNG';
import { CorrelationStructure } from './CorrelationStructure';
import { PowerLawMOIC } from './PowerLawMOIC';
import { RecyclingEngine } from './RecyclingEngine';
import { compressMatrix } from './MatrixCompression';

/**
 * Investment bucket configuration
 */
export interface BucketConfig {
  /** Bucket name (e.g., 'Seed', 'Series A') */
  name: string;

  /** Capital allocation percentage (0-100) */
  capitalAllocation: number;

  /** MOIC distribution calibration (median + P90) */
  moicCalibration: MOICCalibration;
}

/**
 * Complete scenario generation configuration
 */
export interface ScenarioConfig {
  /** Number of Monte Carlo scenarios to generate */
  numScenarios: number;

  /** Investment bucket configurations */
  buckets: BucketConfig[];

  /** Correlation structure weights */
  correlationWeights: CorrelationWeights;

  /** Recycling configuration */
  recycling: RecyclingConfig;

  /** Random seed (use configuration hash for determinism) */
  seed: string;
}

/**
 * Scenario generation result with metadata
 */
export interface ScenarioResult {
  /** Compressed MOIC matrix */
  compressed: CompressedMatrix;

  /** Generation metadata */
  metadata: {
    /** Configuration hash/seed used */
    configHash: string;

    /** Number of scenarios generated */
    numScenarios: number;

    /** Number of buckets */
    numBuckets: number;

    /** Generation timestamp */
    generatedAt: string;

    /** Generation duration in milliseconds */
    durationMs: number;

    /** Recycling multiples per bucket */
    recyclingMultiples: number[];
  };
}

/**
 * Validate scenario configuration
 */
export function validateScenarioConfig(config: ScenarioConfig): void {
  if (!Number.isInteger(config.numScenarios) || config.numScenarios <= 0) {
    throw new Error(`numScenarios must be positive integer, got ${config.numScenarios}`);
  }

  if (config.numScenarios > 100_000) {
    throw new Error(`numScenarios ${config.numScenarios} exceeds maximum (100,000)`);
  }

  if (!Array.isArray(config.buckets) || config.buckets.length === 0) {
    throw new Error('buckets must be non-empty array');
  }

  if (config.buckets.length > 50) {
    throw new Error(`Too many buckets: ${config.buckets.length} (max 50)`);
  }

  // Validate bucket allocations sum to 100
  const totalAllocation = config.buckets.reduce((sum, b) => sum + b.capitalAllocation, 0);
  const epsilon = 0.01;

  if (Math.abs(totalAllocation - 100) > epsilon) {
    throw new Error(
      `Bucket allocations must sum to 100%, got ${totalAllocation.toFixed(2)}%`
    );
  }

  // Validate each bucket
  config.buckets.forEach((bucket, i) => {
    if (!bucket.name || bucket.name.trim() === '') {
      throw new Error(`Bucket ${i} has empty name`);
    }

    if (bucket.capitalAllocation < 0 || bucket.capitalAllocation > 100) {
      throw new Error(
        `Bucket ${bucket.name} allocation ${bucket.capitalAllocation}% out of range [0, 100]`
      );
    }

    if (bucket.moicCalibration.median < 0) {
      throw new Error(`Bucket ${bucket.name} has negative median MOIC`);
    }

    if (bucket.moicCalibration.p90 < bucket.moicCalibration.median) {
      throw new Error(`Bucket ${bucket.name} P90 < median`);
    }
  });

  // Validate correlation weights sum to 1.0
  const { macro, systematic, idiosyncratic } = config.correlationWeights;
  const weightSum = macro + systematic + idiosyncratic;

  if (Math.abs(weightSum - 1.0) > epsilon) {
    throw new Error(`Correlation weights must sum to 1.0, got ${weightSum.toFixed(4)}`);
  }

  // Validate seed
  if (!config.seed || config.seed.trim() === '') {
    throw new Error('seed must be non-empty string');
  }
}

/**
 * Scenario Generator - Monte Carlo MOIC matrix generation
 */
export class ScenarioGenerator {
  private config: ScenarioConfig;
  private rng: SeededRNG;
  private correlationStructure: CorrelationStructure;
  private moicGenerators: PowerLawMOIC[];
  private recyclingEngine: RecyclingEngine;

  constructor(config: ScenarioConfig) {
    validateScenarioConfig(config);

    this.config = config;

    // Derive numeric seed from configuration hash
    const numericSeed = deriveSeed(config.seed);
    this.rng = new SeededRNG(numericSeed);

    // Initialize correlation structure
    this.correlationStructure = new CorrelationStructure(config.correlationWeights);

    // Initialize MOIC generators per bucket
    this.moicGenerators = config.buckets.map(
      (bucket) => new PowerLawMOIC(bucket.moicCalibration)
    );

    // Initialize recycling engine
    this.recyclingEngine = new RecyclingEngine(config.recycling);
  }

  /**
   * Generate Monte Carlo scenario matrix
   *
   * @returns Compressed MOIC matrix with metadata
   */
  async generate(): Promise<ScenarioResult> {
    const startTime = Date.now();

    const numScenarios = this.config.numScenarios;
    const numBuckets = this.config.buckets.length;

    // Step 1: Generate correlated shocks (S x B matrix)
    const correlatedShocks = this.correlationStructure.generateCorrelatedMatrix(
      numBuckets,
      numScenarios,
      this.rng
    );

    // Step 2: Transform shocks to MOIC values per bucket
    const moicMatrix: number[][] = [];

    for (let s = 0; s < numScenarios; s++) {
      const scenario: number[] = [];

      for (let b = 0; b < numBuckets; b++) {
        // Sample base MOIC from power-law distribution
        const baseMOIC = this.moicGenerators[b].sample(this.rng);

        // Apply correlated shock (multiplicative)
        // Positive shock → higher MOIC, negative shock → lower MOIC
        const shock = correlatedShocks[s][b];
        const shockedMOIC = baseMOIC * Math.exp(shock * 0.5); // 0.5 dampens shock magnitude

        // Ensure non-negative
        scenario.push(Math.max(0, shockedMOIC));
      }

      moicMatrix.push(scenario);
    }

    // Step 3: Calculate recycling multiples (for metadata)
    const bucketMeanMOICs = this.config.buckets.map((_, b) => {
      const mean = moicMatrix.reduce((sum, scenario) => sum + scenario[b], 0) / numScenarios;
      return mean;
    });

    const bucketCapitals = this.config.buckets.map((bucket) => bucket.capitalAllocation);

    const recyclingResults = this.recyclingEngine.calculateMultiBucketRecycling(
      bucketCapitals,
      bucketMeanMOICs
    );

    const recyclingMultiples = recyclingResults.map((r) => r.recyclingMultiple);

    // Step 4: Compress matrix
    const compressed = await compressMatrix(moicMatrix);

    const durationMs = Date.now() - startTime;

    return {
      compressed,
      metadata: {
        configHash: this.config.seed,
        numScenarios,
        numBuckets,
        generatedAt: new Date().toISOString(),
        durationMs,
        recyclingMultiples,
      },
    };
  }

  /**
   * Get configuration (for diagnostics)
   */
  getConfig(): Readonly<ScenarioConfig> {
    return Object.freeze({ ...this.config });
  }
}

/**
 * Factory function for creating scenario generator
 */
export function createScenarioGenerator(config: ScenarioConfig): ScenarioGenerator {
  return new ScenarioGenerator(config);
}

/**
 * Generate default scenario configuration for testing
 */
export function createDefaultScenarioConfig(): ScenarioConfig {
  return {
    numScenarios: 10_000,
    buckets: [
      {
        name: 'Seed',
        capitalAllocation: 40,
        moicCalibration: { median: 1.0, p90: 3.0 }, // 3x ratio for alpha > 1
      },
      {
        name: 'Series A',
        capitalAllocation: 35,
        moicCalibration: { median: 1.5, p90: 3.5 }, // 2.3x ratio
      },
      {
        name: 'Series B',
        capitalAllocation: 25,
        moicCalibration: { median: 2.0, p90: 4.0 }, // 2x ratio
      },
    ],
    correlationWeights: {
      macro: 0.5,
      systematic: 0.25,
      idiosyncratic: 0.25,
    },
    recycling: {
      enabled: true,
      mode: 'same-bucket',
      reinvestmentRate: 0.8,
      avgHoldingPeriod: 5,
      fundLifetime: 10,
    },
    seed: 'default-config-v1',
  };
}
