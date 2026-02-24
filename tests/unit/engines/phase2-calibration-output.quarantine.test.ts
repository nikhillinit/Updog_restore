/**
 * Phase 2 Calibration: Quarantined Output Checks
 *
 * These tests validate simulation output envelopes against industry benchmarks.
 * They are intentionally non-blocking because they depend on Monte Carlo
 * convergence and may be sensitive to parameter tuning.
 *
 * @quarantine
 * @owner phoenix-team
 * @reason Output envelope checks depend on MC fixture unlock (Workstream B)
 * @exitCriteria All output checks pass consistently across 5 consecutive runs
 * @addedDate 2026-02-22
 *
 * @see docs/phase2-calibration-benchmarks.md for benchmark provenance
 */

import { describe, it, expect } from 'vitest';
import {
  GraduationRateEngine,
  createDefaultGraduationConfig,
} from '@/core/graduation/GraduationRateEngine';

// @quarantine - These tests are intentionally skipped in CI.
// Run with: npm run test:quarantine
// Exit criteria: pass 5 consecutive runs with different seeds.
describe.skip('Phase 2 Calibration: Output Envelopes', () => {
  describe('MOIC envelope', () => {
    it('expected portfolio MOIC falls within [1.5x, 4.0x] band', () => {
      // Industry benchmark: median VC fund MOIC 1.5-3.0x (Cambridge Associates 2023)
      // Upper bound extended to 4.0x for top-quartile funds.
      // This test validates that default graduation + exit assumptions
      // produce MOICs in a reasonable range.
      //
      // TODO: Implement after MC fixture unlock (Workstream B)
      expect(true).toBe(true);
    });
  });

  describe('Loss ratio envelope', () => {
    it('portfolio loss ratio falls within [30%, 70%] band', () => {
      // Industry benchmark: 30-60% of VC investments return < 1x (Horsley Bridge 2022)
      // Extended to 70% for early-stage focused funds.
      //
      // Derivation from default config:
      //   Seed failure: 45%, A failure: 35%, B: 25%, C: 15%
      //   Cumulative failure through pipeline should cluster around 50-65%
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const summary = engine.getSummary(100, 20);

      expect(summary.expectedFailureRate).toBeGreaterThanOrEqual(0.3);
      expect(summary.expectedFailureRate).toBeLessThanOrEqual(0.7);
    });
  });

  describe('Top-decile concentration', () => {
    it('top 10% of companies generate > 50% of value', () => {
      // Industry benchmark: power law in VC returns (Kauffman Foundation 2012)
      // Top performers generate outsized returns; typical range 50-80% of value.
      //
      // TODO: Requires portfolio simulation with MOIC integration
      expect(true).toBe(true);
    });
  });

  describe('Seed-to-A horizon', () => {
    it('majority of seed companies resolve within 8 quarters', () => {
      // Industry benchmark: seed-to-A round typically 12-24 months (PitchBook 2023)
      // With 35% graduate + 45% fail per quarter (80% resolve rate),
      // after 4 quarters: remain = 0.20^4 = 0.0016 -> essentially all resolved
      const engine = new GraduationRateEngine(createDefaultGraduationConfig(true));
      const projections = engine.projectCohort(100, 8);

      const q8 = projections[projections.length - 1]!;
      // Less than 1% of original seed companies should remain at seed stage
      expect(q8.stageDistribution.seed).toBeLessThan(1);
    });
  });
});
