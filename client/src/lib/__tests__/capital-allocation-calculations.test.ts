/**
 * Tests for capital allocation calculations
 */

import { describe, it, expect } from 'vitest';
import {
  calculateWeightedAvgRoundSize,
  calculateImpliedOwnership,
  calculateEstimatedDeals,
  calculateInitialCapitalAllocated,
  calculateFollowOnCheckForOwnership,
  calculateFollowOnCascade,
  calculatePacingSchedule,
  generateDefaultPacingPeriods,
  calculateCapitalAllocation,
  validateCapitalAllocation,
  type CapitalAllocationCalculations
} from '../capital-allocation-calculations';
import type {
  SectorProfile,
  CapitalAllocationInput,
  PacingPeriod
} from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TEST FIXTURES
// ============================================================================

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
        failureRate: 30,
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
        failureRate: 30,
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
        failureRate: 30,
        exitValuation: 45,
        monthsToGraduate: 20,
        monthsToExit: 40
      }
    ]
  }
];

const mockCapitalAllocation: CapitalAllocationInput = {
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
// INITIAL INVESTMENT CALCULATIONS
// ============================================================================

describe('calculateWeightedAvgRoundSize', () => {
  it('should calculate weighted average across sectors', () => {
    const avgRoundSize = calculateWeightedAvgRoundSize(mockSectorProfiles);
    // (5 * 0.6) + (4 * 0.4) = 3.0 + 1.6 = 4.6
    expect(avgRoundSize).toBeCloseTo(4.6, 2);
  });

  it('should return 0 for empty sector profiles', () => {
    expect(calculateWeightedAvgRoundSize([])).toBe(0);
  });

  it('should handle single sector', () => {
    const singleSector: SectorProfile[] = [
      {
        id: 'sector-1',
        name: 'SaaS',
        allocation: 100,
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
          }
        ]
      }
    ];
    expect(calculateWeightedAvgRoundSize(singleSector)).toBe(5);
  });
});

describe('calculateImpliedOwnership', () => {
  it('should calculate ownership percentage', () => {
    const ownership = calculateImpliedOwnership(1.0, 5.0);
    expect(ownership).toBe(20); // (1 / 5) * 100 = 20%
  });

  it('should handle zero round size', () => {
    expect(calculateImpliedOwnership(1.0, 0)).toBe(0);
  });

  it('should calculate for different check sizes', () => {
    expect(calculateImpliedOwnership(2.0, 10.0)).toBe(20);
    expect(calculateImpliedOwnership(0.5, 5.0)).toBe(10);
  });
});

describe('calculateEstimatedDeals', () => {
  it('should multiply investments per year by period', () => {
    expect(calculateEstimatedDeals(10, 3)).toBe(30);
    expect(calculateEstimatedDeals(15, 4)).toBe(60);
  });

  it('should handle edge cases', () => {
    expect(calculateEstimatedDeals(1, 1)).toBe(1);
    expect(calculateEstimatedDeals(50, 5)).toBe(250);
  });
});

describe('calculateInitialCapitalAllocated', () => {
  it('should multiply check size by number of deals', () => {
    expect(calculateInitialCapitalAllocated(1.0, 30)).toBe(30);
    expect(calculateInitialCapitalAllocated(2.5, 20)).toBe(50);
  });

  it('should handle fractional amounts', () => {
    const capital = calculateInitialCapitalAllocated(1.5, 33);
    expect(capital).toBeCloseTo(49.5, 2);
  });
});

// ============================================================================
// FOLLOW-ON CALCULATIONS
// ============================================================================

describe('calculateFollowOnCheckForOwnership', () => {
  it('should calculate follow-on check to maintain ownership', () => {
    // Starting with 20% ownership in $20M valuation = $4M invested
    // New round raises $15M at $60M post-money
    // To maintain 20%: need (0.20 * 60) - 4 = 12 - 4 = $8M
    const checkSize = calculateFollowOnCheckForOwnership(
      20,      // current ownership %
      20,      // target ownership %
      15,      // new round size
      45,      // pre-money valuation (60 - 15)
      0        // no ESOP
    );

    expect(checkSize).toBeGreaterThan(0);
    expect(checkSize).toBeLessThan(15); // Can't exceed round size
  });

  it('should handle no follow-on needed when already above target', () => {
    const checkSize = calculateFollowOnCheckForOwnership(
      25,      // current ownership % (already high)
      20,      // target ownership %
      10,      // new round size
      40,      // pre-money valuation
      0
    );

    expect(checkSize).toBe(0); // No investment needed
  });

  it('should account for ESOP dilution', () => {
    const withoutEsop = calculateFollowOnCheckForOwnership(
      15, 15, 10, 40, 0
    );

    const withEsop = calculateFollowOnCheckForOwnership(
      15, 15, 10, 40, 10 // 10% ESOP
    );

    expect(withEsop).toBeGreaterThan(withoutEsop);
  });
});

describe('calculateFollowOnCascade', () => {
  it('should calculate follow-on allocations for all stages', () => {
    const cascade = calculateFollowOnCascade(
      mockSectorProfiles,
      mockCapitalAllocation.followOnStrategy,
      1.0,
      30 // estimated deals
    );

    expect(cascade).toHaveLength(2); // Two stage allocations
    expect(cascade[0]?.stageId).toBe('seed');
    expect(cascade[1]?.stageId).toBe('series-a');
  });

  it('should calculate graduates correctly', () => {
    const cascade = calculateFollowOnCascade(
      mockSectorProfiles,
      mockCapitalAllocation.followOnStrategy,
      1.0,
      30
    );

    const seedStage = cascade[0];
    expect(seedStage).toBeDefined();
    expect(seedStage!.graduatesIn).toBeGreaterThan(0);
  });

  it('should apply participation rate', () => {
    const cascade = calculateFollowOnCascade(
      mockSectorProfiles,
      mockCapitalAllocation.followOnStrategy,
      1.0,
      30
    );

    const seedStage = cascade[0];
    if (seedStage) {
      const expectedInvestments = Math.round(seedStage.graduatesIn * 0.7); // 70% participation
      expect(seedStage.followOnInvestments).toBe(expectedInvestments);
    }
  });

  it('should calculate capital allocated', () => {
    const cascade = calculateFollowOnCascade(
      mockSectorProfiles,
      mockCapitalAllocation.followOnStrategy,
      1.0,
      30
    );

    for (const stage of cascade) {
      expect(stage.capitalAllocated).toBe(
        stage.followOnInvestments * stage.impliedCheckSize
      );
    }
  });

  it('should handle empty sector profiles', () => {
    const cascade = calculateFollowOnCascade(
      [],
      mockCapitalAllocation.followOnStrategy,
      1.0,
      30
    );

    expect(cascade).toHaveLength(0);
  });

  it('should handle zero estimated deals', () => {
    const cascade = calculateFollowOnCascade(
      mockSectorProfiles,
      mockCapitalAllocation.followOnStrategy,
      1.0,
      0
    );

    expect(cascade).toHaveLength(0);
  });
});

// ============================================================================
// PACING SCHEDULE CALCULATIONS
// ============================================================================

describe('calculatePacingSchedule', () => {
  it('should generate schedule with date ranges', () => {
    const schedule = calculatePacingSchedule(
      mockCapitalAllocation.pacingHorizon,
      50,  // initial capital
      30,  // follow-on capital
      2024 // vintage year
    );

    expect(schedule).toHaveLength(3);
    expect(schedule[0]?.startDate).toBe('Jan 2024');
    expect(schedule[0]?.endDate).toBe('Jan 2025');
    expect(schedule[1]?.startDate).toBe('Jan 2025');
  });

  it('should allocate capital by percentage', () => {
    const schedule = calculatePacingSchedule(
      mockCapitalAllocation.pacingHorizon,
      50,
      30,
      2024
    );

    const totalCapital = 50 + 30; // 80M
    const period1 = schedule[0];

    expect(period1?.totalCapitalDeployed).toBeCloseTo(totalCapital * 0.4, 2); // 40%
  });

  it('should split capital between initial and follow-on', () => {
    const schedule = calculatePacingSchedule(
      mockCapitalAllocation.pacingHorizon,
      50,
      30,
      2024
    );

    for (const period of schedule) {
      const total = period.initialCapitalDeployed + period.followOnCapitalDeployed;
      expect(total).toBeCloseTo(period.totalCapitalDeployed, 2);
    }
  });
});

describe('generateDefaultPacingPeriods', () => {
  it('should generate linear pacing', () => {
    const periods = generateDefaultPacingPeriods(3, 'linear');

    expect(periods).toHaveLength(3);

    const total = periods.reduce((sum, p) => sum + p.allocationPercent, 0);
    expect(total).toBeCloseTo(100, 1);

    // Linear should have roughly equal allocations
    const allocations = periods.map(p => p.allocationPercent);
    const avg = total / periods.length;
    for (const alloc of allocations) {
      expect(alloc).toBeCloseTo(avg, 1);
    }
  });

  it('should generate front-loaded pacing', () => {
    const periods = generateDefaultPacingPeriods(3, 'front-loaded');

    expect(periods).toHaveLength(3);

    const total = periods.reduce((sum, p) => sum + p.allocationPercent, 0);
    expect(total).toBeCloseTo(100, 1);

    // First period should have highest allocation
    const allocations = periods.map(p => p.allocationPercent);
    expect(allocations[0]).toBeGreaterThan(allocations[1]!);
    expect(allocations[1]).toBeGreaterThan(allocations[2]!);
  });

  it('should generate back-loaded pacing', () => {
    const periods = generateDefaultPacingPeriods(3, 'back-loaded');

    expect(periods).toHaveLength(3);

    const total = periods.reduce((sum, p) => sum + p.allocationPercent, 0);
    expect(total).toBeCloseTo(100, 1);

    // Last period should have highest allocation
    const allocations = periods.map(p => p.allocationPercent);
    expect(allocations[0]).toBeLessThan(allocations[1]!);
    expect(allocations[1]).toBeLessThan(allocations[2]!);
  });

  it('should handle different investment periods', () => {
    expect(generateDefaultPacingPeriods(1, 'linear')).toHaveLength(1);
    expect(generateDefaultPacingPeriods(5, 'linear')).toHaveLength(5);
  });

  it('should generate 12-month periods', () => {
    const periods = generateDefaultPacingPeriods(3, 'linear');

    expect(periods[0]?.startMonth).toBe(0);
    expect(periods[0]?.endMonth).toBe(12);
    expect(periods[1]?.startMonth).toBe(12);
    expect(periods[1]?.endMonth).toBe(24);
  });
});

// ============================================================================
// COMPLETE CALCULATIONS
// ============================================================================

describe('calculateCapitalAllocation', () => {
  it('should calculate all metrics', () => {
    const calculations = calculateCapitalAllocation(
      mockCapitalAllocation,
      mockSectorProfiles,
      100, // fund size
      3,   // investment period
      2024 // vintage year
    );

    expect(calculations.avgRoundSize).toBeGreaterThan(0);
    expect(calculations.impliedOwnership).toBeGreaterThan(0);
    expect(calculations.estimatedDeals).toBe(30); // 10/year * 3 years
    expect(calculations.initialCapitalAllocated).toBe(30); // $1M * 30 deals
    expect(calculations.followOnAllocations.length).toBeGreaterThan(0);
    expect(calculations.totalFollowOnCapital).toBeGreaterThanOrEqual(0);
    expect(calculations.totalCapitalAllocated).toBeGreaterThan(0);
    expect(calculations.availableReserves).toBe(50); // 100 * 0.5
    expect(calculations.remainingCapital).toBeLessThanOrEqual(100);
    expect(calculations.pacingSchedule.length).toBe(3);
  });

  it('should sum initial and follow-on to total', () => {
    const calculations = calculateCapitalAllocation(
      mockCapitalAllocation,
      mockSectorProfiles,
      100,
      3,
      2024
    );

    const calculatedTotal =
      calculations.initialCapitalAllocated + calculations.totalFollowOnCapital;

    expect(calculations.totalCapitalAllocated).toBeCloseTo(calculatedTotal, 2);
  });

  it('should calculate remaining capital correctly', () => {
    const fundSize = 100;
    const calculations = calculateCapitalAllocation(
      mockCapitalAllocation,
      mockSectorProfiles,
      fundSize,
      3,
      2024
    );

    expect(calculations.remainingCapital).toBeCloseTo(
      fundSize - calculations.totalCapitalAllocated,
      2
    );
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('validateCapitalAllocation', () => {
  it('should validate successful allocation', () => {
    const calculations: CapitalAllocationCalculations = {
      avgRoundSize: 4.6,
      impliedOwnership: 15,
      estimatedDeals: 30,
      initialCapitalAllocated: 30,
      followOnAllocations: [],
      totalFollowOnCapital: 20,
      totalCapitalAllocated: 50,
      availableReserves: 50,
      remainingCapital: 50,
      pacingSchedule: []
    };

    const validation = validateCapitalAllocation(calculations, 100);

    expect(validation.isValid).toBe(true);
    expect(validation.errors).toHaveLength(0);
  });

  it('should error when allocation exceeds fund size', () => {
    const calculations: CapitalAllocationCalculations = {
      avgRoundSize: 4.6,
      impliedOwnership: 15,
      estimatedDeals: 30,
      initialCapitalAllocated: 80,
      followOnAllocations: [],
      totalFollowOnCapital: 40,
      totalCapitalAllocated: 120, // Exceeds fund size!
      availableReserves: 50,
      remainingCapital: -20,
      pacingSchedule: []
    };

    const validation = validateCapitalAllocation(calculations, 100);

    expect(validation.isValid).toBe(false);
    expect(validation.errors.length).toBeGreaterThan(0);
    expect(validation.errors[0]?.field).toBe('totalCapitalAllocated');
  });

  it('should error when follow-on exceeds reserves', () => {
    const calculations: CapitalAllocationCalculations = {
      avgRoundSize: 4.6,
      impliedOwnership: 15,
      estimatedDeals: 30,
      initialCapitalAllocated: 30,
      followOnAllocations: [],
      totalFollowOnCapital: 60, // Exceeds available reserves!
      totalCapitalAllocated: 90,
      availableReserves: 50,
      remainingCapital: 10,
      pacingSchedule: []
    };

    const validation = validateCapitalAllocation(calculations, 100);

    expect(validation.isValid).toBe(false);
    expect(validation.errors.some(e => e.field === 'totalFollowOnCapital')).toBe(true);
  });

  it('should warn when deploying >95% of fund', () => {
    const calculations: CapitalAllocationCalculations = {
      avgRoundSize: 4.6,
      impliedOwnership: 15,
      estimatedDeals: 30,
      initialCapitalAllocated: 70,
      followOnAllocations: [],
      totalFollowOnCapital: 27,
      totalCapitalAllocated: 97, // 97% of fund
      availableReserves: 50,
      remainingCapital: 3,
      pacingSchedule: []
    };

    const validation = validateCapitalAllocation(calculations, 100);

    expect(validation.isValid).toBe(true); // No errors
    expect(validation.warnings.length).toBeGreaterThan(0);
  });

  it('should warn about very high implied ownership', () => {
    const calculations: CapitalAllocationCalculations = {
      avgRoundSize: 4.6,
      impliedOwnership: 30, // Very high!
      estimatedDeals: 30,
      initialCapitalAllocated: 30,
      followOnAllocations: [],
      totalFollowOnCapital: 20,
      totalCapitalAllocated: 50,
      availableReserves: 50,
      remainingCapital: 50,
      pacingSchedule: []
    };

    const validation = validateCapitalAllocation(calculations, 100);

    expect(validation.warnings.some(w => w.field === 'impliedOwnership')).toBe(true);
  });

  it('should warn about very low implied ownership', () => {
    const calculations: CapitalAllocationCalculations = {
      avgRoundSize: 4.6,
      impliedOwnership: 3, // Very low!
      estimatedDeals: 30,
      initialCapitalAllocated: 30,
      followOnAllocations: [],
      totalFollowOnCapital: 20,
      totalCapitalAllocated: 50,
      availableReserves: 50,
      remainingCapital: 50,
      pacingSchedule: []
    };

    const validation = validateCapitalAllocation(calculations, 100);

    expect(validation.warnings.some(w => w.field === 'impliedOwnership')).toBe(true);
  });
});
