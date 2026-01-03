/**
 * Waterfall Calculations Hook
 * Calculate example distribution for waterfall preview
 */

import { useMemo } from 'react';
import { type Waterfall } from '@shared/types';

interface WaterfallDistributionExample {
  lpDistribution: number;
  gpDistribution: number;
  lpPercentage: number;
  gpPercentage: number;
  lpMoic: number;
  totalProfit: number;
}

/**
 * Calculate example waterfall distribution
 *
 * @param waterfall - Waterfall configuration
 * @param moic - Example MOIC (e.g., 2.5 for 2.5x return)
 * @returns Distribution breakdown for LPs and GPs
 */
export function useWaterfallCalculations(
  waterfall: Waterfall,
  moic: number = 2.5
): WaterfallDistributionExample {
  return useMemo(() => {
    // Example fund parameters
    const fundSize = 100; // $100M fund
    const totalValue = fundSize * moic;
    const totalProfit = totalValue - fundSize;

    // American waterfall: Deal-by-deal (simplified to 20% carry)
    return calculateAmericanDistribution(fundSize, totalValue, totalProfit);
  }, [moic]);
}

/**
 * Calculate American waterfall distribution (simplified)
 * - Standard 20% carry on profits
 * - No hurdle or catch-up (deal-by-deal basis)
 */
function calculateAmericanDistribution(
  fundSize: number,
  totalValue: number,
  totalProfit: number
): WaterfallDistributionExample {
  const carryRate = 0.2; // 20% standard carry

  // Simple split: LPs get capital back + 80% of profits
  const lpDistribution = fundSize + (totalProfit * (1 - carryRate));
  const gpDistribution = totalProfit * carryRate;

  return {
    lpDistribution,
    gpDistribution,
    lpPercentage: (1 - carryRate) * 100,
    gpPercentage: carryRate * 100,
    lpMoic: lpDistribution / fundSize,
    totalProfit
  };
}
