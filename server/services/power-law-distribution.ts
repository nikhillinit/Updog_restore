/**
 * Power Law Distribution Service for Monte Carlo Simulations
 *
 * Implements realistic venture capital return distributions based on 2024-2025 industry data.
 * Replaces normal distribution sampling with power law (Pareto) distributions that better
 * reflect the "Series A Chasm" and extreme variance in VC outcomes.
 *
 * Key Features:
 * - Stage-specific failure rates reflecting funding progression difficulty
 * - Power law return distribution matching modern VC portfolio outcomes
 * - Removes time decay that incorrectly dampens variance in traditional models
 * - Integrates with existing Monte Carlo engine architecture
 *
 * @author Claude Code
 * @version 1.0
 */

// ============================================================================
// IMPORTS
// ============================================================================

import { normalizeInvestmentStage, type InvestmentStage } from '../utils/stage-utils';

// ============================================================================
// TELEMETRY & OBSERVABILITY
// ============================================================================

/**
 * Telemetry counters for Monte Carlo operations
 *
 * In production, these should be connected to Prometheus/CloudWatch
 * For now, we track them in-memory and log to structured logs
 */
const telemetry = {
  mcTrialsTotal: 0,
  mcTrialsFailed: 0,
  stageNormalizationUnknown: 0,
  unknownStages: new Map<string, number>(), // Track frequency of unknown stages
};

/**
 * Emit telemetry event (would connect to Prometheus in production)
 */
function emitMetric(name: string, value: number, labels?: Record<string, string>) {
  // Log to structured logs (would be ingested by observability stack)
  console.log(
    JSON.stringify({
      type: 'metric',
      name,
      value,
      timestamp: new Date().toISOString(),
      labels: labels || {},
    })
  );
}

/**
 * Record unknown stage for observability
 */
function recordUnknownStage(original: string, caller?: string) {
  telemetry.stageNormalizationUnknown++;
  const existing = telemetry.unknownStages.get(original) || 0;
  telemetry.unknownStages.set(original, existing + 1);

  emitMetric('stage_normalization_unknown_total', 1, {
    original_stage: original,
    caller: caller || 'unknown',
  });

  // Log structured error for debugging
  console.error(
    JSON.stringify({
      type: 'stage_normalization_failure',
      original_stage: original,
      timestamp: new Date().toISOString(),
      caller,
    })
  );
}

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

export type { InvestmentStage } from '../utils/stage-utils';

export interface PowerLawConfig {
  // Overall distribution based on 2024-2025 VC data
  failureRate: number; // 70% of investments return 0-1x
  modestReturnRate: number; // 15% return 1-3x
  goodOutcomeRate: number; // 10% return 3-10x
  homeRunRate: number; // 4% return 10-50x
  unicornRate: number; // 1% return 50x+ (capped at 200x)

  // Power law parameters
  alpha: number; // Shape parameter for power law tail
  xMin: number; // Minimum value for power law
  maxReturn: number; // Maximum return multiple (cap for unicorns)
}

export interface StageReturnProfile {
  stage: InvestmentStage;
  failureRate: number;
  returnBands: {
    failure: { min: number; max: number; probability: number };
    modest: { min: number; max: number; probability: number };
    good: { min: number; max: number; probability: number };
    homeRun: { min: number; max: number; probability: number };
    unicorn: { min: number; max: number; probability: number };
  };
}

export interface ReturnSample {
  multiple: number;
  category: 'failure' | 'modest' | 'good' | 'homeRun' | 'unicorn';
  stage: InvestmentStage;
  probability: number;
}

export interface PortfolioReturnDistribution {
  samples: ReturnSample[];
  statistics: {
    mean: number;
    median: number;
    standardDeviation: number;
    skewness: number;
    kurtosis: number;
    powerLawAlpha: number;
  };
  percentiles: {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  };
}

// ============================================================================
// POWER LAW DISTRIBUTION CLASS
// ============================================================================

export class PowerLawDistribution {
  private config: PowerLawConfig;
  private stageProfiles: Map<InvestmentStage, StageReturnProfile>;
  private randomSeed?: number;
  private rng: () => number;

  constructor(config?: Partial<PowerLawConfig>, randomSeed?: number) {
    this.config = {
      failureRate: 0.7,
      modestReturnRate: 0.15,
      goodOutcomeRate: 0.1,
      homeRunRate: 0.04,
      unicornRate: 0.01,
      alpha: 1.16, // Zipf's law parameter for VC returns
      xMin: 3.0, // Power law starts at 3x returns
      maxReturn: 200.0, // Cap unicorns at 200x
      ...config,
    };

    this.randomSeed = randomSeed;
    this.rng = this.createRandomGenerator(randomSeed);
    this.stageProfiles = this.initializeStageProfiles();
  }

  /**
   * Sample returns for a portfolio company based on investment stage
   */
  sampleReturn(stage: InvestmentStage = 'seed'): ReturnSample {
    const profile = this.stageProfiles.get(stage);
    if (!profile) {
      throw new Error(`Invalid investment stage: ${stage}`);
    }

    const rand = this.rng();
    const { returnBands } = profile;

    // Determine return category based on cumulative probabilities
    let cumulativeProb = 0;

    // Check failure first (highest probability)
    cumulativeProb += returnBands.failure.probability;
    if (rand <= cumulativeProb) {
      return {
        multiple: this.sampleUniform(returnBands.failure.min, returnBands.failure.max),
        category: 'failure',
        stage,
        probability: returnBands.failure.probability,
      };
    }

    // Check modest returns
    cumulativeProb += returnBands.modest.probability;
    if (rand <= cumulativeProb) {
      return {
        multiple: this.sampleUniform(returnBands.modest.min, returnBands.modest.max),
        category: 'modest',
        stage,
        probability: returnBands.modest.probability,
      };
    }

    // Check good outcomes
    cumulativeProb += returnBands.good.probability;
    if (rand <= cumulativeProb) {
      return {
        multiple: this.sampleUniform(returnBands.good.min, returnBands.good.max),
        category: 'good',
        stage,
        probability: returnBands.good.probability,
      };
    }

    // Check home runs
    cumulativeProb += returnBands.homeRun.probability;
    if (rand <= cumulativeProb) {
      return {
        multiple: this.samplePowerLaw(returnBands.homeRun.min, returnBands.homeRun.max),
        category: 'homeRun',
        stage,
        probability: returnBands.homeRun.probability,
      };
    }

    // Must be unicorn
    return {
      multiple: this.samplePowerLaw(returnBands.unicorn.min, returnBands.unicorn.max),
      category: 'unicorn',
      stage,
      probability: returnBands.unicorn.probability,
    };
  }

  /**
   * Generate portfolio return distribution for Monte Carlo simulation
   */
  generatePortfolioReturns(
    portfolioSize: number,
    stageDistribution: Partial<Record<InvestmentStage, number>> = { seed: 1.0 },
    scenarios: number = 10000
  ): PortfolioReturnDistribution {
    // Input validation
    if (
      typeof portfolioSize !== 'number' ||
      portfolioSize <= 0 ||
      !Number.isFinite(portfolioSize)
    ) {
      throw new RangeError(`portfolioSize must be a positive finite number, got: ${portfolioSize}`);
    }
    if (typeof scenarios !== 'number' || scenarios <= 0 || !Number.isFinite(scenarios)) {
      throw new RangeError(`scenarios must be a positive finite number, got: ${scenarios}`);
    }
    if (!stageDistribution || typeof stageDistribution !== 'object') {
      throw new TypeError(`stageDistribution must be an object, got: ${typeof stageDistribution}`);
    }

    const samples: ReturnSample[] = [];

    // Normalize stage distribution
    const totalWeight = Object.values(stageDistribution).reduce(
      (sum, weight) => sum + (weight || 0),
      0
    );
    const normalizedDistribution: Partial<Record<InvestmentStage, number>> = {};
    for (const [stage, weight] of Object.entries(stageDistribution)) {
      if (weight !== undefined) {
        normalizedDistribution[stage as InvestmentStage] = weight / totalWeight;
      }
    }

    // Generate samples for each scenario
    for (let scenario = 0; scenario < scenarios; scenario++) {
      for (let investment = 0; investment < portfolioSize; investment++) {
        // Select stage based on distribution
        const stage = this.selectStageRandomly(normalizedDistribution);
        const sample = this.sampleReturn(stage);
        samples.push(sample);
      }
    }

    // Calculate statistics
    const multiples = samples.map((s) => s.multiple);
    const statistics = this.calculateStatistics(multiples);
    const percentiles = this.calculatePercentiles(multiples);

    return {
      samples,
      statistics,
      percentiles,
    };
  }

  /**
   * Generate single investment scenario for Monte Carlo engine integration
   * Replaces the normal distribution sampling in monte-carlo-engine.ts
   */
  generateInvestmentScenario(
    stage: InvestmentStage = 'seed',
    timeHorizonYears: number = 5
  ): {
    multiple: number;
    irr: number;
    category: string;
    exitTiming: number;
  } {
    const returnSample = this.sampleReturn(stage);

    // Calculate IRR from multiple without time decay
    // IRR = (ending_value / beginning_value)^(1/years) - 1
    const exitTiming = this.sampleExitTiming(stage, returnSample.category);
    const actualTimeHorizon = Math.min(exitTiming, timeHorizonYears);

    let irr: number;
    if (returnSample.multiple <= 0) {
      irr = -1.0; // Total loss
    } else {
      irr = Math.pow(returnSample.multiple, 1 / actualTimeHorizon) - 1;
    }

    return {
      multiple: returnSample.multiple,
      irr,
      category: returnSample.category,
      exitTiming,
    };
  }

  /**
   * Batch generate scenarios for performance (used by Monte Carlo engine)
   */
  generateBatchScenarios(
    count: number,
    stageDistribution: Partial<Record<InvestmentStage, number>> = { seed: 1.0 },
    timeHorizonYears: number = 5
  ): Array<{
    multiple: number;
    irr: number;
    category: string;
    exitTiming: number;
    stage: InvestmentStage;
  }> {
    const scenarios = [];

    // Normalize stage distribution
    const totalWeight = Object.values(stageDistribution).reduce(
      (sum, weight) => sum + (weight || 0),
      0
    );
    const normalizedDistribution: Partial<Record<InvestmentStage, number>> = {};
    for (const [stage, weight] of Object.entries(stageDistribution)) {
      if (weight !== undefined) {
        normalizedDistribution[stage as InvestmentStage] = weight / totalWeight;
      }
    }

    for (let i = 0; i < count; i++) {
      const stage = this.selectStageRandomly(normalizedDistribution);
      const scenario = this.generateInvestmentScenario(stage, timeHorizonYears);
      scenarios.push({
        ...scenario,
        stage,
      });
    }

    return scenarios;
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  /**
   * Initialize stage-specific return profiles based on Series A Chasm data
   */
  private initializeStageProfiles(): Map<InvestmentStage, StageReturnProfile> {
    const profiles = new Map<InvestmentStage, StageReturnProfile>();

    // Pre-Seed: Highest failure rate, limited upside data
    profiles.set('pre-seed', {
      stage: 'pre-seed',
      failureRate: 0.75,
      returnBands: {
        failure: { min: 0, max: 1, probability: 0.75 },
        modest: { min: 1, max: 3, probability: 0.15 },
        good: { min: 3, max: 10, probability: 0.07 },
        homeRun: { min: 10, max: 50, probability: 0.025 },
        unicorn: { min: 50, max: 200, probability: 0.005 },
      },
    });

    // Seed: Kauffman Foundation 68% updated to 70% failure rate
    profiles.set('seed', {
      stage: 'seed',
      failureRate: 0.7,
      returnBands: {
        failure: { min: 0, max: 1, probability: 0.7 },
        modest: { min: 1, max: 3, probability: 0.15 },
        good: { min: 3, max: 10, probability: 0.1 },
        homeRun: { min: 10, max: 50, probability: 0.04 },
        unicorn: { min: 50, max: 200, probability: 0.01 },
      },
    });

    // Series A: The "chasm" - lower failure rate but still significant
    profiles.set('series-a', {
      stage: 'series-a',
      failureRate: 0.5,
      returnBands: {
        failure: { min: 0, max: 1, probability: 0.5 },
        modest: { min: 1, max: 3, probability: 0.25 },
        good: { min: 3, max: 10, probability: 0.15 },
        homeRun: { min: 10, max: 50, probability: 0.08 },
        unicorn: { min: 50, max: 200, probability: 0.02 },
      },
    });

    // Series B: Improved outcomes for companies that made it this far
    profiles.set('series-b', {
      stage: 'series-b',
      failureRate: 0.35,
      returnBands: {
        failure: { min: 0, max: 1, probability: 0.35 },
        modest: { min: 1, max: 3, probability: 0.3 },
        good: { min: 3, max: 10, probability: 0.2 },
        homeRun: { min: 10, max: 50, probability: 0.12 },
        unicorn: { min: 50, max: 200, probability: 0.03 },
      },
    });

    // Series C+: Lower failure rate, higher multiples
    profiles.set('series-c+', {
      stage: 'series-c+',
      failureRate: 0.2,
      returnBands: {
        failure: { min: 0, max: 1, probability: 0.2 },
        modest: { min: 1, max: 3, probability: 0.35 },
        good: { min: 3, max: 10, probability: 0.25 },
        homeRun: { min: 10, max: 50, probability: 0.15 },
        unicorn: { min: 50, max: 200, probability: 0.05 },
      },
    });

    return profiles;
  }

  /**
   * Create seeded random number generator for reproducible results
   */
  private createRandomGenerator(seed?: number): () => number {
    if (seed === undefined) {
      return Math.random;
    }

    let state = seed;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  }

  /**
   * Sample from uniform distribution
   */
  private sampleUniform(min: number, max: number): number {
    return min + this.rng() * (max - min);
  }

  /**
   * Sample from power law distribution for tail returns
   */
  private samplePowerLaw(min: number, max: number): number {
    const alpha = this.config.alpha;
    const u = this.rng();

    // Inverse transform sampling for power law
    // F^(-1)(u) = min * (1 - u * (1 - (min/max)^(alpha-1)))^(-1/(alpha-1))
    if (alpha === 1) {
      // Special case: exponential distribution
      return min * Math.exp(u * Math.log(max / min));
    }

    const alphaMinus1 = alpha - 1;
    const ratio = Math.pow(min / max, alphaMinus1);
    const sample = min * Math.pow(1 - u * (1 - ratio), -1 / alphaMinus1);

    return Math.min(sample, max); // Ensure we don't exceed max
  }

  /**
   * Sample exit timing based on stage and outcome category
   */
  private sampleExitTiming(stage: InvestmentStage, category: string): number {
    // Different exit timings by stage and outcome
    const baseTimings: Record<InvestmentStage, number> = {
      'pre-seed': 6.5,
      seed: 5.5,
      'series-a': 4.5,
      'series-b': 3.5,
      'series-c': 2.7,
      'series-c+': 2.5,
    };

    const categoryMultipliers: Record<string, number> = {
      failure: 0.6, // Failures happen faster
      modest: 0.9, // Modest returns slightly faster
      good: 1.0, // Base timing
      homeRun: 1.2, // Home runs take longer
      unicorn: 1.4, // Unicorns take longest
    };

    const baseTiming = baseTimings[stage] || 5.0;
    const multiplier = categoryMultipliers[category] || 1.0;
    const adjustedTiming = baseTiming * multiplier;

    // Add some variance (±1 year)
    const variance = (this.rng() - 0.5) * 2; // -1 to +1
    return Math.max(1, adjustedTiming + variance);
  }

  /**
   * Select investment stage randomly based on distribution weights
   */
  private selectStageRandomly(
    distribution: Partial<Record<InvestmentStage, number>>
  ): InvestmentStage {
    const rand = this.rng();
    let cumulativeProb = 0;

    for (const [stage, probability] of Object.entries(distribution)) {
      if (probability !== undefined) {
        cumulativeProb += probability;
        if (rand <= cumulativeProb) {
          return stage as InvestmentStage;
        }
      }
    }

    // Fallback to seed if something goes wrong
    return 'seed';
  }

  /**
   * Calculate comprehensive statistics for return distribution
   */
  private calculateStatistics(values: number[]): {
    mean: number;
    median: number;
    standardDeviation: number;
    skewness: number;
    kurtosis: number;
    powerLawAlpha: number;
  } {
    const n = values.length;
    if (n === 0) {
      throw new Error('Cannot calculate statistics on empty array');
    }
    const sortedValues = [...values].sort((a, b) => a - b);

    // Basic statistics
    const mean = values.reduce((sum, val) => sum + val, 0) / n;
    const median =
      n % 2 === 0
        ? (sortedValues[n / 2 - 1]! + sortedValues[n / 2]!) / 2
        : sortedValues[Math.floor(n / 2)]!;

    // Variance and standard deviation
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / (n - 1);
    const standardDeviation = Math.sqrt(variance);

    // Skewness (third moment)
    const skewness =
      values.reduce((sum, val) => sum + Math.pow((val - mean) / standardDeviation, 3), 0) / n;

    // Kurtosis (fourth moment)
    const kurtosis =
      values.reduce((sum, val) => sum + Math.pow((val - mean) / standardDeviation, 4), 0) / n - 3;

    // Estimate power law alpha from tail data (values > 3x)
    const tailValues = values.filter((v) => v >= 3);
    let powerLawAlpha = 1.16; // Default
    if (tailValues.length > 10) {
      // Maximum likelihood estimator for power law
      const logSum = tailValues.reduce((sum, val) => sum + Math.log(val / 3), 0);
      powerLawAlpha = 1 + tailValues.length / logSum;
    }

    return {
      mean,
      median,
      standardDeviation,
      skewness,
      kurtosis,
      powerLawAlpha,
    };
  }

  /**
   * Calculate percentiles for return distribution
   */
  private calculatePercentiles(values: number[]): {
    p5: number;
    p25: number;
    p50: number;
    p75: number;
    p90: number;
    p95: number;
    p99: number;
  } {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;

    const getPercentile = (p: number): number => {
      const index = Math.floor((p / 100) * (n - 1));
      return sorted[index];
    };

    return {
      p5: getPercentile(5),
      p25: getPercentile(25),
      p50: getPercentile(50),
      p75: getPercentile(75),
      p90: getPercentile(90),
      p95: getPercentile(95),
      p99: getPercentile(99),
    };
  }
}

// ============================================================================
// UTILITY FUNCTIONS FOR MONTE CARLO ENGINE INTEGRATION
// ============================================================================

/**
 * Create power law distribution instance with default VC parameters
 */
export function createVCPowerLawDistribution(randomSeed?: number): PowerLawDistribution {
  return new PowerLawDistribution(
    {
      failureRate: 0.7, // 70% of investments return 0-1x
      modestReturnRate: 0.15, // 15% return 1-3x
      goodOutcomeRate: 0.1, // 10% return 3-10x
      homeRunRate: 0.04, // 4% return 10-50x
      unicornRate: 0.01, // 1% return 50x+ (capped at 200x)
      alpha: 1.16, // Realistic power law exponent for VC
      xMin: 3.0, // Power law starts at 3x
      maxReturn: 200.0, // Cap unicorns at 200x
    },
    randomSeed
  );
}

/**
 * Generate power law returns for Monte Carlo integration
 * Replaces normal distribution sampling in existing engine
 */
export function generatePowerLawReturns(
  portfolioSize: number,
  stageDistribution: Record<string, number>,
  timeHorizonYears: number = 5,
  scenarios: number = 10000,
  randomSeed?: number
): Array<{
  multiple: number;
  irr: number;
  category: string;
  exitTiming: number;
  stage: string;
}> {
  const powerLaw = createVCPowerLawDistribution(randomSeed);

  // Convert string keys to InvestmentStage type using typed normalizer (fail-closed)
  const stageMap: Partial<Record<InvestmentStage, number>> = {};
  const failedNormalizations: Array<{ original: string; weight: number }> = [];

  for (const [stage, weight] of Object.entries(stageDistribution)) {
    const result = normalizeInvestmentStage(stage);

    if (result.ok) {
      stageMap[result.value] = weight;
    } else {
      // Track unknown stages for observability
      failedNormalizations.push({ original: stage, weight });
      recordUnknownStage(stage, 'generatePowerLawReturns');
    }
  }

  // Fail-closed: error if all stages are unknown (no silent defaults)
  if (Object.keys(stageMap).length === 0) {
    const failedStages = failedNormalizations.map((f) => f.original).join(', ');

    // Emit failure metric
    emitMetric('mc_trials_failed_total', failedNormalizations.length, {
      reason: 'all_stages_unknown',
    });

    throw new Error(
      `No valid investment stages found in distribution. Invalid stages: ${failedStages}. ` +
        `Valid stages: pre-seed, seed, series-a, series-b, series-c, series-c+`
    );
  }

  // Emit success metric
  telemetry.mcTrialsTotal++;
  emitMetric('mc_trials_total', portfolioSize * scenarios, {
    stage_count: Object.keys(stageMap).length.toString(),
    unknown_count: failedNormalizations.length.toString(),
  });

  return powerLaw.generateBatchScenarios(portfolioSize * scenarios, stageMap, timeHorizonYears);
}

/**
 * Export for direct integration with existing Monte Carlo engine
 */
export { PowerLawDistribution as default };
