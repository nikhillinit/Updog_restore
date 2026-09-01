import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DecisionCreate,
  DecisionEvidenceLinkCreateRequest,
  DecisionEvidenceLinkListResponse,
  DecisionEvidenceLinkV1,
  DecisionListResponse,
  DecisionOutcome,
  DecisionTransition,
  DecisionV1,
} from '@shared/contracts/operating-objects/decision.contract';
import { ApiError, apiRequest } from '@/lib/queryClient';
import { useIdempotencyKey } from '@/hooks/useIdempotencyKey';

interface EvidenceLinksOptions {
  enabled: boolean;
}

export interface TransitionDecisionVariables {
  decisionId: number;
  etag: string;
  input: DecisionTransition;
}

export interface RecordDecisionOutcomeVariables {
  decisionId: number;
  etag: string;
  input: DecisionOutcome;
}

export interface SupersedeDecisionVariables {
  decisionId: number;
  input: DecisionCreate;
}

export interface CreateDecisionEvidenceLinkVariables {
  decisionId: number;
  input: DecisionEvidenceLinkCreateRequest;
}

export function useDecisions(fundId: number | undefined): UseQueryResult<DecisionV1[], Error> {
  return useQuery<DecisionV1[], Error>({
    queryKey: ['decisions', fundId],
    queryFn: async () => {
      if (fundId === undefined) {
        throw new Error('No fund ID available');
      }

      const response = await apiRequest<DecisionListResponse>(
        'GET',
        `/api/funds/${fundId}/decisions`
      );
      return response.data;
    },
    enabled: fundId !== undefined,
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

export function useDecisionEvidenceLinks(
  fundId: number | undefined,
  decisionId: number | undefined,
  options: EvidenceLinksOptions
): UseQueryResult<DecisionEvidenceLinkV1[], Error> {
  return useQuery<DecisionEvidenceLinkV1[], Error>({
    queryKey: ['decision-evidence-links', fundId, decisionId],
    queryFn: async () => {
      if (fundId === undefined || decisionId === undefined) {
        throw new Error('Fund and decision IDs are required');
      }

      const response = await apiRequest<DecisionEvidenceLinkListResponse>(
        'GET',
        `/api/funds/${fundId}/decisions/${decisionId}/evidence-links`
      );
      return response.data;
    },
    enabled: options.enabled && fundId !== undefined && decisionId !== undefined,
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

export function useCreateDecision(
  fundId: number | undefined
): UseMutationResult<DecisionV1, Error, DecisionCreate> {
  const queryClient = useQueryClient();
  const idempotencyKey = useIdempotencyKey();

  return useMutation<DecisionV1, Error, DecisionCreate>({
    mutationFn: async (input) => {
      if (fundId === undefined) {
        throw new Error('No fund ID available');
      }

      return apiRequest<DecisionV1>('POST', `/api/funds/${fundId}/decisions`, input, {
        headers: { 'Idempotency-Key': idempotencyKey.keyFor(input) },
      });
    },
    onSuccess: () => {
      idempotencyKey.reset();
      return queryClient.invalidateQueries({ queryKey: ['decisions', fundId] });
    },
  });
}

export function useTransitionDecision(
  fundId: number | undefined
): UseMutationResult<DecisionV1, Error, TransitionDecisionVariables> {
  const queryClient = useQueryClient();

  return useMutation<DecisionV1, Error, TransitionDecisionVariables>({
    mutationFn: async ({ decisionId, etag, input }) => {
      if (fundId === undefined) {
        throw new Error('No fund ID available');
      }

      return apiRequest<DecisionV1>(
        'PATCH',
        `/api/funds/${fundId}/decisions/${decisionId}`,
        input,
        { headers: { 'If-Match': etag } }
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decisions', fundId] }),
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 412) {
        await queryClient.invalidateQueries({ queryKey: ['decisions', fundId] });
      }
    },
  });
}

export function useRecordDecisionOutcome(
  fundId: number | undefined
): UseMutationResult<DecisionV1, Error, RecordDecisionOutcomeVariables> {
  const queryClient = useQueryClient();

  return useMutation<DecisionV1, Error, RecordDecisionOutcomeVariables>({
    mutationFn: async ({ decisionId, etag, input }) => {
      if (fundId === undefined) {
        throw new Error('No fund ID available');
      }

      return apiRequest<DecisionV1>(
        'POST',
        `/api/funds/${fundId}/decisions/${decisionId}/outcome`,
        input,
        { headers: { 'If-Match': etag } }
      );
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['decisions', fundId] }),
    onError: async (error) => {
      if (error instanceof ApiError && error.status === 412) {
        await queryClient.invalidateQueries({ queryKey: ['decisions', fundId] });
      }
    },
  });
}

export function useSupersedeDecision(
  fundId: number | undefined
): UseMutationResult<DecisionV1, Error, SupersedeDecisionVariables> {
  const queryClient = useQueryClient();
  const idempotencyKey = useIdempotencyKey();

  return useMutation<DecisionV1, Error, SupersedeDecisionVariables>({
    mutationFn: async ({ decisionId, input }) => {
      if (fundId === undefined) {
        throw new Error('No fund ID available');
      }

      return apiRequest<DecisionV1>(
        'POST',
        `/api/funds/${fundId}/decisions/${decisionId}/supersede`,
        input,
        { headers: { 'Idempotency-Key': idempotencyKey.keyFor({ decisionId, input }) } }
      );
    },
    onSuccess: () => {
      idempotencyKey.reset();
      return queryClient.invalidateQueries({ queryKey: ['decisions', fundId] });
    },
  });
}

export function useCreateDecisionEvidenceLink(
  fundId: number | undefined
): UseMutationResult<DecisionEvidenceLinkV1, Error, CreateDecisionEvidenceLinkVariables> {
  const queryClient = useQueryClient();
  const idempotencyKey = useIdempotencyKey();

  return useMutation<DecisionEvidenceLinkV1, Error, CreateDecisionEvidenceLinkVariables>({
    mutationFn: async ({ decisionId, input }) => {
      if (fundId === undefined) {
        throw new Error('No fund ID available');
      }

      return apiRequest<DecisionEvidenceLinkV1>(
        'POST',
        `/api/funds/${fundId}/decisions/${decisionId}/evidence-links`,
        input,
        { headers: { 'Idempotency-Key': idempotencyKey.keyFor({ decisionId, input }) } }
      );
    },
    onSuccess: async (_link, variables) => {
      idempotencyKey.reset();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['decisions', fundId] }),
        queryClient.invalidateQueries({
          queryKey: ['decision-evidence-links', fundId, variables.decisionId],
        }),
      ]);
    },
  });
}
