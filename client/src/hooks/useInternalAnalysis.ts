/**
 * Internal periodic analysis reads (PLAN_61 Task 18, Wave G).
 *
 * Drafts and immutable references for one fund. References come back
 * terminal-per-revision-chain by default, so a corrected snapshot never competes
 * with its successor.
 *
 * @module client/hooks/useInternalAnalysis
 */
import { useQuery } from '@tanstack/react-query';

import type {
  AnalysisDraftListResponse,
  AnalysisDraftV1,
  AnalysisReferenceListResponse,
  AnalysisReferenceV1,
} from '@shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import { apiRequest } from '@/lib/queryClient';

export const internalAnalysisDraftsQueryKey = (fundId: number | undefined) =>
  ['internal-analysis-drafts', fundId ?? null] as const;

export const internalAnalysisReferencesQueryKey = (
  fundId: number | undefined,
  includeSuperseded: boolean
) => ['internal-analysis-references', fundId ?? null, includeSuperseded] as const;

export interface InternalAnalysisResult {
  drafts: AnalysisDraftV1[];
  references: AnalysisReferenceV1[];
  isLoading: boolean;
  error: Error | null;
}

export function useInternalAnalysis(
  fundId: number | undefined,
  options?: { includeSuperseded?: boolean }
): InternalAnalysisResult {
  const includeSuperseded = options?.includeSuperseded ?? false;

  const draftsQuery = useQuery<AnalysisDraftListResponse, Error>({
    queryKey: internalAnalysisDraftsQueryKey(fundId),
    enabled: fundId != null,
    queryFn: () =>
      apiRequest<AnalysisDraftListResponse>('GET', `/api/funds/${fundId}/internal-analysis/drafts`),
  });

  const referencesQuery = useQuery<AnalysisReferenceListResponse, Error>({
    queryKey: internalAnalysisReferencesQueryKey(fundId, includeSuperseded),
    enabled: fundId != null,
    queryFn: () =>
      apiRequest<AnalysisReferenceListResponse>(
        'GET',
        `/api/funds/${fundId}/internal-analysis/references${
          includeSuperseded ? '?includeSuperseded=true' : ''
        }`
      ),
  });

  return {
    drafts: draftsQuery.data?.drafts ?? [],
    references: referencesQuery.data?.references ?? [],
    isLoading: draftsQuery.isLoading || referencesQuery.isLoading,
    error: draftsQuery.error ?? referencesQuery.error,
  };
}
