/**
 * LP Reporting -- valuation-mark import dry-run mutation hook.
 *
 * `useMutation` wrapper around the existing protected dry-run route
 * `POST /api/funds/:fundId/imports/valuation-marks/dry-run`. Parses
 * the response with `ImportDryRunResponseSchema` from the contract
 * barrel and surfaces a typed error envelope on failure.
 *
 * @module client/hooks/lp-reporting/useValuationMarkImportDryRun
 */

import { useMutation } from '@tanstack/react-query';
import {
  ImportDryRunRequestSchema,
  ImportDryRunResponseSchema,
  type ImportDryRunRequest,
  type ImportDryRunResponse,
} from '@shared/contracts/lp-reporting';

import type { LpReportingHookError, DryRunErrorBody } from './useMetricsDryRun';

async function postValuationMarkImportDryRun(
  fundId: number,
  body: ImportDryRunRequest
): Promise<ImportDryRunResponse> {
  ImportDryRunRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/imports/valuation-marks/dry-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<DryRunErrorBody>;
    const error = new Error(errorBody.message ?? `HTTP ${res.status}`) as LpReportingHookError;
    error.code = errorBody.code ?? 'UNKNOWN';
    error.status = res.status;
    throw error;
  }

  const raw = (await res.json()) as unknown;
  const parsed = ImportDryRunResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(
      'Valuation-mark import dry-run response did not match the locked contract.'
    ) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
}

export function useValuationMarkImportDryRun(fundId: number | null) {
  return useMutation<ImportDryRunResponse, LpReportingHookError, ImportDryRunRequest>({
    mutationFn: async (request) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      return postValuationMarkImportDryRun(fundId, request);
    },
  });
}
