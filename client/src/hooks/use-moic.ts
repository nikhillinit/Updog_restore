/**
 * MOIC Calculator Hooks
 *
 * React hooks for MOIC calculations via API.
 */

import { useMutation, useQuery } from '@tanstack/react-query';
import type { Investment, PortfolioMOICSummary, MOICResult } from '@shared/core/moic';
import {
  FundMoicRankingsResponseV2Schema,
  type FundMoicRankingsResponseV2,
} from '@shared/contracts/fund-moic-v2.contract';

interface RankedInvestment {
  investment: Investment;
  reservesMOIC: MOICResult;
  rank: number;
}

export type FundMoicRankingsHookError = Error & {
  code?: 'CONTRACT_PARSE_ERROR';
  status?: number;
};

function getErrorMessage(response: unknown, fallback: string): string {
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const message = (response as { message?: unknown }).message;

    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  return fallback;
}

function buildFundMoicContractError(status?: number): FundMoicRankingsHookError {
  const error = new Error('MOIC rankings contract parse failed') as FundMoicRankingsHookError;
  error.code = 'CONTRACT_PARSE_ERROR';
  if (status !== undefined) {
    error.status = status;
  }
  return error;
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

export function useFundMoicRankingsV2(fundId: number | null) {
  const validFundId = fundId !== null && Number.isInteger(fundId) && fundId > 0 ? fundId : null;

  return useQuery<FundMoicRankingsResponseV2, FundMoicRankingsHookError>({
    queryKey: ['fund-moic-rankings-v2', validFundId],
    queryFn: async () => {
      if (validFundId === null) {
        throw new Error('A positive fund ID is required') as FundMoicRankingsHookError;
      }

      const res = await fetch(`/api/funds/${validFundId}/moic/rankings?contract=v2`, {
        credentials: 'include',
      });

      if (!res.ok) {
        const errorBody: unknown = await res.json().catch(() => ({}));
        const error = new Error(
          getErrorMessage(errorBody, 'Failed to load live MOIC rankings')
        ) as FundMoicRankingsHookError;
        error.status = res.status;
        throw error;
      }

      const raw: unknown = await res.json().catch(() => {
        throw buildFundMoicContractError(res.status);
      });
      const parsed = FundMoicRankingsResponseV2Schema.safeParse(raw);

      if (!parsed.success) {
        throw buildFundMoicContractError(res.status);
      }

      return parsed.data;
    },
    enabled: validFundId !== null,
  });
}
