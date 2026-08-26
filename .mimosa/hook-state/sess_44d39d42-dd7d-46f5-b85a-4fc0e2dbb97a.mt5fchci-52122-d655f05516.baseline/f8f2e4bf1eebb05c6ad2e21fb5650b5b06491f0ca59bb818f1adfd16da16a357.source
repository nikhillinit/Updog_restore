/**
 * Fund Math - Fee Calculations Tests
 *
 * Validates fee timeline computation with tiers, holidays, caps, and recycling
 */

import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeFeeBasisTimeline, type FeeBasisConfig } from '@shared/lib/fund-math';
import type { FeeProfile } from '@shared/schemas/fee-profile';

describe('Fund Math - Fee Calculations', () => {
  it('should compute basic fee timeline with single tier', () => {
    const feeProfile: FeeProfile = {
      id: 'test-profile',
      name: 'Standard 2%',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: new Decimal(0.02), // 2%
          startYear: 1,
          endYear: 10
        }
      ]
    };

    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 40,
      feeProfile
    };

    const timeline = computeFeeBasisTimeline(config);

    expect(timeline.periods.length).toBe(40);

    // Each quarter should have fees (quarterly = annual / 4)
    const q4 = timeline.periods[4]; // Year 1, Q1
    expect(q4?.managementFees.toNumber()).toBeGreaterThan(0);

    // Annual fees should be ~2% of committed capital
    const yearOneFees = timeline.periods
      .slice(0, 4)
      .reduce((sum, p) => sum.plus(p.managementFees), new Decimal(0));

    const expectedAnnual = config.fundSize.times(0.02);
    expect(yearOneFees.toNumber()).toBeCloseTo(expectedAnnual.toNumber(), -3);
  });

  it('should handle tier transitions (step-downs)', () => {
    const feeProfile: FeeProfile = {
      id: 'stepdown-profile',
      name: 'Step-Down Fees',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: new Decimal(0.02), // 2% years 1-5
          startYear: 1,
          endYear: 5
        },
        {
          basis: 'fair_market_value',
          annualRatePercent: new Decimal(0.015), // 1.5% years 6-10
          startYear: 6,
          endYear: 10
        }
      ]
    };

    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 40,
      feeProfile,
      fmvSchedule: Array(40).fill(new Decimal(120_000_000)) // Constant FMV
    };

    const timeline = computeFeeBasisTimeline(config);

    // Year 1 fees (committed capital basis)
    const year1Fees = timeline.periods
      .slice(0, 4)
      .reduce((sum, p) => sum.plus(p.managementFees), new Decimal(0));

    // Year 6 fees (FMV basis)
    const year6Fees = timeline.periods
      .slice(20, 24)
      .reduce((sum, p) => sum.plus(p.managementFees), new Decimal(0));

    expect(year1Fees.toNumber()).toBeGreaterThan(0);
    expect(year6Fees.toNumber()).toBeGreaterThan(0);

    // Year 6 should use different basis (FMV > committed)
    // 1.5% of 120M > 2% of 100M
    expect(year6Fees.toNumber()).toBeLessThan(year1Fees.toNumber());
  });

  it('should respect fee holidays', () => {
    const feeProfile: FeeProfile = {
      id: 'holiday-profile',
      name: 'Holiday Fees',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: new Decimal(0.02),
          startYear: 1
        }
      ],
      feeHolidays: [
        {
          startMonth: 12, // Year 1, Q4
          durationMonths: 6 // 2 quarters
        }
      ]
    };

    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 40,
      feeProfile
    };

    const timeline = computeFeeBasisTimeline(config);

    // Q4-Q5 (months 12-17) should have zero fees
    const q4 = timeline.periods[4];
    const q5 = timeline.periods[5];

    expect(q4?.managementFees.toNumber()).toBe(0);
    expect(q5?.managementFees.toNumber()).toBe(0);

    // Q3 and Q6 should have normal fees
    const q3 = timeline.periods[3];
    const q6 = timeline.periods[6];

    expect(q3?.managementFees.toNumber()).toBeGreaterThan(0);
    expect(q6?.managementFees.toNumber()).toBeGreaterThan(0);
  });

  it('should apply percentage caps', () => {
    const feeProfile: FeeProfile = {
      id: 'capped-profile',
      name: 'Capped Fees',
      tiers: [
        {
          basis: 'fair_market_value',
          annualRatePercent: new Decimal(0.05), // 5% (unrealistically high)
          startYear: 1,
          capPercent: new Decimal(0.02) // Cap at 2%
        }
      ]
    };

    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 40,
      feeProfile,
      fmvSchedule: Array(40).fill(new Decimal(100_000_000))
    };

    const timeline = computeFeeBasisTimeline(config);

    // Annual fees should be capped at 2% of FMV
    const yearOneFees = timeline.periods
      .slice(0, 4)
      .reduce((sum, p) => sum.plus(p.managementFees), new Decimal(0));

    const expectedCap = new Decimal(100_000_000).times(0.02);
    expect(yearOneFees.toNumber()).toBeLessThanOrEqual(expectedCap.toNumber());
  });

  it('should calculate recyclable fees within term', () => {
    const feeProfile: FeeProfile = {
      id: 'recycling-profile',
      name: 'Recycling Fees',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: new Decimal(0.02),
          startYear: 1
        }
      ],
      recyclingPolicy: {
        enabled: true,
        recyclingCapPercent: new Decimal(0.10), // 10% cap
        recyclingTermMonths: 60, // 5 years
        basis: 'committed_capital',
        anticipatedRecycling: false
      }
    };

    const config: FeeBasisConfig = {
      fundSize: new Decimal(100_000_000),
      numQuarters: 40,
      feeProfile
    };

    const timeline = computeFeeBasisTimeline(config);

    // Within recycling term (first 5 years), should have recyclable fees
    const q8 = timeline.periods[8]; // Year 2
    expect(q8?.recyclableFees.toNumber()).toBeGreaterThan(0);

    // Recyclable fees should be capped
    const cap = config.fundSize.times(0.10);
    expect(q8?.recyclableFees.toNumber()).toBeLessThanOrEqual(cap.toNumber());

    // After recycling term, no recyclable fees
    const q24 = timeline.periods[24]; // Year 6
    expect(q24?.recyclableFees.toNumber()).toBe(0);
  });

  it('should handle zero fund size gracefully', () => {
    const feeProfile: FeeProfile = {
      id: 'test-profile',
      name: 'Test',
      tiers: [
        {
          basis: 'committed_capital',
          annualRatePercent: new Decimal(0.02),
          startYear: 1
        }
      ]
    };

    const config: FeeBasisConfig = {
      fundSize: new Decimal(0),
      numQuarters: 40,
      feeProfile
    };

    const timeline = computeFeeBasisTimeline(config);

    expect(timeline.periods.length).toBe(40);
    expect(timeline.totalFees.toNumber()).toBe(0);
  });
});
