/**
 * Internal periodic analysis reads (PLAN_61 Task 18, Wave G).
 *
 * Drafts and immutable references for one fund. References come back
 * terminal-per-revision-chain by default, so a corrected snapshot never competes
 * with its successor.
 *
 * @module client/hooks/useInternalAnalysis
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type {
  AnalysisDraftListResponse,
  AnalysisDraftEconomicsReferencePatchRequest,
  AnalysisDraftV1,
  AnalysisReferenceListResponse,
  AnalysisReferenceV1,
} from '@shared/contracts/internal-analysis/analysis-reference-snapshot-v1.contract';
import {
  QuarterlyReviewCommandReceiptResponseSchema,
  type QuarterlyReviewCommandResult,
} from '@shared/contracts/internal-analysis/quarterly-review-v1.contract';
import { ApiError, apiRequest } from '@/lib/queryClient';

export const internalAnalysisDraftsQueryKey = (fundId: number | undefined) =>
  ['internal-analysis-drafts', fundId ?? null] as const;

export const internalAnalysisReferencesQueryKey = (
  fundId: number | undefined,
  includeSuperseded: boolean
) => ['internal-analysis-references', fundId ?? null, includeSuperseded] as const;

const quarterlyReviewQueryKey = (fundId: number, draftId: number) =>
  ['quarterly-review', fundId, draftId] as const;

export interface InternalAnalysisCommandVariables {
  etag: string;
  idempotencyKey?: string;
}

export interface ReplaceInternalAnalysisEconomicsVariables extends InternalAnalysisCommandVariables {
  input: AnalysisDraftEconomicsReferencePatchRequest;
}

function commandHeaders(variables: InternalAnalysisCommandVariables): Record<string, string> {
  return {
    'If-Match': variables.etag,
    'Idempotency-Key': variables.idempotencyKey ?? crypto.randomUUID(),
  };
}

async function invalidateDraftAndReview(
  queryClient: ReturnType<typeof useQueryClient>,
  fundId: number,
  draftId: number
): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: internalAnalysisDraftsQueryKey(fundId) }),
    queryClient.invalidateQueries({ queryKey: quarterlyReviewQueryKey(fundId, draftId) }),
  ]);
}

function shouldRollback(error: Error): boolean {
  return error instanceof ApiError && error.status === 412;
}

export function useRefreshInternalAnalysisDraft(fundId: number, draftId: number) {
  const queryClient = useQueryClient();

  return useMutation<QuarterlyReviewCommandResult, Error, InternalAnalysisCommandVariables>({
    mutationFn: async (variables) => {
      const response = await apiRequest(
        'POST',
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/refresh`,
        {},
        { headers: commandHeaders(variables) }
      );
      return QuarterlyReviewCommandReceiptResponseSchema.parse(response).result;
    },
    onSuccess: async () => invalidateDraftAndReview(queryClient, fundId, draftId),
    onError: async (error) => {
      if (shouldRollback(error)) {
        await invalidateDraftAndReview(queryClient, fundId, draftId);
      }
    },
  });
}

export function useReplaceInternalAnalysisEconomicsReference(fundId: number, draftId: number) {
  const queryClient = useQueryClient();

  return useMutation<
    QuarterlyReviewCommandResult,
    Error,
    ReplaceInternalAnalysisEconomicsVariables
  >({
    mutationFn: async (variables) => {
      const response = await apiRequest(
        'PATCH',
        `/api/funds/${fundId}/internal-analysis/drafts/${draftId}/economics-reference`,
        variables.input,
        { headers: commandHeaders(variables) }
      );
      return QuarterlyReviewCommandReceiptResponseSchema.parse(response).result;
    },
    onSuccess: async () => invalidateDraftAndReview(queryClient, fundId, draftId),
    onError: async (error) => {
      if (shouldRollback(error)) {
        await invalidateDraftAndReview(queryClient, fundId, draftId);
      }
    },
  });
}

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
