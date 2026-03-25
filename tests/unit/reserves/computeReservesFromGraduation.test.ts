import { describe, expect, it } from 'vitest';
import {
  computeReservesFromGraduation,
  type FundDataForReserves,
} from '@/core/reserves/computeReservesFromGraduation';

const base: FundDataForReserves = {
  totalCommitment: 50_000_000,
  targetCompanies: 35,
  avgCheckSize: 500_000,
  deploymentPacePerYear: 16,
  graduationRates: {
    seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
    aToB: { graduate: 50, fail: 25, remain: 25, months: 24 },
    bToC: { graduate: 60, fail: 20, remain: 20, months: 30 },
  },
  followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },
  startQuarter: 0,
  horizonQuarters: 64,
};

describe('computeReservesFromGraduation', () => {
  it('requires each transition to sum to 100%', () => {
    const invalid = structuredClone(base);
    invalid.graduationRates.aToB = { graduate: 55, fail: 25, remain: 25, months: 24 };

    const result = computeReservesFromGraduation(invalid);

    expect(result.valid).toBe(false);
    expect(result.errors.some((error) => error.includes('aToB'))).toBe(true);
  });

  it('produces reserves inside the expected baseline band', () => {
    const result = computeReservesFromGraduation(base);

    expect(result.valid).toBe(true);
    expect(Object.keys(result.followOnByQuarter).length).toBeGreaterThan(0);
    expect(result.totalReserves).toBeGreaterThan(0);
    expect(result.reserveRatioPct).toBeGreaterThan(40);
    expect(result.reserveRatioPct).toBeLessThan(70);
  });

  it('increases reserves when Seed to A graduation improves', () => {
    const baseline = computeReservesFromGraduation(base);
    const improved = structuredClone(base);
    improved.graduationRates.seedToA = { graduate: 45, fail: 25, remain: 30, months: 18 };

    const result = computeReservesFromGraduation(improved);

    expect(result.totalReserves).toBeGreaterThan(baseline.totalReserves);
    expect(result.reserveRatioPct).toBeGreaterThan(baseline.reserveRatioPct);
  });

  it('increases reserves when remain attempts are enabled', () => {
    const baseline = computeReservesFromGraduation(base);
    const result = computeReservesFromGraduation({
      ...base,
      remainAttempts: 1,
      remainDelayQuarters: 2,
    });

    expect(result.valid).toBe(true);
    expect(result.totalReserves).toBeGreaterThan(baseline.totalReserves);
    expect(result.reserveRatioPct).toBeGreaterThan(baseline.reserveRatioPct);
  });
});
