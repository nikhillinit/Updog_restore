import { describe, it, expect } from 'vitest';
import { fundSchema } from '../server/validators/fundSchema';
import type { CompleteFundSetup } from '@shared/types';

describe.skip('Evergreen Fund Validation', () => {
  const baseFundData: CompleteFundSetup = {
    name: "Test Fund",
    size: 100000000,
    deployedCapital: 0,
    managementFee: 0.02,
    carryPercentage: 0.20,
    vintageYear: 2023,
    isEvergreen: false,
    lifeYears: 10,
    investmentHorizonYears: 5,
    investmentStrategy: {
      stages: [
        { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
        { id: 'stage-2', name: 'Series A', graduationRate: 0, exitRate: 25 }
      ],
      sectorProfiles: [
        { id: 'sector-1', name: 'FinTech', targetPercentage: 50 },
        { id: 'sector-2', name: 'HealthTech', targetPercentage: 50 }
      ],
      allocations: [
        { id: 'alloc-1', category: 'New Investments', percentage: 75 },
        { id: 'alloc-2', category: 'Reserves', percentage: 25 }
      ]
    },
    exitRecycling: {
      enabled: false,
      recyclePercentage: 0,
      recycleWindowMonths: 24,
      restrictToSameSector: false,
      restrictToSameStage: false
    },
    waterfall: {
      type: 'american',
      hurdle: 0.08,
      catchUp: 0.08,
      carryVesting: {
        cliffYears: 0,
        vestingYears: 4
      }
    }
  };

  describe('Closed-End Fund Validation', () => {
    it('should pass validation when fund life is provided for closed-end fund', () => {
      const closedEndFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 10,
        investmentHorizonYears: 5
      };

      const result = fundSchema.safeParse(closedEndFund);
      expect(result.success).toBe(true);
    });

    it('should fail validation when fund life is missing for closed-end fund', () => {
      const closedEndFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: undefined, // Missing fund life
        investmentHorizonYears: 5
      };

      const result = fundSchema.safeParse(closedEndFund);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.errors.some(err => 
          err.message === "Fund life is required for closed-end funds"
        )).toBe(true);
      }
    });

    it('should fail validation when investment horizon exceeds fund life', () => {
      const invalidFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 8,
        investmentHorizonYears: 10 // Exceeds fund life
      };

      const result = fundSchema.safeParse(invalidFund);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.errors.some(err => 
          err.message === "Investment horizon cannot exceed fund life"
        )).toBe(true);
      }
    });

    it('should pass validation when investment horizon equals fund life', () => {
      const validFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 10,
        investmentHorizonYears: 10 // Equals fund life
      };

      const result = fundSchema.safeParse(validFund);
      expect(result.success).toBe(true);
    });
  });

  describe('Evergreen Fund Validation', () => {
    it('should pass validation for evergreen fund without fund life', () => {
      const evergreenFund = {
        ...baseFundData,
        isEvergreen: true,
        lifeYears: undefined, // No fund life needed for evergreen
        investmentHorizonYears: 5
      };

      const result = fundSchema.safeParse(evergreenFund);
      expect(result.success).toBe(true);
    });

    it('should pass validation for evergreen fund with any investment horizon', () => {
      const evergreenFund = {
        ...baseFundData,
        isEvergreen: true,
        lifeYears: undefined,
        investmentHorizonYears: 20 // Can be any reasonable value
      };

      const result = fundSchema.safeParse(evergreenFund);
      expect(result.success).toBe(true);
    });

    it('should pass validation for evergreen fund even with fund life specified', () => {
      const evergreenFund = {
        ...baseFundData,
        isEvergreen: true,
        lifeYears: 10, // Optional for evergreen funds
        investmentHorizonYears: 15 // Can exceed fund life for evergreen
      };

      const result = fundSchema.safeParse(evergreenFund);
      expect(result.success).toBe(true);
    });
  });

  describe('European Waterfall Validation', () => {
    it('should validate hurdle and catch-up rates for European waterfall', () => {
      const europeanFund = {
        ...baseFundData,
        waterfall: {
          type: 'european' as const,
          hurdle: 0.10, // 10%
          catchUp: 0.08, // 8% - less than hurdle, should fail
          carryVesting: {
            cliffYears: 0,
            vestingYears: 4
          }
        }
      };

      const result = fundSchema.safeParse(europeanFund);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.errors.some(err => 
          err.message === "Catch-up rate must be greater than or equal to hurdle rate"
        )).toBe(true);
      }
    });

    it('should pass validation when catch-up equals hurdle for European waterfall', () => {
      const europeanFund = {
        ...baseFundData,
        waterfall: {
          type: 'european' as const,
          hurdle: 0.08, // 8%
          catchUp: 0.08, // 8% - equal to hurdle, should pass
          carryVesting: {
            cliffYears: 0,
            vestingYears: 4
          }
        }
      };

      const result = fundSchema.safeParse(europeanFund);
      expect(result.success).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    it('should handle minimum fund life constraint', () => {
      const minLifeFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 2, // Below minimum of 3
        investmentHorizonYears: 1
      };

      const result = fundSchema.safeParse(minLifeFund);
      expect(result.success).toBe(false);
    });

    it('should handle maximum fund life constraint', () => {
      const maxLifeFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 25, // Above maximum of 20
        investmentHorizonYears: 5
      };

      const result = fundSchema.safeParse(maxLifeFund);
      expect(result.success).toBe(false);
    });

    it('should handle minimum investment horizon constraint', () => {
      const minHorizonFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 10,
        investmentHorizonYears: 0 // Below minimum of 1
      };

      const result = fundSchema.safeParse(minHorizonFund);
      expect(result.success).toBe(false);
    });
  });
});