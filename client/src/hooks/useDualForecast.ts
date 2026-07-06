import type { UseQueryResult } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import {
  DualForecastResponseSchema,
  type DualForecastResponse,
} from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import { getErrorMessage } from '@/lib/http-response';

interface UseDualForecastOptions {
  enabled?: boolean;
  refetchInterval?: number;
  retry?: number | false;
}

export function useDualForecast(
  fundId: number | null,
  options: UseDualForecastOptions = {}
): UseQueryResult<DualForecastResponse, Error> {
  const { enabled = true, refetchInterval = 300_000, retry = 3 } = options;

  return useQuery<DualForecastResponse, Error>({
    queryKey: ['dual-forecast', fundId],
    queryFn: async () => {
      if (fundId == null) {
        throw new Error('No fund ID available');
      }

      const response = await fetch(`/api/funds/${fundId}/dual-forecast`, {
        credentials: 'include',
      });

      if (!response.ok) {
        const errorData: unknown = await response.json().catch(() => null);
        throw new Error(
          getErrorMessage(errorData) || `HTTP ${response.status}: Failed to fetch dual forecast`
        );
      }

      // Ingress contract parse (ADR-031): validate instead of casting so a
      // malformed payload surfaces as a query error, not a render-time crash.
      const payload: unknown = await response.json();
      return DualForecastResponseSchema.parse(payload);
    },
    enabled: enabled && fundId != null,
    // Keep the client freshness window aligned with the route Cache-Control max-age.
    staleTime: 60_000,
    gcTime: 600_000,
    refetchInterval,
    refetchOnWindowFocus: true,
    retry,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
}
