/**
 * Exit Recycling Truth Case Adapter
 *
 * Maps truth case JSON structure to production function signatures.
 * Production function: calculateExitRecycling() in client/src/lib/exit-recycling-calculations.ts
 *
 * @see docs/exit-recycling.truth-cases.json - Truth case definitions
 * @see client/src/lib/exit-recycling-calculations.ts - Production calculations
 */

import type { ExitRecyclingInput } from '@/schemas/modeling-wizard.schemas';
import {
  calculateExitRecycling,
  createExitEvent,
  type ExitEvent,
  type ExitRecyclingCalculations,
} from '@/lib/exit-recycling-calculations';

/**
 * Truth case exit structure (from JSON)
 */
export interface TruthCaseExit {
  id: string;
  year: number;
  grossProceeds: number; // $M
  ownershipPercent: number; // %
}

/**
 * Truth case input structure (from JSON)
 */
export interface ExitRecyclingTruthCaseInput {
  fundSize: number; // $M
  recyclingCapPercent: number; // %
  recyclingPeriod: number; // years
  exitRecyclingRate?: number; // % (only for schedule/cap cases)
  exits?: TruthCaseExit[]; // Only for schedule/cap/term cases
}

/**
 * Truth case expected output - capacity calculation
 */
export interface CapacityExpectedOutput {
  maxRecyclableCapital: number; // $M
  recyclingCapPercentage: number; // %
  recyclingPeriodYears: number; // years
  annualRecyclingCapacity: number; // $M/year
}

/**
 * Truth case expected output - recycling by exit
 */
export interface RecyclingByExitExpected {
  exitId: string;
  exitYear: number;
  fundProceeds: number; // $M
  recycledAmount: number; // $M
  returnedToLPs: number; // $M
  withinPeriod: boolean;
  appliedRate: number; // %
}

/**
 * Truth case expected output - cumulative by year
 */
export interface CumulativeByYearExpected {
  year: number;
  cumulativeRecycled: number; // $M
  annualRecycled: number; // $M
}

/**
 * Truth case expected output - schedule calculation
 */
export interface ScheduleExpectedOutput {
  totalRecycled: number; // $M
  totalReturnedToLPs?: number; // $M
  remainingCapacity?: number; // $M
  capReached: boolean;
  excessProceeds?: number; // $M (for cap enforcement)
  returnedToLPs?: number; // $M (alias for totalReturnedToLPs)
  recyclingByExit?: RecyclingByExitExpected[];
  cumulativeByYear?: CumulativeByYearExpected[];
  // Term validation fields
  exitsWithinPeriod?: number;
  exitsAfterPeriod?: number;
  recycledFromEligibleExits?: number;
  returnedFromIneligibleExits?: number;
}

/**
 * Full truth case structure
 */
export interface ExitRecyclingTruthCase {
  id: string;
  category: 'capacity_calculation' | 'schedule_calculation' | 'cap_enforcement' | 'term_validation';
  description: string;
  input: ExitRecyclingTruthCaseInput;
  expectedOutput: CapacityExpectedOutput | ScheduleExpectedOutput;
  tolerance: number;
  notes: string;
  tags: string[];
}

/**
 * Type guard for capacity expected output
 */
export function isCapacityExpectedOutput(
  output: CapacityExpectedOutput | ScheduleExpectedOutput
): output is CapacityExpectedOutput {
  return 'maxRecyclableCapital' in output && 'annualRecyclingCapacity' in output;
}

/**
 * Type guard for schedule expected output
 */
export function isScheduleExpectedOutput(
  output: CapacityExpectedOutput | ScheduleExpectedOutput
): output is ScheduleExpectedOutput {
  return 'totalRecycled' in output || 'capReached' in output;
}

/**
 * Adapt truth case to production function inputs
 *
 * Maps truth case JSON structure to:
 * - ExitRecyclingInput config
 * - fundSize parameter
 * - ExitEvent[] array (using createExitEvent helper)
 */
export function adaptExitRecyclingTruthCase(tc: ExitRecyclingTruthCase): {
  config: ExitRecyclingInput;
  fundSize: number;
  exits: ExitEvent[];
} {
  const { input } = tc;

  // Build config from truth case input
  const config: ExitRecyclingInput = {
    enabled: true,
    recyclingCap: input.recyclingCapPercent,
    recyclingPeriod: input.recyclingPeriod,
    exitRecyclingRate: input.exitRecyclingRate ?? 100, // Default to 100% if not specified
    mgmtFeeRecyclingRate: 0,
  };

  // Map exits using production helper
  const exits: ExitEvent[] = (input.exits ?? []).map((exit) =>
    createExitEvent({
      id: exit.id,
      year: exit.year,
      grossProceeds: exit.grossProceeds,
      ownershipPercent: exit.ownershipPercent,
      recyclingPeriod: input.recyclingPeriod,
    })
  );

  return {
    config,
    fundSize: input.fundSize,
    exits,
  };
}

/**
 * Execute production calculation from truth case
 */
export function executeExitRecyclingTruthCase(
  tc: ExitRecyclingTruthCase
): ExitRecyclingCalculations {
  const { config, fundSize, exits } = adaptExitRecyclingTruthCase(tc);
  return calculateExitRecycling(config, fundSize, exits.length > 0 ? exits : undefined);
}

/**
 * Validation result structure
 */
export interface ValidationResult {
  pass: boolean;
  failures: string[];
}

/**
 * Validate capacity calculation results
 */
function validateCapacityResult(
  result: ExitRecyclingCalculations,
  expected: CapacityExpectedOutput,
  tolerance: number
): ValidationResult {
  const failures: string[] = [];
  const { capacity } = result;

  // maxRecyclableCapital
  if (Math.abs(capacity.maxRecyclableCapital - expected.maxRecyclableCapital) > tolerance) {
    failures.push(
      `maxRecyclableCapital: expected ${expected.maxRecyclableCapital}, got ${capacity.maxRecyclableCapital}`
    );
  }

  // recyclingCapPercentage
  if (Math.abs(capacity.recyclingCapPercentage - expected.recyclingCapPercentage) > tolerance) {
    failures.push(
      `recyclingCapPercentage: expected ${expected.recyclingCapPercentage}, got ${capacity.recyclingCapPercentage}`
    );
  }

  // recyclingPeriodYears
  if (capacity.recyclingPeriodYears !== expected.recyclingPeriodYears) {
    failures.push(
      `recyclingPeriodYears: expected ${expected.recyclingPeriodYears}, got ${capacity.recyclingPeriodYears}`
    );
  }

  // annualRecyclingCapacity
  if (Math.abs(capacity.annualRecyclingCapacity - expected.annualRecyclingCapacity) > tolerance) {
    failures.push(
      `annualRecyclingCapacity: expected ${expected.annualRecyclingCapacity}, got ${capacity.annualRecyclingCapacity}`
    );
  }

  return { pass: failures.length === 0, failures };
}

/**
 * Validate schedule calculation results
 */
function validateScheduleResult(
  result: ExitRecyclingCalculations,
  expected: ScheduleExpectedOutput,
  tolerance: number
): ValidationResult {
  const failures: string[] = [];
  const { schedule } = result;

  if (!schedule) {
    failures.push('schedule: expected schedule result but got undefined');
    return { pass: false, failures };
  }

  // totalRecycled
  if (expected.totalRecycled !== undefined) {
    if (Math.abs(schedule.totalRecycled - expected.totalRecycled) > tolerance) {
      failures.push(
        `totalRecycled: expected ${expected.totalRecycled}, got ${schedule.totalRecycled}`
      );
    }
  }

  // totalReturnedToLPs (handle both field names)
  const expectedReturnedToLPs = expected.totalReturnedToLPs ?? expected.returnedToLPs;
  if (expectedReturnedToLPs !== undefined) {
    if (Math.abs(schedule.totalReturnedToLPs - expectedReturnedToLPs) > tolerance) {
      failures.push(
        `totalReturnedToLPs: expected ${expectedReturnedToLPs}, got ${schedule.totalReturnedToLPs}`
      );
    }
  }

  // remainingCapacity
  if (expected.remainingCapacity !== undefined) {
    if (Math.abs(schedule.remainingCapacity - expected.remainingCapacity) > tolerance) {
      failures.push(
        `remainingCapacity: expected ${expected.remainingCapacity}, got ${schedule.remainingCapacity}`
      );
    }
  }

  // capReached
  if (expected.capReached !== undefined) {
    if (schedule.capReached !== expected.capReached) {
      failures.push(`capReached: expected ${expected.capReached}, got ${schedule.capReached}`);
    }
  }

  // Validate recyclingByExit if expected
  if (expected.recyclingByExit) {
    if (schedule.recyclingByExit.length !== expected.recyclingByExit.length) {
      failures.push(
        `recyclingByExit.length: expected ${expected.recyclingByExit.length}, got ${schedule.recyclingByExit.length}`
      );
    } else {
      expected.recyclingByExit.forEach((expectedExit, idx) => {
        const actualExit = schedule.recyclingByExit[idx];
        if (!actualExit) {
          failures.push(`recyclingByExit[${idx}]: missing in result`);
          return;
        }

        // exitId
        if (actualExit.exitId !== expectedExit.exitId) {
          failures.push(
            `recyclingByExit[${idx}].exitId: expected ${expectedExit.exitId}, got ${actualExit.exitId}`
          );
        }

        // exitYear
        if (actualExit.exitYear !== expectedExit.exitYear) {
          failures.push(
            `recyclingByExit[${idx}].exitYear: expected ${expectedExit.exitYear}, got ${actualExit.exitYear}`
          );
        }

        // fundProceeds
        if (Math.abs(actualExit.fundProceeds - expectedExit.fundProceeds) > tolerance) {
          failures.push(
            `recyclingByExit[${idx}].fundProceeds: expected ${expectedExit.fundProceeds}, got ${actualExit.fundProceeds}`
          );
        }

        // recycledAmount
        if (Math.abs(actualExit.recycledAmount - expectedExit.recycledAmount) > tolerance) {
          failures.push(
            `recyclingByExit[${idx}].recycledAmount: expected ${expectedExit.recycledAmount}, got ${actualExit.recycledAmount}`
          );
        }

        // returnedToLPs
        if (Math.abs(actualExit.returnedToLPs - expectedExit.returnedToLPs) > tolerance) {
          failures.push(
            `recyclingByExit[${idx}].returnedToLPs: expected ${expectedExit.returnedToLPs}, got ${actualExit.returnedToLPs}`
          );
        }

        // withinPeriod
        if (actualExit.withinPeriod !== expectedExit.withinPeriod) {
          failures.push(
            `recyclingByExit[${idx}].withinPeriod: expected ${expectedExit.withinPeriod}, got ${actualExit.withinPeriod}`
          );
        }

        // appliedRate
        if (Math.abs(actualExit.appliedRate - expectedExit.appliedRate) > tolerance) {
          failures.push(
            `recyclingByExit[${idx}].appliedRate: expected ${expectedExit.appliedRate}, got ${actualExit.appliedRate}`
          );
        }
      });
    }
  }

  // Validate cumulativeByYear if expected
  if (expected.cumulativeByYear) {
    if (schedule.cumulativeByYear.length !== expected.cumulativeByYear.length) {
      failures.push(
        `cumulativeByYear.length: expected ${expected.cumulativeByYear.length}, got ${schedule.cumulativeByYear.length}`
      );
    } else {
      expected.cumulativeByYear.forEach((expectedYear, idx) => {
        const actualYear = schedule.cumulativeByYear[idx];
        if (!actualYear) {
          failures.push(`cumulativeByYear[${idx}]: missing in result`);
          return;
        }

        if (actualYear.year !== expectedYear.year) {
          failures.push(
            `cumulativeByYear[${idx}].year: expected ${expectedYear.year}, got ${actualYear.year}`
          );
        }

        if (Math.abs(actualYear.cumulativeRecycled - expectedYear.cumulativeRecycled) > tolerance) {
          failures.push(
            `cumulativeByYear[${idx}].cumulativeRecycled: expected ${expectedYear.cumulativeRecycled}, got ${actualYear.cumulativeRecycled}`
          );
        }

        if (Math.abs(actualYear.annualRecycled - expectedYear.annualRecycled) > tolerance) {
          failures.push(
            `cumulativeByYear[${idx}].annualRecycled: expected ${expectedYear.annualRecycled}, got ${actualYear.annualRecycled}`
          );
        }
      });
    }
  }

  // Term validation fields
  if (expected.exitsWithinPeriod !== undefined) {
    const actualWithinPeriod = schedule.recyclingByExit.filter((e) => e.withinPeriod).length;
    if (actualWithinPeriod !== expected.exitsWithinPeriod) {
      failures.push(
        `exitsWithinPeriod: expected ${expected.exitsWithinPeriod}, got ${actualWithinPeriod}`
      );
    }
  }

  if (expected.exitsAfterPeriod !== undefined) {
    const actualAfterPeriod = schedule.recyclingByExit.filter((e) => !e.withinPeriod).length;
    if (actualAfterPeriod !== expected.exitsAfterPeriod) {
      failures.push(
        `exitsAfterPeriod: expected ${expected.exitsAfterPeriod}, got ${actualAfterPeriod}`
      );
    }
  }

  if (expected.recycledFromEligibleExits !== undefined) {
    const actualRecycledEligible = schedule.recyclingByExit
      .filter((e) => e.withinPeriod)
      .reduce((sum, e) => sum + e.recycledAmount, 0);
    if (Math.abs(actualRecycledEligible - expected.recycledFromEligibleExits) > tolerance) {
      failures.push(
        `recycledFromEligibleExits: expected ${expected.recycledFromEligibleExits}, got ${actualRecycledEligible}`
      );
    }
  }

  if (expected.returnedFromIneligibleExits !== undefined) {
    const actualReturnedIneligible = schedule.recyclingByExit
      .filter((e) => !e.withinPeriod)
      .reduce((sum, e) => sum + e.returnedToLPs, 0);
    if (Math.abs(actualReturnedIneligible - expected.returnedFromIneligibleExits) > tolerance) {
      failures.push(
        `returnedFromIneligibleExits: expected ${expected.returnedFromIneligibleExits}, got ${actualReturnedIneligible}`
      );
    }
  }

  return { pass: failures.length === 0, failures };
}

/**
 * Validate exit recycling result against expected values.
 * Routes to appropriate validator based on truth case category.
 *
 * @param result - Production function output
 * @param tc - Full truth case for context
 * @returns Validation result with pass/fail status and details
 */
export function validateExitRecyclingResult(
  result: ExitRecyclingCalculations,
  tc: ExitRecyclingTruthCase
): ValidationResult {
  const { category, expectedOutput, tolerance } = tc;

  // Route to appropriate validator based on category
  if (category === 'capacity_calculation') {
    if (!isCapacityExpectedOutput(expectedOutput)) {
      return {
        pass: false,
        failures: ['expectedOutput structure does not match capacity_calculation category'],
      };
    }
    return validateCapacityResult(result, expectedOutput, tolerance);
  }

  // All other categories are schedule-based
  if (!isScheduleExpectedOutput(expectedOutput)) {
    return {
      pass: false,
      failures: [`expectedOutput structure does not match ${category} category`],
    };
  }
  return validateScheduleResult(result, expectedOutput, tolerance);
}
