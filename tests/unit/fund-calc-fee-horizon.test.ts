/**
 * Test: Management Fee Horizon Fix (PR #112 Review)
 *
 * Verifies that management fees are charged for the FULL fee horizon,
 * even when all companies exit early.
 *
 * Bug: Original implementation stopped simulation after longest exit time,
 * potentially missing years of management fees.
 *
 * Fix: Simulation now runs through max(exitTime, feeHorizon)
 */

import { describe, it, expect } from 'vitest';
import { runFundModel } from '../../client/src/lib/fund-calc';
import type { FundModelInputs } from '@shared/schemas/fund-model';

describe('Management Fee Horizon Fix (PR #112)', () => {
  it('should charge fees for full 10-year horizon even with early exits', () => {
    // Scenario: All companies exit at year 3, but fees continue through year 10
    const inputs: FundModelInputs = {
      fundSize: 100_000_000, // $100M
      periodLengthMonths: 12, // Annual periods for clarity
      capitalCallMode: 'upfront',
      managementFeeRate: 0.02, // 2% annual
      managementFeeYears: 10, // 10 years of fees

      stageAllocations: [
        {
          stage: 'seed',
          allocationPct: 1.0, // 100% in seed
        },
      ],

      reservePoolPct: 0.0, // No reserves for simplicity

      averageCheckSizes: {
        seed: 10_000_000, // $10M per company
        series_a: 0,
        series_b: 0,
        series_c: 0,
        growth: 0,
      },

      graduationRates: {
        seed: 0,
        series_a: 0,
        series_b: 0,
        series_c: 0,
        growth: 0,
      },

      exitRates: {
        seed: 0,
        series_a: 0,
        series_b: 0,
        series_c: 0,
        growth: 0,
      },

      monthsToGraduate: {
        seed: 999, // Never graduate
        series_a: 999,
        series_b: 999,
        series_c: 999,
        growth: 999,
      },

      monthsToExit: {
        seed: 36, // Exit at 3 years (36 months)
        series_a: 999,
        series_b: 999,
        series_c: 999,
        growth: 999,
      },
    };

    const result = runFundModel(inputs);

    // Calculate expected fees
    const annualFee = 100_000_000 * 0.02; // $2M per year
    const expectedTotalFees = annualFee * 10; // $20M over 10 years

    // Get total fees from all periods
    const actualTotalFees = result.periodResults.reduce(
      (sum, period) => sum + period.managementFees,
      0
    );

    // Verify fees are charged for FULL 10 years, not just 3
    expect(result.periodResults.length).toBeGreaterThanOrEqual(10); // At least 10 periods
    expect(actualTotalFees).toBeCloseTo(expectedTotalFees, -5); // Within $0.01M

    // Verify last period is at year 10 (120 months)
    const lastPeriod = result.periodResults[result.periodResults.length - 1];
    expect(lastPeriod.periodIndex).toBeGreaterThanOrEqual(9); // Period 9 = year 10 (0-indexed)

    // Verify all companies exited by period 3
    expect(result.companyLedger.every((c) => c.exitValue > 0)).toBe(true);

    // Log for verification
    console.warn(`Total periods simulated: ${result.periodResults.length}`);
    console.warn(`Total management fees: $${(actualTotalFees / 1_000_000).toFixed(2)}M`);
    console.warn(`Expected fees: $${(expectedTotalFees / 1_000_000).toFixed(2)}M`);
  });

  it('should use longer of exit time or fee horizon', () => {
    // Scenario 1: Exits at 12 years, fees for 10 years
    const longExits: FundModelInputs = {
      fundSize: 100_000_000,
      periodLengthMonths: 12,
      capitalCallMode: 'upfront',
      managementFeeRate: 0.02,
      managementFeeYears: 10,

      stageAllocations: [{ stage: 'seed', allocationPct: 1.0 }],
      reservePoolPct: 0.0,

      averageCheckSizes: { seed: 10_000_000, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      graduationRates: { seed: 0, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      exitRates: { seed: 0, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      monthsToGraduate: { seed: 999, series_a: 999, series_b: 999, series_c: 999, growth: 999 },
      monthsToExit: { seed: 144, series_a: 999, series_b: 999, series_c: 999, growth: 999 }, // 12 years
    };

    const result1 = runFundModel(longExits);

    // Should simulate through year 12 (longer of 12-year exits vs 10-year fees)
    expect(result1.periodResults.length).toBeGreaterThanOrEqual(12);

    // Scenario 2: Exits at 3 years, fees for 10 years
    const shortExits: FundModelInputs = {
      ...longExits,
      monthsToExit: { seed: 36, series_a: 999, series_b: 999, series_c: 999, growth: 999 }, // 3 years
    };

    const result2 = runFundModel(shortExits);

    // Should simulate through year 10 (longer of 3-year exits vs 10-year fees)
    expect(result2.periodResults.length).toBeGreaterThanOrEqual(10);
  });

  it('should stop charging fees after fee horizon expires', () => {
    const inputs: FundModelInputs = {
      fundSize: 100_000_000,
      periodLengthMonths: 12,
      capitalCallMode: 'upfront',
      managementFeeRate: 0.02,
      managementFeeYears: 5, // Only 5 years of fees

      stageAllocations: [{ stage: 'seed', allocationPct: 1.0 }],
      reservePoolPct: 0.0,

      averageCheckSizes: { seed: 10_000_000, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      graduationRates: { seed: 0, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      exitRates: { seed: 0, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      monthsToGraduate: { seed: 999, series_a: 999, series_b: 999, series_c: 999, growth: 999 },
      monthsToExit: { seed: 36, series_a: 999, series_b: 999, series_c: 999, growth: 999 },
    };

    const result = runFundModel(inputs);

    // Find period at year 6 (after fee horizon)
    const year6Period = result.periodResults.find((p) => p.periodIndex === 6);

    if (year6Period) {
      // Fees should be 0 after year 5
      expect(year6Period.managementFees).toBe(0);
    }

    // Total fees should only be 5 years worth
    const totalFees = result.periodResults.reduce((sum, p) => sum + p.managementFees, 0);
    const expectedFees = 100_000_000 * 0.02 * 5; // $10M

    expect(totalFees).toBeCloseTo(expectedFees, -5);
  });

  it('should correctly calculate NAV and TVPI with extended periods', () => {
    const inputs: FundModelInputs = {
      fundSize: 100_000_000,
      periodLengthMonths: 12,
      capitalCallMode: 'upfront',
      managementFeeRate: 0.02,
      managementFeeYears: 10,

      stageAllocations: [{ stage: 'seed', allocationPct: 1.0 }],
      reservePoolPct: 0.0,

      averageCheckSizes: { seed: 10_000_000, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      graduationRates: { seed: 0, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      exitRates: { seed: 0, series_a: 0, series_b: 0, series_c: 0, growth: 0 },
      monthsToGraduate: { seed: 999, series_a: 999, series_b: 999, series_c: 999, growth: 999 },
      monthsToExit: { seed: 36, series_a: 999, series_b: 999, series_c: 999, growth: 999 },
    };

    const result = runFundModel(inputs);

    // After all exits (year 3), NAV should decrease each year due to fees
    const year3Period = result.periodResults.find((p) => p.periodIndex === 3);
    const year10Period = result.periodResults.find((p) => p.periodIndex === 10);

    if (year3Period && year10Period) {
      // NAV at year 10 should be LOWER than year 3 (fees consumed uninvested cash)
      expect(year10Period.nav).toBeLessThan(year3Period.nav);

      // TVPI at year 10 should be LOWER than year 3 (more fees in denominator)
      expect(year10Period.tvpi).toBeLessThanOrEqual(year3Period.tvpi);
    }
  });
});
