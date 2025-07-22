import { describe, it, expect } from 'vitest';
import { fundSchema, waterfallSchema } from '../server/validators/fundSchema';
import type { CompleteFundSetup, Waterfall } from '@shared/types';

describe.skip('Fund Schema Updates', () => {
  const baseFundData: CompleteFundSetup = {
    name: 'Test Fund',
    size: 100000000,
    deployedCapital: 0,
    managementFee: 0.02,
    carryPercentage: 0.20,
    vintageYear: 2024,
    isEvergreen: false,
    lifeYears: 10,
    investmentHorizonYears: 5,
    investmentStrategy: {
      stages: [
        { id: 'stage-1', name: 'Seed', graduationRate: 0, exitRate: 100 }
      ],
      sectorProfiles: [
        { id: 'sector-1', name: 'Tech', targetPercentage: 100 }
      ],
      allocations: [
        { id: 'alloc-1', category: 'Investments', percentage: 100 }
      ]
    },
    exitRecycling: {
      enabled: false,
      recyclePercentage: 0,
      recycleWindowMonths: 24,
      restrictToSameSector: false,
      restrictToSameStage: false,
    },
    waterfall: {
      type: 'EUROPEAN',
      hurdle: 0.08,
      catchUp: 0.08,
      carryVesting: {
        cliffYears: 0,
        vestingYears: 4,
      }
    }
  };

  describe('Number validation for fund fields', () => {
    it('should accept number values for size, deployedCapital, managementFee, carryPercentage', () => {
      const result = fundSchema.safeParse(baseFundData);
      expect(result.success).toBe(true);
    });

    it('should reject negative values for size', () => {
      const invalidData = { ...baseFundData, size: -1000000 };
      const result = fundSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject negative values for deployedCapital', () => {
      const invalidData = { ...baseFundData, deployedCapital: -500000 };
      const result = fundSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe('Waterfall validation updates', () => {
    it('should accept EUROPEAN waterfall type', () => {
      const europeanWaterfall: Waterfall = {
        type: 'EUROPEAN',
        hurdle: 0.08,
        catchUp: 0.08,
        carryVesting: { cliffYears: 0, vestingYears: 4 }
      };
      
      const result = waterfallSchema.safeParse(europeanWaterfall);
      expect(result.success).toBe(true);
    });

    it('should accept AMERICAN waterfall type', () => {
      const americanWaterfall: Waterfall = {
        type: 'AMERICAN',
        hurdle: 0.08,
        catchUp: 0.08,
        carryVesting: { cliffYears: 0, vestingYears: 4 }
      };
      
      const result = waterfallSchema.safeParse(americanWaterfall);
      expect(result.success).toBe(true);
    });

    it('should validate hurdle/catch-up relationship only for EUROPEAN waterfall', () => {
      // EUROPEAN with invalid hurdle/catch-up relationship should fail
      const europeanInvalid: Waterfall = {
        type: 'EUROPEAN',
        hurdle: 0.10, // 10%
        catchUp: 0.08, // 8% (less than hurdle)
        carryVesting: { cliffYears: 0, vestingYears: 4 }
      };
      
      const europeanResult = waterfallSchema.safeParse(europeanInvalid);
      expect(europeanResult.success).toBe(false);

      // AMERICAN with same relationship should pass (validation doesn't apply)
      const americanSame: Waterfall = {
        type: 'AMERICAN',
        hurdle: 0.10, // 10%
        catchUp: 0.08, // 8% (less than hurdle, but OK for American)
        carryVesting: { cliffYears: 0, vestingYears: 4 }
      };
      
      const americanResult = waterfallSchema.safeParse(americanSame);
      expect(americanResult.success).toBe(true);
    });
  });

  describe('Evergreen fund validation', () => {
    it('should require lifeYears for non-evergreen funds', () => {
      const nonEvergreenWithoutLife = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: undefined
      };
      
      const result = fundSchema.safeParse(nonEvergreenWithoutLife);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes('lifeYears'))).toBe(true);
      }
    });

    it('should not require lifeYears for evergreen funds', () => {
      const evergreenFund = {
        ...baseFundData,
        isEvergreen: true,
        lifeYears: undefined
      };
      
      const result = fundSchema.safeParse(evergreenFund);
      expect(result.success).toBe(true);
    });

    it('should validate that investment horizon does not exceed fund life for closed-end funds', () => {
      const invalidFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 10,
        investmentHorizonYears: 15 // Exceeds fund life
      };
      
      const result = fundSchema.safeParse(invalidFund);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        expect(result.error.errors.some(e => e.path.includes('investmentHorizonYears'))).toBe(true);
      }
    });

    it('should allow investment horizon up to fund life for closed-end funds', () => {
      const validFund = {
        ...baseFundData,
        isEvergreen: false,
        lifeYears: 10,
        investmentHorizonYears: 10 // Equals fund life
      };
      
      const result = fundSchema.safeParse(validFund);
      expect(result.success).toBe(true);
    });

    it('should not validate investment horizon against fund life for evergreen funds', () => {
      const evergreenFund = {
        ...baseFundData,
        isEvergreen: true,
        lifeYears: undefined,
        investmentHorizonYears: 20 // Any value should be OK for evergreen
      };
      
      const result = fundSchema.safeParse(evergreenFund);
      expect(result.success).toBe(true);
    });
  });

  describe('Default values', () => {
    it('should use EUROPEAN as default waterfall type', () => {
      const waterfallWithoutType = {
        hurdle: 0.08,
        catchUp: 0.08,
        carryVesting: { cliffYears: 0, vestingYears: 4 }
      };
      
      const result = waterfallSchema.safeParse(waterfallWithoutType);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.type).toBe('EUROPEAN');
      }
    });

    it('should use default hurdle and catch-up values', () => {
      const minimalWaterfall = {
        type: 'EUROPEAN',
        carryVesting: { cliffYears: 0, vestingYears: 4 }
      };
      
      const result = waterfallSchema.safeParse(minimalWaterfall);
      expect(result.success).toBe(true);
      
      if (result.success) {
        expect(result.data.hurdle).toBe(0.08);
        expect(result.data.catchUp).toBe(0.08);
      }
    });
  });
});