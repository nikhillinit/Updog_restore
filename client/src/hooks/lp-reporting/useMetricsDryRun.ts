/**
 * LP Reporting -- metric-run preview and commit mutation hooks.
 *
 * Dry-run returns the full server envelope, including the preview hash that
 * commit must echo with the original request. Commit parses the server-owned
 * draft-row response and invalidates metric-run consumers.
 *
 * @module client/hooks/lp-reporting/useMetricsDryRun
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MetricRunCommitRequestSchema,
  MetricRunCommitResponseSchema,
  MetricRunDryRunResponseSchema,
  type MetricRunCommitRequest,
  type MetricRunCommitResponse,
  type MetricRunDryRunRequest,
  type MetricRunDryRunResponse,
} from '@shared/contracts/lp-reporting';

export type MetricsDryRunRequest = MetricRunDryRunRequest;

export interface DryRunErrorBody {
  code?: string;
  error?: string;
  message?: string;
}

export type LpReportingHookError = Error & {
  code?: string;
  status?: number;
};

function buildHookError(
  status: number,
  body: Partial<DryRunErrorBody>,
  fallback: string
): LpReportingHookError {
  const error = new Error(body.message ?? fallback) as LpReportingHookError;
  error.code = body.code ?? body.error ?? 'UNKNOWN';
  error.status = status;
  return error;
}

async function postMetricsDryRun(
  fundId: number,
  body: MetricsDryRunRequest
): Promise<MetricRunDryRunResponse> {
  const res = await fetch(`/api/funds/${fundId}/metric-runs/dry-run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<DryRunErrorBody>;
    throw buildHookError(res.status, errorBody, `HTTP ${res.status}`);
  }

  const raw = (await res.json()) as unknown;
  const parsed = MetricRunDryRunResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(
      'Metric-run dry-run response did not match the locked contract.'
    ) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
}

async function postMetricRunCommit(
  fundId: number,
  body: MetricRunCommitRequest
): Promise<MetricRunCommitResponse> {
  MetricRunCommitRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/metric-runs/commit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<DryRunErrorBody>;
    throw buildHookError(res.status, errorBody, `HTTP ${res.status}`);
  }

  const raw = (await res.json()) as unknown;
  const parsed = MetricRunCommitResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(
      'Metric-run commit response did not match the locked contract.'
    ) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
}

export function useMetricsDryRun(fundId: number | null) {
  return useMutation<MetricRunDryRunResponse, LpReportingHookError, MetricsDryRunRequest>({
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

export function useMetricRunCommit(fundId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<MetricRunCommitResponse, LpReportingHookError, MetricRunCommitRequest>({
    mutationFn: async (request) => {
      if (fundId === null) {
        const error = new Error('fundId is required') as LpReportingHookError;
        error.code = 'MISSING_FUND_ID';
        throw error;
      }

      return postMetricRunCommit(fundId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'metric-runs', fundId] });
      queryClient.invalidateQueries({ queryKey: ['fund-metrics', fundId] });
    },
  });
}
