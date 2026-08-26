/**
 * Characterization tests for the legacy PacingEngine (Tranche 2, ADR-043).
 *
 * These pin the engine's CURRENT behavior before substrate adoption; they are
 * evidence, not aspiration. The legacy engine resets its module-global LCG
 * (shared/utils/prng.ts, Numerical Recipes parameters) to the hardcoded seed
 * 123 on every call, so per-call output is fully deterministic given a fixed
 * environment. The remaining ambient reads are:
 *
 * - process.env['ALG_PACING'] / process.env['NODE_ENV'] select the ML vs
 *   rule-based path (controlled explicitly below);
 * - generatePacingSummary stamps `generatedAt: new Date()` (characterized
 *   structurally only; the wall-clock value is not blessed as truth).
 *
 * Expected deployment values are hand-authored from the LCG recurrence
 * state' = (1664525 * state + 1013904223) mod 2^32 starting at state 123,
 * variability = 0.9 + draw * 0.2, deployment = round(base * phase * variability).
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PacingEngine, generatePacingSummary } from '../../../shared/core/pacing/PacingEngine';
import type { PacingInput, PacingOutput } from '../../../shared/types';

const NEUTRAL_50M_Q1: PacingInput = {
  fundSize: 50_000_000,
  deploymentQuarter: 1,
  marketCondition: 'neutral',
};
const BULL_100M_Q3: PacingInput = {
  fundSize: 100_000_000,
  deploymentQuarter: 3,
  marketCondition: 'bull',
};
const BEAR_20M_Q10: PacingInput = {
  fundSize: 20_000_000,
  deploymentQuarter: 10,
  marketCondition: 'bear',
};

// Hand-authored expected deployments for the LCG(123) draw sequence.
const EXPECTED_NEUTRAL_50M_Q1 = [
  5_979_671, 6_168_913, 5_673_314, 5_901_100, 6_074_284, 6_362_805, 6_076_601, 6_033_562,
];
const EXPECTED_BULL_100M_Q3 = [
  15_547_145, 16_039_173, 14_750_617, 12_982_420, 13_363_424, 13_998_171, 9_722_562, 9_653_700,
];
const EXPECTED_BEAR_20M_Q10 = [
  1_674_308, 1_727_296, 1_588_528, 2_124_396, 2_186_742, 2_290_610, 2_916_769, 2_896_110,
];
const EXPECTED_NEUTRAL_50M_Q1_ML = [
  5_225_765, 6_442_743, 5_851_990, 6_732_204, 6_562_221, 7_238_359, 5_330_876, 6_657_064,
];

function deployments(outputs: PacingOutput[]): number[] {
  return outputs.map((o) => o.deployment);
}

describe('legacy PacingEngine characterization (rule-based path)', () => {
  const savedAlgPacing = process.env['ALG_PACING'];

  beforeEach(() => {
    // NODE_ENV is 'test' under vitest; ALG_PACING unset selects rule-based.
    delete process.env['ALG_PACING'];
  });

  afterEach(() => {
    if (savedAlgPacing === undefined) {
      delete process.env['ALG_PACING'];
    } else {
      process.env['ALG_PACING'] = savedAlgPacing;
    }
  });

  it('pins exact neutral-market deployments for seed 123', () => {
    const result = PacingEngine(NEUTRAL_50M_Q1);
    expect(deployments(result)).toEqual(EXPECTED_NEUTRAL_50M_Q1);
    expect(result.map((o) => o.quarter)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(result[0]!.note).toBe('neutral market pacing (early-stage focus)');
    expect(result[3]!.note).toBe('neutral market pacing (mid-stage deployment)');
    expect(result[7]!.note).toBe('neutral market pacing (late-stage optimization)');
  });

  it('pins exact bull-market deployments for seed 123', () => {
    const result = PacingEngine(BULL_100M_Q3);
    expect(deployments(result)).toEqual(EXPECTED_BULL_100M_Q3);
    expect(result.map((o) => o.quarter)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(result[0]!.note).toBe('bull market pacing (early-stage focus)');
  });

  it('pins exact bear-market deployments for seed 123', () => {
    const result = PacingEngine(BEAR_20M_Q10);
    expect(deployments(result)).toEqual(EXPECTED_BEAR_20M_Q10);
    expect(result.map((o) => o.quarter)).toEqual([10, 11, 12, 13, 14, 15, 16, 17]);
    expect(result[7]!.note).toBe('bear market pacing (late-stage optimization)');
  });

  it('is deterministic across repeated calls (module PRNG resets to 123 per call)', () => {
    const first = PacingEngine(NEUTRAL_50M_Q1);
    const second = PacingEngine(NEUTRAL_50M_Q1);
    expect(second).toEqual(first);
  });

  it('is call-order independent because each call resets the shared generator', () => {
    PacingEngine(BULL_100M_Q3);
    const afterOther = PacingEngine(NEUTRAL_50M_Q1);
    expect(deployments(afterOther)).toEqual(EXPECTED_NEUTRAL_50M_Q1);
  });
});

describe('legacy PacingEngine characterization (ML path via ALG_PACING)', () => {
  const savedAlgPacing = process.env['ALG_PACING'];

  afterEach(() => {
    if (savedAlgPacing === undefined) {
      delete process.env['ALG_PACING'];
    } else {
      process.env['ALG_PACING'] = savedAlgPacing;
    }
  });

  it('pins exact ML-path deployments: 8 rule-based draws then 8 trend draws from one stream', () => {
    process.env['ALG_PACING'] = 'true';
    const result = PacingEngine(NEUTRAL_50M_Q1);
    expect(deployments(result)).toEqual(EXPECTED_NEUTRAL_50M_Q1_ML);
    expect(result[0]!.note).toBe('ML-optimized pacing (neutral trend analysis)');
  });
});

describe('legacy generatePacingSummary characterization', () => {
  const savedAlgPacing = process.env['ALG_PACING'];

  beforeEach(() => {
    delete process.env['ALG_PACING'];
  });

  afterEach(() => {
    if (savedAlgPacing === undefined) {
      delete process.env['ALG_PACING'];
    } else {
      process.env['ALG_PACING'] = savedAlgPacing;
    }
  });

  it('pins summary aggregates; generatedAt is an ambient new Date() read (structure only)', () => {
    const summary = generatePacingSummary(NEUTRAL_50M_Q1);
    const expectedTotal = EXPECTED_NEUTRAL_50M_Q1.reduce((sum, d) => sum + d, 0);
    expect(summary.totalQuarters).toBe(8);
    expect(deployments(summary.deployments)).toEqual(EXPECTED_NEUTRAL_50M_Q1);
    expect(summary.avgQuarterlyDeployment).toBe(Math.round(expectedTotal / 8));
    expect(summary.fundSize).toBe(NEUTRAL_50M_Q1.fundSize);
    expect(summary.marketCondition).toBe('neutral');
    // Nondeterministic under fixed inputs: value intentionally not pinned.
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });
});
