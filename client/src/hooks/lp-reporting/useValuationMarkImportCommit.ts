/**
 * LP Reporting -- valuation-mark import commit mutation hook.
 *
 * Posts the original import payload plus the dry-run preview hash to the
 * protected commit endpoint. The server re-runs parsing before it writes.
 *
 * @module client/hooks/lp-reporting/useValuationMarkImportCommit
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ImportCommitRequestSchema,
  ImportCommitResponseSchema,
  type ImportCommitRequest,
  type ImportCommitResponse,
} from '@shared/contracts/lp-reporting';

import type { DryRunErrorBody, LpReportingHookError } from './useMetricsDryRun';

type CommitErrorBody = Partial<DryRunErrorBody & { error: string }>;

async function postValuationMarkImportCommit(
  fundId: number,
  body: ImportCommitRequest
): Promise<ImportCommitResponse> {
  ImportCommitRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/imports/valuation-marks/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as CommitErrorBody;
    const error = new Error(errorBody.message ?? `HTTP ${res.status}`) as LpReportingHookError;
    error.code = errorBody.code ?? errorBody.error ?? 'UNKNOWN';
    error.status = res.status;
    throw error;
  }

  const raw = (await res.json()) as unknown;
  const parsed = ImportCommitResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(
      'Valuation-mark import commit response did not match the locked contract.'
    ) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
}

export function useValuationMarkImportCommit(fundId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<ImportCommitResponse, LpReportingHookError, ImportCommitRequest>({
    mutationFn: async (request) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      return postValuationMarkImportCommit(fundId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'valuation-marks', fundId] });
      queryClient.invalidateQueries({ queryKey: ['fund-metrics', fundId] });
    },
  });
}
