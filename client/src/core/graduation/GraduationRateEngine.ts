/**
 * GraduationRateEngine
 *
 * Implements stage transition modeling for VC portfolio companies.
 * Supports two modes:
 * - Expectation Mode (deterministic): Uses expected values only, testable
 * - Stochastic Mode (seeded): Monte Carlo sampling with reproducible results
 *
 * Phase 2 Phoenix: Wraps Phase 1 deterministic core, never modifies it.
 */

import { PRNG } from '@shared/utils/prng';
import type { FundDataForReserves } from '../reserves/computeReservesFromGraduation';

// Stage definitions
export type Stage = 'seed' | 'series_a' | 'series_b' | 'series_c' | 'exit' | 'failed';

export interface TransitionProbabilities {
  graduate: number; // 0-100, probability of advancing to next stage
  fail: number;     // 0-100, probability of failure
  remain: number;   // 0-100, probability of staying at current stage
}

export interface GraduationConfig {
  /** If true, uses expected values only (deterministic). If false, samples. */
  expectationMode: boolean;
  /** Seed for reproducible stochastic runs. Required when expectationMode=false */
  seed?: number;
  /** Graduation probabilities per stage transition */
  transitions: {
    seedToA: TransitionProbabilities;
    aToB: TransitionProbabilities;
    bToC: TransitionProbabilities;
    cToExit: TransitionProbabilities;
  };
}

export interface TransitionResult {
  fromStage: Stage;
  toStage: Stage;
  probability: number;
  isExpectedPath: boolean;
}

export interface CohortProjection {
  quarter: number;
  stageDistribution: Record<Stage, number>;
  expectedGraduates: number;
  expectedFailures: number;
}

export interface GraduationSummary {
  mode: 'expectation' | 'stochastic';
  seed?: number;
  totalCompanies: number;
  expectedGraduationRate: number;
  expectedFailureRate: number;
  stageDistribution: Record<Stage, number>;
  quarterlyProjections: CohortProjection[];
}

/**
 * GraduationRateEngine
 *
 * Core engine for modeling company stage transitions through the VC pipeline.
 */
export class GraduationRateEngine {
  private config: GraduationConfig;
  private prng: PRNG | null = null;

  constructor(config: GraduationConfig) {
    this.config = config;

    // Validate configuration
    this.validateConfig();

    // Initialize PRNG for stochastic mode
    if (!config.expectationMode) {
      if (config.seed === undefined) {
        throw new Error('Seed is required for stochastic mode');
      }
      this.prng = new PRNG(config.seed);
    }
  }

  private validateConfig(): void {
    const transitions = ['seedToA', 'aToB', 'bToC', 'cToExit'] as const;

    for (const key of transitions) {
      const t = this.config.transitions[key];
      const sum = t.graduate + t.fail + t.remain;
      if (Math.abs(sum - 100) > 0.01) {
        throw new Error(`${key} probabilities must sum to 100% (got ${sum}%)`);
      }
    }
  }

  /**
   * Calculate expected transition for a company at a given stage.
   * In expectation mode, returns weighted average outcome.
   * In stochastic mode, samples from the distribution.
   */
  calculateTransition(currentStage: Stage): TransitionResult {
    if (currentStage === 'exit' || currentStage === 'failed') {
      // Terminal states - no transition
      return {
        fromStage: currentStage,
        toStage: currentStage,
        probability: 1.0,
        isExpectedPath: true,
      };
    }

    const transitionKey = this.getTransitionKey(currentStage);
    if (!transitionKey) {
      throw new Error(`Unknown stage: ${currentStage}`);
    }

    const probs = this.config.transitions[transitionKey];

    if (this.config.expectationMode) {
      return this.calculateExpectedTransition(currentStage, probs);
    } else {
      return this.sampleTransition(currentStage, probs);
    }
  }

  /**
   * Expectation Mode: Returns the most likely outcome with its probability.
   * This is deterministic and testable.
   */
  private calculateExpectedTransition(
    currentStage: Stage,
    probs: TransitionProbabilities
  ): TransitionResult {
    const nextStage = this.getNextStage(currentStage);

    // In expectation mode, we report the graduation probability
    // The "expected" path is graduation if probability > 50%
    const graduateProb = probs.graduate / 100;
    const failProb = probs.fail / 100;

    if (graduateProb >= failProb && graduateProb >= probs.remain / 100) {
      return {
        fromStage: currentStage,
        toStage: nextStage,
        probability: graduateProb,
        isExpectedPath: true,
      };
    } else if (failProb > graduateProb && failProb > probs.remain / 100) {
      return {
        fromStage: currentStage,
        toStage: 'failed',
        probability: failProb,
        isExpectedPath: false,
      };
    } else {
      return {
        fromStage: currentStage,
        toStage: currentStage, // remain
        probability: probs.remain / 100,
        isExpectedPath: false,
      };
    }
  }

  /**
   * Stochastic Mode: Samples from the transition distribution using seeded PRNG.
   * Reproducible given the same seed.
   */
  private sampleTransition(
    currentStage: Stage,
    probs: TransitionProbabilities
  ): TransitionResult {
    if (!this.prng) {
      throw new Error('PRNG not initialized - stochastic mode requires seed');
    }

    const roll = this.prng.next() * 100; // 0-100
    const nextStage = this.getNextStage(currentStage);

    if (roll < probs.graduate) {
      return {
        fromStage: currentStage,
        toStage: nextStage,
        probability: probs.graduate / 100,
        isExpectedPath: true,
      };
    } else if (roll < probs.graduate + probs.fail) {
      return {
        fromStage: currentStage,
        toStage: 'failed',
        probability: probs.fail / 100,
        isExpectedPath: false,
      };
    } else {
      return {
        fromStage: currentStage,
        toStage: currentStage, // remain
        probability: probs.remain / 100,
        isExpectedPath: false,
      };
    }
  }

  /**
   * Project a cohort of companies through the graduation pipeline.
   * In expectation mode, uses expected values for fractional companies.
   * In stochastic mode, simulates individual companies.
   */
  projectCohort(
    initialCompanies: number,
    horizonQuarters: number
  ): CohortProjection[] {
    const projections: CohortProjection[] = [];

    if (this.config.expectationMode) {
      return this.projectCohortExpectation(initialCompanies, horizonQuarters);
    } else {
      return this.projectCohortStochastic(initialCompanies, horizonQuarters);
    }
  }

  /**
   * Expectation Mode projection: Uses fractional companies based on probabilities.
   */
  private projectCohortExpectation(
    initialCompanies: number,
    horizonQuarters: number
  ): CohortProjection[] {
    const projections: CohortProjection[] = [];

    // Track fractional companies at each stage
    const distribution: Record<Stage, number> = {
      seed: initialCompanies,
      series_a: 0,
      series_b: 0,
      series_c: 0,
      exit: 0,
      failed: 0,
    };

    for (let q = 0; q < horizonQuarters; q++) {
      // Calculate transitions for each stage
      const newDistribution = { ...distribution };

      // Seed -> Series A
      const seedGrads = distribution.seed * (this.config.transitions.seedToA.graduate / 100);
      const seedFails = distribution.seed * (this.config.transitions.seedToA.fail / 100);
      newDistribution.seed -= seedGrads + seedFails;
      newDistribution.series_a += seedGrads;
      newDistribution.failed += seedFails;

      // Series A -> Series B
      const aGrads = distribution.series_a * (this.config.transitions.aToB.graduate / 100);
      const aFails = distribution.series_a * (this.config.transitions.aToB.fail / 100);
      newDistribution.series_a -= aGrads + aFails;
      newDistribution.series_b += aGrads;
      newDistribution.failed += aFails;

      // Series B -> Series C
      const bGrads = distribution.series_b * (this.config.transitions.bToC.graduate / 100);
      const bFails = distribution.series_b * (this.config.transitions.bToC.fail / 100);
      newDistribution.series_b -= bGrads + bFails;
      newDistribution.series_c += bGrads;
      newDistribution.failed += bFails;

      // Series C -> Exit
      const cGrads = distribution.series_c * (this.config.transitions.cToExit.graduate / 100);
      const cFails = distribution.series_c * (this.config.transitions.cToExit.fail / 100);
      newDistribution.series_c -= cGrads + cFails;
      newDistribution.exit += cGrads;
      newDistribution.failed += cFails;

      // Update distribution
      Object.assign(distribution, newDistribution);

      projections.push({
        quarter: q + 1,
        stageDistribution: { ...distribution },
        expectedGraduates: seedGrads + aGrads + bGrads + cGrads,
        expectedFailures: seedFails + aFails + bFails + cFails,
      });
    }

    return projections;
  }

  /**
   * Stochastic Mode projection: Simulates individual company paths.
   */
  private projectCohortStochastic(
    initialCompanies: number,
    horizonQuarters: number
  ): CohortProjection[] {
    const projections: CohortProjection[] = [];

    // Track each company's stage
    const companyStages: Stage[] = Array(initialCompanies).fill('seed');

    for (let q = 0; q < horizonQuarters; q++) {
      let graduates = 0;
      let failures = 0;

      for (let i = 0; i < companyStages.length; i++) {
        const currentStage = companyStages[i];
        if (!currentStage || currentStage === 'exit' || currentStage === 'failed') {
          continue; // Terminal state or undefined
        }

        const transition = this.calculateTransition(currentStage);
        companyStages[i] = transition.toStage;

        if (transition.toStage !== currentStage) {
          if (transition.toStage === 'failed') {
            failures++;
          } else if (transition.toStage !== currentStage) {
            graduates++;
          }
        }
      }

      // Count distribution
      const distribution: Record<Stage, number> = {
        seed: 0,
        series_a: 0,
        series_b: 0,
        series_c: 0,
        exit: 0,
        failed: 0,
      };

      for (const stage of companyStages) {
        distribution[stage]++;
      }

      projections.push({
        quarter: q + 1,
        stageDistribution: distribution,
        expectedGraduates: graduates,
        expectedFailures: failures,
      });
    }

    return projections;
  }

  /**
   * Generate summary statistics for the graduation engine.
   */
  getSummary(initialCompanies: number, horizonQuarters: number): GraduationSummary {
    const projections = this.projectCohort(initialCompanies, horizonQuarters);
    const finalProjection = projections[projections.length - 1];

    const total = initialCompanies;
    const exits = finalProjection?.stageDistribution.exit ?? 0;
    const failures = finalProjection?.stageDistribution.failed ?? 0;

    const summary: GraduationSummary = {
      mode: this.config.expectationMode ? 'expectation' : 'stochastic',
      totalCompanies: initialCompanies,
      expectedGraduationRate: total > 0 ? exits / total : 0,
      expectedFailureRate: total > 0 ? failures / total : 0,
      stageDistribution: finalProjection?.stageDistribution ?? {
        seed: 0,
        series_a: 0,
        series_b: 0,
        series_c: 0,
        exit: 0,
        failed: 0,
      },
      quarterlyProjections: projections,
    };

    // Only add seed for stochastic mode
    if (this.config.seed !== undefined) {
      summary.seed = this.config.seed;
    }

    return summary;
  }

  /**
   * Reset PRNG for reproducible runs (stochastic mode only).
   */
  resetSeed(seed: number): void {
    if (this.config.expectationMode) {
      throw new Error('Cannot reset seed in expectation mode');
    }
    this.prng = new PRNG(seed);
    this.config.seed = seed;
  }

  // Helper methods

  private getTransitionKey(
    stage: Stage
  ): 'seedToA' | 'aToB' | 'bToC' | 'cToExit' | null {
    switch (stage) {
      case 'seed':
        return 'seedToA';
      case 'series_a':
        return 'aToB';
      case 'series_b':
        return 'bToC';
      case 'series_c':
        return 'cToExit';
      default:
        return null;
    }
  }

  private getNextStage(stage: Stage): Stage {
    switch (stage) {
      case 'seed':
        return 'series_a';
      case 'series_a':
        return 'series_b';
      case 'series_b':
        return 'series_c';
      case 'series_c':
        return 'exit';
      default:
        return stage;
    }
  }
}

/**
 * Create a default graduation config based on industry averages.
 */
export function createDefaultGraduationConfig(
  expectationMode: boolean = true,
  seed: number = 42
): GraduationConfig {
  const config: GraduationConfig = {
    expectationMode,
    transitions: {
      seedToA: { graduate: 35, fail: 45, remain: 20 },
      aToB: { graduate: 45, fail: 35, remain: 20 },
      bToC: { graduate: 55, fail: 25, remain: 20 },
      cToExit: { graduate: 65, fail: 15, remain: 20 },
    },
  };

  // Only add seed for stochastic mode
  if (!expectationMode) {
    config.seed = seed;
  }

  return config;
}

/**
 * Convert FundDataForReserves graduation rates to GraduationConfig.
 * Bridges existing Phase 1 data structures to Phase 2 engine.
 */
export function fromFundDataGraduationRates(
  graduationRates: FundDataForReserves['graduationRates'],
  expectationMode: boolean = true,
  seed: number = 42
): GraduationConfig {
  const config: GraduationConfig = {
    expectationMode,
    transitions: {
      seedToA: {
        graduate: graduationRates.seedToA.graduate,
        fail: graduationRates.seedToA.fail,
        remain: graduationRates.seedToA.remain,
      },
      aToB: {
        graduate: graduationRates.aToB.graduate,
        fail: graduationRates.aToB.fail,
        remain: graduationRates.aToB.remain,
      },
      bToC: {
        graduate: graduationRates.bToC.graduate,
        fail: graduationRates.bToC.fail,
        remain: graduationRates.bToC.remain,
      },
      // Default C to Exit - not in original FundDataForReserves
      cToExit: { graduate: 65, fail: 15, remain: 20 },
    },
  };

  // Only add seed for stochastic mode
  if (!expectationMode) {
    config.seed = seed;
  }

  return config;
}
