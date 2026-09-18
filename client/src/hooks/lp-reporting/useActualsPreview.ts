import { useMutation } from '@tanstack/react-query';
import {
  ActualsPreviewRequestV1Schema,
  ActualsPreviewResponseV1Schema,
  type ActualsPreviewRequestV1,
  type ActualsPreviewResponseV1,
} from '@shared/contracts/lp-reporting';

import { contractFetch, type LpReportingHookError } from './contract-fetch';

export function useActualsPreview(fundId: number | null) {
  return useMutation<ActualsPreviewResponseV1, LpReportingHookError, ActualsPreviewRequestV1>({
    mutationFn: async (request) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      ActualsPreviewRequestV1Schema.parse(request);
      return contractFetch(
        `/api/funds/${fundId}/imports/actuals/dry-run`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        },
        ActualsPreviewResponseV1Schema,
        'Actuals preview response did not match the locked contract.'
      );
    },
  });
}
