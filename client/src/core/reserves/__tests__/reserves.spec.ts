import { describe, it, expect } from "vitest";
import { computeReservesFromGraduation } from "../../reserves/computeReservesFromGraduation";

describe("graduation-driven reserves", () => {
  it("validates row sums and computes a sensible ratio", () => {
    const res = computeReservesFromGraduation({
      totalCommitment: 100_000_000,
      targetCompanies: 30,
      avgCheckSize: 1_666_667,
      deploymentPacePerYear: 10,
      graduationRates: {
        seedToA: { graduate: 35, fail: 35, remain: 30, months: 18 },
        aToB:    { graduate: 50, fail: 25, remain: 25, months: 24 },
        bToC:    { graduate: 60, fail: 20, remain: 20, months: 30 },
      },
      followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },
      startQuarter: 0,
      horizonQuarters: 64,
    });

    expect(res.valid).toBe(true);
    expect(res.reserveRatioPct).toBeGreaterThan(0);
    expect(res.aggregateByStage.A + res.aggregateByStage.B + res.aggregateByStage.C)
      .toBeGreaterThan(0);
  });

  it("flags invalid rows when not summing to 100", () => {
    const res = computeReservesFromGraduation({
      totalCommitment: 100_000_000,
      targetCompanies: 30,
      avgCheckSize: 1_666_667,
      deploymentPacePerYear: 10,
      graduationRates: {
        seedToA: { graduate: 40, fail: 30, remain: 35, months: 18 }, // 105
        aToB:    { graduate: 50, fail: 25, remain: 25, months: 24 },
        bToC:    { graduate: 60, fail: 20, remain: 20, months: 30 },
      },
      followOnChecks: { A: 800_000, B: 1_500_000, C: 2_500_000 },
      startQuarter: 0,
      horizonQuarters: 64,
    });

    expect(res.valid).toBe(false);
    expect(res.errors?.length ?? 0).toBeGreaterThan(0);
  });
});
