import { describe, it, expect } from 'vitest';
import { computeReservesFromGraduation } from '../computeReservesFromGraduation';

// Helper: normalize whatever the engine returns into a single % ratio
function toReserveRatioPct(result: any, totalCommitment: number): number {
  // Common shapes we might encounter:
  if (typeof result?.reserveRatioPct === 'number') return result.reserveRatioPct;

  if (typeof result?.reserveRatio === 'number') {
    // reserveRatio might be 0..1 → convert to %
    const rr = result.reserveRatio;
    return rr > 1 ? rr : rr * 100;
  }

  if (typeof result?.totalFollowOnCapital === 'number') {
    return (result.totalFollowOnCapital / totalCommitment) * 100;
  }

  const agg = result?.aggregateByStage ?? result?.byStage;
  if (agg && typeof agg === 'object') {
    const total =
      (agg.A ?? 0) +
      (agg.B ?? 0) +
      (agg.C ?? 0);
    return (total / totalCommitment) * 100;
  }

  throw new Error('Unable to determine reserve ratio from engine result');
}

describe('Graduation reserves monotonicity', () => {
  it('increasing Seed→A graduate% (holding row sum at 100) increases required reserves', () => {
    const totalCommitment = 100_000_000; // $100M
    const baseInputs = {
      totalCommitment,
      targetCompanies: 30,
      avgCheckSize: 1_000_000, // Average seed check size
      deploymentPacePerYear: 10,
      followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },
      startQuarter: 0,
      horizonQuarters: 44, // 3y invest + 8y harvest → 44q; adjust if your hook computes this dynamically
    };

    // Base graduation (sums = 100 per row)
    const baseGrad = {
      seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
      aToB:    { graduate: 50, fail: 25, remain: 25, months: 24 },
      bToC:    { graduate: 60, fail: 20, remain: 20, months: 30 },
    };

    // Increased Seed→A graduation: +20 to graduate, -15 fail, -5 remain (still 100)
    const higherGrad = {
      seedToA: { graduate: 55, fail: 20, remain: 25, months: 18 },
      aToB:    baseGrad.aToB,
      bToC:    baseGrad.bToC,
    };

    const baseResult = computeReservesFromGraduation({ ...baseInputs, graduationRates: baseGrad });
    const higherResult = computeReservesFromGraduation({ ...baseInputs, graduationRates: higherGrad });

    const basePct = toReserveRatioPct(baseResult, totalCommitment);
    const higherPct = toReserveRatioPct(higherResult, totalCommitment);

    // Monotonicity: more companies graduating to A → more follow-on capital → higher reserve ratio
    expect(higherPct).toBeGreaterThan(basePct);
  });
});
