import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import type { CashFlowEventResponse } from '@shared/contracts/lp-reporting/cash-flow-event.contract';
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
