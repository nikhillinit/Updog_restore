/**
 * Fee calculation utilities for fund modeling
 *
 * Handles multiple fee bases, tiered step-downs, and provides both
 * quick preview calculations and precise fee drag computation.
 */

import type { Percentage} from '@shared/units';
import { pctToFraction, type Fraction } from '@shared/units';

export interface FeeTier {
  id: string;
  name: string;
  percentage: number;      // Annual percentage
  startMonth: number;
  endMonth?: number;       // null/undefined = until end of fund
  recyclingPercentage?: number; // % of fees that can be recycled
}

export interface FeeProfile {
  id: string;
  name: string;
  feeTiers: FeeTier[];
}

export type FeeBasis = 
  | 'committed_capital'
  | 'called_capital_period' 
  | 'gross_cumulative_called'
  | 'net_cumulative_called'
  | 'cumulative_invested'
  | 'fair_market_value'
  | 'unrealized_investments';

/**
 * Calculate precise fee drag as FRACTION (0-1) for use in calculations
 *
 * This is the preferred function for use in financial calculations.
 * Returns a type-safe Fraction that prevents unit mismatch bugs.
 *
 * @param tiers Fee tier configuration
 * @param termMonths Fund term in months (default 120 = 10 years)
 * @returns Total fee drag as Fraction (0-1) of committed capital
 * @example
 * // For 2% annual fee over 10 years:
 * committedFeeDragFraction(tiers) => 0.20 (as Fraction)
 */
export function committedFeeDragFraction(tiers: FeeTier[], termMonths = 120): Fraction {
  const pct = committedFeeDragPctFromTiers(tiers, termMonths);
  return pctToFraction(pct as Percentage);
}

/**
 * Calculate precise fee drag % from tier table for committed capital basis
 *
 * @deprecated Use committedFeeDragFraction() for calculations to ensure unit safety.
 * This function returns a percentage (0-100), which can lead to calculation errors
 * if mistaken for a fraction (0-1).
 *
 * This gives exact results for committed-basis funds (your default template)
 * and is still fast enough for real-time preview calculations.
 *
 * @param tiers Fee tier configuration
 * @param termMonths Fund term in months (default 120 = 10 years)
 * @returns Total fee drag as percentage of committed capital (e.g., 20 for 20%)
 * @example
 * // For 2% annual fee over 10 years:
 * committedFeeDragPctFromTiers(tiers) => 20 (percentage, not fraction!)
 */
export function committedFeeDragPctFromTiers(tiers: FeeTier[], termMonths = 120): number {
  if (!tiers.length) return 0;

  const endMonth = termMonths;
  let totalFeeMonthsPercent = 0;

  for (const tier of tiers) {
    const startMonth = Math.max(1, tier.startMonth ?? 1);
    const tierEndMonth = Math.min(endMonth, tier.endMonth ?? endMonth);

    if (tierEndMonth < startMonth) continue; // Invalid tier

    const monthsActive = tierEndMonth - startMonth + 1;
    const annualRate = tier.percentage || 0;

    // Convert annual percentage to monthly and accumulate
    totalFeeMonthsPercent += monthsActive * (annualRate / 12);
  }

  // Return total fee burden as % of committed capital over fund life
  return totalFeeMonthsPercent;
}

/**
 * Quick fee drag estimate for simple cases
 * 
 * @param managementFeeRate Annual management fee rate (e.g., 2.0 for 2%)
 * @param termYears Fund term in years (default 10)
 * @returns Simple fee drag percentage
 */
export function quickFeeDragEstimate(managementFeeRate: number, termYears = 10): number {
  return managementFeeRate * termYears;
}

/**
 * Validate fee tier configuration
 * 
 * @param tiers Fee tier array to validate
 * @returns Array of validation error messages
 */
export function validateFeeTiers(tiers: FeeTier[]): string[] {
  const errors: string[] = [];
  
  if (!tiers.length) {
    return ['At least one fee tier is required'];
  }
  
  tiers.forEach((tier: any, index: any) => {
    if (!tier.name?.trim()) {
      errors.push(`Tier ${index + 1}: Name is required`);
    }
    
    if (tier.percentage < 0 || tier.percentage > 10) {
      errors.push(`Tier ${index + 1}: Fee percentage must be between 0% and 10%`);
    }
    
    if (tier.startMonth < 1) {
      errors.push(`Tier ${index + 1}: Start month must be at least 1`);
    }
    
    if (tier.endMonth && tier.endMonth < tier.startMonth) {
      errors.push(`Tier ${index + 1}: End month must be after start month`);
    }
    
    if (tier.recyclingPercentage !== undefined) {
      if (tier.recyclingPercentage < 0 || tier.recyclingPercentage > 100) {
        errors.push(`Tier ${index + 1}: Recycling percentage must be between 0% and 100%`);
      }
    }
  });
  
  // Check for overlapping periods
  const sortedTiers = [...tiers].sort((a: any, b: any) => a.startMonth - b.startMonth);
  for (let i = 1; i < sortedTiers.length; i++) {
    const prev = sortedTiers[i - 1];
    const curr = sortedTiers[i];
    const prevEnd = prev.endMonth ?? Infinity;
    
    if (curr.startMonth <= prevEnd) {
      errors.push(`Overlapping fee periods: "${prev.name}" and "${curr.name}"`);
    }
  }
  
  return errors;
}

/**
 * Get fee templates for common fee structures
 */
export function getFeeTemplates(): { [key: string]: FeeTier[] } {
  return {
    'flat_2pct': [
      {
        id: 'tier-flat-2',
        name: 'Management Fee (2%)',
        percentage: 2.0,
        startMonth: 1,
        endMonth: 120 // 10 years
      }
    ],
    'step_down_2_1.5': [
      {
        id: 'tier-initial-2',
        name: 'Management Fee (2%)',
        percentage: 2.0,
        startMonth: 1,
        endMonth: 60 // 5 years
      },
      {
        id: 'tier-step-1.5',
        name: 'Management Fee (1.5%)',
        percentage: 1.5,
        startMonth: 61,
        endMonth: 120 // Years 6-10
      }
    ],
    'institutional_2.5_2_1.5': [
      {
        id: 'tier-ramp-2.5',
        name: 'Management Fee (2.5%)',
        percentage: 2.5,
        startMonth: 1,
        endMonth: 24 // Years 1-2
      },
      {
        id: 'tier-standard-2',
        name: 'Management Fee (2%)',
        percentage: 2.0,
        startMonth: 25,
        endMonth: 60 // Years 3-5
      },
      {
        id: 'tier-final-1.5',
        name: 'Management Fee (1.5%)',
        percentage: 1.5,
        startMonth: 61,
        endMonth: 120 // Years 6-10
      }
    ]
  };
}

/**
 * Calculate recycling capacity for fees
 * 
 * @param feesEarnedToDate Total fees earned to date
 * @param recyclingRate Percentage of fees that can be recycled (0-100)
 * @param recycledToDate Amount already recycled
 * @returns Available recycling capacity
 */
export function calculateFeeRecyclingCapacity(
  feesEarnedToDate: number,
  recyclingRate: number,
  recycledToDate: number
): number {
  const maxRecyclable = feesEarnedToDate * (recyclingRate / 100);
  return Math.max(0, maxRecyclable - recycledToDate);
}

/**
 * Get fee basis display names
 */
export function getFeeBasisDisplayName(basis: FeeBasis): string {
  const displayNames: Record<FeeBasis, string> = {
    'committed_capital': 'Committed Capital',
    'called_capital_period': 'Called Capital (Period)',
    'gross_cumulative_called': 'Gross Cumulative Called',
    'net_cumulative_called': 'Net Cumulative Called',
    'cumulative_invested': 'Cumulative Invested',
    'fair_market_value': 'Fair Market Value',
    'unrealized_investments': 'Unrealized Investments'
  };
  
  return displayNames[basis] || basis;
}

/**
 * Check if fee basis is supported for preview calculations
 * 
 * Preview calculations work best with committed capital basis.
 * Other bases require full cash flow modeling.
 */
export function isPreviewSupported(basis: FeeBasis): boolean {
  return basis === 'committed_capital';
}