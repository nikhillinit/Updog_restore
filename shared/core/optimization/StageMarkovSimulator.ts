/**
 * Stage-by-Stage Markov Simulator for VC Investment Progression
 *
 * Models realistic investment stage transitions: Seed → Series A → Series B → Series C
 * Each stage has transition probabilities for:
 * - Success (advance to next stage)
 * - Failure (company dies)
 * - Stagnation (stays at current stage)
 *
 * Design rationale:
 * - VC returns are path-dependent: Early-stage failures are common, late-stage failures rare
 * - Stage progression affects MOIC: Seed→IPO has different distribution than A→IPO
 * - Calibration uses subsequent investments as signal (avoids censoring bias)
 *
 * References:
 * - Korteweg & Sorensen (2010): Stage-specific failure rates
 * - Gompers et al. (2020): "How Do Venture Capitalists Make Decisions?"
 */

import type { SeededRNG } from './SeededRNG';

/**
 * Investment stages in typical VC lifecycle
 */
export enum InvestmentStage {
  Seed = 'seed',
  SeriesA = 'series-a',
  SeriesB = 'series-b',
  SeriesC = 'series-c',
  Growth = 'growth',
  Exit = 'exit', // IPO or acquisition
  Failed = 'failed',
}

/**
 * Transition probabilities from a given stage
 */
export interface StageTransitionProbs {
  /** Probability of advancing to next stage */
  advance: number;
  /** Probability of staying at current stage */
  stagnate: number;
  /** Probability of failure (company dies) */
  fail: number;
}

/**
 * Complete Markov transition matrix for all stages
 */
export interface MarkovTransitionMatrix {
  [InvestmentStage.Seed]: StageTransitionProbs;
  [InvestmentStage.SeriesA]: StageTransitionProbs;
  [InvestmentStage.SeriesB]: StageTransitionProbs;
  [InvestmentStage.SeriesC]: StageTransitionProbs;
  [InvestmentStage.Growth]: StageTransitionProbs;
}

/**
 * Validate transition probabilities sum to 1.0
 */
export function validateTransitionProbs(probs: StageTransitionProbs, stageName: string): void {
  const sum = probs.advance + probs.stagnate + probs.fail;
  const epsilon = 1e-6;

  if (Math.abs(sum - 1.0) > epsilon) {
    throw new Error(
      `${stageName} transition probabilities must sum to 1.0, got ${sum.toFixed(6)} ` +
        `(advance: ${probs.advance}, stagnate: ${probs.stagnate}, fail: ${probs.fail})`
    );
  }

  if (probs.advance < 0 || probs.stagnate < 0 || probs.fail < 0) {
    throw new Error(`${stageName} transition probabilities must be non-negative`);
  }
}

/**
 * Default Markov transition matrix based on VC industry empirics
 *
 * Source: Korteweg & Sorensen (2010) + CB Insights data (2015-2023)
 *
 * Key insights:
 * - Seed: 50% fail, 40% advance to A, 10% stagnate
 * - Series A: 30% fail, 50% advance to B, 20% stagnate
 * - Series B: 20% fail, 60% advance to C, 20% stagnate
 * - Series C: 15% fail, 65% advance to Growth, 20% stagnate
 * - Growth: 10% fail, 70% exit, 20% stagnate
 *
 * Failure rates decline as companies de-risk through subsequent rounds
 */
export const DEFAULT_TRANSITION_MATRIX: MarkovTransitionMatrix = {
  [InvestmentStage.Seed]: {
    advance: 0.4, // Seed → A
    stagnate: 0.1,
    fail: 0.5,
  },
  [InvestmentStage.SeriesA]: {
    advance: 0.5, // A → B
    stagnate: 0.2,
    fail: 0.3,
  },
  [InvestmentStage.SeriesB]: {
    advance: 0.6, // B → C
    stagnate: 0.2,
    fail: 0.2,
  },
  [InvestmentStage.SeriesC]: {
    advance: 0.65, // C → Growth
    stagnate: 0.2,
    fail: 0.15,
  },
  [InvestmentStage.Growth]: {
    advance: 0.7, // Growth → Exit
    stagnate: 0.2,
    fail: 0.1,
  },
};

/**
 * Stage progression sequence (defines next stage for "advance")
 */
const STAGE_PROGRESSION: Record<InvestmentStage, InvestmentStage | null> = {
  [InvestmentStage.Seed]: InvestmentStage.SeriesA,
  [InvestmentStage.SeriesA]: InvestmentStage.SeriesB,
  [InvestmentStage.SeriesB]: InvestmentStage.SeriesC,
  [InvestmentStage.SeriesC]: InvestmentStage.Growth,
  [InvestmentStage.Growth]: InvestmentStage.Exit,
  [InvestmentStage.Exit]: null, // Terminal state
  [InvestmentStage.Failed]: null, // Terminal state
};

/**
 * Simulate investment stage progression using Markov chain
 */
export class StageMarkovSimulator {
  private transitionMatrix: MarkovTransitionMatrix;

  constructor(transitionMatrix: MarkovTransitionMatrix = DEFAULT_TRANSITION_MATRIX) {
    // Validate all transition probabilities
    (Object.entries(transitionMatrix) as [string, StageTransitionProbs][]).forEach(
      ([stage, probs]) => {
        validateTransitionProbs(probs, stage);
      }
    );

    this.transitionMatrix = transitionMatrix;
  }

  /**
   * Simulate single stage transition
   *
   * @param currentStage - Current investment stage
   * @param rng - Seeded RNG for reproducibility
   * @returns Next stage after transition
   */
  simulateTransition(currentStage: InvestmentStage, rng: SeededRNG): InvestmentStage {
    // Terminal states don't transition
    if (currentStage === InvestmentStage.Exit || currentStage === InvestmentStage.Failed) {
      return currentStage;
    }

    const probs = this.transitionMatrix[currentStage];
    if (!probs) {
      throw new Error(`No transition probabilities defined for stage: ${currentStage}`);
    }

    // Sample transition outcome
    const roll = rng.next();

    if (roll < probs.fail) {
      return InvestmentStage.Failed;
    } else if (roll < probs.fail + probs.stagnate) {
      return currentStage; // Stagnate
    } else {
      // Advance to next stage
      const nextStage = STAGE_PROGRESSION[currentStage];
      if (nextStage === null) {
        throw new Error(`Cannot advance from terminal stage: ${currentStage}`);
      }
      return nextStage;
    }
  }

  /**
   * Simulate full investment lifecycle from initial stage to terminal state
   *
   * @param initialStage - Starting investment stage
   * @param maxSteps - Maximum simulation steps (prevents infinite loops)
   * @param rng - Seeded RNG for reproducibility
   * @returns Array of stages traversed (including initial and final)
   */
  simulateLifecycle(
    initialStage: InvestmentStage,
    rng: SeededRNG,
    maxSteps = 20
  ): InvestmentStage[] {
    const stages: InvestmentStage[] = [initialStage];
    let currentStage = initialStage;
    let steps = 0;

    while (
      currentStage !== InvestmentStage.Exit &&
      currentStage !== InvestmentStage.Failed &&
      steps < maxSteps
    ) {
      currentStage = this.simulateTransition(currentStage, rng);
      stages.push(currentStage);
      steps++;
    }

    return stages;
  }

  /**
   * Calculate probability of reaching exit from given stage
   * Uses recursive probability calculation through transition matrix
   *
   * @param fromStage - Starting stage
   * @param maxDepth - Maximum recursion depth (prevents infinite loops)
   * @returns Probability of eventual exit (0 to 1)
   */
  calculateExitProbability(fromStage: InvestmentStage, maxDepth = 10): number {
    // Base cases
    if (fromStage === InvestmentStage.Exit) return 1.0;
    if (fromStage === InvestmentStage.Failed) return 0.0;
    if (maxDepth === 0) return 0.0; // Depth limit reached

    const probs = this.transitionMatrix[fromStage];
    if (!probs) return 0.0;

    const nextStage = STAGE_PROGRESSION[fromStage];
    if (nextStage === null) return 0.0;

    // P(exit | fromStage) = P(advance) * P(exit | nextStage) + P(stagnate) * P(exit | fromStage)
    // Solving for P(exit | fromStage):
    // P(exit) = [P(advance) * P(exit | next)] / [1 - P(stagnate)]

    const exitProbFromNext = this.calculateExitProbability(nextStage, maxDepth - 1);
    const exitProb = (probs.advance * exitProbFromNext) / (1 - probs.stagnate);

    return Math.min(exitProb, 1.0); // Clamp to [0, 1]
  }

  /**
   * Calculate expected number of periods to exit or failure
   *
   * @param fromStage - Starting stage
   * @returns Expected time to absorption (exit or failure)
   */
  calculateExpectedTimeToAbsorption(fromStage: InvestmentStage): number {
    // Terminal states
    if (fromStage === InvestmentStage.Exit || fromStage === InvestmentStage.Failed) {
      return 0;
    }

    const probs = this.transitionMatrix[fromStage];
    if (!probs) return Infinity;

    // Expected time = 1 + P(stagnate) * E[time | same stage] + P(advance) * E[time | next stage]
    // E[time] = [1 + P(advance) * E[time | next]] / [1 - P(stagnate)]

    const nextStage = STAGE_PROGRESSION[fromStage];
    if (nextStage === null) return Infinity;

    const nextTime = this.calculateExpectedTimeToAbsorption(nextStage);
    const expectedTime = (1 + probs.advance * nextTime) / (1 - probs.stagnate);

    return expectedTime;
  }

  /**
   * Get transition matrix (for diagnostics/logging)
   */
  getTransitionMatrix(): Readonly<MarkovTransitionMatrix> {
    return Object.freeze({ ...this.transitionMatrix }) as MarkovTransitionMatrix;
  }
}

/**
 * Create stage simulator with validation
 */
export function createStageSimulator(
  transitionMatrix: MarkovTransitionMatrix = DEFAULT_TRANSITION_MATRIX
): StageMarkovSimulator {
  return new StageMarkovSimulator(transitionMatrix);
}

/**
 * Map string stage names to enum (handles common variations)
 */
export function normalizeStage(stage: string): InvestmentStage {
  const normalized = stage.toLowerCase().replace(/[_\s-]/g, '');

  if (normalized.includes('seed')) return InvestmentStage.Seed;
  if (normalized.includes('seriesa') || normalized === 'a') return InvestmentStage.SeriesA;
  if (normalized.includes('seriesb') || normalized === 'b') return InvestmentStage.SeriesB;
  if (normalized.includes('seriesc') || normalized === 'c') return InvestmentStage.SeriesC;
  if (normalized.includes('growth')) return InvestmentStage.Growth;
  if (normalized.includes('exit') || normalized.includes('ipo')) return InvestmentStage.Exit;
  if (normalized.includes('fail')) return InvestmentStage.Failed;

  throw new Error(`Cannot normalize stage: ${stage}`);
}
