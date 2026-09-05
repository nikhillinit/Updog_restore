import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ActualsPublishReceiptV1Schema,
  ActualsPublishRequestV1Schema,
  type ActualsPublishReceiptV1,
  type ActualsPublishRequestV1,
} from '@shared/contracts/lp-reporting';

import { buildHookError, type LpReportingHookError } from './contract-fetch';

export type ActualsPublishHookError = LpReportingHookError & { retryAfterSeconds?: number };

export interface ActualsPublishMutationRequest {
  body: ActualsPublishRequestV1;
  serializedBody: string;
  idempotencyKey: string;
  ifMatch: string;
}

export function useActualsPublish(fundId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<
    ActualsPublishReceiptV1,
    ActualsPublishHookError,
    ActualsPublishMutationRequest
  >({
    mutationFn: async ({ body, serializedBody, idempotencyKey, ifMatch }) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as ActualsPublishHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      ActualsPublishRequestV1Schema.parse(body);
      const response = await fetch(`/api/funds/${fundId}/imports/actuals/publish`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey,
          'If-Match': ifMatch,
        },
        body: serializedBody,
      });

      if (!response.ok) {
        const raw = (await response.json().catch(() => ({}))) as {
          code?: string;
          error?: string;
          message?: string;
        };
        const message = raw.message ?? raw.error;
        const error = buildHookError(
          response.status,
          {
            ...(raw.code !== undefined ? { code: raw.code } : {}),
            ...(raw.error !== undefined ? { error: raw.error } : {}),
            ...(message !== undefined ? { message } : {}),
          },
          `HTTP ${response.status}`
        ) as ActualsPublishHookError;
        const retryAfter = response.headers.get('Retry-After');
        if (retryAfter !== null && /^\d+$/.test(retryAfter)) {
          error.retryAfterSeconds = Number.parseInt(retryAfter, 10);
        }
        throw error;
      }

      let raw: unknown;
      try {
        raw = await response.json();
      } catch {
        const error = new Error(
          'Actuals publish receipt did not match the locked contract.'
        ) as ActualsPublishHookError;
        error.code = 'CONTRACT_PARSE_ERROR';
        error.status = response.status;
        throw error;
      }
      const parsed = ActualsPublishReceiptV1Schema.safeParse(raw);
      if (!parsed.success) {
        const error = new Error(
          'Actuals publish receipt did not match the locked contract.'
        ) as ActualsPublishHookError;
        error.code = 'CONTRACT_PARSE_ERROR';
        error.status = response.status;
        throw error;
      }
      return parsed.data;
    },
    onSuccess: (receipt) => {
      queryClient.invalidateQueries({
        queryKey: ['lp-reporting', 'financial-facts-latest-reference', fundId],
      });
      queryClient.invalidateQueries({
        queryKey: ['lp-reporting', 'actuals-metrics', fundId, receipt.facts.snapshotId],
      });
    },
  });
}
