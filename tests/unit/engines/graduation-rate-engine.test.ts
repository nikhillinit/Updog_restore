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
      engine = new GraduationRateEngine(createDefaultGraduationConfig(false, SEED));
    });

    it('is reproducible - same seed yields same results', () => {
      const engine1 = new GraduationRateEngine(createDefaultGraduationConfig(false, SEED));
      const engine2 = new GraduationRateEngine(createDefaultGraduationConfig(false, SEED));

      const results1: Stage[] = [];
      const results2: Stage[] = [];

      for (let i = 0; i < 100; i++) {
        results1.push(engine1.calculateTransition('seed').toStage);
        results2.push(engine2.calculateTransition('seed').toStage);
      }

      expect(results1).toEqual(results2);
    });

    it('different seeds produce different results', () => {
      const engine1 = new GraduationRateEngine(createDefaultGraduationConfig(false, 42));
      const engine2 = new GraduationRateEngine(createDefaultGraduationConfig(false, 123));

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
      const expectationEngine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const expectationSummary = expectationEngine.getSummary(initialCompanies, horizonQuarters);

      // Run stochastic iterations and compute mean
      let totalExits = 0;
      let totalFailures = 0;

      for (let i = 0; i < iterations; i++) {
        const stochasticEngine = new GraduationRateEngine(createDefaultGraduationConfig(false, i));
        const summary = stochasticEngine.getSummary(initialCompanies, horizonQuarters);
        totalExits += summary.stageDistribution.exit;
        totalFailures += summary.stageDistribution.failed;
      }

      const meanExits = totalExits / iterations;
      const meanFailures = totalFailures / iterations;

      const expectedExits = expectationSummary.stageDistribution.exit;
      const expectedFailures = expectationSummary.stageDistribution.failed;

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
        for (const [stage, count] of Object.entries(projection.stageDistribution)) {
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

      expect(summary.expectedGraduationRate + summary.expectedFailureRate).toBeLessThanOrEqual(
        1.001
      ); // Small tolerance for floating point
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

  /**
   * GRAD Oracle Cases
   *
   * Hand-arithmetic derivations for expectation mode after 1 quarter.
   * Default config: seedToA(35/45/20), aToB(45/35/20), bToC(55/25/20), cToExit(65/15/20)
   *
   * Starting with 100 companies at seed, after Q1:
   *   seed: 100 * (1 - 0.35 - 0.45) = 100 * 0.20 = 20 remain
   *   series_a: 100 * 0.35 = 35 (all from seed grads)
   *   series_b: 0 (no A companies existed to graduate)
   *   series_c: 0
   *   exit: 0
   *   failed: 100 * 0.45 = 45
   */
  describe('GRAD Oracle Cases (Expectation Mode)', () => {
    it('GRAD-01: 100 seed companies after 1 quarter', () => {
      // Derivation:
      //   seed grads = 100 * 0.35 = 35 -> series_a
      //   seed fails = 100 * 0.45 = 45 -> failed
      //   seed remain = 100 * 0.20 = 20 -> seed
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(100, 1);

      expect(projections).toHaveLength(1);
      const q1 = projections[0]!;
      expect(q1.stageDistribution.seed).toBeCloseTo(20, 4);
      expect(q1.stageDistribution.series_a).toBeCloseTo(35, 4);
      expect(q1.stageDistribution.series_b).toBeCloseTo(0, 4);
      expect(q1.stageDistribution.series_c).toBeCloseTo(0, 4);
      expect(q1.stageDistribution.exit).toBeCloseTo(0, 4);
      expect(q1.stageDistribution.failed).toBeCloseTo(45, 4);
    });

    it('GRAD-03: 100 seed companies after 2 quarters', () => {
      // Derivation (Q2 starts from Q1 state: seed=20, A=35, B=0, C=0, exit=0, fail=45):
      //   From seed(20):  grads=20*0.35=7->A, fails=20*0.45=9->fail, remain=20*0.20=4
      //   From A(35):     grads=35*0.45=15.75->B, fails=35*0.35=12.25->fail, remain=35*0.20=7
      //   From B(0):      nothing
      //   From C(0):      nothing
      //   Q2 state:
      //     seed = 4
      //     series_a = 7 + 7 = 14 (new from seed + remain from A(35-15.75-12.25=7))
      //     series_b = 15.75
      //     series_c = 0
      //     exit = 0
      //     failed = 45 + 9 + 12.25 = 66.25
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(100, 2);

      expect(projections).toHaveLength(2);
      const q2 = projections[1]!;
      expect(q2.stageDistribution.seed).toBeCloseTo(4, 4);
      expect(q2.stageDistribution.series_a).toBeCloseTo(14, 4);
      expect(q2.stageDistribution.series_b).toBeCloseTo(15.75, 4);
      expect(q2.stageDistribution.series_c).toBeCloseTo(0, 4);
      expect(q2.stageDistribution.exit).toBeCloseTo(0, 4);
      expect(q2.stageDistribution.failed).toBeCloseTo(66.25, 4);
    });

    it('GRAD-04: total company count preserved across quarters', () => {
      // Conservation law: sum of all stages = initial companies (100) at every quarter
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(100, 10);

      for (const p of projections) {
        const total = Object.values(p.stageDistribution).reduce((s, v) => s + v, 0);
        expect(total).toBeCloseTo(100, 2);
      }
    });

    it('GRAD-05: single-company deterministic path through all stages', () => {
      // With 1 company at seed, expectation mode distributes fractionally.
      // After Q1: seed=0.20, A=0.35, failed=0.45
      // Verify fractions are exact per transition probabilities.
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(1, 1);

      const q1 = projections[0]!;
      expect(q1.stageDistribution.seed).toBeCloseTo(0.2, 6);
      expect(q1.stageDistribution.series_a).toBeCloseTo(0.35, 6);
      expect(q1.stageDistribution.failed).toBeCloseTo(0.45, 6);
    });
  });
});
