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

function getErrorMessage(response: unknown, fallback: string): string {
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return fallback;
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
        const errorBody: unknown = await res.json().catch(() => ({}));
        throw new Error(getErrorMessage(errorBody, 'MOIC calculation failed'));
      }

      return (await res.json()) as PortfolioMOICSummary;
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
        const errorBody: unknown = await res.json().catch(() => ({}));
        throw new Error(getErrorMessage(errorBody, 'MOIC ranking failed'));
      }

      return (await res.json()) as RankedInvestment[];
    },
  });
}
