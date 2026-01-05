/**
 * Tests for StageMarkovSimulator - Markov chain for VC stage transitions
 * Critical invariants:
 * - Transition probabilities must sum to 1.0
 * - Same seed produces identical lifecycle paths
 * - Empirical transition rates match theoretical probabilities
 * - Terminal states (Exit, Failed) are absorbing
 */

import { describe, it, expect } from 'vitest';
import {
  StageMarkovSimulator,
  InvestmentStage,
  validateTransitionProbs,
  createStageSimulator,
  normalizeStage,
  DEFAULT_TRANSITION_MATRIX,
  type StageTransitionProbs,
  type MarkovTransitionMatrix,
} from '../../../shared/core/optimization/StageMarkovSimulator';
import { SeededRNG } from '../../../shared/core/optimization/SeededRNG';

describe('StageMarkovSimulator', () => {
  describe('Validation', () => {
    it('should accept probabilities that sum to 1.0', () => {
      const probs: StageTransitionProbs = {
        advance: 0.5,
        stagnate: 0.3,
        fail: 0.2,
      };

      expect(() => validateTransitionProbs(probs, 'TestStage')).not.toThrow();
    });

    it('should reject probabilities that do not sum to 1.0', () => {
      const probs: StageTransitionProbs = {
        advance: 0.5,
        stagnate: 0.3,
        fail: 0.3, // Sum = 1.1
      };

      expect(() => validateTransitionProbs(probs, 'TestStage')).toThrow(
        'TestStage transition probabilities must sum to 1.0'
      );
    });

    it('should reject negative probabilities', () => {
      const probs: StageTransitionProbs = {
        advance: 0.6,
        stagnate: 0.5,
        fail: -0.1, // Negative
      };

      expect(() => validateTransitionProbs(probs, 'TestStage')).toThrow(
        'TestStage transition probabilities must be non-negative'
      );
    });

    it('should accept small rounding errors (1e-6 tolerance)', () => {
      const probs: StageTransitionProbs = {
        advance: 0.333333,
        stagnate: 0.333333,
        fail: 0.333334, // Sum = 1.000000 (within epsilon)
      };

      expect(() => validateTransitionProbs(probs, 'TestStage')).not.toThrow();
    });

    it('should validate default transition matrix', () => {
      expect(() => {
        Object.entries(DEFAULT_TRANSITION_MATRIX).forEach(([stage, probs]) => {
          validateTransitionProbs(probs, stage);
        });
      }).not.toThrow();

      // Verify specific default values
      expect(DEFAULT_TRANSITION_MATRIX[InvestmentStage.Seed].fail).toBe(0.5);
      expect(DEFAULT_TRANSITION_MATRIX[InvestmentStage.SeriesA].advance).toBe(0.5);
      expect(DEFAULT_TRANSITION_MATRIX[InvestmentStage.Growth].advance).toBe(0.7);
    });
  });

  describe('Construction', () => {
    it('should create simulator with valid transition matrix', () => {
      const matrix: MarkovTransitionMatrix = {
        [InvestmentStage.Seed]: { advance: 0.4, stagnate: 0.1, fail: 0.5 },
        [InvestmentStage.SeriesA]: { advance: 0.5, stagnate: 0.2, fail: 0.3 },
        [InvestmentStage.SeriesB]: { advance: 0.6, stagnate: 0.2, fail: 0.2 },
        [InvestmentStage.SeriesC]: { advance: 0.65, stagnate: 0.2, fail: 0.15 },
        [InvestmentStage.Growth]: { advance: 0.7, stagnate: 0.2, fail: 0.1 },
      };

      const simulator = new StageMarkovSimulator(matrix);
      expect(simulator).toBeDefined();
      expect(simulator.getTransitionMatrix()).toEqual(matrix);
    });

    it('should throw on construction with invalid matrix', () => {
      const matrix: MarkovTransitionMatrix = {
        [InvestmentStage.Seed]: { advance: 0.5, stagnate: 0.5, fail: 0.5 }, // Sum = 1.5
        [InvestmentStage.SeriesA]: { advance: 0.5, stagnate: 0.2, fail: 0.3 },
        [InvestmentStage.SeriesB]: { advance: 0.6, stagnate: 0.2, fail: 0.2 },
        [InvestmentStage.SeriesC]: { advance: 0.65, stagnate: 0.2, fail: 0.15 },
        [InvestmentStage.Growth]: { advance: 0.7, stagnate: 0.2, fail: 0.1 },
      };

      expect(() => new StageMarkovSimulator(matrix)).toThrow();
    });

    it('should use factory function', () => {
      const simulator = createStageSimulator();
      expect(simulator.getTransitionMatrix()).toEqual(DEFAULT_TRANSITION_MATRIX);
    });
  });

  describe('simulateTransition()', () => {
    it('should keep terminal states unchanged', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(12345);

      expect(simulator.simulateTransition(InvestmentStage.Exit, rng)).toBe(InvestmentStage.Exit);
      expect(simulator.simulateTransition(InvestmentStage.Failed, rng)).toBe(
        InvestmentStage.Failed
      );
    });

    it('should produce deterministic transitions with same seed', () => {
      const simulator = createStageSimulator();

      const rng1 = new SeededRNG(999);
      const transitions1 = Array.from({ length: 100 }, () =>
        simulator.simulateTransition(InvestmentStage.Seed, rng1)
      );

      const rng2 = new SeededRNG(999);
      const transitions2 = Array.from({ length: 100 }, () =>
        simulator.simulateTransition(InvestmentStage.Seed, rng2)
      );

      expect(transitions1).toEqual(transitions2);
    });

    it('should produce all three transition outcomes (advance, stagnate, fail)', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(777);

      const outcomes = new Set<InvestmentStage>();
      for (let i = 0; i < 1000; i++) {
        const outcome = simulator.simulateTransition(InvestmentStage.Seed, rng);
        outcomes.add(outcome);
      }

      // Should see advance (SeriesA), stagnate (Seed), and fail (Failed)
      expect(outcomes.has(InvestmentStage.SeriesA)).toBe(true); // Advance
      expect(outcomes.has(InvestmentStage.Seed)).toBe(true); // Stagnate
      expect(outcomes.has(InvestmentStage.Failed)).toBe(true); // Fail
    });

    it('should advance through stage sequence correctly', () => {
      const simulator = createStageSimulator();

      // Run many transitions and verify that advance happens at expected rate
      const rng = new SeededRNG(12345);
      let advanceCount = 0;
      const numTrials = 1000;

      for (let i = 0; i < numTrials; i++) {
        const result = simulator.simulateTransition(InvestmentStage.Seed, rng);
        if (result === InvestmentStage.SeriesA) {
          advanceCount++;
        }
      }

      // With 40% advance probability, should see roughly 400 advances (±5%)
      const expectedAdvances = numTrials * 0.4;
      expect(Math.abs(advanceCount - expectedAdvances)).toBeLessThan(numTrials * 0.05);
    });
  });

  describe('simulateLifecycle()', () => {
    it('should start with initial stage', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(555);

      const lifecycle = simulator.simulateLifecycle(InvestmentStage.Seed, rng);

      expect(lifecycle[0]).toBe(InvestmentStage.Seed);
      expect(lifecycle.length).toBeGreaterThan(1); // Should have transitions
    });

    it('should end at terminal state (Exit or Failed)', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(666);

      const lifecycle = simulator.simulateLifecycle(InvestmentStage.Seed, rng);
      const finalStage = lifecycle[lifecycle.length - 1];

      expect([InvestmentStage.Exit, InvestmentStage.Failed]).toContain(finalStage);
    });

    it('should produce reproducible lifecycles with same seed', () => {
      const simulator = createStageSimulator();

      const rng1 = new SeededRNG(888);
      const lifecycle1 = simulator.simulateLifecycle(InvestmentStage.Seed, rng1);

      const rng2 = new SeededRNG(888);
      const lifecycle2 = simulator.simulateLifecycle(InvestmentStage.Seed, rng2);

      expect(lifecycle1).toEqual(lifecycle2);
    });

    it('should respect maxSteps limit', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(111);

      const maxSteps = 5;
      const lifecycle = simulator.simulateLifecycle(InvestmentStage.Seed, rng, maxSteps);

      // Length = initial stage + at most maxSteps transitions
      expect(lifecycle.length).toBeLessThanOrEqual(maxSteps + 1);
    });

    it('should show stage progression for successful path', () => {
      const simulator = createStageSimulator();

      // Run many simulations and verify that some succeed
      let successCount = 0;
      const numSimulations = 1000;
      const rng = new SeededRNG(111222);

      for (let i = 0; i < numSimulations; i++) {
        const lifecycle = simulator.simulateLifecycle(InvestmentStage.Seed, rng);

        if (lifecycle[lifecycle.length - 1] === InvestmentStage.Exit) {
          successCount++;
          // Verify some progression happened
          expect(lifecycle.length).toBeGreaterThan(2);
        }
      }

      // Should see at least some successful exits (theoretical probability ~8-15%)
      expect(successCount).toBeGreaterThan(0);
    });
  });

  describe('calculateExitProbability()', () => {
    it('should return 1.0 for Exit state', () => {
      const simulator = createStageSimulator();
      expect(simulator.calculateExitProbability(InvestmentStage.Exit)).toBe(1.0);
    });

    it('should return 0.0 for Failed state', () => {
      const simulator = createStageSimulator();
      expect(simulator.calculateExitProbability(InvestmentStage.Failed)).toBe(0.0);
    });

    it('should return probabilities in (0, 1) for intermediate stages', () => {
      const simulator = createStageSimulator();

      const seedProb = simulator.calculateExitProbability(InvestmentStage.Seed);
      const seriesAProb = simulator.calculateExitProbability(InvestmentStage.SeriesA);
      const growthProb = simulator.calculateExitProbability(InvestmentStage.Growth);

      expect(seedProb).toBeGreaterThan(0);
      expect(seedProb).toBeLessThan(1);

      expect(seriesAProb).toBeGreaterThan(0);
      expect(seriesAProb).toBeLessThan(1);

      expect(growthProb).toBeGreaterThan(0);
      expect(growthProb).toBeLessThan(1);
    });

    it('should show increasing exit probability in later stages', () => {
      const simulator = createStageSimulator();

      const seedProb = simulator.calculateExitProbability(InvestmentStage.Seed);
      const seriesAProb = simulator.calculateExitProbability(InvestmentStage.SeriesA);
      const seriesBProb = simulator.calculateExitProbability(InvestmentStage.SeriesB);
      const seriesCProb = simulator.calculateExitProbability(InvestmentStage.SeriesC);
      const growthProb = simulator.calculateExitProbability(InvestmentStage.Growth);

      // Later stages have higher exit probability
      expect(seriesAProb).toBeGreaterThan(seedProb);
      expect(seriesBProb).toBeGreaterThan(seriesAProb);
      expect(seriesCProb).toBeGreaterThan(seriesBProb);
      expect(growthProb).toBeGreaterThan(seriesCProb);
    });

    it('should match empirical exit rates approximately', () => {
      const simulator = createStageSimulator();

      // Run many simulations to get empirical exit rate
      const rng = new SeededRNG(12345);
      const numSimulations = 10000;
      let exitCount = 0;

      for (let i = 0; i < numSimulations; i++) {
        const lifecycle = simulator.simulateLifecycle(InvestmentStage.Seed, rng);
        if (lifecycle[lifecycle.length - 1] === InvestmentStage.Exit) {
          exitCount++;
        }
      }

      const empiricalExitProb = exitCount / numSimulations;
      const theoreticalExitProb = simulator.calculateExitProbability(InvestmentStage.Seed);

      // Should match within 5% (sampling error)
      expect(Math.abs(empiricalExitProb - theoreticalExitProb)).toBeLessThan(0.05);
    });
  });

  describe('calculateExpectedTimeToAbsorption()', () => {
    it('should return 0 for terminal states', () => {
      const simulator = createStageSimulator();

      expect(simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Exit)).toBe(0);
      expect(simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Failed)).toBe(0);
    });

    it('should return positive values for non-terminal stages', () => {
      const simulator = createStageSimulator();

      const seedTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Seed);
      const seriesATime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.SeriesA);
      const growthTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Growth);

      expect(seedTime).toBeGreaterThan(0);
      expect(seriesATime).toBeGreaterThan(0);
      expect(growthTime).toBeGreaterThan(0);
    });

    it('should show decreasing time in later stages', () => {
      const simulator = createStageSimulator();

      const seedTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Seed);
      const seriesATime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.SeriesA);
      const seriesBTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.SeriesB);
      const seriesCTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.SeriesC);
      const growthTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Growth);

      // Later stages generally have shorter expected time to absorption
      // Note: Series A may be higher than Seed due to stagnation probability
      expect(seriesBTime).toBeLessThan(seriesATime);
      expect(seriesCTime).toBeLessThan(seriesBTime);
      expect(growthTime).toBeLessThan(seriesCTime);

      // All should be positive
      expect(seedTime).toBeGreaterThan(0);
      expect(seriesATime).toBeGreaterThan(0);
    });

    it('should match empirical average lifecycle length', () => {
      const simulator = createStageSimulator();

      // Run many simulations to get empirical average
      const rng = new SeededRNG(99999);
      const numSimulations = 5000;
      let totalSteps = 0;

      for (let i = 0; i < numSimulations; i++) {
        const lifecycle = simulator.simulateLifecycle(InvestmentStage.Seed, rng);
        totalSteps += lifecycle.length - 1; // Subtract 1 to get transition count
      }

      const empiricalAvgTime = totalSteps / numSimulations;
      const theoreticalAvgTime = simulator.calculateExpectedTimeToAbsorption(InvestmentStage.Seed);

      // Should match within 20% (sampling error and maxSteps truncation)
      const relativeError = Math.abs(empiricalAvgTime - theoreticalAvgTime) / theoreticalAvgTime;
      expect(relativeError).toBeLessThan(0.2);
    });
  });

  describe('normalizeStage()', () => {
    it('should parse seed stage variations', () => {
      expect(normalizeStage('seed')).toBe(InvestmentStage.Seed);
      expect(normalizeStage('Seed')).toBe(InvestmentStage.Seed);
      expect(normalizeStage('SEED')).toBe(InvestmentStage.Seed);
    });

    it('should parse series stages', () => {
      expect(normalizeStage('series-a')).toBe(InvestmentStage.SeriesA);
      expect(normalizeStage('Series A')).toBe(InvestmentStage.SeriesA);
      expect(normalizeStage('a')).toBe(InvestmentStage.SeriesA);

      expect(normalizeStage('series-b')).toBe(InvestmentStage.SeriesB);
      expect(normalizeStage('Series B')).toBe(InvestmentStage.SeriesB);
      expect(normalizeStage('b')).toBe(InvestmentStage.SeriesB);

      expect(normalizeStage('series-c')).toBe(InvestmentStage.SeriesC);
      expect(normalizeStage('Series C')).toBe(InvestmentStage.SeriesC);
      expect(normalizeStage('c')).toBe(InvestmentStage.SeriesC);
    });

    it('should parse growth stage', () => {
      expect(normalizeStage('growth')).toBe(InvestmentStage.Growth);
      expect(normalizeStage('Growth')).toBe(InvestmentStage.Growth);
      expect(normalizeStage('GROWTH')).toBe(InvestmentStage.Growth);
    });

    it('should parse exit stage', () => {
      expect(normalizeStage('exit')).toBe(InvestmentStage.Exit);
      expect(normalizeStage('Exit')).toBe(InvestmentStage.Exit);
      expect(normalizeStage('ipo')).toBe(InvestmentStage.Exit);
      expect(normalizeStage('IPO')).toBe(InvestmentStage.Exit);
    });

    it('should parse failed stage', () => {
      expect(normalizeStage('failed')).toBe(InvestmentStage.Failed);
      expect(normalizeStage('Failed')).toBe(InvestmentStage.Failed);
      expect(normalizeStage('fail')).toBe(InvestmentStage.Failed);
    });

    it('should handle various separators', () => {
      expect(normalizeStage('series_a')).toBe(InvestmentStage.SeriesA);
      expect(normalizeStage('series a')).toBe(InvestmentStage.SeriesA);
      expect(normalizeStage('series-a')).toBe(InvestmentStage.SeriesA);
    });

    it('should throw on invalid stage', () => {
      expect(() => normalizeStage('invalid')).toThrow('Cannot normalize stage: invalid');
      expect(() => normalizeStage('series-d')).toThrow('Cannot normalize stage: series-d');
    });
  });

  describe('Empirical Transition Rates - Design Validation', () => {
    it('should match theoretical transition probabilities empirically', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(777777);

      const numTrials = 10000;
      const outcomes: Record<string, number> = {
        advance: 0,
        stagnate: 0,
        fail: 0,
      };

      for (let i = 0; i < numTrials; i++) {
        const result = simulator.simulateTransition(InvestmentStage.Seed, rng);

        if (result === InvestmentStage.Failed) {
          outcomes.fail++;
        } else if (result === InvestmentStage.Seed) {
          outcomes.stagnate++;
        } else if (result === InvestmentStage.SeriesA) {
          outcomes.advance++;
        }
      }

      const empiricalProbs = {
        advance: outcomes.advance / numTrials,
        stagnate: outcomes.stagnate / numTrials,
        fail: outcomes.fail / numTrials,
      };

      const theoreticalProbs = DEFAULT_TRANSITION_MATRIX[InvestmentStage.Seed];

      // Should match within 2% (sampling error)
      expect(Math.abs(empiricalProbs.advance - theoreticalProbs.advance)).toBeLessThan(0.02);
      expect(Math.abs(empiricalProbs.stagnate - theoreticalProbs.stagnate)).toBeLessThan(0.02);
      expect(Math.abs(empiricalProbs.fail - theoreticalProbs.fail)).toBeLessThan(0.02);
    });
  });

  describe('Performance', () => {
    it('should simulate 10k lifecycles quickly', () => {
      const simulator = createStageSimulator();
      const rng = new SeededRNG(12345);

      const start = Date.now();
      for (let i = 0; i < 10000; i++) {
        simulator.simulateLifecycle(InvestmentStage.Seed, rng);
      }
      const elapsed = Date.now() - start;

      // Should complete in < 500ms
      expect(elapsed).toBeLessThan(500);
    });
  });
});
