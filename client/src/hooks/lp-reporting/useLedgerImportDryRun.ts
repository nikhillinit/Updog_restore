/**
 * LP Reporting -- ledger import dry-run mutation hook.
 *
 * `useMutation` wrapper around the existing protected dry-run route
 * `POST /api/funds/:fundId/imports/ledger/dry-run`. Parses the
 * response with `ImportDryRunResponseSchema` from the contract
 * barrel and surfaces a typed error envelope on failure.
 *
 * @module client/hooks/lp-reporting/useLedgerImportDryRun
 */

import { useMutation } from '@tanstack/react-query';
import {
  ImportDryRunRequestSchema,
  ImportDryRunResponseSchema,
  type ImportDryRunRequest,
  type ImportDryRunResponse,
} from '@shared/contracts/lp-reporting';

import type { LpReportingHookError, DryRunErrorBody } from './useMetricsDryRun';

async function postLedgerImportDryRun(
  fundId: number,
  body: ImportDryRunRequest
): Promise<ImportDryRunResponse> {
  // Validate the outgoing request against the locked contract before
  // hitting the wire so callers get an actionable error instead of a
  // generic 400.
  ImportDryRunRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/imports/ledger/dry-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
      'Ledger import dry-run response did not match the locked contract.'
    ) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
}

export function useLedgerImportDryRun(fundId: number | null) {
  return useMutation<ImportDryRunResponse, LpReportingHookError, ImportDryRunRequest>({
    mutationFn: async (request) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      return postLedgerImportDryRun(fundId, request);
    },
  });
}
