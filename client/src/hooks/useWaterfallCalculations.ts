/**
 * Waterfall Calculations Hook
 * Calculate example distribution for waterfall preview
 */

import { useMemo } from 'react';
import { type Waterfall } from '@shared/types';
import { isEuropean } from '@/lib/waterfall';

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

    if (isEuropean(waterfall)) {
      // European waterfall: Whole fund basis with hurdle
      return calculateEuropeanDistribution(
        fundSize,
        totalValue,
        totalProfit,
        waterfall.hurdle,
        waterfall.catchUp
      );
    } else {
      // American waterfall: Deal-by-deal (simplified to 20% carry)
      return calculateAmericanDistribution(fundSize, totalValue, totalProfit);
    }
  }, [waterfall, moic]);
}

/**
 * Calculate European waterfall distribution
 * - LPs receive capital back + hurdle rate return
 * - GPs catch up to carry percentage
 * - Remaining profits split based on carry rate
 */
function calculateEuropeanDistribution(
  fundSize: number,
  totalValue: number,
  totalProfit: number,
  hurdleRate: number,
  catchUpRate: number
): WaterfallDistributionExample {
  const carryRate = 0.2; // 20% standard carry

  // Step 1: Return of capital to LPs
  let remainingValue = totalValue;
  const lpReturnOfCapital = Math.min(remainingValue, fundSize);
  remainingValue -= lpReturnOfCapital;

  // Step 2: Preferred return (hurdle) to LPs
  const preferredReturn = fundSize * hurdleRate;
  const lpPreferredReturn = Math.min(remainingValue, preferredReturn);
  remainingValue -= lpPreferredReturn;

  // Step 3: Catch-up to GP
  let gpCatchUp = 0;
  if (catchUpRate > 0 && remainingValue > 0) {
    // GP catches up until they have carryRate% of total profits above hurdle
    const targetGpShare = (lpPreferredReturn + remainingValue) * carryRate;
    gpCatchUp = Math.min(remainingValue * catchUpRate, targetGpShare);
    remainingValue -= gpCatchUp;
  }

  // Step 4: Split remaining profits
  const gpCarry = remainingValue * carryRate;
  const lpRemainingProfit = remainingValue * (1 - carryRate);

  // Totals
  const lpDistribution = lpReturnOfCapital + lpPreferredReturn + lpRemainingProfit;
  const gpDistribution = gpCatchUp + gpCarry;

  return {
    lpDistribution,
    gpDistribution,
    lpPercentage: (lpRemainingProfit / totalProfit) * 100,
    gpPercentage: ((gpCatchUp + gpCarry) / totalProfit) * 100,
    lpMoic: lpDistribution / fundSize,
    totalProfit
  };
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
