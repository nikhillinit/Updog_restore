/**
 * @adr {id: "adr-001", status: "active"}
 * @decision Use Math.ceil for conservative time allocation
 * @context Prevents under-allocating quarters; critical business risk mitigation
 * @alternatives Math.round (rejected: unsafe), Math.floor (rejected: very unsafe)
 * @consequences Slightly longer timelines, safer financial models, consistent UX
 * @stakeholders product-team, engineering-team, finance-team
 * @date 2025-08-26
 * @review_date 2025-11-26
 */

export const HORIZON_LIMITS = {
  MIN_YEARS: 1,
  MAX_YEARS: 20,
  MIN_QUARTERS: 4,
  MAX_QUARTERS: 80,
} as const;

/**
 * Convert investment horizon years to quarters using conservative ceiling approach.
 * Ensures sufficient time allocation for reserve calculations.
 */
export function yearsToQuarters(years: number): number {
  if (!Number.isFinite(years)) return 0;
  if (years < 0) return 0;
  if (years > HORIZON_LIMITS.MAX_YEARS) {
    throw new Error(`Investment horizon exceeds ${HORIZON_LIMITS.MAX_YEARS} years`);
  }

  // Conservative mapping: ceil ensures adequate time
  return Math.ceil(years * 4);
}

/**
 * Validate horizon quarters meet business requirements.
 */
export function validateHorizonQuarters(quarters: number): void {
  if (quarters < HORIZON_LIMITS.MIN_QUARTERS) {
    throw new Error(
      `Investment horizon must be at least ${HORIZON_LIMITS.MIN_YEARS} year (${HORIZON_LIMITS.MIN_QUARTERS} quarters)`
    );
  }
  if (quarters > HORIZON_LIMITS.MAX_QUARTERS) {
    throw new Error(
      `Investment horizon cannot exceed ${HORIZON_LIMITS.MAX_YEARS} years (${HORIZON_LIMITS.MAX_QUARTERS} quarters)`
    );
  }
}

export interface HorizonData {
  investmentHorizonYears: number;
  horizonQuarters: number;
  isValid: boolean;
  validationError?: string;
}

export function createHorizonData(years: number): HorizonData {
  try {
    const quarters = yearsToQuarters(years);
    validateHorizonQuarters(quarters);
    return {
      investmentHorizonYears: years,
      horizonQuarters: quarters,
      isValid: true,
    };
  } catch (error) {
    return {
      investmentHorizonYears: years,
      horizonQuarters: 0,
      isValid: false,
      validationError: error instanceof Error ? error.message : 'Unknown validation error',
    };
  }
}