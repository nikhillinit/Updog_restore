import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashFlowEventResponse,
  LpCapitalCallPatch,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import { apiRequest } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/http-response';

// The pure draft-edit form model lives in a framework-free module so server
// integration tests can import the exact client serializer. Re-exported here so
// existing imports from this hook path keep working.
export {
  buildLpCapitalCallPatch,
  formFromEvent,
  isCashEventFormValid,
  type CashEventEditForm,
} from '@/lib/cash-event-edit-model';

interface UseCashFlowEventsOptions {
  /** Enable/disable the query (e.g. only fetch when the panel is open). */
  enabled?: boolean;
}

/**
 * Read-only list of persisted cash-flow events for a fund, newest-first.
 * Reads GET /api/funds/:fundId/cash-flow-events (server returns { data: [...] }).
 */
export function useCashFlowEvents(
  fundId: string | undefined,
  options: UseCashFlowEventsOptions = {}
): UseQueryResult<CashFlowEventResponse[], Error> {
  const { enabled = true } = options;

  return useQuery<CashFlowEventResponse[], Error>({
    queryKey: ['cash-flow-events', fundId],
    queryFn: async () => {
      if (!fundId) {
        throw new Error('No fund ID available');
      }

      const response = await fetch(`/api/funds/${fundId}/cash-flow-events`);
      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        throw new Error(
          getErrorMessage(errorData) || `HTTP ${response.status}: Failed to fetch cash flow events`
        );
      }

      const body = (await response.json()) as { data: CashFlowEventResponse[] };
      return body.data;
    },
    enabled: enabled && !!fundId,
    staleTime: 60_000,
    gcTime: 600_000,
    refetchOnWindowFocus: false,
  });
}

// ============================================================================
// Draft-edit mutation — PATCH with If-Match. First If-Match client in the repo.
// ============================================================================

export interface UpdateCashFlowEventVariables {
  eventId: number;
  /** Opaque etag of the loaded row; echoed verbatim as If-Match. */
  etag: string;
  patch: LpCapitalCallPatch;
}

export interface CashFlowEventMutationError {
  status: number;
  message: string;
}

export function useUpdateCashFlowEvent(
  fundId: string | undefined
): UseMutationResult<
  CashFlowEventResponse,
  CashFlowEventMutationError,
  UpdateCashFlowEventVariables
> {
  const queryClient = useQueryClient();

  return useMutation<
    CashFlowEventResponse,
    CashFlowEventMutationError,
    UpdateCashFlowEventVariables
  >({
    mutationFn: async ({ eventId, etag, patch }) => {
      if (!fundId) {
        throw { status: 0, message: 'No fund ID available' } as CashFlowEventMutationError;
      }
      try {
        return await apiRequest<CashFlowEventResponse>(
          'PATCH',
          `/api/funds/${fundId}/cash-flow-events/${eventId}`,
          patch,
          { headers: { 'If-Match': etag } }
        );
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        throw {
          status: err.status ?? 500,
          message: err.message ?? 'Failed to update cash flow event',
        } as CashFlowEventMutationError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-events', fundId] });
    },
  });
}

export interface TransitionCashFlowEventVariables {
  eventId: number;
  /** Opaque etag of the loaded row; echoed verbatim as If-Match. */
  etag: string;
}

function useTransitionCashFlowEvent(
  fundId: string | undefined,
  action: 'approve' | 'lock'
): UseMutationResult<
  CashFlowEventResponse,
  CashFlowEventMutationError,
  TransitionCashFlowEventVariables
> {
  const queryClient = useQueryClient();

  return useMutation<
    CashFlowEventResponse,
    CashFlowEventMutationError,
    TransitionCashFlowEventVariables
  >({
    mutationFn: async ({ eventId, etag }) => {
      if (!fundId) {
        throw { status: 0, message: 'No fund ID available' } as CashFlowEventMutationError;
      }
      try {
        return await apiRequest<CashFlowEventResponse>(
          'POST',
          `/api/funds/${fundId}/cash-flow-events/${eventId}/${action}`,
          undefined,
          { headers: { 'If-Match': etag } }
        );
      } catch (error: unknown) {
        const err = error as { status?: number; message?: string };
        throw {
          status: err.status ?? 500,
          message: err.message ?? `Failed to ${action} cash flow event`,
        } as CashFlowEventMutationError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cash-flow-events', fundId] });
    },
  });
}

export function useApproveCashFlowEvent(
  fundId: string | undefined
): UseMutationResult<
  CashFlowEventResponse,
  CashFlowEventMutationError,
  TransitionCashFlowEventVariables
> {
  return useTransitionCashFlowEvent(fundId, 'approve');
}

export function useLockCashFlowEvent(
  fundId: string | undefined
): UseMutationResult<
  CashFlowEventResponse,
  CashFlowEventMutationError,
  TransitionCashFlowEventVariables
> {
  return useTransitionCashFlowEvent(fundId, 'lock');
}
