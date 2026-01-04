/**
 * MOIC Calculator Hooks
 *
 * React hooks for MOIC calculations via API.
 */

import { useMutation } from '@tanstack/react-query';
import type { Investment, PortfolioMOICSummary, MOICResult } from '@shared/core/moic';

interface RankedInvestment {
  investment: Investment;
  reservesMOIC: MOICResult;
  rank: number;
}

/**
 * Hook for calculating portfolio MOIC summary
 */
export function useMOICCalculation() {
  return useMutation<PortfolioMOICSummary, Error, Investment[]>({
    mutationFn: async (investments: Investment[]) => {
      const res = await fetch('/api/moic/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investments }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'MOIC calculation failed');
      }

      return res.json();
    },
  });
}

/**
 * Hook for ranking investments by reserves MOIC
 */
export function useMOICRanking() {
  return useMutation<RankedInvestment[], Error, Investment[]>({
    mutationFn: async (investments: Investment[]) => {
      const res = await fetch('/api/moic/rank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investments }),
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({}));
        throw new Error(error.message || 'MOIC ranking failed');
      }

      return res.json();
    },
  });
}
