/**
 * Tests for exit recycling calculations
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMaxRecyclableCapital,
  calculateAnnualRecyclingCapacity,
  calculateRecyclingCapacity,
  calculateRecyclableFromExit,
  calculateExitRecycling,
  calculateRecyclingSchedule,
  calculateMgmtFeeRecycling,
  validateExitRecycling,
  isExitWithinRecyclingPeriod,
  createExitEvent,
  type ExitEvent,
  type RecyclingCapacity
} from '../exit-recycling-calculations';
import type { ExitRecyclingInput } from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TEST FIXTURES
// ============================================================================

const mockConfig: ExitRecyclingInput = {
  enabled: true,
  recyclingCap: 15, // 15% of committed capital
  recyclingPeriod: 5, // First 5 years
  exitRecyclingRate: 75, // Recycle 75% of exit proceeds
  mgmtFeeRecyclingRate: 0
};

const mockDisabledConfig: ExitRecyclingInput = {
  enabled: false
};

// ============================================================================
// CAPACITY CALCULATIONS
// ============================================================================

describe('calculateMaxRecyclableCapital', () => {
  it('calculates max recyclable capital correctly', () => {
    const result = calculateMaxRecyclableCapital(100, 15);
    expect(result).toBe(15); // 15% of $100M = $15M
  });

  it('handles zero recycling cap', () => {
    const result = calculateMaxRecyclableCapital(100, 0);
    expect(result).toBe(0);
  });

  it('handles full recycling cap (25%)', () => {
    const result = calculateMaxRecyclableCapital(200, 25);
    expect(result).toBe(50); // 25% of $200M = $50M
  });

  it('handles small fund sizes', () => {
    const result = calculateMaxRecyclableCapital(10, 10);
    expect(result).toBe(1); // 10% of $10M = $1M
  });
});

describe('calculateAnnualRecyclingCapacity', () => {
  it('distributes capacity evenly across period', () => {
    const result = calculateAnnualRecyclingCapacity(15, 5);
    expect(result).toBe(3); // $15M / 5 years = $3M/year
  });

  it('handles zero period', () => {
    const result = calculateAnnualRecyclingCapacity(15, 0);
    expect(result).toBe(0);
  });

  it('handles single-year period', () => {
    const result = calculateAnnualRecyclingCapacity(10, 1);
    expect(result).toBe(10);
  });

  it('handles long periods', () => {
    const result = calculateAnnualRecyclingCapacity(20, 10);
    expect(result).toBe(2);
  });
});

describe('calculateRecyclingCapacity', () => {
  it('returns complete capacity object', () => {
    const result = calculateRecyclingCapacity(100, 15, 5);

    expect(result).toEqual<RecyclingCapacity>({
      maxRecyclableCapital: 15,
      recyclingCapPercentage: 15,
      recyclingPeriodYears: 5,
      annualRecyclingCapacity: 3
    });
  });

  it('handles zero recycling cap', () => {
    const result = calculateRecyclingCapacity(100, 0, 5);

    expect(result.maxRecyclableCapital).toBe(0);
    expect(result.annualRecyclingCapacity).toBe(0);
  });
});

// ============================================================================
// EXIT RECYCLING CALCULATIONS
// ============================================================================

describe('isExitWithinRecyclingPeriod', () => {
  it('identifies exits within period', () => {
    expect(isExitWithinRecyclingPeriod(3, 5)).toBe(true);
    expect(isExitWithinRecyclingPeriod(5, 5)).toBe(true);
    expect(isExitWithinRecyclingPeriod(1, 5)).toBe(true);
  });

  it('identifies exits outside period', () => {
    expect(isExitWithinRecyclingPeriod(6, 5)).toBe(false);
    expect(isExitWithinRecyclingPeriod(10, 5)).toBe(false);
  });

  it('handles year zero', () => {
    expect(isExitWithinRecyclingPeriod(0, 5)).toBe(true);
  });
});

describe('createExitEvent', () => {
  it('creates exit event with calculated fund proceeds', () => {
    const exit = createExitEvent({
      id: 'exit-1',
      year: 3,
      grossProceeds: 100,
      ownershipPercent: 15,
      recyclingPeriod: 5
    });

    expect(exit).toEqual<ExitEvent>({
      id: 'exit-1',
      year: 3,
      grossProceeds: 100,
      ownershipPercent: 15,
      fundProceeds: 15, // 15% of $100M
      withinRecyclingPeriod: true
    });
  });

  it('marks exits outside recycling period', () => {
    const exit = createExitEvent({
      id: 'exit-2',
      year: 7,
      grossProceeds: 100,
      ownershipPercent: 20,
      recyclingPeriod: 5
    });

    expect(exit.withinRecyclingPeriod).toBe(false);
  });
});

describe('calculateRecyclableFromExit', () => {
  it('calculates recyclable amount within capacity', () => {
    const result = calculateRecyclableFromExit(
      10, // $10M fund proceeds
      75, // 75% recycling rate
      20, // $20M remaining capacity
      true // within period
    );

    expect(result).toBe(7.5); // 75% of $10M = $7.5M
  });

  it('respects remaining capacity limit', () => {
    const result = calculateRecyclableFromExit(
      10, // $10M fund proceeds
      75, // 75% recycling rate
      5, // $5M remaining capacity (less than potential $7.5M)
      true
    );

    expect(result).toBe(5); // Capped at remaining capacity
  });

  it('returns zero for exits outside period', () => {
    const result = calculateRecyclableFromExit(
      10,
      75,
      20,
      false // outside period
    );

    expect(result).toBe(0);
  });

  it('returns zero when no capacity remains', () => {
    const result = calculateRecyclableFromExit(
      10,
      75,
      0, // No capacity
      true
    );

    expect(result).toBe(0);
  });

  it('handles 100% recycling rate', () => {
    const result = calculateRecyclableFromExit(
      10,
      100,
      20,
      true
    );

    expect(result).toBe(10); // All proceeds recycled
  });

  it('handles 0% recycling rate', () => {
    const result = calculateRecyclableFromExit(
      10,
      0,
      20,
      true
    );

    expect(result).toBe(0);
  });
});

describe('calculateRecyclingSchedule', () => {
  it('calculates schedule for multiple exits', () => {
    const exits: ExitEvent[] = [
      createExitEvent({
        id: 'exit-1',
        year: 2,
        grossProceeds: 50,
        ownershipPercent: 20, // Fund gets $10M
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-2',
        year: 4,
        grossProceeds: 100,
        ownershipPercent: 15, // Fund gets $15M
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-3',
        year: 7,
        grossProceeds: 200,
        ownershipPercent: 10, // Fund gets $20M (but outside period)
        recyclingPeriod: 5
      })
    ];

    const schedule = calculateRecyclingSchedule(
      exits,
      75, // 75% recycling rate
      15 // $15M cap
    );

    // Exit 1: $10M * 75% = $7.5M recycled
    // Exit 2: $15M * 75% = $11.25M, but only $7.5M capacity left, so $7.5M recycled
    // Exit 3: Outside period, $0 recycled
    expect(schedule.totalRecycled).toBe(15); // Hit cap
    expect(schedule.totalReturnedToLPs).toBe(30); // $10M + $15M + $20M - $15M recycled = $30M
    expect(schedule.capReached).toBe(true);
    expect(schedule.remainingCapacity).toBeLessThanOrEqual(0.01);
    expect(schedule.recyclingByExit).toHaveLength(3);
  });

  it('handles no exits', () => {
    const schedule = calculateRecyclingSchedule([], 75, 15);

    expect(schedule.totalRecycled).toBe(0);
    expect(schedule.totalReturnedToLPs).toBe(0);
    expect(schedule.capReached).toBe(false);
    expect(schedule.remainingCapacity).toBe(15);
    expect(schedule.recyclingByExit).toHaveLength(0);
  });

  it('handles single exit below cap', () => {
    const exits: ExitEvent[] = [
      createExitEvent({
        id: 'exit-1',
        year: 3,
        grossProceeds: 100,
        ownershipPercent: 10, // Fund gets $10M
        recyclingPeriod: 5
      })
    ];

    const schedule = calculateRecyclingSchedule(exits, 50, 20);

    // $10M * 50% = $5M recycled
    expect(schedule.totalRecycled).toBe(5);
    expect(schedule.totalReturnedToLPs).toBe(5);
    expect(schedule.capReached).toBe(false);
    expect(schedule.remainingCapacity).toBe(15);
  });

  it('processes exits chronologically', () => {
    const exits: ExitEvent[] = [
      createExitEvent({
        id: 'exit-2',
        year: 4,
        grossProceeds: 100,
        ownershipPercent: 10,
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-1',
        year: 2, // Earlier year
        grossProceeds: 50,
        ownershipPercent: 20,
        recyclingPeriod: 5
      })
    ];

    const schedule = calculateRecyclingSchedule(exits, 75, 20);

    // Should process exit-1 first (year 2)
    expect(schedule.recyclingByExit[0]?.exitId).toBe('exit-1');
    expect(schedule.recyclingByExit[1]?.exitId).toBe('exit-2');
  });

  it('builds cumulative by year correctly', () => {
    const exits: ExitEvent[] = [
      createExitEvent({
        id: 'exit-1',
        year: 2,
        grossProceeds: 50,
        ownershipPercent: 20,
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-2',
        year: 2, // Same year
        grossProceeds: 40,
        ownershipPercent: 25,
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-3',
        year: 4,
        grossProceeds: 60,
        ownershipPercent: 20,
        recyclingPeriod: 5
      })
    ];

    const schedule = calculateRecyclingSchedule(exits, 100, 50);

    expect(schedule.cumulativeByYear).toHaveLength(2); // 2 distinct years

    const year2 = schedule.cumulativeByYear.find(y => y.year === 2);
    expect(year2).toBeDefined();
    expect(year2?.annualRecycled).toBe(20); // $10M + $10M from year 2
    expect(year2?.cumulativeRecycled).toBe(20);

    const year4 = schedule.cumulativeByYear.find(y => y.year === 4);
    expect(year4).toBeDefined();
    expect(year4?.annualRecycled).toBe(12); // $12M from year 4
    expect(year4?.cumulativeRecycled).toBe(32); // $20M + $12M cumulative
  });
});

// ============================================================================
// MANAGEMENT FEE RECYCLING
// ============================================================================

describe('calculateMgmtFeeRecycling', () => {
  it('calculates recyclable management fees', () => {
    const result = calculateMgmtFeeRecycling(10, 50);
    expect(result).toBe(5); // 50% of $10M = $5M
  });

  it('handles zero recycling rate', () => {
    const result = calculateMgmtFeeRecycling(10, 0);
    expect(result).toBe(0);
  });

  it('handles 100% recycling rate', () => {
    const result = calculateMgmtFeeRecycling(10, 100);
    expect(result).toBe(10);
  });
});

// ============================================================================
// COMPLETE CALCULATIONS
// ============================================================================

describe('calculateExitRecycling', () => {
  it('returns disabled state when recycling disabled', () => {
    const result = calculateExitRecycling(mockDisabledConfig, 100);

    expect(result.enabled).toBe(false);
    expect(result.capacity.maxRecyclableCapital).toBe(0);
    expect(result.extendedInvestmentCapacity).toBe(0);
    expect(result.effectiveDeploymentRate).toBe(100);
  });

  it('calculates capacity when enabled without exits', () => {
    const result = calculateExitRecycling(mockConfig, 100);

    expect(result.enabled).toBe(true);
    expect(result.capacity.maxRecyclableCapital).toBe(15); // 15% of $100M
    expect(result.capacity.annualRecyclingCapacity).toBe(3); // $15M / 5 years
    expect(result.extendedInvestmentCapacity).toBe(15); // Assumes full cap used
    expect(result.effectiveDeploymentRate).toBe(115); // 115% of committed capital
    expect(result.schedule).toBeUndefined();
  });

  it('calculates schedule when exits provided', () => {
    const exits: ExitEvent[] = [
      createExitEvent({
        id: 'exit-1',
        year: 3,
        grossProceeds: 100,
        ownershipPercent: 15,
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-2',
        year: 7,
        grossProceeds: 200,
        ownershipPercent: 20,
        recyclingPeriod: 5
      })
    ];

    const result = calculateExitRecycling(mockConfig, 100, exits);

    expect(result.enabled).toBe(true);
    expect(result.schedule).toBeDefined();
    expect(result.schedule?.recyclingByExit).toHaveLength(2);

    // Exit 1: $15M proceeds * 75% = $11.25M recycled
    // Exit 2: Outside period, $0 recycled
    expect(result.schedule?.totalRecycled).toBe(11.25);
    expect(result.extendedInvestmentCapacity).toBe(11.25);
    expect(result.effectiveDeploymentRate).toBeCloseTo(111.25); // 111.25% of committed
  });

  it('respects recycling cap across multiple exits', () => {
    const exits: ExitEvent[] = [
      createExitEvent({
        id: 'exit-1',
        year: 2,
        grossProceeds: 100,
        ownershipPercent: 20, // $20M proceeds
        recyclingPeriod: 5
      }),
      createExitEvent({
        id: 'exit-2',
        year: 3,
        grossProceeds: 100,
        ownershipPercent: 20, // $20M proceeds
        recyclingPeriod: 5
      })
    ];

    const result = calculateExitRecycling(mockConfig, 100, exits);

    // Each exit could recycle $15M (75% of $20M), but cap is $15M total
    expect(result.schedule?.totalRecycled).toBe(15); // Capped
    expect(result.schedule?.capReached).toBe(true);
  });
});

// ============================================================================
// VALIDATION
// ============================================================================

describe('validateExitRecycling', () => {
  it('passes validation for disabled recycling', () => {
    const result = validateExitRecycling(mockDisabledConfig, 100);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('passes validation for well-configured recycling', () => {
    const result = validateExitRecycling(mockConfig, 100);

    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('requires recycling cap when enabled', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingPeriod: 5,
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(config, 100);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'recyclingCap')).toBe(true);
  });

  it('requires recycling period when enabled', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 15,
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(config, 100);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'recyclingPeriod')).toBe(true);
  });

  it('requires exit recycling rate when enabled', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 15,
      recyclingPeriod: 5
    };

    const result = validateExitRecycling(config, 100);

    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'exitRecyclingRate')).toBe(true);
  });

  it('validates recycling cap range', () => {
    const configHigh: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 30, // Too high
      recyclingPeriod: 5,
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(configHigh, 100);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.field === 'recyclingCap')).toBe(true);
  });

  it('warns about high recycling cap', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 22, // Above 20%
      recyclingPeriod: 5,
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(config, 100);
    expect(result.warnings.some(w => w.field === 'recyclingCap' && w.message.includes('uncommon'))).toBe(true);
  });

  it('warns about low recycling cap', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 3, // Below 5%
      recyclingPeriod: 5,
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(config, 100);
    expect(result.warnings.some(w => w.field === 'recyclingCap' && w.message.includes('limited'))).toBe(true);
  });

  it('warns about short recycling period', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 15,
      recyclingPeriod: 2, // Less than 3 years
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(config, 100);
    expect(result.warnings.some(w => w.field === 'recyclingPeriod')).toBe(true);
  });

  it('warns about long recycling period', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 15,
      recyclingPeriod: 8, // More than 7 years
      exitRecyclingRate: 75
    };

    const result = validateExitRecycling(config, 100);
    expect(result.warnings.some(w => w.field === 'recyclingPeriod' && w.message.includes('harvest'))).toBe(true);
  });

  it('warns about low recycling rate', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 15,
      recyclingPeriod: 5,
      exitRecyclingRate: 40 // Below 50%
    };

    const result = validateExitRecycling(config, 100);
    expect(result.warnings.some(w => w.field === 'exitRecyclingRate')).toBe(true);
  });

  it('warns about management fee recycling', () => {
    const config: ExitRecyclingInput = {
      enabled: true,
      recyclingCap: 15,
      recyclingPeriod: 5,
      exitRecyclingRate: 75,
      mgmtFeeRecyclingRate: 50
    };

    const result = validateExitRecycling(config, 100);
    expect(result.warnings.some(w => w.field === 'mgmtFeeRecyclingRate')).toBe(true);
  });
});
