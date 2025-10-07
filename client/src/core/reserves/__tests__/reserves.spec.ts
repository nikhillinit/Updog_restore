/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-console */
/* eslint-disable react/no-unescaped-entities */
/* eslint-disable react-hooks/exhaustive-deps */
import { describe, it, expect } from "vitest";
import type { FundDataForReserves } from "../../reserves/computeReservesFromGraduation";
import { computeReservesFromGraduation } from "../../reserves/computeReservesFromGraduation";

const base: FundDataForReserves = {
  totalCommitment: 50_000_000,
  targetCompanies: 35,
  avgCheckSize: 500_000,
  deploymentPacePerYear: 16,   // ~4 per quarter
  graduationRates: {
    seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
    aToB:    { graduate: 50, fail: 25, remain: 25, months: 24 },
    bToC:    { graduate: 60, fail: 20, remain: 20, months: 30 },
  },
  followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },
  startQuarter: 0,
  horizonQuarters: 64,
};

describe("computeReservesFromGraduation", () => {
  it("requires each transition to sum to 100%", () => {
    const bad = structuredClone(base);
    bad.graduationRates.aToB = { graduate: 55, fail: 25, remain: 25, months: 24 }; // 105%
    const res = computeReservesFromGraduation(bad);
    expect(res.valid).toBe(false);
    expect(res.errors.some(e => e.includes("aToB"))).toBe(true);
  });

  it("produces timeline and ratio within a reasonable band for market defaults", () => {
    const res = computeReservesFromGraduation(base);
    expect(res.valid).toBe(true);
    expect(Object.keys(res.followOnByQuarter).length).toBeGreaterThan(0);
    expect(res.totalReserves).toBeGreaterThan(0);
    // with these params, reserve ratio should be in ~45–65% band
    expect(res.reserveRatioPct).toBeGreaterThan(40);
    expect(res.reserveRatioPct).toBeLessThan(70);
  });

  it("is sensitive to Seed→A graduation increases", () => {
    const res1 = computeReservesFromGraduation(base);
    const more = structuredClone(base);
    more.graduationRates.seedToA = { graduate: 45, fail: 25, remain: 30, months: 18 };
    const res2 = computeReservesFromGraduation(more);
    expect(res2.totalReserves).toBeGreaterThan(res1.totalReserves);
    expect(res2.reserveRatioPct).toBeGreaterThan(res1.reserveRatioPct);
  });

  // v1.1: Remain pass functionality tests
  it("should increase reserves with remain pass enabled", () => {
    const baseline = computeReservesFromGraduation(base);
    const withRemain = computeReservesFromGraduation({
      ...base,
      remainAttempts: 1,
      remainDelayQuarters: 2
    });
    
    expect(withRemain.valid).toBe(true);
    expect(withRemain.totalReserves).toBeGreaterThan(baseline.totalReserves);
    expect(withRemain.reserveRatioPct).toBeGreaterThan(baseline.reserveRatioPct);
  });

  it("should handle remain attempts with zero remain percentages", () => {
    const noRemain = structuredClone(base);
    noRemain.graduationRates.seedToA.remain = 0;
    noRemain.graduationRates.aToB.remain = 0;
    noRemain.graduationRates.bToC.remain = 0;
    noRemain.graduationRates.seedToA.fail += 30;
    noRemain.graduationRates.aToB.fail += 25;
    noRemain.graduationRates.bToC.fail += 20;

    const baseline = computeReservesFromGraduation(noRemain);
    const withRemain = computeReservesFromGraduation({
      ...noRemain,
      remainAttempts: 1,
      remainDelayQuarters: 2
    });

    expect(withRemain.valid).toBe(true);
    expect(withRemain.totalReserves).toBe(baseline.totalReserves); // Should be identical when no remain companies
  });

  it("should use default values when remain configuration is missing", () => {
    const withoutConfig = computeReservesFromGraduation(base);
    const withDefaults = computeReservesFromGraduation({
      ...base,
      remainAttempts: 0, // Explicitly disabled
      remainDelayQuarters: 2
    });

    expect(withoutConfig.totalReserves).toBe(withDefaults.totalReserves);
  });
});

