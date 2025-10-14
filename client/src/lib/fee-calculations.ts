/**
 * Fee Calculations Library
 *
 * Comprehensive calculations for fund fees and expenses:
 * - Management fees with step-downs and basis types
 * - Carried interest with American/European waterfall
 * - Fee recycling schedules
 * - Net return impact analysis
 *
 * Pure functions with detailed JSDoc comments.
 * All monetary values in millions ($M) unless noted.
 */

import type { FeeBasis, WaterfallType } from '@/schemas/modeling-wizard.schemas';

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

/**
 * Management fee configuration
 */
export interface ManagementFeeConfig {
  /** Fund size in millions ($M) */
  fundSize: number;
  /** Base management fee rate (%) */
  feeRate: number;
  /** Fee calculation basis */
  basis: FeeBasis;
  /** Fund term in years */
  fundTerm: number;
  /** Optional step-down configuration */
  stepDown?: {
    /** Year after which step-down applies (1-indexed) */
    afterYear: number;
    /** New fee rate after step-down (%) */
    newRate: number;
  };
}

/**
 * Yearly management fee breakdown
 */
export interface YearlyFee {
  /** Year number (1-indexed) */
  year: number;
  /** Capital basis for fee calculation ($M) */
  basisAmount: number;
  /** Fee rate applied (%) */
  feeRate: number;
  /** Fee amount for this year ($M) */
  feeAmount: number;
  /** Cumulative fees through this year ($M) */
  cumulativeFees: number;
}

/**
 * Carried interest calculation configuration
 */
export interface CarryConfig {
  /** Gross returns before carry ($M) */
  grossReturns: number;
  /** Total invested capital ($M) */
  investedCapital: number;
  /** Hurdle rate (%) */
  hurdleRate: number;
  /** Carry rate - GP's share of profits (%) */
  carryRate: number;
  /** Catch-up percentage - how fast GP catches up (%) */
  catchUpPercentage: number;
  /** Waterfall type */
  waterfallType: WaterfallType;
}

/**
 * Carried interest calculation result
 */
export interface CarryCalculation {
  /** Preferred return amount - invested capital + hurdle ($M) */
  preferredReturn: number;
  /** Returns above the preferred return ($M) */
  returnsAboveHurdle: number;
  /** GP catch-up amount before carry split ($M) */
  catchUpAmount: number;
  /** Total GP carried interest ($M) */
  gpCarry: number;
  /** LP net proceeds after carry ($M) */
  lpNet: number;
}

/**
 * Fee recycling configuration
 */
export interface FeeRecyclingConfig {
  /** Management fees by year */
  managementFees: YearlyFee[];
  /** Maximum recyclable as % of fund size */
  recyclingCapPercent: number;
  /** Term during which fees can be recycled (months) */
  recyclingTermMonths: number;
  /** Fund size ($M) */
  fundSize: number;
}

/**
 * Fee recycling schedule by year
 */
export interface RecyclingSchedule {
  /** Total recyclable amount ($M) */
  totalRecyclable: number;
  /** Recycling breakdown by year */
  recyclingByYear: Array<{
    /** Year number (1-indexed) */
    year: number;
    /** Fee amount eligible for recycling ($M) */
    feeAmount: number;
    /** Cumulative recyclable amount ($M) */
    cumulative: number;
  }>;
}

/**
 * Complete fee structure for impact analysis
 */
export interface FeeStructure {
  /** Management fee configuration */
  managementFee: {
    rate: number;
    basis: FeeBasis;
    stepDown?: {
      enabled: boolean;
      afterYear?: number;
      newRate?: number;
    };
  };
  /** Carried interest configuration */
  carriedInterest?: {
    enabled: boolean;
    rate: number;
    hurdleRate: number;
    catchUpPercentage: number;
    waterfallType: WaterfallType;
  };
  /** Admin expenses configuration */
  adminExpenses: {
    annualAmount: number;
    growthRate: number;
  };
}

/**
 * Fee impact analysis result
 */
export interface FeeImpactResult {
  /** Total management fees over fund life ($M) */
  totalManagementFees: number;
  /** Total admin expenses over fund life ($M) */
  totalAdminExpenses: number;
  /** Total carried interest ($M) */
  totalCarry: number;
  /** Gross multiple on invested capital (MOIC) */
  grossMOIC: number;
  /** Net multiple on invested capital after fees (MOIC) */
  netMOIC: number;
  /** Fee drag in basis points (10000 * (gross - net) / gross) */
  feeDragBps: number;
  /** Yearly breakdown */
  yearlyBreakdown: Array<{
    year: number;
    managementFee: number;
    adminExpenses: number;
    cumulativeFees: number;
  }>;
}

// ============================================================================
// MANAGEMENT FEE CALCULATIONS
// ============================================================================

/**
 * Calculate management fees over fund term with step-downs
 *
 * @param config - Management fee configuration
 * @returns Array of yearly fee calculations
 *
 * @example
 * ```ts
 * const fees = calculateManagementFees({
 *   fundSize: 100,
 *   feeRate: 2.0,
 *   basis: 'committed',
 *   fundTerm: 10,
 *   stepDown: { afterYear: 5, newRate: 1.0 }
 * });
 * // Returns 10 years of fees with step-down after year 5
 * ```
 */
export function calculateManagementFees(
  config: ManagementFeeConfig
): YearlyFee[] {
  const { fundSize, feeRate, basis, fundTerm, stepDown } = config;
  const fees: YearlyFee[] = [];
  let cumulative = 0;

  for (let year = 1; year <= fundTerm; year++) {
    // Determine basis amount (for MVP, all basis types use committed)
    // Future enhancement: implement called capital and FMV tracking
    const basisAmount = fundSize;

    // Determine applicable fee rate
    const applicableFeeRate =
      stepDown && year > stepDown.afterYear
        ? stepDown.newRate
        : feeRate;

    // Calculate fee for this year
    const feeAmount = basisAmount * (applicableFeeRate / 100);
    cumulative += feeAmount;

    fees.push({
      year,
      basisAmount,
      feeRate: applicableFeeRate,
      feeAmount,
      cumulativeFees: cumulative,
    });
  }

  return fees;
}

/**
 * Calculate total management fees over fund term
 *
 * @param config - Management fee configuration
 * @returns Total management fees ($M)
 */
export function calculateTotalManagementFees(
  config: ManagementFeeConfig
): number {
  const fees = calculateManagementFees(config);
  return fees.reduce((sum, fee) => sum + fee.feeAmount, 0);
}

// ============================================================================
// CARRIED INTEREST CALCULATIONS
// ============================================================================

/**
 * Calculate carried interest using American or European waterfall
 *
 * **European Waterfall:**
 * 1. LP receives preferred return (hurdle) on entire fund
 * 2. GP catches up to their carry percentage
 * 3. Remaining profits split per carry rate
 *
 * **American Waterfall:**
 * Same calculation applied at fund level (simplified).
 * In reality, American waterfall is deal-by-deal.
 *
 * @param config - Carry calculation configuration
 * @returns Detailed carry calculation breakdown
 *
 * @example
 * ```ts
 * // European waterfall with 8% hurdle, 20% carry, 100% catch-up
 * const carry = calculateCarriedInterest({
 *   grossReturns: 250,
 *   investedCapital: 100,
 *   hurdleRate: 8,
 *   carryRate: 20,
 *   catchUpPercentage: 100,
 *   waterfallType: 'european'
 * });
 * // Returns: { preferredReturn: 108, returnsAboveHurdle: 142, gpCarry: 30, lpNet: 220 }
 * ```
 */
export function calculateCarriedInterest(
  config: CarryConfig
): CarryCalculation {
  const {
    grossReturns,
    investedCapital,
    hurdleRate,
    carryRate,
    catchUpPercentage,
  } = config;

  // Calculate preferred return (invested capital + hurdle)
  const preferredReturn = investedCapital * (1 + hurdleRate / 100);

  // Initialize result
  const result: CarryCalculation = {
    preferredReturn,
    returnsAboveHurdle: 0,
    catchUpAmount: 0,
    gpCarry: 0,
    lpNet: grossReturns,
  };

  // No carry if returns don't exceed preferred return
  if (grossReturns <= preferredReturn) {
    return result;
  }

  // Calculate returns above hurdle
  const excessReturns = grossReturns - preferredReturn;
  result.returnsAboveHurdle = excessReturns;

  // Handle catch-up calculation
  if (catchUpPercentage > 0 && hurdleRate > 0) {
    // Calculate catch-up amount
    // GP catches up until they have their carry % of total distributions
    // Catch-up formula: GP gets 100% of distributions until they catch up

    // Target: GP should have carryRate% of (preferredReturn + catchUpAmount)
    // GP gets: catchUpAmount
    // So: catchUpAmount = carryRate% * (preferredReturn + catchUpAmount)
    // Solving: catchUpAmount = (carryRate/100) * preferredReturn / (1 - carryRate/100)

    // But catch-up is typically limited by catchUpPercentage
    const hurdleAmount = preferredReturn - investedCapital;
    const fullCatchUpAmount = (carryRate / 100) * hurdleAmount / (1 - carryRate / 100);
    const maxCatchUpAmount = hurdleAmount * (catchUpPercentage / 100);
    const catchUpAmount = Math.min(fullCatchUpAmount, maxCatchUpAmount, excessReturns);

    result.catchUpAmount = catchUpAmount;
    result.gpCarry += catchUpAmount;

    // Apply carry rate to remaining excess
    const remainingExcess = excessReturns - catchUpAmount;
    if (remainingExcess > 0) {
      result.gpCarry += remainingExcess * (carryRate / 100);
    }
  } else {
    // No catch-up: apply carry rate to all excess returns
    result.gpCarry = excessReturns * (carryRate / 100);
  }

  // Calculate LP net
  result.lpNet = grossReturns - result.gpCarry;

  return result;
}

/**
 * Calculate effective carry rate (blended rate on all returns)
 *
 * @param carry - Carry calculation result
 * @param grossReturns - Total gross returns ($M)
 * @returns Effective carry rate as percentage of gross returns
 */
export function calculateEffectiveCarryRate(
  carry: CarryCalculation,
  grossReturns: number
): number {
  if (grossReturns === 0) return 0;
  return (carry.gpCarry / grossReturns) * 100;
}

// ============================================================================
// FEE RECYCLING CALCULATIONS
// ============================================================================

/**
 * Calculate fee recycling schedule
 *
 * Determines which management fees are eligible for recycling based on:
 * - Recycling cap (% of fund size)
 * - Recycling term (months from vintage)
 *
 * @param config - Fee recycling configuration
 * @returns Recycling schedule with yearly breakdown
 *
 * @example
 * ```ts
 * const recycling = calculateFeeRecycling({
 *   managementFees: fees, // from calculateManagementFees
 *   recyclingCapPercent: 10,
 *   recyclingTermMonths: 84, // 7 years
 *   fundSize: 100
 * });
 * // Returns: { totalRecyclable: 10, recyclingByYear: [...] }
 * ```
 */
export function calculateFeeRecycling(
  config: FeeRecyclingConfig
): RecyclingSchedule {
  const {
    managementFees,
    recyclingCapPercent,
    recyclingTermMonths,
    fundSize,
  } = config;

  // Calculate maximum recyclable amount
  const maxRecyclable = fundSize * (recyclingCapPercent / 100);

  // Convert term to years (ceiling to include partial years)
  const recyclingTermYears = Math.ceil(recyclingTermMonths / 12);

  // Build recycling schedule
  const recyclingByYear: RecyclingSchedule['recyclingByYear'] = [];
  let cumulative = 0;

  for (const fee of managementFees) {
    // Only include fees within recycling term
    if (fee.year > recyclingTermYears) {
      break;
    }

    // Don't exceed recycling cap
    const recyclableAmount = Math.min(
      fee.feeAmount,
      maxRecyclable - cumulative
    );

    if (recyclableAmount > 0) {
      cumulative += recyclableAmount;
      recyclingByYear.push({
        year: fee.year,
        feeAmount: recyclableAmount,
        cumulative,
      });
    }

    // Stop if we've hit the cap
    if (cumulative >= maxRecyclable) {
      break;
    }
  }

  return {
    totalRecyclable: cumulative,
    recyclingByYear,
  };
}

// ============================================================================
// ADMIN EXPENSES CALCULATIONS
// ============================================================================

/**
 * Calculate admin expenses over fund term with growth rate
 *
 * @param annualAmount - Initial annual admin expenses ($M)
 * @param growthRate - Annual growth rate (%)
 * @param fundTerm - Fund term in years
 * @returns Array of yearly admin expenses
 */
export function calculateAdminExpenses(
  annualAmount: number,
  growthRate: number,
  fundTerm: number
): Array<{ year: number; amount: number; cumulative: number }> {
  const expenses: Array<{ year: number; amount: number; cumulative: number }> = [];
  let cumulative = 0;
  let currentAmount = annualAmount;

  for (let year = 1; year <= fundTerm; year++) {
    cumulative += currentAmount;
    expenses.push({
      year,
      amount: currentAmount,
      cumulative,
    });

    // Apply growth rate for next year
    currentAmount *= 1 + growthRate / 100;
  }

  return expenses;
}

/**
 * Calculate total admin expenses over fund term
 *
 * @param annualAmount - Initial annual admin expenses ($M)
 * @param growthRate - Annual growth rate (%)
 * @param fundTerm - Fund term in years
 * @returns Total admin expenses ($M)
 */
export function calculateTotalAdminExpenses(
  annualAmount: number,
  growthRate: number,
  fundTerm: number
): number {
  const expenses = calculateAdminExpenses(annualAmount, growthRate, fundTerm);
  return expenses.reduce((sum, exp) => sum + exp.amount, 0);
}

// ============================================================================
// FEE IMPACT ANALYSIS
// ============================================================================

/**
 * Calculate comprehensive fee impact on fund returns
 *
 * Combines all fee types and calculates net returns after fees:
 * - Management fees (with step-downs)
 * - Admin expenses (with growth)
 * - Carried interest
 *
 * @param fundSize - Fund size ($M)
 * @param feeStructure - Complete fee structure configuration
 * @param fundTerm - Fund term in years
 * @param grossReturns - Optional gross returns for carry calculation ($M)
 * @param investedCapital - Optional invested capital for carry calculation ($M)
 * @returns Detailed fee impact analysis
 *
 * @example
 * ```ts
 * const impact = calculateFeeImpact(100, feeStructure, 10, 250, 90);
 * console.log(`Net MOIC: ${impact.netMOIC.toFixed(2)}x`);
 * console.log(`Fee drag: ${impact.feeDragBps} bps`);
 * ```
 */
export function calculateFeeImpact(
  fundSize: number,
  feeStructure: FeeStructure,
  fundTerm: number,
  grossReturns?: number,
  investedCapital?: number
): FeeImpactResult {
  // Calculate management fees
  const managementFeeConfig: ManagementFeeConfig = {
    fundSize,
    feeRate: feeStructure.managementFee.rate,
    basis: feeStructure.managementFee.basis,
    fundTerm,
    ...(feeStructure.managementFee.stepDown?.enabled &&
      feeStructure.managementFee.stepDown.afterYear !== undefined &&
      feeStructure.managementFee.stepDown.newRate !== undefined
      ? {
          stepDown: {
            afterYear: feeStructure.managementFee.stepDown.afterYear,
            newRate: feeStructure.managementFee.stepDown.newRate,
          },
        }
      : {}),
  };

  const managementFees = calculateManagementFees(managementFeeConfig);
  const totalManagementFees = managementFees.reduce(
    (sum, fee) => sum + fee.feeAmount,
    0
  );

  // Calculate admin expenses
  const adminExpenses = calculateAdminExpenses(
    feeStructure.adminExpenses.annualAmount,
    feeStructure.adminExpenses.growthRate,
    fundTerm
  );
  const totalAdminExpenses = adminExpenses.reduce(
    (sum, exp) => sum + exp.amount,
    0
  );

  // Build yearly breakdown
  const yearlyBreakdown = managementFees.map((fee) => {
    const adminExp = adminExpenses.find((exp) => exp.year === fee.year);
    return {
      year: fee.year,
      managementFee: fee.feeAmount,
      adminExpenses: adminExp?.amount || 0,
      cumulativeFees: fee.cumulativeFees + (adminExp?.cumulative || 0),
    };
  });

  // Calculate carried interest if returns provided
  let totalCarry = 0;
  let grossMOIC = 1.0;
  let netMOIC = 1.0;
  let feeDragBps = 0;

  if (
    grossReturns !== undefined &&
    investedCapital !== undefined &&
    investedCapital > 0
  ) {
    // Calculate carry
    if (feeStructure.carriedInterest?.enabled) {
      const carryConfig: CarryConfig = {
        grossReturns,
        investedCapital,
        hurdleRate: feeStructure.carriedInterest.hurdleRate,
        carryRate: feeStructure.carriedInterest.rate,
        catchUpPercentage: feeStructure.carriedInterest.catchUpPercentage,
        waterfallType: feeStructure.carriedInterest.waterfallType,
      };

      const carry = calculateCarriedInterest(carryConfig);
      totalCarry = carry.gpCarry;
    }

    // Calculate MOICs
    grossMOIC = grossReturns / investedCapital;
    const netReturns = grossReturns - totalManagementFees - totalAdminExpenses - totalCarry;
    netMOIC = netReturns / investedCapital;

    // Calculate fee drag in basis points
    // Fee drag = (Gross Return % - Net Return %) * 10000
    const grossReturnPct = (grossReturns - investedCapital) / investedCapital;
    const netReturnPct = (netReturns - investedCapital) / investedCapital;
    feeDragBps = Math.round((grossReturnPct - netReturnPct) * 10000);
  }

  return {
    totalManagementFees,
    totalAdminExpenses,
    totalCarry,
    grossMOIC,
    netMOIC,
    feeDragBps,
    yearlyBreakdown,
  };
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Calculate effective management fee rate (average over fund life)
 *
 * @param fees - Yearly management fees
 * @returns Effective annual fee rate (%)
 */
export function calculateEffectiveFeeRate(fees: YearlyFee[]): number {
  if (fees.length === 0) return 0;

  const totalFees = fees.reduce((sum, fee) => sum + fee.feeAmount, 0);
  const avgBasis = fees.reduce((sum, fee) => sum + fee.basisAmount, 0) / fees.length;

  if (avgBasis === 0) return 0;
  return (totalFees / fees.length / avgBasis) * 100;
}

/**
 * Calculate LP net-to-gross ratio (efficiency metric)
 *
 * @param grossReturns - Gross returns ($M)
 * @param netReturns - Net returns after all fees ($M)
 * @returns Ratio of net to gross returns (0-1)
 */
export function calculateNetToGrossRatio(
  grossReturns: number,
  netReturns: number
): number {
  if (grossReturns === 0) return 0;
  return netReturns / grossReturns;
}

/**
 * Format fee impact for display
 *
 * @param impact - Fee impact result
 * @returns Formatted summary object
 */
export function formatFeeImpact(impact: FeeImpactResult): {
  managementFees: string;
  adminExpenses: string;
  carry: string;
  grossMOIC: string;
  netMOIC: string;
  feeDrag: string;
} {
  return {
    managementFees: `$${impact.totalManagementFees.toFixed(1)}M`,
    adminExpenses: `$${impact.totalAdminExpenses.toFixed(1)}M`,
    carry: `$${impact.totalCarry.toFixed(1)}M`,
    grossMOIC: `${impact.grossMOIC.toFixed(2)}x`,
    netMOIC: `${impact.netMOIC.toFixed(2)}x`,
    feeDrag: `${impact.feeDragBps} bps`,
  };
}

/**
 * Validate fee structure for common issues
 *
 * @param feeStructure - Fee structure to validate
 * @returns Validation result with warnings
 */
export function validateFeeStructure(feeStructure: FeeStructure): {
  valid: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check management fee rate
  if (feeStructure.managementFee.rate > 3) {
    warnings.push('Management fee over 3% is above market standards');
  }
  if (feeStructure.managementFee.rate < 1) {
    warnings.push('Management fee under 1% may be unsustainable');
  }

  // Check step-down
  if (feeStructure.managementFee.stepDown?.enabled) {
    const stepDown = feeStructure.managementFee.stepDown;
    if (
      stepDown.newRate !== undefined &&
      stepDown.newRate >= feeStructure.managementFee.rate
    ) {
      warnings.push('Step-down rate should be lower than initial rate');
    }
  }

  // Check carried interest
  if (feeStructure.carriedInterest?.enabled) {
    const carry = feeStructure.carriedInterest;
    if (carry.rate > 25) {
      warnings.push('Carried interest over 25% is above typical market rates');
    }
    if (carry.rate < 15) {
      warnings.push('Carried interest under 15% may not align GP incentives');
    }
    if (carry.hurdleRate > 10) {
      warnings.push('Hurdle rate over 10% is unusually high');
    }
  }

  return {
    valid: warnings.length === 0,
    warnings,
  };
}

/**
 * Calculate fee load (total fees as % of fund size)
 *
 * @param totalFees - Total fees over fund life ($M)
 * @param fundSize - Fund size ($M)
 * @returns Fee load as percentage of fund size
 */
export function calculateFeeLoad(totalFees: number, fundSize: number): number {
  if (fundSize === 0) return 0;
  return (totalFees / fundSize) * 100;
}

/**
 * Project management fees over custom period
 *
 * Useful for modeling extensions or alternative fund terms
 *
 * @param baseConfig - Base management fee configuration
 * @param periodYears - Custom period length in years
 * @returns Projected fees for custom period
 */
export function projectManagementFeesCustomPeriod(
  baseConfig: ManagementFeeConfig,
  periodYears: number
): YearlyFee[] {
  return calculateManagementFees({
    ...baseConfig,
    fundTerm: periodYears,
  });
}
