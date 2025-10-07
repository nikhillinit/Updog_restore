/**
 * Lifecycle Rules Tests
 *
 * Validates fund age calculations and lifecycle stage detection
 */

import { describe, it, expect } from 'vitest';
import {
  getFundAge,
  getLifecycleStage,
  shouldForceLiquidation,
  isConstructionPhase,
  getInvestmentPeriodEndQuarter,
  getFundLifeEndQuarter
} from '@shared/lib/lifecycle-rules';

describe('Lifecycle Rules', () => {
  describe('getFundAge', () => {
    it('should calculate fund age from establishment date', () => {
      const establishmentDate = new Date('2020-01-01');
      const asOfDate = new Date('2023-04-15');

      const age = getFundAge(establishmentDate, asOfDate);

      expect(age.years).toBe(3);
      expect(age.months).toBeGreaterThanOrEqual(3);
      expect(age.quarters).toBeGreaterThanOrEqual(13);
      expect(age.totalMonths).toBeGreaterThanOrEqual(39);
    });

    it('should handle string dates', () => {
      const age = getFundAge('2020-01-01', new Date('2021-01-01'));

      expect(age.years).toBe(1);
      expect(age.months).toBe(0);
      expect(age.quarters).toBe(4);
    });

    it('should default to current date when not specified', () => {
      const establishmentDate = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // 1 year ago
      const age = getFundAge(establishmentDate);

      expect(age.years).toBeGreaterThanOrEqual(0);
      expect(age.years).toBeLessThanOrEqual(1);
    });
  });

  describe('getLifecycleStage', () => {
    it('should identify investment stage (years 0-5)', () => {
      const age = { years: 2, months: 6, quarters: 10, totalMonths: 30 };
      const stage = getLifecycleStage(age);

      expect(stage).toBe('investment');
    });

    it('should identify holding stage (years 5-7)', () => {
      const age = { years: 6, months: 0, quarters: 24, totalMonths: 72 };
      const stage = getLifecycleStage(age);

      expect(stage).toBe('holding');
    });

    it('should identify harvest stage (years 7-10)', () => {
      const age = { years: 8, months: 6, quarters: 34, totalMonths: 102 };
      const stage = getLifecycleStage(age);

      expect(stage).toBe('harvest');
    });

    it('should identify liquidation stage (years 10+)', () => {
      const age = { years: 11, months: 0, quarters: 44, totalMonths: 132 };
      const stage = getLifecycleStage(age);

      expect(stage).toBe('liquidation');
    });

    it('should respect custom investment period', () => {
      const age = { years: 4, months: 0, quarters: 16, totalMonths: 48 };
      const stage = getLifecycleStage(age, 3); // 3-year investment period

      expect(stage).toBe('holding'); // Year 4 is holding with 3-year IP
    });
  });

  describe('shouldForceLiquidation', () => {
    it('should return false for young funds', () => {
      const age = { years: 5, months: 0, quarters: 20, totalMonths: 60 };
      expect(shouldForceLiquidation(age)).toBe(false);
    });

    it('should return true for funds beyond max life', () => {
      const age = { years: 13, months: 0, quarters: 52, totalMonths: 156 };
      expect(shouldForceLiquidation(age)).toBe(true);
    });

    it('should respect custom max life', () => {
      const age = { years: 11, months: 0, quarters: 44, totalMonths: 132 };
      expect(shouldForceLiquidation(age, 10)).toBe(true);
      expect(shouldForceLiquidation(age, 15)).toBe(false);
    });
  });

  describe('isConstructionPhase', () => {
    it('should return true for fund in year 0 with no investments', () => {
      const age = { years: 0, months: 6, quarters: 2, totalMonths: 6 };
      const hasInvestments = false;

      expect(isConstructionPhase(age, hasInvestments)).toBe(true);
    });

    it('should return false if fund has investments', () => {
      const age = { years: 0, months: 6, quarters: 2, totalMonths: 6 };
      const hasInvestments = true;

      expect(isConstructionPhase(age, hasInvestments)).toBe(false);
    });

    it('should return false if fund is beyond year 0', () => {
      const age = { years: 1, months: 0, quarters: 4, totalMonths: 12 };
      const hasInvestments = false;

      expect(isConstructionPhase(age, hasInvestments)).toBe(false);
    });
  });

  describe('Helper functions', () => {
    it('should calculate investment period end quarter', () => {
      expect(getInvestmentPeriodEndQuarter(5)).toBe(20);
      expect(getInvestmentPeriodEndQuarter(3)).toBe(12);
    });

    it('should calculate fund life end quarter', () => {
      expect(getFundLifeEndQuarter(10)).toBe(40);
      expect(getFundLifeEndQuarter(12)).toBe(48);
    });
  });
});
