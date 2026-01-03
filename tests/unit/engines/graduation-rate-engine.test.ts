/**
 * GraduationRateEngine Tests
 *
 * Validates:
 * 1. Expectation Mode determinism
 * 2. Stochastic Mode reproducibility (same seed = same results)
 * 3. Expectation alignment (Monte Carlo mean ~ Expectation Mode)
 * 4. Distribution sanity (no impossible outcomes)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  GraduationRateEngine,
  createDefaultGraduationConfig,
  type GraduationConfig,
  type Stage,
} from '@/core/graduation/GraduationRateEngine';

describe('GraduationRateEngine', () => {
  describe('Configuration Validation', () => {
    it('rejects probabilities that do not sum to 100%', () => {
      const config: GraduationConfig = {
        expectationMode: true,
        transitions: {
          seedToA: { graduate: 30, fail: 30, remain: 30 }, // sums to 90
          aToB: { graduate: 45, fail: 35, remain: 20 },
          bToC: { graduate: 55, fail: 25, remain: 20 },
          cToExit: { graduate: 65, fail: 15, remain: 20 },
        },
      };

      expect(() => new GraduationRateEngine(config)).toThrow(
        'seedToA probabilities must sum to 100%'
      );
    });

    it('requires seed for stochastic mode', () => {
      const config: GraduationConfig = {
        expectationMode: false,
        // seed: undefined - missing!
        transitions: {
          seedToA: { graduate: 35, fail: 45, remain: 20 },
          aToB: { graduate: 45, fail: 35, remain: 20 },
          bToC: { graduate: 55, fail: 25, remain: 20 },
          cToExit: { graduate: 65, fail: 15, remain: 20 },
        },
      };

      expect(() => new GraduationRateEngine(config)).toThrow(
        'Seed is required for stochastic mode'
      );
    });

    it('accepts valid configuration', () => {
      const config = createDefaultGraduationConfig(true);
      expect(() => new GraduationRateEngine(config)).not.toThrow();
    });
  });

  describe('Expectation Mode', () => {
    let engine: GraduationRateEngine;

    beforeEach(() => {
      engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
    });

    it('is deterministic - same input yields same output', () => {
      const result1 = engine.calculateTransition('seed');
      const result2 = engine.calculateTransition('seed');

      expect(result1.toStage).toBe(result2.toStage);
      expect(result1.probability).toBe(result2.probability);
    });

    it('calculates expected transition for each stage', () => {
      const stages: Stage[] = ['seed', 'series_a', 'series_b', 'series_c'];

      for (const stage of stages) {
        const result = engine.calculateTransition(stage);
        expect(result.fromStage).toBe(stage);
        expect(result.probability).toBeGreaterThan(0);
        expect(result.probability).toBeLessThanOrEqual(1);
      }
    });

    it('terminal states have no transition', () => {
      const exitResult = engine.calculateTransition('exit');
      expect(exitResult.toStage).toBe('exit');
      expect(exitResult.probability).toBe(1.0);

      const failedResult = engine.calculateTransition('failed');
      expect(failedResult.toStage).toBe('failed');
      expect(failedResult.probability).toBe(1.0);
    });

    it('projects cohort deterministically', () => {
      const projections1 = engine.projectCohort(100, 10);
      const projections2 = engine.projectCohort(100, 10);

      expect(projections1).toEqual(projections2);
    });

    it('cohort projection preserves total company count', () => {
      const initialCompanies = 100;
      const projections = engine.projectCohort(initialCompanies, 10);

      for (const projection of projections) {
        const total = Object.values(projection.stageDistribution).reduce(
          (sum, count) => sum + count,
          0
        );
        expect(total).toBeCloseTo(initialCompanies, 6);
      }
    });

    it('generates summary with expectation mode flag', () => {
      const summary = engine.getSummary(100, 10);

      expect(summary.mode).toBe('expectation');
      expect(summary.seed).toBeUndefined();
      expect(summary.totalCompanies).toBe(100);
      expect(summary.expectedGraduationRate).toBeGreaterThanOrEqual(0);
      expect(summary.expectedGraduationRate).toBeLessThanOrEqual(1);
    });
  });

  describe('Stochastic Mode', () => {
    const SEED = 42;
    let engine: GraduationRateEngine;

    beforeEach(() => {
      engine = new GraduationRateEngine(
        createDefaultGraduationConfig(false, SEED)
      );
    });

    it('is reproducible - same seed yields same results', () => {
      const engine1 = new GraduationRateEngine(
        createDefaultGraduationConfig(false, SEED)
      );
      const engine2 = new GraduationRateEngine(
        createDefaultGraduationConfig(false, SEED)
      );

      const results1: Stage[] = [];
      const results2: Stage[] = [];

      for (let i = 0; i < 100; i++) {
        results1.push(engine1.calculateTransition('seed').toStage);
        results2.push(engine2.calculateTransition('seed').toStage);
      }

      expect(results1).toEqual(results2);
    });

    it('different seeds produce different results', () => {
      const engine1 = new GraduationRateEngine(
        createDefaultGraduationConfig(false, 42)
      );
      const engine2 = new GraduationRateEngine(
        createDefaultGraduationConfig(false, 123)
      );

      const results1: Stage[] = [];
      const results2: Stage[] = [];

      for (let i = 0; i < 100; i++) {
        results1.push(engine1.calculateTransition('seed').toStage);
        results2.push(engine2.calculateTransition('seed').toStage);
      }

      // Should be different (very unlikely to be identical)
      expect(results1).not.toEqual(results2);
    });

    it('can reset seed for reproducible reruns', () => {
      const results1: Stage[] = [];
      for (let i = 0; i < 10; i++) {
        results1.push(engine.calculateTransition('seed').toStage);
      }

      engine.resetSeed(SEED);

      const results2: Stage[] = [];
      for (let i = 0; i < 10; i++) {
        results2.push(engine.calculateTransition('seed').toStage);
      }

      expect(results1).toEqual(results2);
    });

    it('generates summary with stochastic mode flag', () => {
      const summary = engine.getSummary(100, 10);

      expect(summary.mode).toBe('stochastic');
      expect(summary.seed).toBe(SEED);
    });
  });

  describe('Expectation Alignment', () => {
    it('stochastic mean converges to expectation mode result', () => {
      // Run many stochastic iterations
      const iterations = 1000;
      const initialCompanies = 100;
      const horizonQuarters = 20;

      // Get expectation mode result
      const expectationEngine = new GraduationRateEngine(
        createDefaultGraduationConfig(true)
      );
      const expectationSummary = expectationEngine.getSummary(
        initialCompanies,
        horizonQuarters
      );

      // Run stochastic iterations and compute mean
      let totalExits = 0;
      let totalFailures = 0;

      for (let i = 0; i < iterations; i++) {
        const stochasticEngine = new GraduationRateEngine(
          createDefaultGraduationConfig(false, i)
        );
        const summary = stochasticEngine.getSummary(
          initialCompanies,
          horizonQuarters
        );
        totalExits += summary.stageDistribution.exit;
        totalFailures += summary.stageDistribution.failed;
      }

      const meanExits = totalExits / iterations;
      const meanFailures = totalFailures / iterations;

      const expectedExits =
        expectationSummary.stageDistribution.exit;
      const expectedFailures =
        expectationSummary.stageDistribution.failed;

      // Monte Carlo mean should be within 10% of expectation mode
      // (allowing for statistical variance)
      const tolerance = 0.15; // 15% tolerance for 1000 iterations

      expect(meanExits).toBeGreaterThan(expectedExits * (1 - tolerance));
      expect(meanExits).toBeLessThan(expectedExits * (1 + tolerance));

      expect(meanFailures).toBeGreaterThan(expectedFailures * (1 - tolerance));
      expect(meanFailures).toBeLessThan(expectedFailures * (1 + tolerance));
    });
  });

  describe('Distribution Sanity', () => {
    it('no negative company counts', () => {
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(100, 40);

      for (const projection of projections) {
        for (const [stage, count] of Object.entries(
          projection.stageDistribution
        )) {
          expect(count).toBeGreaterThanOrEqual(0);
        }
      }
    });

    it('graduation rate is between 0 and 1', () => {
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const summary = engine.getSummary(100, 40);

      expect(summary.expectedGraduationRate).toBeGreaterThanOrEqual(0);
      expect(summary.expectedGraduationRate).toBeLessThanOrEqual(1);
    });

    it('failure rate is between 0 and 1', () => {
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const summary = engine.getSummary(100, 40);

      expect(summary.expectedFailureRate).toBeGreaterThanOrEqual(0);
      expect(summary.expectedFailureRate).toBeLessThanOrEqual(1);
    });

    it('graduation + failure rates sum to <= 1', () => {
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const summary = engine.getSummary(100, 40);

      expect(
        summary.expectedGraduationRate + summary.expectedFailureRate
      ).toBeLessThanOrEqual(1.001); // Small tolerance for floating point
    });

    it('stage distribution is monotonic over time (exits and failures only increase)', () => {
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(100, 20);

      for (let i = 1; i < projections.length; i++) {
        // Exits should never decrease
        expect(projections[i].stageDistribution.exit).toBeGreaterThanOrEqual(
          projections[i - 1].stageDistribution.exit
        );
        // Failures should never decrease
        expect(projections[i].stageDistribution.failed).toBeGreaterThanOrEqual(
          projections[i - 1].stageDistribution.failed
        );
      }
    });
  });

  describe('createDefaultGraduationConfig', () => {
    it('creates expectation mode config by default', () => {
      const config = createDefaultGraduationConfig();
      expect(config.expectationMode).toBe(true);
      expect(config.seed).toBeUndefined();
    });

    it('creates stochastic mode config with seed', () => {
      const config = createDefaultGraduationConfig(false, 123);
      expect(config.expectationMode).toBe(false);
      expect(config.seed).toBe(123);
    });

    it('all transitions sum to 100%', () => {
      const config = createDefaultGraduationConfig();
      const keys = ['seedToA', 'aToB', 'bToC', 'cToExit'] as const;

      for (const key of keys) {
        const t = config.transitions[key];
        expect(t.graduate + t.fail + t.remain).toBe(100);
      }
    });
  });
});
