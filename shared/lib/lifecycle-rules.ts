/**
 * Fund Lifecycle Rules
 *
 * Helper functions for fund age calculation and lifecycle stage detection.
 * Used by forecasting engines to determine appropriate modeling behavior.
 */

/**
 * Fund age breakdown
 */
export interface FundAge {
  /** Full years since establishment */
  years: number;

  /** Additional months beyond full years */
  months: number;

  /** Total quarters (for modeling) */
  quarters: number;

  /** Total months */
  totalMonths: number;
}

/**
 * Fund lifecycle stages
 */
export type LifecycleStage =
  | 'investment'   // Active deployment (years 0-5 typically)
  | 'holding'      // Post-investment, pre-harvest (years 5-7)
  | 'harvest'      // Active exit phase (years 7-10)
  | 'liquidation'; // Wind-down phase (years 10+)

/**
 * Calculate fund age from establishment date
 *
 * @param establishmentDate - Fund establishment date (ISO string or Date)
 * @param asOfDate - Reference date (defaults to now)
 * @returns Fund age breakdown
 */
export function getFundAge(
  establishmentDate: string | Date,
  asOfDate: Date = new Date()
): FundAge {
  const established = typeof establishmentDate === 'string'
    ? new Date(establishmentDate)
    : establishmentDate;

  const totalMonths = Math.floor(
    (asOfDate.getTime() - established.getTime()) / (1000 * 60 * 60 * 24 * 30.44)
  );

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const quarters = Math.floor(totalMonths / 3);

  return {
    years,
    months,
    quarters,
    totalMonths
  };
}

/**
 * Determine lifecycle stage based on fund age
 *
 * Typical breakdown:
 * - Investment: Years 0-5 (deployment phase)
 * - Holding: Years 5-7 (growth phase)
 * - Harvest: Years 7-10 (exit phase)
 * - Liquidation: Years 10+ (wind-down)
 *
 * @param fundAge - Fund age object
 * @param investmentPeriodYears - Custom investment period (default 5)
 * @returns Lifecycle stage
 */
export function getLifecycleStage(
  fundAge: FundAge,
  investmentPeriodYears: number = 5
): LifecycleStage {
  const { years } = fundAge;

  if (years < investmentPeriodYears) {
    return 'investment';
  } else if (years < 7) {
    return 'holding';
  } else if (years < 10) {
    return 'harvest';
  } else {
    return 'liquidation';
  }
}

/**
 * Check if fund should force liquidation assumptions
 *
 * Funds beyond typical life (10+ years) should use aggressive
 * exit assumptions in forecasting.
 *
 * @param fundAge - Fund age object
 * @param maxLifeYears - Maximum fund life (default 12)
 * @returns True if forcing liquidation
 */
export function shouldForceLiquidation(
  fundAge: FundAge,
  maxLifeYears: number = 12
): boolean {
  return fundAge.years >= maxLifeYears;
}

/**
 * Get investment period end quarter
 *
 * @param investmentPeriodYears - Investment period in years
 * @returns Last quarter of investment period
 */
export function getInvestmentPeriodEndQuarter(
  investmentPeriodYears: number = 5
): number {
  return investmentPeriodYears * 4;
}

/**
 * Get fund life end quarter
 *
 * @param fundLifeYears - Total fund life in years
 * @returns Last quarter of fund life
 */
export function getFundLifeEndQuarter(
  fundLifeYears: number = 10
): number {
  return fundLifeYears * 4;
}

/**
 * Check if fund is in construction phase
 *
 * Construction phase = no investments made yet, still in first year
 *
 * @param fundAge - Fund age object
 * @param hasInvestments - Whether fund has any investments
 * @returns True if in construction phase
 */
export function isConstructionPhase(
  fundAge: FundAge,
  hasInvestments: boolean
): boolean {
  return !hasInvestments && fundAge.years === 0;
}
