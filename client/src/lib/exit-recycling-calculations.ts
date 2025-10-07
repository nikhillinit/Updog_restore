/**
 * Exit Recycling Calculations
 *
 * Pure functions for calculating recycling schedules, caps, and capital availability.
 * Models how exit proceeds can be recycled back into new investments within policy limits.
 *
 * @module exit-recycling-calculations
 */

import type { ExitRecyclingInput } from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TYPES
// ============================================================================

/**
 * Calculated recycling capacity and limits
 */
export interface RecyclingCapacity {
  /** Maximum recyclable capital based on cap ($M) */
  maxRecyclableCapital: number;

  /** Percentage of fund that can be recycled (%) */
  recyclingCapPercentage: number;

  /** Recycling period in years */
  recyclingPeriodYears: number;

  /** Annual recycling capacity ($M/year) */
  annualRecyclingCapacity: number;
}

/**
 * Single exit event for modeling
 */
export interface ExitEvent {
  /** Exit ID */
  id: string;

  /** Year of exit (relative to vintage) */
  year: number;

  /** Gross exit proceeds ($M) */
  grossProceeds: number;

  /** Fund's ownership stake (%) */
  ownershipPercent: number;

  /** Fund's share of proceeds ($M) */
  fundProceeds: number;

  /** Is this exit within recycling period? */
  withinRecyclingPeriod: boolean;
}

/**
 * Calculated recycling from a single exit
 */
export interface RecyclingCalculation {
  /** Exit event reference */
  exitId: string;

  /** Year of exit */
  exitYear: number;

  /** Total fund proceeds from exit ($M) */
  fundProceeds: number;

  /** Proceeds eligible for recycling ($M) */
  eligibleProceeds: number;

  /** Actual recycled amount after applying rate ($M) */
  recycledAmount: number;

  /** Returned to LPs ($M) */
  returnedToLPs: number;

  /** Is this exit within recycling period? */
  withinPeriod: boolean;

  /** Applied recycling rate (%) */
  appliedRate: number;
}

/**
 * Complete recycling schedule across all exits
 */
export interface RecyclingSchedule {
  /** All recycling calculations by exit */
  recyclingByExit: RecyclingCalculation[];

  /** Total capital recycled across all exits ($M) */
  totalRecycled: number;

  /** Total returned to LPs ($M) */
  totalReturnedToLPs: number;

  /** Remaining recycling capacity ($M) */
  remainingCapacity: number;

  /** Has recycling cap been reached? */
  capReached: boolean;

  /** Cumulative recycling by year */
  cumulativeByYear: Array<{
    year: number;
    cumulativeRecycled: number;
    annualRecycled: number;
  }>;
}

/**
 * Complete exit recycling calculations
 */
export interface ExitRecyclingCalculations {
  /** Is recycling enabled? */
  enabled: boolean;

  /** Recycling capacity and limits */
  capacity: RecyclingCapacity;

  /** Full recycling schedule (if exits provided) */
  schedule?: RecyclingSchedule;

  /** Extended investment capacity from recycling ($M) */
  extendedInvestmentCapacity: number;

  /** Effective fund deployment percentage (%) */
  effectiveDeploymentRate: number;
}

/**
 * Validation result for exit recycling
 */
export interface ValidationResult {
  isValid: boolean;
  errors: Array<{ field: string; message: string }>;
  warnings: Array<{ field: string; message: string }>;
}

// ============================================================================
// RECYCLING CAPACITY CALCULATIONS
// ============================================================================

/**
 * Calculate maximum recyclable capital based on fund size and cap
 *
 * @param fundSize - Total committed capital ($M)
 * @param recyclingCapPercent - Recycling cap as percentage of committed capital (%)
 * @returns Maximum amount that can be recycled ($M)
 *
 * @example
 * ```typescript
 * const maxRecyclable = calculateMaxRecyclableCapital(100, 15);
 * console.log(maxRecyclable); // 15 (15% of $100M)
 * ```
 */
export function calculateMaxRecyclableCapital(
  fundSize: number,
  recyclingCapPercent: number
): number {
  return fundSize * (recyclingCapPercent / 100);
}

/**
 * Calculate annual recycling capacity
 *
 * Distributes total recycling capacity evenly across the recycling period.
 * Useful for pacing analysis and capacity planning.
 *
 * @param maxRecyclableCapital - Total recycling cap ($M)
 * @param recyclingPeriod - Recycling period (years)
 * @returns Annual recycling capacity ($M/year)
 */
export function calculateAnnualRecyclingCapacity(
  maxRecyclableCapital: number,
  recyclingPeriod: number
): number {
  if (recyclingPeriod === 0) return 0;
  return maxRecyclableCapital / recyclingPeriod;
}

/**
 * Calculate complete recycling capacity
 *
 * Main entry point for capacity calculations.
 * Returns all capacity-related metrics.
 */
export function calculateRecyclingCapacity(
  fundSize: number,
  recyclingCapPercent: number,
  recyclingPeriod: number
): RecyclingCapacity {
  const maxRecyclableCapital = calculateMaxRecyclableCapital(
    fundSize,
    recyclingCapPercent
  );

  const annualRecyclingCapacity = calculateAnnualRecyclingCapacity(
    maxRecyclableCapital,
    recyclingPeriod
  );

  return {
    maxRecyclableCapital,
    recyclingCapPercentage: recyclingCapPercent,
    recyclingPeriodYears: recyclingPeriod,
    annualRecyclingCapacity
  };
}

// ============================================================================
// EXIT RECYCLING CALCULATIONS
// ============================================================================

/**
 * Calculate recyclable amount from a single exit
 *
 * Applies recycling rate and checks against remaining capacity.
 * Exits outside recycling period return 0 recyclable amount.
 *
 * @param exitProceeds - Fund's share of exit proceeds ($M)
 * @param recyclingRate - Percentage of proceeds to recycle (%)
 * @param remainingCapacity - Remaining recycling capacity ($M)
 * @param withinPeriod - Is exit within recycling period?
 * @returns Recycled amount ($M)
 */
export function calculateRecyclableFromExit(
  exitProceeds: number,
  recyclingRate: number,
  remainingCapacity: number,
  withinPeriod: boolean
): number {
  if (!withinPeriod) return 0;
  if (remainingCapacity <= 0) return 0;

  const potentialRecycling = exitProceeds * (recyclingRate / 100);
  return Math.min(potentialRecycling, remainingCapacity);
}

/**
 * Calculate recycling for a single exit event
 *
 * Returns complete calculation breakdown for one exit.
 */
export function calculateSingleExitRecycling(
  exitEvent: ExitEvent,
  recyclingRate: number,
  remainingCapacity: number
): RecyclingCalculation {
  const eligibleProceeds = exitEvent.withinRecyclingPeriod
    ? exitEvent.fundProceeds
    : 0;

  const recycledAmount = calculateRecyclableFromExit(
    exitEvent.fundProceeds,
    recyclingRate,
    remainingCapacity,
    exitEvent.withinRecyclingPeriod
  );

  const returnedToLPs = exitEvent.fundProceeds - recycledAmount;

  return {
    exitId: exitEvent.id,
    exitYear: exitEvent.year,
    fundProceeds: exitEvent.fundProceeds,
    eligibleProceeds,
    recycledAmount,
    returnedToLPs,
    withinPeriod: exitEvent.withinRecyclingPeriod,
    appliedRate: exitEvent.withinRecyclingPeriod ? recyclingRate : 0
  };
}

/**
 * Calculate complete recycling schedule across all exits
 *
 * Processes exits chronologically, tracking cumulative recycling
 * and enforcing recycling cap.
 *
 * @param exits - Array of exit events (chronologically ordered)
 * @param recyclingRate - Exit recycling rate (%)
 * @param maxRecyclableCapital - Total recycling cap ($M)
 * @returns Complete recycling schedule
 */
export function calculateRecyclingSchedule(
  exits: ExitEvent[],
  recyclingRate: number,
  maxRecyclableCapital: number
): RecyclingSchedule {
  // Sort exits by year to process chronologically
  const sortedExits = [...exits].sort((a, b) => a.year - b.year);

  const recyclingByExit: RecyclingCalculation[] = [];
  let remainingCapacity = maxRecyclableCapital;
  let totalRecycled = 0;
  let totalReturnedToLPs = 0;

  // Process each exit
  for (const exitEvent of sortedExits) {
    const calculation = calculateSingleExitRecycling(
      exitEvent,
      recyclingRate,
      remainingCapacity
    );

    recyclingByExit.push(calculation);

    // Update running totals
    totalRecycled += calculation.recycledAmount;
    totalReturnedToLPs += calculation.returnedToLPs;
    remainingCapacity -= calculation.recycledAmount;
  }

  // Build cumulative by year
  const yearMap = new Map<number, number>();
  for (const calc of recyclingByExit) {
    const current = yearMap.get(calc.exitYear) || 0;
    yearMap.set(calc.exitYear, current + calc.recycledAmount);
  }

  const years = Array.from(yearMap.keys()).sort((a, b) => a - b);
  const cumulativeByYear = years.map((year, index) => {
    const annualRecycled = yearMap.get(year) || 0;
    const cumulativeRecycled = years
      .slice(0, index + 1)
      .reduce((sum, y) => sum + (yearMap.get(y) || 0), 0);

    return {
      year,
      annualRecycled,
      cumulativeRecycled
    };
  });

  return {
    recyclingByExit,
    totalRecycled,
    totalReturnedToLPs,
    remainingCapacity,
    capReached: remainingCapacity <= 0.01, // Allow small floating point tolerance
    cumulativeByYear
  };
}

// ============================================================================
// MANAGEMENT FEE RECYCLING
// ============================================================================

/**
 * Calculate recycled capital from management fees
 *
 * Some LPAs allow recycling of unused management fees back into fund investments.
 * This is less common than exit recycling but can extend deployment capacity.
 *
 * @param totalManagementFees - Total management fees collected ($M)
 * @param mgmtFeeRecyclingRate - Percentage of fees that can be recycled (%)
 * @returns Recyclable management fee capital ($M)
 */
export function calculateMgmtFeeRecycling(
  totalManagementFees: number,
  mgmtFeeRecyclingRate: number
): number {
  return totalManagementFees * (mgmtFeeRecyclingRate / 100);
}

// ============================================================================
// COMPLETE CALCULATIONS
// ============================================================================

/**
 * Calculate all exit recycling metrics
 *
 * Main entry point for deriving all calculated fields from user inputs.
 * Provides capacity analysis even without specific exit data.
 *
 * @param config - Exit recycling configuration
 * @param fundSize - Total fund size ($M)
 * @param exits - Optional array of exit events for schedule calculation
 * @returns Complete exit recycling calculations
 *
 * @example
 * ```typescript
 * const calculations = calculateExitRecycling(
 *   {
 *     enabled: true,
 *     recyclingCap: 15,
 *     recyclingPeriod: 5,
 *     exitRecyclingRate: 75,
 *     mgmtFeeRecyclingRate: 0
 *   },
 *   100, // $100M fund
 *   [] // No exits yet
 * );
 *
 * console.log(calculations.capacity.maxRecyclableCapital); // 15
 * console.log(calculations.extendedInvestmentCapacity); // 15
 * ```
 */
export function calculateExitRecycling(
  config: ExitRecyclingInput,
  fundSize: number,
  exits?: ExitEvent[]
): ExitRecyclingCalculations {
  // If recycling is disabled, return minimal calculations
  if (!config.enabled) {
    return {
      enabled: false,
      capacity: {
        maxRecyclableCapital: 0,
        recyclingCapPercentage: 0,
        recyclingPeriodYears: 0,
        annualRecyclingCapacity: 0
      },
      extendedInvestmentCapacity: 0,
      effectiveDeploymentRate: 100
    };
  }

  // Calculate recycling capacity
  const capacity = calculateRecyclingCapacity(
    fundSize,
    config.recyclingCap || 0,
    config.recyclingPeriod || 0
  );

  // Calculate recycling schedule if exits provided
  let schedule: RecyclingSchedule | undefined;
  if (exits && exits.length > 0) {
    schedule = calculateRecyclingSchedule(
      exits,
      config.exitRecyclingRate || 0,
      capacity.maxRecyclableCapital
    );
  }

  // Calculate extended investment capacity
  // This is the additional capital available for investment beyond initial fund size
  const extendedInvestmentCapacity = schedule
    ? schedule.totalRecycled
    : capacity.maxRecyclableCapital;

  // Effective deployment rate accounts for recycling extending fund life
  const effectiveDeploymentRate =
    ((fundSize + extendedInvestmentCapacity) / fundSize) * 100;

  return {
    enabled: true,
    capacity,
    schedule,
    extendedInvestmentCapacity,
    effectiveDeploymentRate
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate exit recycling configuration
 *
 * Checks for logical consistency and common configuration errors.
 *
 * @param config - Exit recycling configuration
 * @param fundSize - Total fund size for context
 * @returns Validation result with errors and warnings
 */
export function validateExitRecycling(
  config: ExitRecyclingInput,
  _fundSize: number
): ValidationResult {
  const errors: Array<{ field: string; message: string }> = [];
  const warnings: Array<{ field: string; message: string }> = [];

  // If disabled, skip validation
  if (!config.enabled) {
    return { isValid: true, errors: [], warnings: [] };
  }

  // Required field validation
  if (config.recyclingCap === undefined) {
    errors.push({
      field: 'recyclingCap',
      message: 'Recycling cap is required when recycling is enabled'
    });
  }

  if (config.recyclingPeriod === undefined) {
    errors.push({
      field: 'recyclingPeriod',
      message: 'Recycling period is required when recycling is enabled'
    });
  }

  if (config.exitRecyclingRate === undefined) {
    errors.push({
      field: 'exitRecyclingRate',
      message: 'Exit recycling rate is required when recycling is enabled'
    });
  }

  // Range validation (if values provided)
  if (config.recyclingCap !== undefined) {
    if (config.recyclingCap < 0 || config.recyclingCap > 25) {
      errors.push({
        field: 'recyclingCap',
        message: 'Recycling cap should be between 0% and 25% of fund size'
      });
    }

    // Warning: Very high recycling cap
    if (config.recyclingCap > 20) {
      warnings.push({
        field: 'recyclingCap',
        message: 'Recycling cap above 20% is uncommon and may face LP scrutiny'
      });
    }

    // Warning: Very low recycling cap
    if (config.recyclingCap > 0 && config.recyclingCap < 5) {
      warnings.push({
        field: 'recyclingCap',
        message: 'Recycling cap below 5% may provide limited deployment flexibility'
      });
    }
  }

  if (config.recyclingPeriod !== undefined) {
    if (config.recyclingPeriod < 1 || config.recyclingPeriod > 10) {
      errors.push({
        field: 'recyclingPeriod',
        message: 'Recycling period should be between 1 and 10 years'
      });
    }

    // Warning: Short recycling period
    if (config.recyclingPeriod < 3) {
      warnings.push({
        field: 'recyclingPeriod',
        message: 'Recycling period under 3 years may not capture meaningful exits'
      });
    }

    // Warning: Long recycling period
    if (config.recyclingPeriod > 7) {
      warnings.push({
        field: 'recyclingPeriod',
        message: 'Recycling period over 7 years may overlap with fund harvest period'
      });
    }
  }

  if (config.exitRecyclingRate !== undefined) {
    if (config.exitRecyclingRate < 0 || config.exitRecyclingRate > 100) {
      errors.push({
        field: 'exitRecyclingRate',
        message: 'Exit recycling rate must be between 0% and 100%'
      });
    }

    // Warning: Low recycling rate
    if (config.exitRecyclingRate < 50) {
      warnings.push({
        field: 'exitRecyclingRate',
        message: 'Exit recycling rate below 50% reduces effective recycling capacity'
      });
    }
  }

  // Warning: Mgmt fee recycling enabled
  if (config.mgmtFeeRecyclingRate && config.mgmtFeeRecyclingRate > 0) {
    warnings.push({
      field: 'mgmtFeeRecyclingRate',
      message: 'Management fee recycling is uncommon and may require specific LPA provisions'
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Check if exit is within recycling period
 *
 * Helper function to determine exit eligibility for recycling.
 *
 * @param exitYear - Year of exit (relative to vintage)
 * @param recyclingPeriod - Recycling period in years
 * @returns True if exit is within recycling period
 */
export function isExitWithinRecyclingPeriod(
  exitYear: number,
  recyclingPeriod: number
): boolean {
  return exitYear <= recyclingPeriod;
}

/**
 * Create exit event from basic parameters
 *
 * Helper to construct ExitEvent objects for testing and modeling.
 *
 * @param params - Exit event parameters
 * @returns Complete exit event
 */
export function createExitEvent(params: {
  id: string;
  year: number;
  grossProceeds: number;
  ownershipPercent: number;
  recyclingPeriod: number;
}): ExitEvent {
  const fundProceeds = params.grossProceeds * (params.ownershipPercent / 100);
  const withinRecyclingPeriod = isExitWithinRecyclingPeriod(
    params.year,
    params.recyclingPeriod
  );

  return {
    id: params.id,
    year: params.year,
    grossProceeds: params.grossProceeds,
    ownershipPercent: params.ownershipPercent,
    fundProceeds,
    withinRecyclingPeriod
  };
}
