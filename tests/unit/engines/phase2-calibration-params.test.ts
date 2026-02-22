/**
 * Phase 2 Calibration: CI-Blocking Parameter Checks
 *
 * Fast, deterministic validation of default configuration parameters
 * against cited industry benchmarks. These tests are CI-blocking.
 *
 * @see docs/phase2-calibration-benchmarks.md for provenance
 */

import { describe, it, expect } from 'vitest';
import {
  GraduationRateEngine,
  createDefaultGraduationConfig,
} from '@/core/graduation/GraduationRateEngine';

describe('Phase 2 Calibration: Parameter Checks', () => {
  describe('createDefaultGraduationConfig() bounds and order', () => {
    const config = createDefaultGraduationConfig(true);

    it('all transition probabilities are in [0, 100]', () => {
      const keys = ['seedToA', 'aToB', 'bToC', 'cToExit'] as const;

      for (const key of keys) {
        const t = config.transitions[key];
        expect(t.graduate).toBeGreaterThanOrEqual(0);
        expect(t.graduate).toBeLessThanOrEqual(100);
        expect(t.fail).toBeGreaterThanOrEqual(0);
        expect(t.fail).toBeLessThanOrEqual(100);
        expect(t.remain).toBeGreaterThanOrEqual(0);
        expect(t.remain).toBeLessThanOrEqual(100);
      }
    });

    it('each transition sums to exactly 100%', () => {
      const keys = ['seedToA', 'aToB', 'bToC', 'cToExit'] as const;

      for (const key of keys) {
        const t = config.transitions[key];
        expect(t.graduate + t.fail + t.remain).toBe(100);
      }
    });

    it('seed failure rate is the highest stage failure rate', () => {
      // Industry benchmark: earliest-stage companies have the highest failure rates.
      // Seed: 45%, A: 35%, B: 25%, C: 15%
      const { seedToA, aToB, bToC, cToExit } = config.transitions;

      expect(seedToA.fail).toBeGreaterThan(aToB.fail);
      expect(aToB.fail).toBeGreaterThan(bToC.fail);
      expect(bToC.fail).toBeGreaterThan(cToExit.fail);
    });

    it('graduation rates increase monotonically through stages', () => {
      // Industry benchmark: later-stage companies are more likely to graduate.
      // Seed->A: 35%, A->B: 45%, B->C: 55%, C->Exit: 65%
      const { seedToA, aToB, bToC, cToExit } = config.transitions;

      expect(seedToA.graduate).toBeLessThan(aToB.graduate);
      expect(aToB.graduate).toBeLessThan(bToC.graduate);
      expect(bToC.graduate).toBeLessThan(cToExit.graduate);
    });
  });

  describe('Follow-on check monotonicity', () => {
    it('graduation probabilities A < B < C', () => {
      // Follow-on decisions should get easier as companies mature.
      // This ensures the model doesn't invert the natural funnel.
      const config = createDefaultGraduationConfig(true);
      const { aToB, bToC, cToExit } = config.transitions;

      expect(aToB.graduate).toBeLessThan(bToC.graduate);
      expect(bToC.graduate).toBeLessThan(cToExit.graduate);
    });
  });

  describe('Remain rate consistency', () => {
    it('remain rate is consistent across all stages', () => {
      // Current defaults use 20% remain for all stages.
      // This is a design choice (not benchmark-driven) for model simplicity.
      const config = createDefaultGraduationConfig(true);
      const keys = ['seedToA', 'aToB', 'bToC', 'cToExit'] as const;

      const remainRates = keys.map((k) => config.transitions[k].remain);
      // All should be equal (currently 20%)
      const first = remainRates[0];
      for (const rate of remainRates) {
        expect(rate).toBe(first);
      }
    });
  });

  describe('Reserve-ratio sanity from pinned fixture', () => {
    it('graduation config produces sensible cohort projections', () => {
      // Smoke test: 100 companies over 20 quarters should have:
      // - More than 0 exits
      // - More than 0 failures
      // - Less than 100 companies remaining in pipeline
      const config = createDefaultGraduationConfig(true);
      const engine = new GraduationRateEngine(config);
      const projections = engine.projectCohort(100, 20);

      const final = projections[projections.length - 1]!;
      expect(final.stageDistribution.exit).toBeGreaterThan(0);
      expect(final.stageDistribution.failed).toBeGreaterThan(0);

      const inPipeline =
        final.stageDistribution.seed +
        final.stageDistribution.series_a +
        final.stageDistribution.series_b +
        final.stageDistribution.series_c;
      expect(inPipeline).toBeLessThan(100);
    });
  });
});
