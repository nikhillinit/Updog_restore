import { useQuery } from '@tanstack/react-query';
import { ActualMetricsV2Schema, type ActualMetricsV2 } from '@shared/contracts/lp-reporting';

import { contractFetch, type LpReportingHookError } from './contract-fetch';

export function useActualsMetrics(
  fundId: number | null,
  factsSnapshotId: number | null,
  enabled = true
) {
  return useQuery<ActualMetricsV2, LpReportingHookError>({
    queryKey: ['lp-reporting', 'actuals-metrics', fundId, factsSnapshotId],
    enabled: enabled && fundId !== null,
    retry: false,
    queryFn: async () => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }
      const query = factsSnapshotId === null ? '' : `?factsSnapshotId=${factsSnapshotId}`;
      return contractFetch(
        `/api/funds/${fundId}/actuals/metrics${query}`,
        { method: 'GET' },
        ActualMetricsV2Schema,
        'Actuals metrics response did not match the locked contract.'
      );
    },
  });
}
