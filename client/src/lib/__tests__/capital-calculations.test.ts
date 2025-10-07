/**
 * Tests for capital calculations including schedule patterns
 */

import { describe, it, expect } from 'vitest';
import {
  getSchedulePattern,
  calculateProjections,
  calculateNetInvestableCapital,
  validateCapitalAllocation
} from '../capital-calculations';

describe('getSchedulePattern', () => {
  describe('even distribution', () => {
    it('should distribute evenly over investment period', () => {
      const pattern = getSchedulePattern('even', 5);
      expect(pattern).toEqual([20, 20, 20, 20, 20]);
      expect(pattern.reduce((sum, p) => sum + p, 0)).toBeCloseTo(100);
    });

    it('should handle different investment periods', () => {
      expect(getSchedulePattern('even', 3)).toEqual([33.333333333333336, 33.333333333333336, 33.333333333333336]);
      expect(getSchedulePattern('even', 4)).toEqual([25, 25, 25, 25]);
    });
  });

  describe('front-loaded distribution', () => {
    it('should front-load for 4-year period', () => {
      const pattern = getSchedulePattern('front-loaded', 4);
      expect(pattern).toEqual([40, 30, 20, 10]);
      expect(pattern.reduce((sum, p) => sum + p, 0)).toBe(100);
    });

    it('should front-load for 3-year period', () => {
      const pattern = getSchedulePattern('front-loaded', 3);
      expect(pattern).toEqual([50, 30, 20]);
      expect(pattern.reduce((sum, p) => sum + p, 0)).toBe(100);
    });

    it('should front-load for 5-year period', () => {
      const pattern = getSchedulePattern('front-loaded', 5);
      expect(pattern).toEqual([35, 25, 20, 12, 8]);
      expect(pattern.reduce((sum, p) => sum + p, 0)).toBe(100);
    });

    it('should decrease deployment over time', () => {
      const pattern = getSchedulePattern('front-loaded', 4);
      expect(pattern[0]).toBeGreaterThan(pattern[1]);
      expect(pattern[1]).toBeGreaterThan(pattern[2]);
      expect(pattern[2]).toBeGreaterThan(pattern[3]);
    });
  });

  describe('back-loaded distribution', () => {
    it('should back-load for 4-year period', () => {
      const pattern = getSchedulePattern('back-loaded', 4);
      expect(pattern).toEqual([10, 20, 30, 40]);
      expect(pattern.reduce((sum, p) => sum + p, 0)).toBe(100);
    });

    it('should increase deployment over time', () => {
      const pattern = getSchedulePattern('back-loaded', 4);
      expect(pattern[0]).toBeLessThan(pattern[1]);
      expect(pattern[1]).toBeLessThan(pattern[2]);
      expect(pattern[2]).toBeLessThan(pattern[3]);
    });
  });

  describe('custom distribution', () => {
    it('should use custom schedule when provided', () => {
      const customSchedule = [
        { year: 1, percentage: 50 },
        { year: 2, percentage: 30 },
        { year: 3, percentage: 20 }
      ];
      const pattern = getSchedulePattern('custom', 3, customSchedule);
      expect(pattern).toEqual([50, 30, 20]);
    });

    it('should throw error if custom schedule not provided', () => {
      expect(() => getSchedulePattern('custom', 3)).toThrow('Custom schedule requires customSchedule parameter');
    });

    it('should handle gaps in custom schedule', () => {
      const customSchedule = [
        { year: 1, percentage: 60 },
        { year: 3, percentage: 40 }
      ];
      const pattern = getSchedulePattern('custom', 3, customSchedule);
      expect(pattern).toEqual([60, 0, 40]);
    });
  });
});

describe('calculateProjections', () => {
  const baseData = {
    targetFundSize: 100,
    investmentPeriod: 5,
    gpCommitment: 2.0,
    cashlessSplit: 50,
    managementFeeRate: 2.0,
    stepDownEnabled: false
  };

  describe('with even schedule', () => {
    it('should distribute capital evenly', () => {
      const projections = calculateProjections({ ...baseData, scheduleType: 'even' });

      // Check first 5 years have equal called capital
      expect(projections[0].calledCapital).toBeCloseTo(20); // 100 / 5
      expect(projections[1].calledCapital).toBeCloseTo(20);
      expect(projections[2].calledCapital).toBeCloseTo(20);
      expect(projections[3].calledCapital).toBeCloseTo(20);
      expect(projections[4].calledCapital).toBeCloseTo(20);

      // Years 6-10 should have no capital calls
      expect(projections[5].calledCapital).toBe(0);
      expect(projections[9].calledCapital).toBe(0);
    });
  });

  describe('with front-loaded schedule', () => {
    it('should deploy more capital early', () => {
      const projections = calculateProjections({
        ...baseData,
        investmentPeriod: 4,
        scheduleType: 'front-loaded'
      });

      expect(projections[0].calledCapital).toBeCloseTo(40); // 100 * 0.4
      expect(projections[1].calledCapital).toBeCloseTo(30); // 100 * 0.3
      expect(projections[2].calledCapital).toBeCloseTo(20); // 100 * 0.2
      expect(projections[3].calledCapital).toBeCloseTo(10); // 100 * 0.1
    });
  });

  describe('with back-loaded schedule', () => {
    it('should deploy more capital later', () => {
      const projections = calculateProjections({
        ...baseData,
        investmentPeriod: 4,
        scheduleType: 'back-loaded'
      });

      expect(projections[0].calledCapital).toBeCloseTo(10); // 100 * 0.1
      expect(projections[1].calledCapital).toBeCloseTo(20); // 100 * 0.2
      expect(projections[2].calledCapital).toBeCloseTo(30); // 100 * 0.3
      expect(projections[3].calledCapital).toBeCloseTo(40); // 100 * 0.4
    });
  });

  describe('with custom schedule', () => {
    it('should follow custom deployment pattern', () => {
      const customSchedule = [
        { year: 1, percentage: 60 },
        { year: 2, percentage: 40 }
      ];

      const projections = calculateProjections({
        ...baseData,
        investmentPeriod: 2,
        scheduleType: 'custom',
        customSchedule
      });

      expect(projections[0].calledCapital).toBeCloseTo(60); // 100 * 0.6
      expect(projections[1].calledCapital).toBeCloseTo(40); // 100 * 0.4
    });
  });

  describe('GP commitment calculations', () => {
    it('should split GP commitment between cash and cashless', () => {
      const projections = calculateProjections({ ...baseData, scheduleType: 'even' });

      const yearOne = projections[0];
      const totalGpCommitment = yearOne.calledCapital * (baseData.gpCommitment / 100);

      // With 50% cashless split
      expect(yearOne.gpCashCommitment).toBeCloseTo(totalGpCommitment * 0.5);
      expect(yearOne.gpCashlessCommitment).toBeCloseTo(totalGpCommitment * 0.5);
    });

    it('should handle 100% cash commitment', () => {
      const projections = calculateProjections({
        ...baseData,
        cashlessSplit: 0,
        scheduleType: 'even'
      });

      const yearOne = projections[0];
      const totalGpCommitment = yearOne.calledCapital * (baseData.gpCommitment / 100);

      expect(yearOne.gpCashCommitment).toBeCloseTo(totalGpCommitment);
      expect(yearOne.gpCashlessCommitment).toBe(0);
    });
  });

  describe('management fee calculations', () => {
    it('should calculate management fees correctly', () => {
      const projections = calculateProjections({ ...baseData, scheduleType: 'even' });

      const yearOne = projections[0];
      const expectedFee = (yearOne.calledCapital - yearOne.gpCashlessCommitment) * 0.02;

      expect(yearOne.managementFeeAfterCashless).toBeCloseTo(expectedFee);
    });

    it('should apply step-down after specified year', () => {
      const projections = calculateProjections({
        ...baseData,
        stepDownEnabled: true,
        stepDownYear: 6,
        stepDownRate: 1.5,
        scheduleType: 'even'
      });

      // Years 1-5 should use initial rate
      expect(projections[0].managementFeeRate).toBe(2.0);
      expect(projections[4].managementFeeRate).toBe(2.0);

      // Years 6-10 should use step-down rate
      expect(projections[5].managementFeeRate).toBe(1.5);
      expect(projections[9].managementFeeRate).toBe(1.5);
    });
  });
});

describe('calculateNetInvestableCapital', () => {
  it('should subtract org expenses and fees from fund size', () => {
    const fundSize = 100;
    const orgExpenses = 0.5;
    const projections = [
      { year: 1, calledCapital: 20, gpCashCommitment: 0.2, gpCashlessCommitment: 0.2, managementFeeRate: 2, managementFeeAfterCashless: 0.4 },
      { year: 2, calledCapital: 20, gpCashCommitment: 0.2, gpCashlessCommitment: 0.2, managementFeeRate: 2, managementFeeAfterCashless: 0.4 }
    ];

    const netCapital = calculateNetInvestableCapital(fundSize, orgExpenses, projections);

    // 100 - 0.5 - (0.4 + 0.4) - (0.2 + 0.2) = 98.3
    expect(netCapital).toBeCloseTo(98.3);
  });

  it('should handle zero projections', () => {
    const netCapital = calculateNetInvestableCapital(100, 0.5, []);
    expect(netCapital).toBe(99.5);
  });
});

describe('validateCapitalAllocation', () => {
  it('should pass when allocation is within limit', () => {
    const result = validateCapitalAllocation(50, 100);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('should fail when allocation exceeds limit', () => {
    const result = validateCapitalAllocation(150, 100);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('exceeds');
    expect(result.excess).toBe(50);
  });

  it('should pass when allocation exactly equals limit', () => {
    const result = validateCapitalAllocation(100, 100);
    expect(result.valid).toBe(true);
  });
});
