import { useQuery } from '@tanstack/react-query';
import type { FundResultsComparisonV1 } from '@shared/contracts/fund-results-comparison-v1.contract';
import type { FundResultsReadV1 } from '@shared/contracts/fund-results-v1.contract';
import { useFundContext } from '@/contexts/FundContext';

async function readJsonOrNull<T>(url: string): Promise<T | null> {
  const response = await fetch(url);

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => response.statusText);
    throw new Error(errorText || `HTTP ${response.status}: request failed`);
  }

  return response.json() as Promise<T>;
}

export function useReserveIcPacketEvidence(enabled: boolean) {
  const { fundId } = useFundContext();

  const publishedResultsQuery = useQuery<FundResultsReadV1 | null>({
    queryKey: ['reserve-ic-packet', 'results', fundId],
    queryFn: async () => {
      if (!fundId) {
        return null;
      }
      return readJsonOrNull<FundResultsReadV1>(`/api/funds/${fundId}/results`);
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000,
  });

  const comparisonQuery = useQuery<FundResultsComparisonV1 | null>({
    queryKey: ['reserve-ic-packet', 'comparison', fundId],
    queryFn: async () => {
      if (!fundId) {
        return null;
      }
      return readJsonOrNull<FundResultsComparisonV1>(`/api/funds/${fundId}/results-comparison`);
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000,
  });

  return {
    publishedResultsQuery,
    comparisonQuery,
  };
}
