/**
 * Compass - Valuation Calculator
 * Core calculation logic for sandbox valuations
 *
 * Based on Gemini code review recommendations:
 * - Input validation
 * - Edge case handling
 * - Clear step-by-step calculations
 * - Financial precision considerations
 */

import type { ValuationInputs, ValuationResult, ComparableCompany, PortfolioCompanyMetrics } from './types';

/**
 * Validates valuation inputs are within logical ranges
 * @throws Error if inputs are invalid
 */
function validateInputs(inputs: ValuationInputs): void {
  const { revenue, selectedMultiple, iliquidityDiscount, controlPremium } = inputs;

  if (revenue < 0) {
    throw new Error('Revenue cannot be negative');
  }

  if (selectedMultiple < 0) {
    throw new Error('Selected multiple cannot be negative');
  }

  if (iliquidityDiscount < 0 || iliquidityDiscount > 1) {
    throw new Error('Illiquidity discount must be between 0 and 1 (0% and 100%)');
  }

  if (controlPremium < -1) {
    throw new Error('Control premium cannot be less than -1 (-100%)');
  }

  // Warn for extreme values (don't throw, just log)
  if (selectedMultiple > 50) {
    console.warn(`[Compass] High multiple detected: ${selectedMultiple}x - Is this intentional?`);
  }

  if (iliquidityDiscount > 0.5) {
    console.warn(`[Compass] High illiquidity discount: ${iliquidityDiscount * 100}% - Is this intentional?`);
  }
}

/**
 * Calculates median multiple from comparable companies
 * Handles edge cases: empty array, invalid data
 */
export function calculateMedianMultiple(comps: ComparableCompany[]): number {
  // Handle empty or invalid input
  if (!comps || comps.length === 0) {
    return 0;
  }

  // Filter out invalid multiples to prevent NaN
  const multiples = comps
    .map(c => c.evRevenueMultiple)
    .filter(m => typeof m === 'number' && !isNaN(m) && m > 0);

  if (multiples.length === 0) {
    console.warn('[Compass] No valid multiples found in comp set');
    return 0;
  }

  // Non-mutating sort
  const sortedMultiples = [...multiples].sort((a, b) => a - b);

  // Calculate median
  const mid = Math.floor(sortedMultiples.length / 2);

  if (sortedMultiples.length % 2 === 0) {
    // Even number: average of two middle values
    const prev = sortedMultiples[mid - 1] ?? 0;
    const curr = sortedMultiples[mid] ?? 0;
    return (prev + curr) / 2;
  } else {
    // Odd number: middle value
    return sortedMultiples[mid] ?? 0;
  }
}

/**
 * Calculates sandbox valuation with detailed metrics
 * This is the core calculation engine
 */
export function calculateSandboxValuation(
  inputs: ValuationInputs,
  comps: ComparableCompany[],
  company: PortfolioCompanyMetrics
): ValuationResult {
  // 1. Validate inputs
  validateInputs(inputs);

  const { revenue, selectedMultiple, iliquidityDiscount, controlPremium } = inputs;

  // 2. Calculate step-by-step with clear variable names
  const baseEnterpriseValue = revenue * selectedMultiple;

  const controlPremiumFactor = 1 + controlPremium;
  const evWithControl = baseEnterpriseValue * controlPremiumFactor;

  const illiquidityDiscountFactor = 1 - iliquidityDiscount;
  const finalValue = evWithControl * illiquidityDiscountFactor;

  // 3. Round to nearest dollar (financial convention)
  const sandboxValue = Math.round(finalValue);

  // 4. Calculate implied multiple
  const impliedMultiple = revenue > 0 ? sandboxValue / revenue : 0;

  // 5. Calculate vs. last round (if available)
  let vsLastRound;
  if (company.lastRound) {
    const absoluteChange = sandboxValue - company.lastRound.valuationUSD;
    const percentChange = company.lastRound.valuationUSD > 0
      ? (absoluteChange / company.lastRound.valuationUSD) * 100
      : 0;

    const multipleChange = impliedMultiple - company.lastRound.impliedMultiple;

    vsLastRound = {
      absoluteChange,
      percentChange,
      multipleChange,
    };
  }

  // 6. Build result object
  const result: ValuationResult = {
    sandboxValue,
    inputs,
    compsUsed: comps.map(c => c.id),
    metrics: {
      baseEV: Math.round(baseEnterpriseValue),
      evWithControl: Math.round(evWithControl),
      finalValue: Math.round(finalValue),
      impliedMultiple: Math.round(impliedMultiple * 100) / 100, // Round to 2 decimals
      vsLastRound,
    },
    calculatedAt: new Date(),
  };

  return result;
}

/**
 * Calculates a range of valuations based on comp set
 * Useful for showing sensitivity
 */
export function calculateValuationRange(
  baseInputs: ValuationInputs,
  comps: ComparableCompany[],
  company: PortfolioCompanyMetrics
): {
  low: number;
  median: number;
  high: number;
  p25: number;
  p75: number;
} {
  if (!comps || comps.length === 0) {
    return { low: 0, median: 0, high: 0, p25: 0, p75: 0 };
  }

  // Get all multiples and calculate percentiles
  const multiples = comps
    .map(c => c.evRevenueMultiple)
    .filter(m => typeof m === 'number' && !isNaN(m) && m > 0)
    .sort((a, b) => a - b);

  if (multiples.length === 0) {
    return { low: 0, median: 0, high: 0, p25: 0, p75: 0 };
  }

  const getPercentile = (arr: number[], percentile: number): number => {
    const index = Math.ceil((percentile / 100) * arr.length) - 1;
    return arr[Math.max(0, Math.min(index, arr.length - 1))];
  };

  // Calculate valuations at different percentiles
  const calculateAtMultiple = (multiple: number): number => {
    const result = calculateSandboxValuation(
      { ...baseInputs, selectedMultiple: multiple },
      comps,
      company
    );
    return result.sandboxValue;
  };

  return {
    low: calculateAtMultiple(multiples[0]),
    p25: calculateAtMultiple(getPercentile(multiples, 25)),
    median: calculateAtMultiple(getPercentile(multiples, 50)),
    p75: calculateAtMultiple(getPercentile(multiples, 75)),
    high: calculateAtMultiple(multiples[multiples.length - 1]),
  };
}

/**
 * Utility: Format valuation for display
 */
export function formatValuation(value: number): string {
  if (value >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`;
  } else if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  } else {
    return `$${value.toFixed(0)}`;
  }
}

/**
 * Utility: Calculate multiple from valuation and revenue
 */
export function calculateMultiple(valuation: number, revenue: number): number {
  if (revenue <= 0) return 0;
  return Math.round((valuation / revenue) * 100) / 100;
}
