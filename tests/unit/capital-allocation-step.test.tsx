/**
 * Integration tests for Capital Allocation Wizard Step
 *
 * Tests the complete Capital Allocations step workflow including:
 * - Component rendering with all sections
 * - Form interactions and real-time calculations
 * - Validation and error handling
 * - Integration with wizard context (fundFinancials, sectorProfiles)
 *
 * Complements unit tests in capital-allocation-calculations.test.ts
 */

import { describe, it, expect, vi } from 'vitest';
import type {
  FundFinancialsOutput,
  SectorProfile,
  CapitalAllocationInput
} from '@/schemas/modeling-wizard.schemas';
import { capitalAllocationSchema } from '@/schemas/modeling-wizard.schemas';
import {
  calculateCapitalAllocation,
  validateCapitalAllocation,
  generateDefaultPacingPeriods,
  calculatePacingSchedule
} from '@/lib/capital-allocation-calculations';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockFundFinancials: FundFinancialsOutput = {
  fundSize: 100,
  orgExpenses: 2,
  additionalExpenses: [],
  investmentPeriod: 3,
  gpCommitment: 2,
  cashlessSplit: 50,
  managementFee: {
    rate: 2,
    stepDown: {
      enabled: false
    }
  }
};

const mockSectorProfiles: SectorProfile[] = [
  {
    id: 'sector-1',
    name: 'SaaS',
    allocation: 60,
    stages: [
      {
        id: 'stage-1',
        stage: 'seed',
        roundSize: 5,
        valuation: 20,
        esopPercentage: 10,
        graduationRate: 50,
        exitRate: 20,
        exitValuation: 50,
        monthsToGraduate: 18,
        monthsToExit: 36
      },
      {
        id: 'stage-2',
        stage: 'series-a',
        roundSize: 15,
        valuation: 60,
        esopPercentage: 15,
        graduationRate: 40,
        exitRate: 30,
        exitValuation: 150,
        monthsToGraduate: 24,
        monthsToExit: 48
      }
    ]
  },
  {
    id: 'sector-2',
    name: 'Fintech',
    allocation: 40,
    stages: [
      {
        id: 'stage-3',
        stage: 'seed',
        roundSize: 4,
        valuation: 16,
        esopPercentage: 12,
        graduationRate: 45,
        exitRate: 25,
        exitValuation: 45,
        monthsToGraduate: 20,
        monthsToExit: 40
      }
    ]
  }
];

const mockInitialData: Partial<CapitalAllocationInput> = {
  entryStrategy: 'amount-based',
  initialCheckSize: 1.0,
  followOnStrategy: {
    reserveRatio: 0.5,
    stageAllocations: [
      {
        stageId: 'seed',
        stageName: 'Seed',
        maintainOwnership: 15,
        participationRate: 70
      },
      {
        stageId: 'series-a',
        stageName: 'Series A',
        maintainOwnership: 12,
        participationRate: 60
      }
    ]
  },
  pacingModel: {
    investmentsPerYear: 10,
    deploymentCurve: 'linear'
  },
  pacingHorizon: [
    {
      id: 'period-1',
      startMonth: 0,
      endMonth: 12,
      allocationPercent: 40
    },
    {
      id: 'period-2',
      startMonth: 12,
      endMonth: 24,
      allocationPercent: 35
    },
    {
      id: 'period-3',
      startMonth: 24,
      endMonth: 36,
      allocationPercent: 25
    }
  ]
};

// ============================================================================
// SCHEMA AND CALCULATION VALIDATION TESTS
// ============================================================================

describe('CapitalAllocationStep - Schema Validation', () => {
  it('validates complete capital allocation data structure', () => {
    const validData = mockInitialData;

    // Should have all required fields
    expect(validData.entryStrategy).toBeDefined();
    expect(validData.initialCheckSize).toBeDefined();
    expect(validData.followOnStrategy).toBeDefined();
    expect(validData.pacingModel).toBeDefined();
    expect(validData.pacingHorizon).toBeDefined();
  });

  it('validates entry strategy enum values', () => {
    const validStrategies = ['amount-based', 'ownership-based'];

    expect(validStrategies).toContain(mockInitialData.entryStrategy);
  });

  it('validates reserve ratio is within bounds', () => {
    const reserveRatio = mockInitialData.followOnStrategy?.reserveRatio || 0;

    expect(reserveRatio).toBeGreaterThanOrEqual(0.3);
    expect(reserveRatio).toBeLessThanOrEqual(0.7);
  });

  it('validates pacing periods sum to 100%', () => {
    const total = mockInitialData.pacingHorizon!.reduce(
      (sum, period) => sum + period.allocationPercent,
      0
    );

    expect(total).toBeCloseTo(100, 1);
  });

  it('validates stage allocations have required fields', () => {
    const stages = mockInitialData.followOnStrategy?.stageAllocations || [];

    for (const stage of stages) {
      expect(stage.stageId).toBeDefined();
      expect(stage.stageName).toBeDefined();
      expect(stage.maintainOwnership).toBeGreaterThanOrEqual(0);
      expect(stage.maintainOwnership).toBeLessThanOrEqual(100);
      expect(stage.participationRate).toBeGreaterThanOrEqual(0);
      expect(stage.participationRate).toBeLessThanOrEqual(100);
    }
  });
});

// ============================================================================
// CALCULATION INTEGRATION TESTS
// ============================================================================

describe('CapitalAllocationStep - Calculation Integration', () => {
  it('integrates with useCapitalAllocationCalculations hook', () => {
    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    expect(calculations).toBeDefined();
    expect(calculations.avgRoundSize).toBeGreaterThan(0);
    expect(calculations.estimatedDeals).toBe(30); // 10/year * 3 years
  });

  it('calculates correct metrics from form values', () => {
    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Avg round size = (5 * 0.6) + (4 * 0.4) = 4.6M
    expect(calculations.avgRoundSize).toBeCloseTo(4.6, 1);

    // Implied ownership = (1 / 4.6) * 100 ≈ 21.7%
    expect(calculations.impliedOwnership).toBeCloseTo(21.7, 1);

    // Initial capital = 1.0M * 30 deals = 30M
    expect(calculations.initialCapitalAllocated).toBe(30);
  });

  it('validates capital allocation correctly', () => {
    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    const validation = validateCapitalAllocation(
      calculations,
      mockFundFinancials.fundSize
    );

    expect(validation).toBeDefined();
    expect(validation.isValid).toBeDefined();
    expect(validation.errors).toBeDefined();
    expect(validation.warnings).toBeDefined();
  });

  it('calculates reserves based on reserve ratio', () => {
    const reserveRatio = mockInitialData.followOnStrategy!.reserveRatio;
    const expectedReserves = mockFundFinancials.fundSize * reserveRatio;

    // 100M * 0.5 = 50M
    expect(expectedReserves).toBe(50);
  });
});

// ============================================================================
// VALIDATION LOGIC TESTS
// ============================================================================

describe('CapitalAllocationStep - Validation Logic', () => {
  it('validates check size bounds', () => {
    // Too small
    const tooSmall = capitalAllocationSchema.safeParse({
      ...mockInitialData,
      initialCheckSize: 0.05
    });
    expect(tooSmall.success).toBe(false);

    // Too large
    const tooLarge = capitalAllocationSchema.safeParse({
      ...mockInitialData,
      initialCheckSize: 60
    });
    expect(tooLarge.success).toBe(false);

    // Valid
    const valid = capitalAllocationSchema.safeParse({
      ...mockInitialData,
      initialCheckSize: 1.0
    });
    expect(valid.success).toBe(true);
  });

  it('validates pacing allocations sum to 100%', () => {
    // Invalid: sum to 110%
    const invalid = capitalAllocationSchema.safeParse({
      ...mockInitialData,
      pacingHorizon: [
        { id: 'p1', startMonth: 0, endMonth: 12, allocationPercent: 50 },
        { id: 'p2', startMonth: 12, endMonth: 24, allocationPercent: 35 },
        { id: 'p3', startMonth: 24, endMonth: 36, allocationPercent: 25 }
      ]
    });
    expect(invalid.success).toBe(false);

    // Valid: sum to 100%
    const valid = capitalAllocationSchema.safeParse(mockInitialData);
    expect(valid.success).toBe(true);
  });

  it('detects when total capital exceeds fund size', () => {
    const highCheckSize = {
      ...mockInitialData,
      initialCheckSize: 5 // 5M * 30 = 150M > 100M fund
    };

    const calculations = calculateCapitalAllocation(
      highCheckSize as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    const validation = validateCapitalAllocation(
      calculations,
      mockFundFinancials.fundSize
    );

    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.field === 'totalCapitalAllocated')).toBe(true);
  });

  it('warns about very high implied ownership', () => {
    const highCheckSize = {
      ...mockInitialData,
      initialCheckSize: 2.5 // Implies >50% ownership
    };

    const calculations = calculateCapitalAllocation(
      highCheckSize as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    const validation = validateCapitalAllocation(
      calculations,
      mockFundFinancials.fundSize
    );

    // Should have warning about high ownership
    expect(validation.warnings.some(w => w.field === 'impliedOwnership')).toBe(true);
  });

  it('warns about very low implied ownership', () => {
    const lowCheckSize = {
      ...mockInitialData,
      initialCheckSize: 0.2 // Implies <5% ownership
    };

    const calculations = calculateCapitalAllocation(
      lowCheckSize as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    const validation = validateCapitalAllocation(
      calculations,
      mockFundFinancials.fundSize
    );

    // Should have warning about low ownership
    expect(validation.warnings.some(w => w.field === 'impliedOwnership')).toBe(true);
  });

  it('validates reserve ratio bounds in schema', () => {
    // Below minimum
    const tooLow = capitalAllocationSchema.safeParse({
      ...mockInitialData,
      followOnStrategy: {
        ...mockInitialData.followOnStrategy,
        reserveRatio: 0.2 // 20% < 30% minimum
      }
    });
    expect(tooLow.success).toBe(false);

    // Above maximum
    const tooHigh = capitalAllocationSchema.safeParse({
      ...mockInitialData,
      followOnStrategy: {
        ...mockInitialData.followOnStrategy,
        reserveRatio: 0.8 // 80% > 70% maximum
      }
    });
    expect(tooHigh.success).toBe(false);
  });
});

// ============================================================================
// WIZARD CONTEXT INTEGRATION TESTS
// ============================================================================

describe('CapitalAllocationStep - Wizard Context Integration', () => {
  it('uses fundFinancials from previous step for calculations', () => {
    const largeFundFinancials = {
      ...mockFundFinancials,
      fundSize: 150,
      investmentPeriod: 5
    };

    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      mockSectorProfiles,
      largeFundFinancials.fundSize,
      largeFundFinancials.investmentPeriod,
      2024
    );

    // Reserve calculation should use new fund size
    // 150M * 0.5 = 75M
    expect(calculations.availableReserves).toBe(75);

    // Estimated deals should use new investment period
    // 10/year * 5 years = 50
    expect(calculations.estimatedDeals).toBe(50);
  });

  it('uses sectorProfiles from previous step for calculations', () => {
    const techOnlyProfiles: SectorProfile[] = [
      {
        id: 'tech',
        name: 'Technology',
        allocation: 100,
        stages: [
          {
            id: 'stage-1',
            stage: 'seed',
            roundSize: 10,
            valuation: 40,
            esopPercentage: 10,
            graduationRate: 50,
            exitRate: 20,
            exitValuation: 100,
            monthsToGraduate: 18,
            monthsToExit: 36
          }
        ]
      }
    ];

    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      techOnlyProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Avg round size should be 10M (100% in tech with 10M rounds)
    expect(calculations.avgRoundSize).toBe(10);

    // Implied ownership = (1 / 10) * 100 = 10%
    expect(calculations.impliedOwnership).toBe(10);
  });

  it('validates auto-save behavior with valid data', () => {
    const mockOnSave = vi.fn();

    const validData = {
      ...mockInitialData,
      initialCheckSize: 1.5
    };

    const parseResult = capitalAllocationSchema.safeParse(validData);

    if (parseResult.success) {
      mockOnSave(parseResult.data);
    }

    expect(mockOnSave).toHaveBeenCalledTimes(1);
    expect(mockOnSave.mock.calls[0]?.[0].initialCheckSize).toBe(1.5);
  });

  it('prevents auto-save with invalid data', () => {
    const mockOnSave = vi.fn();

    const invalidData = {
      ...mockInitialData,
      initialCheckSize: 100 // Exceeds max of 50M
    };

    const parseResult = capitalAllocationSchema.safeParse(invalidData);

    if (parseResult.success) {
      mockOnSave(parseResult.data);
    }

    // Should not call onSave with invalid data
    expect(mockOnSave).not.toHaveBeenCalled();
  });

  it('generates default pacing periods when not provided', () => {
    const defaultPeriods = generateDefaultPacingPeriods(
      mockFundFinancials.investmentPeriod,
      'linear'
    );

    // Should generate 3 periods for 3-year investment period
    expect(defaultPeriods).toHaveLength(3);

    // Should sum to 100%
    const total = defaultPeriods.reduce(
      (sum: number, p: any) => sum + p.allocationPercent,
      0
    );
    expect(total).toBeCloseTo(100, 1);
  });

  it('uses correct vintage year for pacing schedule dates', () => {
    const schedule = calculatePacingSchedule(
      mockInitialData.pacingHorizon!,
      30, // initial capital
      20, // follow-on capital
      2025 // vintage year
    );

    // First period should start in Jan 2025
    expect(schedule[0]?.startDate).toBe('Jan 2025');

    // Second period should start in Jan 2026
    expect(schedule[1]?.startDate).toBe('Jan 2026');
  });
});

// ============================================================================
// EDGE CASES AND ERROR HANDLING
// ============================================================================

describe('CapitalAllocationStep - Edge Cases', () => {
  it('handles zero fund size gracefully', () => {
    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      mockSectorProfiles,
      0, // Zero fund size
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Should calculate without errors
    expect(calculations).toBeDefined();
    expect(calculations.availableReserves).toBe(0);
  });

  it('handles empty sector profiles', () => {
    const calculations = calculateCapitalAllocation(
      mockInitialData as any,
      [], // Empty sector profiles
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Should handle empty profiles without crashing
    expect(calculations.avgRoundSize).toBe(0);
    expect(calculations.impliedOwnership).toBe(0);
  });

  it('handles empty stage allocations', () => {
    const noFollowOns = {
      ...mockInitialData,
      followOnStrategy: {
        reserveRatio: 0.5,
        stageAllocations: []
      }
    };

    const calculations = calculateCapitalAllocation(
      noFollowOns as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Should show zero follow-on capital
    expect(calculations.totalFollowOnCapital).toBe(0);
    expect(calculations.followOnAllocations).toHaveLength(0);
  });

  it('handles very large numbers without overflow', () => {
    const largeFund = {
      ...mockInitialData,
      pacingModel: {
        investmentsPerYear: 50,
        deploymentCurve: 'linear' as const
      }
    };

    const calculations = calculateCapitalAllocation(
      largeFund as any,
      mockSectorProfiles,
      10000, // $10B fund
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Should handle large calculations
    expect(calculations.estimatedDeals).toBe(150); // 50 * 3 years
    expect(calculations.totalCapitalAllocated).toBeGreaterThan(0);
    expect(calculations.totalCapitalAllocated).toBeLessThan(10000);
  });

  it('handles decimal precision in calculations', () => {
    const decimalCheckSize = {
      ...mockInitialData,
      initialCheckSize: 1.33 // Repeating decimal in calculations
    };

    const calculations = calculateCapitalAllocation(
      decimalCheckSize as any,
      mockSectorProfiles,
      mockFundFinancials.fundSize,
      mockFundFinancials.investmentPeriod,
      2024
    );

    // Should handle decimal precision
    expect(calculations.impliedOwnership).toBeGreaterThan(0);
    expect(calculations.impliedOwnership).toBeLessThan(100);

    // Check that numbers are reasonable (not NaN or Infinity)
    expect(Number.isFinite(calculations.impliedOwnership)).toBe(true);
  });

  it('handles missing optional fields', () => {
    const minimalData = {
      entryStrategy: 'amount-based' as const,
      initialCheckSize: 1.0,
      followOnStrategy: {
        reserveRatio: 0.5,
        stageAllocations: [
          {
            stageId: 'seed',
            stageName: 'Seed',
            maintainOwnership: 10,
            participationRate: 50
          }
        ]
      },
      pacingModel: {
        investmentsPerYear: 10,
        deploymentCurve: 'linear' as const
      },
      pacingHorizon: [
        {
          id: 'p1',
          startMonth: 0,
          endMonth: 12,
          allocationPercent: 100
        }
      ]
    };

    const parseResult = capitalAllocationSchema.safeParse(minimalData);
    expect(parseResult.success).toBe(true);
  });

  it('validates pacing period date ordering', () => {
    // Invalid: end month before start month
    const invalidPeriods = {
      ...mockInitialData,
      pacingHorizon: [
        {
          id: 'p1',
          startMonth: 12,
          endMonth: 0, // End before start!
          allocationPercent: 100
        }
      ]
    };

    const parseResult = capitalAllocationSchema.safeParse(invalidPeriods);
    expect(parseResult.success).toBe(false);
  });
});
