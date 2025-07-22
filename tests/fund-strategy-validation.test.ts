import { describe, it, expect } from 'vitest';
import { fundSchema, investmentStrategySchema, exitRecyclingSchema, waterfallSchema } from '../server/validators/fundSchema';
import type { InvestmentStrategy, ExitRecycling, Waterfall } from '@shared/types';

describe.skip('Fund Strategy Validation Rules', () => {
  describe('Investment Strategy Validation', () => {
    const validStrategy: InvestmentStrategy = {
      stages: [
        { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
        { id: 'stage-2', name: 'Series A', graduationRate: 40, exitRate: 25 },
        { id: 'stage-3', name: 'Series B+', graduationRate: 0, exitRate: 35 }
      ],
      sectorProfiles: [
        { id: 'sector-1', name: 'FinTech', targetPercentage: 40 },
        { id: 'sector-2', name: 'HealthTech', targetPercentage: 30 },
        { id: 'sector-3', name: 'Enterprise SaaS', targetPercentage: 30 }
      ],
      allocations: [
        { id: 'alloc-1', category: 'New Investments', percentage: 75 },
        { id: 'alloc-2', category: 'Reserves', percentage: 20 },
        { id: 'alloc-3', category: 'Operating Expenses', percentage: 5 }
      ]
    };

    it('should accept valid investment strategy', () => {
      const result = investmentStrategySchema.safeParse(validStrategy);
      expect(result.success).toBe(true);
    });

    it('should reject allocation sum exceeding 100%', () => {
      const invalidStrategy = {
        ...validStrategy,
        allocations: [
          { id: 'alloc-1', category: 'New Investments', percentage: 80 },
          { id: 'alloc-2', category: 'Reserves', percentage: 30 }, // Total = 110%
        ]
      };

      const result = investmentStrategySchema.safeParse(invalidStrategy);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.message.includes('Total allocation percentages cannot exceed 100%')
        )).toBe(true);
      }
    });

    it('should reject stage with graduation + exit > 100%', () => {
      const invalidStrategy = {
        ...validStrategy,
        stages: [
          { id: 'stage-1', name: 'Seed', graduationRate: 60, exitRate: 50 }, // Total = 110%
          { id: 'stage-2', name: 'Series A', graduationRate: 0, exitRate: 35 }
        ]
      };

      const result = investmentStrategySchema.safeParse(invalidStrategy);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.message.includes('graduation rate + exit rate cannot exceed 100%')
        )).toBe(true);
      }
    });

    it('should reject non-zero graduation rate for last stage', () => {
      const invalidStrategy = {
        ...validStrategy,
        stages: [
          { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
          { id: 'stage-2', name: 'Series A', graduationRate: 25, exitRate: 35 } // Last stage with graduation > 0
        ]
      };

      const result = investmentStrategySchema.safeParse(invalidStrategy);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.message.includes('Last stage must have graduation rate of 0%')
        )).toBe(true);
      }
    });

    it('should accept zero graduation rate for last stage', () => {
      const validLastStageStrategy = {
        ...validStrategy,
        stages: [
          { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
          { id: 'stage-2', name: 'Final', graduationRate: 0, exitRate: 70 } // Last stage with graduation = 0
        ]
      };

      const result = investmentStrategySchema.safeParse(validLastStageStrategy);
      expect(result.success).toBe(true);
    });
  });

  describe('Exit Recycling Validation', () => {
    const validRecycling: ExitRecycling = {
      enabled: true,
      recyclePercentage: 25,
      recycleWindowMonths: 24,
      restrictToSameSector: false,
      restrictToSameStage: false
    };

    it('should accept valid exit recycling', () => {
      const result = exitRecyclingSchema.safeParse(validRecycling);
      expect(result.success).toBe(true);
    });

    it('should accept disabled recycling with 0%', () => {
      const disabledRecycling = {
        ...validRecycling,
        enabled: false,
        recyclePercentage: 0
      };

      const result = exitRecyclingSchema.safeParse(disabledRecycling);
      expect(result.success).toBe(true);
    });

    it('should reject enabled recycling with 0% percentage', () => {
      const invalidRecycling = {
        ...validRecycling,
        enabled: true,
        recyclePercentage: 0
      };

      const result = exitRecyclingSchema.safeParse(invalidRecycling);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.message.includes('recycle percentage must be greater than 0%')
        )).toBe(true);
      }
    });
  });

  describe('Waterfall Validation', () => {
    const validWaterfall: Waterfall = {
      type: 'american',
      hurdle: 0.08,
      catchUp: 0.10,
      carryVesting: {
        cliffYears: 0,
        vestingYears: 4
      }
    };

    it('should accept valid waterfall', () => {
      const result = waterfallSchema.safeParse(validWaterfall);
      expect(result.success).toBe(true);
    });

    it('should accept equal hurdle and catch-up rates', () => {
      const equalRatesWaterfall = {
        ...validWaterfall,
        hurdle: 0.08,
        catchUp: 0.08
      };

      const result = waterfallSchema.safeParse(equalRatesWaterfall);
      expect(result.success).toBe(true);
    });

    it('should reject catch-up rate lower than hurdle rate', () => {
      const invalidWaterfall = {
        ...validWaterfall,
        hurdle: 0.10,
        catchUp: 0.08 // Lower than hurdle
      };

      const result = waterfallSchema.safeParse(invalidWaterfall);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue => 
          issue.message.includes('Catch-up rate must be greater than or equal to hurdle rate')
        )).toBe(true);
      }
    });
  });

  describe('Complete Fund Schema Validation', () => {
    const validFund = {
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
          { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
          { id: 'stage-2', name: 'Final', graduationRate: 0, exitRate: 35 }
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
        enabled: true,
        recyclePercentage: 25,
        recycleWindowMonths: 24,
        restrictToSameSector: false,
        restrictToSameStage: false
      },
      waterfall: {
        type: 'american' as const,
        hurdle: 0.08,
        catchUp: 0.08,
        carryVesting: {
          cliffYears: 0,
          vestingYears: 4
        }
      }
    };

    it('should accept valid complete fund data', () => {
      const result = fundSchema.safeParse(validFund);
      expect(result.success).toBe(true);
    });

    it('should reject fund with multiple validation errors', () => {
      const invalidFund = {
        ...validFund,
        investmentStrategy: {
          ...validFund.investmentStrategy,
          allocations: [
            { id: 'alloc-1', category: 'New Investments', percentage: 80 },
            { id: 'alloc-2', category: 'Reserves', percentage: 30 } // Total = 110%
          ],
          stages: [
            { id: 'stage-1', name: 'Seed', graduationRate: 30, exitRate: 20 },
            { id: 'stage-2', name: 'Final', graduationRate: 15, exitRate: 35 } // Last stage with graduation > 0
          ]
        },
        exitRecycling: {
          ...validFund.exitRecycling,
          enabled: true,
          recyclePercentage: 0 // Enabled but 0%
        },
        waterfall: {
          ...validFund.waterfall,
          hurdle: 0.10,
          catchUp: 0.08 // Catch-up < hurdle
        }
      };

      const result = fundSchema.safeParse(invalidFund);
      expect(result.success).toBe(false);
      
      if (!result.success) {
        const issues = result.error.issues;
        expect(issues.length).toBeGreaterThan(1); // Multiple validation errors
        expect(issues.some(issue => issue.message.includes('allocation percentages cannot exceed 100%'))).toBe(true);
        expect(issues.some(issue => issue.message.includes('Last stage must have graduation rate of 0%'))).toBe(true);
        expect(issues.some(issue => issue.message.includes('recycle percentage must be greater than 0%'))).toBe(true);
        expect(issues.some(issue => issue.message.includes('Catch-up rate must be greater than or equal to hurdle rate'))).toBe(true);
      }
    });
  });
});