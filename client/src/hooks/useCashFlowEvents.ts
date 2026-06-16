import type { UseMutationResult, UseQueryResult } from '@tanstack/react-query';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashFlowEventResponse,
  LpCapitalCallPatch,
} from '@shared/contracts/lp-reporting/cash-flow-event.contract';
import { apiRequest } from '@/lib/queryClient';
import { getErrorMessage } from '@/lib/http-response';

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
// Draft-edit form model (pure) — lp_capital_call only.
// String-typed throughout: money stays a string (ADR-011); '' means "clear".
// ============================================================================

export interface CashEventEditForm {
  amount: string;
  description: string;
  /** Date portion only, 'YYYY-MM-DD'. */
  eventDate: string;
  callNumber: string;
  dueDate: string;
  purpose: string;
}

const DECIMAL_RE = /^-?\d+(\.\d{1,6})?$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const POSITIVE_INT_RE = /^[1-9]\d*$/;

function payloadString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  return value === null || value === undefined ? '' : String(value);
}

/** Project a persisted event into the editable string form. */
export function formFromEvent(event: CashFlowEventResponse): CashEventEditForm {
  return {
    amount: event.amount,
    description: event.description ?? '',
    eventDate: event.eventDate.slice(0, 10),
    callNumber: payloadString(event.payload, 'callNumber'),
    dueDate: payloadString(event.payload, 'dueDate'),
    purpose: payloadString(event.payload, 'purpose'),
  };
}

/** Mirror of the server contract; gates the Save button. */
export function isCashEventFormValid(form: CashEventEditForm): boolean {
  if (!DECIMAL_RE.test(form.amount)) return false;
  if (!DATE_RE.test(form.eventDate)) return false;
  if (form.description.length > 1000) return false;
  if (form.callNumber !== '' && !POSITIVE_INT_RE.test(form.callNumber)) return false;
  if (form.dueDate !== '' && !DATE_RE.test(form.dueDate)) return false;
  if (form.purpose.length > 500) return false;
  return true;
}

/**
 * Serialize ONLY changed fields. '' on a nullable field -> null (clear).
 * eventDate swaps only the date portion, preserving the original ISO time.
 * `payload` is included only when at least one payload sub-key changed.
 * Returns {} when nothing changed (caller treats that as "not dirty").
 */
export function buildLpCapitalCallPatch(
  event: CashFlowEventResponse,
  form: CashEventEditForm
): LpCapitalCallPatch {
  const base = formFromEvent(event);
  const patch: LpCapitalCallPatch = {};

  if (form.amount !== base.amount) {
    patch.amount = form.amount;
  }
  if (form.description !== base.description) {
    patch.description = form.description === '' ? null : form.description;
  }
  if (form.eventDate !== base.eventDate) {
    patch.eventDate = `${form.eventDate}${event.eventDate.slice(10)}`;
  }

  const payload: NonNullable<LpCapitalCallPatch['payload']> = {};
  if (form.callNumber !== base.callNumber) {
    payload.callNumber = form.callNumber === '' ? null : Number(form.callNumber);
  }
  if (form.dueDate !== base.dueDate) {
    payload.dueDate = form.dueDate === '' ? null : form.dueDate;
  }
  if (form.purpose !== base.purpose) {
    payload.purpose = form.purpose === '' ? null : form.purpose;
  }
  if (Object.keys(payload).length > 0) {
    patch.payload = payload;
  }

  return patch;
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
