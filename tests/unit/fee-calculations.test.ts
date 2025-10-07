/**
 * Fee Calculations Tests
 *
 * Comprehensive test suite for all fee calculation functions
 */

import { describe, it, expect } from 'vitest';
import {
  calculateManagementFees,
  calculateTotalManagementFees,
  calculateCarriedInterest,
  calculateEffectiveCarryRate,
  calculateFeeRecycling,
  calculateAdminExpenses,
  calculateTotalAdminExpenses,
  calculateFeeImpact,
  calculateEffectiveFeeRate,
  calculateNetToGrossRatio,
  validateFeeStructure,
  calculateFeeLoad,
  type ManagementFeeConfig,
  type CarryConfig,
  type FeeStructure,
} from '@/lib/fee-calculations';

describe('Management Fee Calculations', () => {
  it('calculates basic management fees without step-down', () => {
    const config: ManagementFeeConfig = {
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
    };

    const fees = calculateManagementFees(config);

    expect(fees).toHaveLength(10);
    expect(fees[0]).toEqual({
      year: 1,
      basisAmount: 100,
      feeRate: 2.0,
      feeAmount: 2.0,
      cumulativeFees: 2.0,
    });
    expect(fees[9]).toEqual({
      year: 10,
      basisAmount: 100,
      feeRate: 2.0,
      feeAmount: 2.0,
      cumulativeFees: 20.0,
    });
  });

  it('calculates management fees with step-down', () => {
    const config: ManagementFeeConfig = {
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
      stepDown: {
        afterYear: 5,
        newRate: 1.0,
      },
    };

    const fees = calculateManagementFees(config);

    // Years 1-5 should use 2.0%
    expect(fees[0]?.feeRate).toBe(2.0);
    expect(fees[4]?.feeRate).toBe(2.0);

    // Years 6-10 should use 1.0%
    expect(fees[5]?.feeRate).toBe(1.0);
    expect(fees[9]?.feeRate).toBe(1.0);

    // Cumulative should be (5 * 2.0) + (5 * 1.0) = 15.0
    expect(fees[9]?.cumulativeFees).toBe(15.0);
  });

  it('calculates total management fees', () => {
    const config: ManagementFeeConfig = {
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
    };

    const total = calculateTotalManagementFees(config);
    expect(total).toBe(20.0);
  });

  it('handles zero fund size', () => {
    const config: ManagementFeeConfig = {
      fundSize: 0,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
    };

    const fees = calculateManagementFees(config);
    expect(fees[0]?.feeAmount).toBe(0);
  });

  it('calculates effective fee rate', () => {
    const config: ManagementFeeConfig = {
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
      stepDown: {
        afterYear: 5,
        newRate: 1.0,
      },
    };

    const fees = calculateManagementFees(config);
    const effectiveRate = calculateEffectiveFeeRate(fees);

    // Average: (5 * 2.0 + 5 * 1.0) / 10 = 1.5%
    expect(effectiveRate).toBe(1.5);
  });
});

describe('Carried Interest Calculations', () => {
  describe('European Waterfall', () => {
    it('calculates carry with 8% hurdle, 20% carry, 100% catch-up', () => {
      const config: CarryConfig = {
        grossReturns: 250,
        investedCapital: 100,
        hurdleRate: 8,
        carryRate: 20,
        catchUpPercentage: 100,
        waterfallType: 'european',
      };

      const result = calculateCarriedInterest(config);

      expect(result.preferredReturn).toBe(108); // 100 * 1.08
      expect(result.returnsAboveHurdle).toBe(142); // 250 - 108
      expect(result.catchUpAmount).toBeGreaterThan(0);
      expect(result.gpCarry).toBeGreaterThan(0);
      expect(result.lpNet).toBe(250 - result.gpCarry);

      // LP should get at least preferred return
      expect(result.lpNet).toBeGreaterThanOrEqual(108);
    });

    it('calculates carry with no hurdle', () => {
      const config: CarryConfig = {
        grossReturns: 200,
        investedCapital: 100,
        hurdleRate: 0,
        carryRate: 20,
        catchUpPercentage: 0,
        waterfallType: 'european',
      };

      const result = calculateCarriedInterest(config);

      expect(result.preferredReturn).toBe(100);
      expect(result.returnsAboveHurdle).toBe(100);
      expect(result.catchUpAmount).toBe(0);
      expect(result.gpCarry).toBe(20); // 20% of 100
      expect(result.lpNet).toBe(180);
    });

    it('returns zero carry when returns below hurdle', () => {
      const config: CarryConfig = {
        grossReturns: 100,
        investedCapital: 100,
        hurdleRate: 8,
        carryRate: 20,
        catchUpPercentage: 100,
        waterfallType: 'european',
      };

      const result = calculateCarriedInterest(config);

      expect(result.gpCarry).toBe(0);
      expect(result.lpNet).toBe(100);
    });

    it('calculates carry with 80% catch-up', () => {
      const config: CarryConfig = {
        grossReturns: 250,
        investedCapital: 100,
        hurdleRate: 8,
        carryRate: 20,
        catchUpPercentage: 80,
        waterfallType: 'european',
      };

      const result = calculateCarriedInterest(config);

      expect(result.preferredReturn).toBe(108);
      expect(result.returnsAboveHurdle).toBe(142);

      // With 80% catch-up, catch-up amount should be capped
      const hurdleAmount = 8; // 100 * 8%
      const maxCatchUp = hurdleAmount * 0.8;
      expect(result.catchUpAmount).toBeLessThanOrEqual(maxCatchUp);
    });

    it('handles exactly at hurdle', () => {
      const config: CarryConfig = {
        grossReturns: 108,
        investedCapital: 100,
        hurdleRate: 8,
        carryRate: 20,
        catchUpPercentage: 100,
        waterfallType: 'european',
      };

      const result = calculateCarriedInterest(config);

      expect(result.returnsAboveHurdle).toBe(0);
      expect(result.gpCarry).toBe(0);
      expect(result.lpNet).toBe(108);
    });
  });

  describe('American Waterfall', () => {
    it('calculates carry using same formula (simplified)', () => {
      const config: CarryConfig = {
        grossReturns: 250,
        investedCapital: 100,
        hurdleRate: 8,
        carryRate: 20,
        catchUpPercentage: 100,
        waterfallType: 'american',
      };

      const result = calculateCarriedInterest(config);

      // Should produce same result as European (simplified implementation)
      expect(result.preferredReturn).toBe(108);
      expect(result.returnsAboveHurdle).toBe(142);
      expect(result.gpCarry).toBeGreaterThan(0);
    });
  });

  it('calculates effective carry rate', () => {
    const config: CarryConfig = {
      grossReturns: 200,
      investedCapital: 100,
      hurdleRate: 0,
      carryRate: 20,
      catchUpPercentage: 0,
      waterfallType: 'european',
    };

    const result = calculateCarriedInterest(config);
    const effectiveRate = calculateEffectiveCarryRate(result, config.grossReturns);

    // GP gets 20 out of 200 = 10%
    expect(effectiveRate).toBe(10);
  });

  it('handles zero returns', () => {
    const config: CarryConfig = {
      grossReturns: 0,
      investedCapital: 100,
      hurdleRate: 8,
      carryRate: 20,
      catchUpPercentage: 100,
      waterfallType: 'european',
    };

    const result = calculateCarriedInterest(config);
    expect(result.gpCarry).toBe(0);
  });
});

describe('Fee Recycling Calculations', () => {
  it('calculates basic fee recycling schedule', () => {
    const fees = calculateManagementFees({
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
    });

    const recycling = calculateFeeRecycling({
      managementFees: fees,
      recyclingCapPercent: 10,
      recyclingTermMonths: 84, // 7 years
      fundSize: 100,
    });

    expect(recycling.totalRecyclable).toBeLessThanOrEqual(10); // 10% of 100
    // Cap is hit after 5 years (5 * $2M = $10M), so only 5 years included
    expect(recycling.recyclingByYear).toHaveLength(5);
    expect(recycling.recyclingByYear[0]?.feeAmount).toBe(2.0); // First year fee
    expect(recycling.totalRecyclable).toBe(10); // Hit the cap
  });

  it('respects recycling cap', () => {
    const fees = calculateManagementFees({
      fundSize: 100,
      feeRate: 5.0, // High fee
      basis: 'committed',
      fundTerm: 10,
    });

    const recycling = calculateFeeRecycling({
      managementFees: fees,
      recyclingCapPercent: 10,
      recyclingTermMonths: 120, // 10 years
      fundSize: 100,
    });

    // Should be capped at 10% of fund size
    expect(recycling.totalRecyclable).toBe(10);
  });

  it('respects recycling term', () => {
    const fees = calculateManagementFees({
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
    });

    const recycling = calculateFeeRecycling({
      managementFees: fees,
      recyclingCapPercent: 50, // High cap
      recyclingTermMonths: 36, // 3 years
      fundSize: 100,
    });

    // Should only include 3 years of fees
    expect(recycling.recyclingByYear).toHaveLength(3);
    expect(recycling.totalRecyclable).toBe(6.0); // 3 years * 2.0
  });

  it('handles zero recycling cap', () => {
    const fees = calculateManagementFees({
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 10,
    });

    const recycling = calculateFeeRecycling({
      managementFees: fees,
      recyclingCapPercent: 0,
      recyclingTermMonths: 84,
      fundSize: 100,
    });

    expect(recycling.totalRecyclable).toBe(0);
    expect(recycling.recyclingByYear).toHaveLength(0);
  });
});

describe('Admin Expenses Calculations', () => {
  it('calculates admin expenses without growth', () => {
    const expenses = calculateAdminExpenses(1.0, 0, 10);

    expect(expenses).toHaveLength(10);
    expect(expenses[0]).toEqual({
      year: 1,
      amount: 1.0,
      cumulative: 1.0,
    });
    expect(expenses[9]).toEqual({
      year: 10,
      amount: 1.0,
      cumulative: 10.0,
    });
  });

  it('calculates admin expenses with 5% growth', () => {
    const expenses = calculateAdminExpenses(1.0, 5, 5);

    expect(expenses[0]?.amount).toBe(1.0);
    expect(expenses[1]?.amount).toBeCloseTo(1.05, 2);
    expect(expenses[2]?.amount).toBeCloseTo(1.1025, 2);
    expect(expenses[4]?.amount).toBeCloseTo(1.2155, 2);
  });

  it('calculates admin expenses with negative growth', () => {
    const expenses = calculateAdminExpenses(1.0, -10, 5);

    expect(expenses[0]?.amount).toBe(1.0);
    expect(expenses[1]?.amount).toBeCloseTo(0.9, 2);
    expect(expenses[2]?.amount).toBeCloseTo(0.81, 2);
  });

  it('calculates total admin expenses', () => {
    const total = calculateTotalAdminExpenses(1.0, 0, 10);
    expect(total).toBe(10.0);
  });
});

describe('Fee Impact Analysis', () => {
  const baseFeeStructure: FeeStructure = {
    managementFee: {
      rate: 2.0,
      basis: 'committed',
    },
    adminExpenses: {
      annualAmount: 0.5,
      growthRate: 0,
    },
  };

  it('calculates fee impact without carry', () => {
    const impact = calculateFeeImpact(100, baseFeeStructure, 10);

    expect(impact.totalManagementFees).toBe(20.0); // 10 years * 2%
    expect(impact.totalAdminExpenses).toBe(5.0); // 10 years * 0.5
    expect(impact.totalCarry).toBe(0);
    expect(impact.yearlyBreakdown).toHaveLength(10);
  });

  it('calculates fee impact with carry', () => {
    const feeStructure: FeeStructure = {
      ...baseFeeStructure,
      carriedInterest: {
        enabled: true,
        rate: 20,
        hurdleRate: 8,
        catchUpPercentage: 100,
        waterfallType: 'european',
      },
    };

    const impact = calculateFeeImpact(100, feeStructure, 10, 250, 90);

    expect(impact.totalManagementFees).toBe(20.0);
    expect(impact.totalAdminExpenses).toBe(5.0);
    expect(impact.totalCarry).toBeGreaterThan(0);
    expect(impact.grossMOIC).toBeCloseTo(2.78, 2); // 250 / 90
    expect(impact.netMOIC).toBeLessThan(impact.grossMOIC);
    expect(impact.feeDragBps).toBeGreaterThan(0);
  });

  it('calculates fee impact with step-down', () => {
    const feeStructure: FeeStructure = {
      ...baseFeeStructure,
      managementFee: {
        rate: 2.0,
        basis: 'committed',
        stepDown: {
          enabled: true,
          afterYear: 5,
          newRate: 1.0,
        },
      },
    };

    const impact = calculateFeeImpact(100, feeStructure, 10);

    expect(impact.totalManagementFees).toBe(15.0); // (5 * 2%) + (5 * 1%)
  });

  it('calculates MOIC correctly', () => {
    const impact = calculateFeeImpact(100, baseFeeStructure, 10, 300, 100);

    expect(impact.grossMOIC).toBe(3.0); // 300 / 100
    // Net MOIC = (300 - 20 mgmt - 5 admin) / 100 = 2.75
    expect(impact.netMOIC).toBeCloseTo(2.75, 2);
  });

  it('calculates fee drag in basis points', () => {
    const impact = calculateFeeImpact(100, baseFeeStructure, 10, 300, 100);

    // Gross return: 200% (300 - 100)
    // Net return: 175% (275 - 100)
    // Fee drag: 25% = 2500 bps
    expect(impact.feeDragBps).toBe(2500);
  });

  it('handles zero invested capital gracefully', () => {
    const impact = calculateFeeImpact(100, baseFeeStructure, 10, 0, 0);

    expect(impact.grossMOIC).toBe(1.0);
    expect(impact.netMOIC).toBe(1.0);
    expect(impact.feeDragBps).toBe(0);
  });
});

describe('Utility Functions', () => {
  it('calculates net-to-gross ratio', () => {
    const ratio = calculateNetToGrossRatio(300, 275);
    expect(ratio).toBeCloseTo(0.9167, 4);
  });

  it('handles zero gross returns in ratio', () => {
    const ratio = calculateNetToGrossRatio(0, 0);
    expect(ratio).toBe(0);
  });

  it('validates fee structure - high management fee', () => {
    const feeStructure: FeeStructure = {
      managementFee: {
        rate: 3.5,
        basis: 'committed',
      },
      adminExpenses: {
        annualAmount: 0.5,
        growthRate: 0,
      },
    };

    const validation = validateFeeStructure(feeStructure);
    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain('Management fee over 3% is above market standards');
  });

  it('validates fee structure - low management fee', () => {
    const feeStructure: FeeStructure = {
      managementFee: {
        rate: 0.5,
        basis: 'committed',
      },
      adminExpenses: {
        annualAmount: 0.5,
        growthRate: 0,
      },
    };

    const validation = validateFeeStructure(feeStructure);
    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain('Management fee under 1% may be unsustainable');
  });

  it('validates fee structure - high carry', () => {
    const feeStructure: FeeStructure = {
      managementFee: {
        rate: 2.0,
        basis: 'committed',
      },
      carriedInterest: {
        enabled: true,
        rate: 30,
        hurdleRate: 8,
        catchUpPercentage: 100,
        waterfallType: 'european',
      },
      adminExpenses: {
        annualAmount: 0.5,
        growthRate: 0,
      },
    };

    const validation = validateFeeStructure(feeStructure);
    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain('Carried interest over 25% is above typical market rates');
  });

  it('validates fee structure - invalid step-down', () => {
    const feeStructure: FeeStructure = {
      managementFee: {
        rate: 2.0,
        basis: 'committed',
        stepDown: {
          enabled: true,
          afterYear: 5,
          newRate: 2.5, // Higher than initial
        },
      },
      adminExpenses: {
        annualAmount: 0.5,
        growthRate: 0,
      },
    };

    const validation = validateFeeStructure(feeStructure);
    expect(validation.valid).toBe(false);
    expect(validation.warnings).toContain('Step-down rate should be lower than initial rate');
  });

  it('calculates fee load', () => {
    const feeLoad = calculateFeeLoad(25, 100);
    expect(feeLoad).toBe(25); // 25% of fund size
  });

  it('handles zero fund size in fee load', () => {
    const feeLoad = calculateFeeLoad(25, 0);
    expect(feeLoad).toBe(0);
  });
});

describe('Edge Cases', () => {
  it('handles very small fund sizes', () => {
    const fees = calculateManagementFees({
      fundSize: 0.1,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 5,
    });

    expect(fees[0]?.feeAmount).toBeCloseTo(0.002, 6);
  });

  it('handles very large fund sizes', () => {
    const fees = calculateManagementFees({
      fundSize: 10000,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 5,
    });

    expect(fees[0]?.feeAmount).toBe(200);
  });

  it('handles 100% hurdle rate', () => {
    const config: CarryConfig = {
      grossReturns: 250,
      investedCapital: 100,
      hurdleRate: 100,
      carryRate: 20,
      catchUpPercentage: 100,
      waterfallType: 'european',
    };

    const result = calculateCarriedInterest(config);
    expect(result.preferredReturn).toBe(200); // 100 * 2.0
  });

  it('handles negative returns', () => {
    const config: CarryConfig = {
      grossReturns: 50,
      investedCapital: 100,
      hurdleRate: 8,
      carryRate: 20,
      catchUpPercentage: 100,
      waterfallType: 'european',
    };

    const result = calculateCarriedInterest(config);
    expect(result.gpCarry).toBe(0);
    expect(result.lpNet).toBe(50);
  });

  it('handles single year fund term', () => {
    const fees = calculateManagementFees({
      fundSize: 100,
      feeRate: 2.0,
      basis: 'committed',
      fundTerm: 1,
    });

    expect(fees).toHaveLength(1);
    expect(fees[0]?.feeAmount).toBe(2.0);
  });
});
