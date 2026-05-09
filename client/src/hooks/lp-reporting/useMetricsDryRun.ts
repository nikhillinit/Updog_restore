/**
 * LP Reporting -- metric-run dry-run mutation hook.
 *
 * `useMutation` wrapper around the existing protected dry-run route
 * `POST /api/funds/:fundId/metric-runs/dry-run`. Parses the response
 * with the locked `LpMetricRunResultsSchema` from the contract barrel
 * and surfaces a typed error envelope on failure.
 *
 * Mirrors the `useSensitivityRuns` pattern: throws synchronously for
 * `null` fundId, parses `{ code, message }` from non-OK responses,
 * and tags Zod parse failures with `code = 'CONTRACT_PARSE_ERROR'`
 * so the page can render a clear envelope.
 *
 * @module client/hooks/lp-reporting/useMetricsDryRun
 */

import { useMutation } from '@tanstack/react-query';
import { z } from 'zod';
import { LpMetricRunResultsSchema, type LpMetricRunResults } from '@shared/contracts/lp-reporting';

const MetricRunDryRunResponseSchema = z.object({ results: LpMetricRunResultsSchema }).passthrough();

export interface MetricsDryRunRequest {
  asOfDate: string;
  perspective: 'lp_net' | 'fund_gross' | 'vehicle';
  /** Required by the server route; optional in the type so 1b.1 callers
   *  that did not yet wire it stay compatible. The 1b.4 form always
   *  supplies it. */
  runType?: 'quarterly_report' | 'fundraise_pack' | 'internal_review' | 'lp_update';
  /** Optional source ID arrays; server defaults each to `[]`. */
  sourceEventIds?: number[];
  sourceMarkIds?: number[];
}

export interface DryRunErrorBody {
  code: string;
  message: string;
}

export type LpReportingHookError = Error & {
  code?: string;
  status?: number;
};

async function postMetricsDryRun(
  fundId: number,
  body: MetricsDryRunRequest
): Promise<LpMetricRunResults> {
  const res = await fetch(`/api/funds/${fundId}/metric-runs/dry-run`, {
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
  // Server returns { results, diagnostics, inputsHash, runType }; we parse
  // the wrapper and surface only the locked LpMetricRunResults to callers.
  const parsed = MetricRunDryRunResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(
      'Metric-run dry-run response did not match the locked contract.'
    ) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data.results;
}

export function useMetricsDryRun(fundId: number | null) {
  return useMutation<LpMetricRunResults, LpReportingHookError, MetricsDryRunRequest>({
    mutationFn: async (request) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      return postMetricsDryRun(fundId, request);
    },
  });
}
