/**
 * Characterization tests for the legacy ReserveEngine (Tranche 3, ADR-044).
 *
 * These pin the engine's CURRENT behavior before substrate adoption; they are
 * evidence, not aspiration. The legacy engine resets its module-global LCG
 * (shared/utils/prng.ts, Numerical Recipes parameters) to the hardcoded seed
 * 42 on every call, so per-call output is fully deterministic given a fixed
 * environment. The remaining ambient reads are:
 *
 * - process.env['ALG_RESERVE'] / process.env['NODE_ENV'] select the ML vs
 *   rule-based path (controlled explicitly below);
 * - generateReserveSummary stamps `generatedAt: new Date()` (characterized
 *   structurally only; the wall-clock value is not blessed as truth).
 *
 * The rule-based path draws NO randomness. The ML path draws, per company in
 * portfolio order, one gate value (`next() > 0.3` selects ML) and, only when
 * the gate passes, one adjustment value (`0.8 + next() * 0.4`), so the draw
 * count interleaves with gate outcomes. Hand-derived LCG(42) stream
 * (state' = (1664525 * state + 1013904223) mod 2^32 starting at state 42):
 *
 *   draw1 = 0.2523451747838408   gate fails  -> company 1 rule-based
 *   draw2 = 0.08812504541128874  gate fails  -> company 2 rule-based
 *   draw3 = 0.5772811982315034   gate passes -> company 3 ML
 *   draw4 = 0.22255426598712802  adjustment  -> 0.8 + 0.4 * draw4
 *                                            = 0.8890217063948512
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ReserveEngine, generateReserveSummary } from '../../../shared/core/reserves/ReserveEngine';
import { ConfidenceLevel, type ReserveCompanyInput } from '../../../shared/types';

// Fixtures chosen to exercise the stage/sector multiplier tables, both
// ownership branches, the between-thresholds band, and the confidence ladder.
const SERIES_A_FINTECH_BOOST: ReserveCompanyInput = {
  id: 1,
  invested: 2_000_000,
  ownership: 0.15,
  stage: 'Series A',
  sector: 'Fintech',
};
const SEED_SAAS_PENALTY: ReserveCompanyInput = {
  id: 2,
  invested: 500_000,
  ownership: 0.02,
  stage: 'Seed',
  sector: 'SaaS',
};
const UNKNOWN_STAGE_SECTOR_COLD: ReserveCompanyInput = {
  id: 3,
  invested: 1_000_000,
  ownership: 0,
  stage: 'Series D',
  sector: 'Robotics',
};
const SERIES_B_HEALTHCARE_MID: ReserveCompanyInput = {
  id: 4,
  invested: 3_000_000,
  ownership: 0.08,
  stage: 'Series B',
  sector: 'Healthcare',
};
const GROWTH_ENTERPRISE_EDGE: ReserveCompanyInput = {
  id: 5,
  invested: 1_500_000,
  ownership: 0.1,
  stage: 'Growth',
  sector: 'Enterprise',
};
const SERIES_C_INFRA_EDGE: ReserveCompanyInput = {
  id: 6,
  invested: 800_000,
  ownership: 0.05,
  stage: 'Series C',
  sector: 'Infrastructure',
};

const RULE_BASED_PORTFOLIO = [
  SERIES_A_FINTECH_BOOST,
  SEED_SAAS_PENALTY,
  UNKNOWN_STAGE_SECTOR_COLD,
  SERIES_B_HEALTHCARE_MID,
];
const ML_PORTFOLIO = [SERIES_A_FINTECH_BOOST, SEED_SAAS_PENALTY, SERIES_B_HEALTHCARE_MID];

function withSavedAlgReserve(): void {
  const saved = process.env['ALG_RESERVE'];
  afterEach(() => {
    if (saved === undefined) {
      delete process.env['ALG_RESERVE'];
    } else {
      process.env['ALG_RESERVE'] = saved;
    }
  });
}

describe('legacy ReserveEngine characterization (rule-based path)', () => {
  withSavedAlgReserve();

  beforeEach(() => {
    // NODE_ENV is 'test' under vitest; ALG_RESERVE unset selects rule-based.
    delete process.env['ALG_RESERVE'];
  });

  it('pins exact allocations for the stage/sector multiplier table', () => {
    const result = ReserveEngine(RULE_BASED_PORTFOLIO);
    // 2M * 2.0 (Series A) * 1.2 (Fintech) * 1.2 (ownership 0.15 > 0.1)
    // 500k * 1.5 (Seed) * 1.1 (SaaS) * 0.8 (ownership 0.02 < 0.05)
    // 1M * 2.0 (unknown-stage default) * 1.0 (unknown-sector default) * 0.8 (ownership 0 < 0.05)
    // 3M * 2.5 (Series B) * 1.3 (Healthcare), ownership 0.08 in the no-adjustment band
    expect(result.map((o) => o.allocation)).toEqual([5_760_000, 660_000, 1_600_000, 9_750_000]);
  });

  it('pins the confidence ladder: base COLD_START, +0.2 stage&sector, +0.15 ownership>0, +0.1 invested>1M, capped at MEDIUM', () => {
    const result = ReserveEngine(RULE_BASED_PORTFOLIO);
    // Ladder sums are 2dp-rounded by the engine (Math.round(c * 100) / 100).
    expect(result[0]!.confidence).toBe(ConfidenceLevel.MEDIUM); // 0.3+0.2+0.15+0.1 capped
    expect(result[1]!.confidence).toBe(0.65); // 0.3+0.2+0.15; invested 500k earns no bonus
    expect(result[2]!.confidence).toBe(ConfidenceLevel.LOW); // 0.3+0.2; ownership 0, invested exactly 1M
    expect(result[3]!.confidence).toBe(ConfidenceLevel.MEDIUM);
  });

  it('pins rationale strings, including the cold-start/enhanced-rules suffix flip at LOW', () => {
    const result = ReserveEngine(RULE_BASED_PORTFOLIO);
    expect(result.map((o) => o.rationale)).toEqual([
      'Series A stage, Fintech sector (enhanced rules)',
      'Seed stage, SaaS sector (enhanced rules)',
      'Series D stage, Robotics sector (cold-start mode)',
      'Series B stage, Healthcare sector (enhanced rules)',
    ]);
  });

  it('pins threshold boundaries: ownership exactly 0.1 or 0.05 takes no adjustment; invested exactly 1M earns no confidence bonus', () => {
    const result = ReserveEngine([GROWTH_ENTERPRISE_EDGE, SERIES_C_INFRA_EDGE]);
    // 1.5M * 1.2 (Growth) * 0.8 (Enterprise), ownership 0.1 is NOT > 0.1
    // 800k * 1.8 (Series C) * 0.9 (Infrastructure), ownership 0.05 is NOT < 0.05
    expect(result.map((o) => o.allocation)).toEqual([1_440_000, 1_296_000]);
    expect(result[0]!.confidence).toBe(ConfidenceLevel.MEDIUM);
    expect(result[1]!.confidence).toBe(0.65);
  });

  it('is deterministic across repeated calls (module PRNG resets to 42 per call)', () => {
    const first = ReserveEngine(RULE_BASED_PORTFOLIO);
    const second = ReserveEngine(RULE_BASED_PORTFOLIO);
    expect(second).toEqual(first);
  });

  it('silently returns [] for an empty portfolio', () => {
    expect(ReserveEngine([])).toEqual([]);
  });

  it('silently returns [] for non-array input (pinned legacy silent-fallback smell)', () => {
    // The engine swallows a type error instead of surfacing it; the substrate
    // adapter deliberately deviates and reports failed + INPUT_INVALID.
    expect(ReserveEngine(null as unknown as unknown[])).toEqual([]);
    expect(ReserveEngine({} as unknown as unknown[])).toEqual([]);
  });

  it('throws with the offending index for an invalid company element', () => {
    expect(() => ReserveEngine([{ id: 1 }])).toThrow(/Invalid company data at index 0/);
  });
});

describe('legacy ReserveEngine characterization (ML path via ALG_RESERVE)', () => {
  withSavedAlgReserve();

  it('pins the seed-42 gate/adjustment interleave: rule, rule, then ML on the third company', () => {
    process.env['ALG_RESERVE'] = 'true';
    const result = ReserveEngine(ML_PORTFOLIO);
    // Gates for companies 1 and 2 fail (draws 0.2523..., 0.0881... are <= 0.3),
    // so they emit rule-based outputs even in ML mode. The company-3 gate
    // passes (0.5772... > 0.3) and draw4 prices the adjustment:
    // round(9,750,000 * 0.8890217063948512) = 8,667,962.
    expect(result.map((o) => o.allocation)).toEqual([5_760_000, 660_000, 8_667_962]);
    expect(result[2]!.confidence).toBe(ConfidenceLevel.ML_ENHANCED); // min(0.95, 0.7 + 0.3)
    expect(result[2]!.rationale).toBe('ML-enhanced allocation (Series B stage, Healthcare sector)');
    // Gate-failed companies keep their rule-based confidence and rationale.
    expect(result[0]!.confidence).toBe(ConfidenceLevel.MEDIUM);
    expect(result[0]!.rationale).toBe('Series A stage, Fintech sector (enhanced rules)');
  });

  it('is deterministic across repeated ML calls (per-call reset to seed 42)', () => {
    process.env['ALG_RESERVE'] = 'true';
    const first = ReserveEngine(ML_PORTFOLIO);
    const second = ReserveEngine(ML_PORTFOLIO);
    expect(second).toEqual(first);
  });

  it('is call-order independent because each call resets the shared generator', () => {
    process.env['ALG_RESERVE'] = 'true';
    ReserveEngine(RULE_BASED_PORTFOLIO);
    const afterOther = ReserveEngine(ML_PORTFOLIO);
    expect(afterOther.map((o) => o.allocation)).toEqual([5_760_000, 660_000, 8_667_962]);
  });
});

describe('legacy generateReserveSummary characterization', () => {
  withSavedAlgReserve();

  beforeEach(() => {
    delete process.env['ALG_RESERVE'];
  });

  it('pins summary aggregates; generatedAt is an ambient new Date() read (structure only)', () => {
    const summary = generateReserveSummary(7, RULE_BASED_PORTFOLIO);
    expect(summary.fundId).toBe(7);
    expect(summary.totalAllocation).toBe(17_770_000);
    expect(summary.avgConfidence).toBe(0.64); // round(((0.7+0.65+0.5+0.7)/4)*100)/100
    expect(summary.highConfidenceCount).toBe(2); // confidences >= MEDIUM
    expect(summary.allocations.map((o) => o.allocation)).toEqual([
      5_760_000, 660_000, 1_600_000, 9_750_000,
    ]);
    // Nondeterministic under fixed inputs: value intentionally not pinned.
    expect(summary.generatedAt).toBeInstanceOf(Date);
  });

  it('pins zero aggregates for an empty portfolio', () => {
    const summary = generateReserveSummary(7, []);
    expect(summary.totalAllocation).toBe(0);
    expect(summary.avgConfidence).toBe(0);
    expect(summary.highConfidenceCount).toBe(0);
    expect(summary.allocations).toEqual([]);
  });
});
