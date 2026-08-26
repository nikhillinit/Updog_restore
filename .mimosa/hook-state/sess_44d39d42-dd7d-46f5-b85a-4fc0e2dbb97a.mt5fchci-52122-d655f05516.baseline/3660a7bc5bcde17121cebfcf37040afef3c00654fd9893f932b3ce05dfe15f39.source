/**
 * Characterization tests for the legacy DeterministicReserveEngine
 * (Tranche 4, ADR-045).
 *
 * These pin the engine's CURRENT behavior before substrate adoption; they are
 * evidence, not aspiration. The engine draws NO randomness - its only
 * nondeterminism is the wall clock, which sits INSIDE calculation math
 * (calculateRiskMultiplier derives company age from Date.now()), so every
 * test freezes time with fake timers and the clock dependence is itself
 * pinned behavior: the same input at two frozen instants a year apart
 * produces different allocations because one company crosses the 60-month
 * age threshold in between.
 *
 * Numeric expectations are CAPTURED-then-frozen golden values (run at the
 * frozen instants and transcribed), NOT hand-derived - a disclosed deviation
 * from the Tranche 2/3 hand-derivation discipline, recorded in ADR-045: this
 * is a 924-line Decimal.js kernel and restating it by hand is exactly the
 * rejected alternative. Structural invariants (conservation, ranking order,
 * allocation bounds) are asserted alongside so the goldens are anchored, not
 * free-floating.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DeterministicReserveEngine } from '../../../shared/core/reserves/DeterministicReserveEngine';
import { computeDeterministicReserveCacheKey } from '../../../shared/core/reserves/deterministic-reserve-canonical';
import { ReserveCalculationError } from '../../../shared/schemas/reserves-schemas';
import {
  ALPHA_ID,
  BETA_ID,
  DELTA_ID,
  EPSILON_ID,
  GAMMA_ID,
  T1_ISO,
  T2_ISO,
  ZETA_ID,
  baseInput,
  collidingInput,
} from './fixtures';

// CAPTURED golden values (frozen instant T1 = 2026-01-01T00:00:00.000Z).
// Ranking by allocation score: Beta Bio, Alpha Analytics, Gamma Grid.
const GOLDEN_T1 = {
  companyIds: [BETA_ID, ALPHA_ID, GAMMA_ID],
  recommendedAllocations: [1_054_687.5, 724_570.3125, 216_554.079],
  totalAllocated: 1_995_811.8915,
  unallocatedReserves: 8_004_188.1085,
  allocationEfficiency: 0.19958118915,
  expectedPortfolioMOIC: 18.954692153661817,
  expectedPortfolioValue: 37_830_000,
  expectedMOICs: [18.75, 18, 8.4],
  expectedValues: [18_750_000, 9_000_000, 10_080_000],
  riskAdjustedReturns: [11_250_000, 3_600_000, 7_056_000],
};

// CAPTURED golden values (frozen instant T2 = 2027-01-01T00:00:00.000Z).
// Beta Bio's investment age crosses 60 engine-months between T1 and T2, so
// its allocation and risk-adjusted return take the 0.9 age multiplier; the
// other companies are byte-identical to T1.
const GOLDEN_T2 = {
  betaAllocation: 949_218.75, // exactly 0.9 * GOLDEN_T1 allocation
  betaRiskAdjustedReturn: 10_125_000, // exactly 0.9 * 11_250_000
  totalAllocated: 1_890_343.1415,
};

function freezeAt(iso: string): void {
  vi.setSystemTime(new Date(iso));
}

describe('legacy DeterministicReserveEngine characterization', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('pins captured golden allocations and metrics at frozen instant T1', async () => {
    freezeAt(T1_ISO);
    const engine = new DeterministicReserveEngine();
    const result = await engine.calculateOptimalReserveAllocation(baseInput());

    expect(result.allocations.map((a) => a.companyId)).toEqual(GOLDEN_T1.companyIds);
    expect(result.allocations.map((a) => a.recommendedAllocation)).toEqual(
      GOLDEN_T1.recommendedAllocations
    );
    expect(result.allocations.map((a) => a.priority)).toEqual([1, 2, 3]);
    expect(result.allocations.map((a) => a.expectedMOIC)).toEqual(GOLDEN_T1.expectedMOICs);
    expect(result.allocations.map((a) => a.expectedValue)).toEqual(GOLDEN_T1.expectedValues);
    expect(result.allocations.map((a) => a.riskAdjustedReturn)).toEqual(
      GOLDEN_T1.riskAdjustedReturns
    );
    expect(result.inputSummary.totalAllocated).toBe(GOLDEN_T1.totalAllocated);
    expect(result.inputSummary.allocationEfficiency).toBe(GOLDEN_T1.allocationEfficiency);
    expect(result.unallocatedReserves).toBe(GOLDEN_T1.unallocatedReserves);
    expect(result.portfolioMetrics.expectedPortfolioMOIC).toBe(GOLDEN_T1.expectedPortfolioMOIC);
    expect(result.portfolioMetrics.expectedPortfolioValue).toBe(GOLDEN_T1.expectedPortfolioValue);
    // No company is older than 60 engine-months at T1: no risk-factor entries.
    expect(result.allocations.map((a) => a.riskFactors)).toEqual([[], [], []]);
  });

  it('pins metadata under a frozen clock: calculationDate is the instant, duration is 0', async () => {
    freezeAt(T1_ISO);
    const engine = new DeterministicReserveEngine();
    const result = await engine.calculateOptimalReserveAllocation(baseInput());

    expect(result.metadata.calculationDate).toEqual(new Date(T1_ISO));
    // Frozen clock start == end. (The legacy ReserveCalculationResultSchema
    // declares calculationDuration z.number().positive(), which a frozen run
    // violates - the engine never parses its own output; pinned as-is.)
    expect(result.metadata.calculationDuration).toBe(0);
    expect(result.metadata.modelVersion).toBe('1.0.0');
  });

  it('pins wall-clock dependence: the 60-month age threshold flips the 0.9 risk multiplier between T1 and T2', async () => {
    freezeAt(T1_ISO);
    const engineT1 = new DeterministicReserveEngine();
    const resultT1 = await engineT1.calculateOptimalReserveAllocation(baseInput());

    freezeAt(T2_ISO);
    // Fresh engine: the pre-fix per-instance cache would otherwise return the
    // T1 result verbatim and mask the drift (same 5-field cache key).
    const engineT2 = new DeterministicReserveEngine();
    const resultT2 = await engineT2.calculateOptimalReserveAllocation(baseInput());

    const betaT1 = resultT1.allocations.find((a) => a.companyId === BETA_ID)!;
    const betaT2 = resultT2.allocations.find((a) => a.companyId === BETA_ID)!;
    expect(betaT1.recommendedAllocation).toBe(GOLDEN_T1.recommendedAllocations[0]);
    expect(betaT2.recommendedAllocation).toBe(GOLDEN_T2.betaAllocation);
    expect(betaT2.recommendedAllocation).toBe(betaT1.recommendedAllocation * 0.9);
    expect(betaT2.riskAdjustedReturn).toBe(GOLDEN_T2.betaRiskAdjustedReturn);
    expect(betaT2.riskFactors).toEqual(['Risk adjustment applied due to company factors']);
    expect(resultT2.inputSummary.totalAllocated).toBe(GOLDEN_T2.totalAllocated);

    // Companies that do not cross the age threshold are unchanged.
    const othersT1 = resultT1.allocations.filter((a) => a.companyId !== BETA_ID);
    const othersT2 = resultT2.allocations.filter((a) => a.companyId !== BETA_ID);
    expect(othersT2).toEqual(othersT1);
  });

  it('is deterministic across engine instances at a fixed instant', async () => {
    freezeAt(T1_ISO);
    const first = await new DeterministicReserveEngine().calculateOptimalReserveAllocation(
      baseInput()
    );
    const second = await new DeterministicReserveEngine().calculateOptimalReserveAllocation(
      baseInput()
    );
    expect(second).toEqual(first);
  });

  it('short-circuits repeat calls on the same instance through the calculation cache', async () => {
    freezeAt(T1_ISO);
    const engine = new DeterministicReserveEngine();
    const first = await engine.calculateOptimalReserveAllocation(baseInput());
    const second = await engine.calculateOptimalReserveAllocation(baseInput());
    // A cache hit returns the cached object itself, not a copy.
    expect(second).toBe(first);
  });

  it('no longer collides: equal-length portfolios with matching scalars keep their own results', async () => {
    freezeAt(T1_ISO);
    const engine = new DeterministicReserveEngine();
    const first = await engine.calculateOptimalReserveAllocation(baseInput());
    const second = await engine.calculateOptimalReserveAllocation(collidingInput());

    // POST-FIX PIN (ADR-045 cache-identity fix). PRE-FIX this asserted
    // `expect(second).toBe(first)` and that the second call's allocations
    // named Alpha/Beta/Gamma: the 5-field cache key ignored portfolio
    // contents, so the second call returned the FIRST portfolio's result
    // verbatim - a real wrong-output defect. The canonical input identity
    // now keys each portfolio to its own result.
    expect(second).not.toBe(first);
    expect(second.allocations.map((a) => a.companyId)).toEqual([EPSILON_ID, DELTA_ID, ZETA_ID]);
  });

  it('stamps the canonical 64-hex cache key, different across different portfolios', async () => {
    freezeAt(T1_ISO);
    const input = baseInput();
    const result = await new DeterministicReserveEngine().calculateOptimalReserveAllocation(input);

    // POST-FIX PIN (ADR-045 cache-identity fix). PRE-FIX the stamped
    // deterministicHash was the base64 JSON of only portfolioCount/
    // availableReserves/totalFundSize/scenarioType/timeHorizon
    // ("eyJwb3J0Zm9saW9Db3VudCI6..."), identical across different
    // equal-length portfolios. It is now the domain-separated canonical
    // sha256 of the complete serialized input.
    expect(result.metadata.deterministicHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.metadata.deterministicHash).toBe(computeDeterministicReserveCacheKey(input));

    // A different portfolio of the same length now carries a different hash.
    const other = await new DeterministicReserveEngine().calculateOptimalReserveAllocation(
      collidingInput()
    );
    expect(other.metadata.deterministicHash).not.toBe(result.metadata.deterministicHash);
  });

  it('holds conservation, ranking, and bound invariants at both instants', async () => {
    for (const iso of [T1_ISO, T2_ISO]) {
      freezeAt(iso);
      const input = baseInput();
      const result = await new DeterministicReserveEngine().calculateOptimalReserveAllocation(
        input
      );

      // Conservation: allocated + unallocated == available reserves.
      const allocated = result.allocations.reduce((sum, a) => sum + a.recommendedAllocation, 0);
      expect(allocated + result.unallocatedReserves).toBeCloseTo(input.availableReserves, 6);
      expect(result.inputSummary.totalAllocated).toBeCloseTo(allocated, 6);

      // Ranking: priorities are 1..n in emitted order.
      expect(result.allocations.map((a) => a.priority)).toEqual(
        result.allocations.map((_, i) => i + 1)
      );

      // Bounds: every allocation clears the minimum threshold and the total
      // never exceeds the available reserves.
      for (const allocation of result.allocations) {
        expect(allocation.recommendedAllocation).toBeGreaterThanOrEqual(
          input.minAllocationThreshold
        );
      }
      expect(allocated).toBeLessThanOrEqual(input.availableReserves);
    }
  });

  it('pins guard-clause rejections: empty portfolio and non-positive reserves throw ReserveCalculationError', async () => {
    freezeAt(T1_ISO);
    const engine = new DeterministicReserveEngine();
    await expect(
      engine.calculateOptimalReserveAllocation(baseInput({ portfolio: [] }))
    ).rejects.toThrow(ReserveCalculationError);
    await expect(
      engine.calculateOptimalReserveAllocation(baseInput({ availableReserves: -1 }))
    ).rejects.toThrow(ReserveCalculationError);
  });
});
