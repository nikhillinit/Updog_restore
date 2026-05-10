/**
 * LP Reporting -- metric-run preview and commit mutation hooks.
 *
 * Dry-run returns the full server envelope, including the preview hash that
 * commit must echo with the original request. Commit parses the server-owned
 * draft-row response and invalidates metric-run consumers.
 *
 * @module client/hooks/lp-reporting/useMetricsDryRun
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  LatestMetricRunResponseSchema,
  MetricRunApproveRequestSchema,
  MetricRunCommitRequestSchema,
  MetricRunCommitResponseSchema,
  MetricRunDetailResponseSchema,
  MetricRunDryRunResponseSchema,
  MetricRunEvidenceCreateRequestSchema,
  MetricRunEvidenceCreateResponseSchema,
  MetricRunEvidenceListResponseSchema,
  MetricRunLifecycleResponseSchema,
  MetricRunLockRequestSchema,
  NarrativeRunCreateRequestSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunListResponseSchema,
  type LatestMetricRunQuery,
  type LatestMetricRunResponse,
  type MetricRunApproveRequest,
  type MetricRunCommitRequest,
  type MetricRunCommitResponse,
  type MetricRunDetailResponse,
  type MetricRunDryRunRequest,
  type MetricRunDryRunResponse,
  type MetricRunEvidenceCreateRequest,
  type MetricRunEvidenceCreateResponse,
  type MetricRunEvidenceListResponse,
  type MetricRunLifecycleResponse,
  type MetricRunLockRequest,
  type NarrativeRunCreateRequest,
  type NarrativeRunCreateResponse,
  type NarrativeRunDetailResponse,
  type NarrativeRunListResponse,
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

interface ContractResponseSchema<TResponse> {
  safeParse(raw: unknown): { success: true; data: TResponse } | { success: false };
}

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

async function readContractResponse<TResponse>(
  res: Response,
  schema: ContractResponseSchema<TResponse>,
  contractErrorMessage: string
): Promise<TResponse> {
  if (!res.ok) {
    const errorBody = (await res.json().catch(() => ({}))) as Partial<DryRunErrorBody>;
    throw buildHookError(res.status, errorBody, `HTTP ${res.status}`);
  }

  const raw = (await res.json()) as unknown;
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(contractErrorMessage) as LpReportingHookError;
    error.code = 'CONTRACT_PARSE_ERROR';
    error.status = res.status;
    throw error;
  }

  return parsed.data;
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

  return readContractResponse(
    res,
    MetricRunDryRunResponseSchema,
    'Metric-run dry-run response did not match the locked contract.'
  );
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

  return readContractResponse(
    res,
    MetricRunCommitResponseSchema,
    'Metric-run commit response did not match the locked contract.'
  );
}

function metricRunEvidenceQueryKey(fundId: number | null, metricRunId: number | null) {
  return ['lp-reporting', 'metric-run-evidence', fundId, metricRunId] as const;
}

function metricRunNarrativeQueryKey(fundId: number | null, metricRunId: number | null) {
  return ['lp-reporting', 'metric-run-narratives', fundId, metricRunId] as const;
}

function metricRunNarrativeDetailQueryKey(
  fundId: number | null,
  metricRunId: number | null,
  narrativeRunId: number | null
) {
  return ['lp-reporting', 'metric-run-narratives', fundId, metricRunId, narrativeRunId] as const;
}

function latestMetricRunQueryKey(fundId: number | null, query: LatestMetricRunQuery | null) {
  return [
    'lp-reporting',
    'metric-runs',
    'latest',
    fundId,
    query?.runType ?? null,
    query?.perspective ?? null,
    query?.asOfDate ?? null,
  ] as const;
}

function metricRunDetailQueryKey(fundId: number | null, metricRunId: number | null) {
  return ['lp-reporting', 'metric-runs', 'detail', fundId, metricRunId] as const;
}

async function getLatestMetricRun(
  fundId: number,
  query: LatestMetricRunQuery
): Promise<LatestMetricRunResponse> {
  const params = new URLSearchParams({
    runType: query.runType,
    perspective: query.perspective,
    asOfDate: query.asOfDate,
  });
  const res = await fetch(`/api/funds/${fundId}/metric-runs/latest?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  return readContractResponse(
    res,
    LatestMetricRunResponseSchema,
    'Latest metric-run response did not match the locked contract.'
  );
}

async function getMetricRunDetail(
  fundId: number,
  metricRunId: number
): Promise<MetricRunDetailResponse> {
  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}`, {
    method: 'GET',
    credentials: 'include',
  });

  return readContractResponse(
    res,
    MetricRunDetailResponseSchema,
    'Metric-run detail response did not match the locked contract.'
  );
}

async function getMetricRunEvidenceList(
  fundId: number,
  metricRunId: number
): Promise<MetricRunEvidenceListResponse> {
  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/evidence-records`, {
    method: 'GET',
    credentials: 'include',
  });

  return readContractResponse(
    res,
    MetricRunEvidenceListResponseSchema,
    'Metric-run evidence list response did not match the locked contract.'
  );
}

async function getMetricRunNarrativeList(
  fundId: number,
  metricRunId: number
): Promise<NarrativeRunListResponse> {
  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs`, {
    method: 'GET',
    credentials: 'include',
  });

  return readContractResponse(
    res,
    NarrativeRunListResponseSchema,
    'Metric-run narrative list response did not match the locked contract.'
  );
}

async function getMetricRunNarrativeDetail(
  fundId: number,
  metricRunId: number,
  narrativeRunId: number
): Promise<NarrativeRunDetailResponse> {
  const res = await fetch(
    `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );

  return readContractResponse(
    res,
    NarrativeRunDetailResponseSchema,
    'Metric-run narrative detail response did not match the locked contract.'
  );
}

async function postMetricRunApprove(
  fundId: number,
  metricRunId: number,
  body: MetricRunApproveRequest
): Promise<MetricRunLifecycleResponse> {
  MetricRunApproveRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return readContractResponse(
    res,
    MetricRunLifecycleResponseSchema,
    'Metric-run approve response did not match the locked contract.'
  );
}

async function postMetricRunLock(
  fundId: number,
  metricRunId: number,
  body: MetricRunLockRequest
): Promise<MetricRunLifecycleResponse> {
  MetricRunLockRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/lock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return readContractResponse(
    res,
    MetricRunLifecycleResponseSchema,
    'Metric-run lock response did not match the locked contract.'
  );
}

async function postMetricRunEvidence(
  fundId: number,
  metricRunId: number,
  body: MetricRunEvidenceCreateRequest
): Promise<MetricRunEvidenceCreateResponse> {
  MetricRunEvidenceCreateRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/evidence-records`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return readContractResponse(
    res,
    MetricRunEvidenceCreateResponseSchema,
    'Metric-run evidence create response did not match the locked contract.'
  );
}

async function postMetricRunNarrative(
  fundId: number,
  metricRunId: number,
  body: NarrativeRunCreateRequest
): Promise<NarrativeRunCreateResponse> {
  NarrativeRunCreateRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return readContractResponse(
    res,
    NarrativeRunCreateResponseSchema,
    'Metric-run narrative create response did not match the locked contract.'
  );
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
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'metric-runs'] });
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'metric-runs', fundId] });
      queryClient.invalidateQueries({ queryKey: ['fund-metrics', fundId] });
    },
  });
}

export function useLatestMetricRun(fundId: number | null, query: LatestMetricRunQuery | null) {
  return useQuery<LatestMetricRunResponse, LpReportingHookError>({
    queryKey: latestMetricRunQueryKey(fundId, query),
    enabled: fundId !== null && query !== null,
    queryFn: async () => {
      if (fundId === null || query === null) {
        const error = new Error(
          'fundId and latest metric-run filters are required'
        ) as LpReportingHookError;
        error.code = 'MISSING_LATEST_METRIC_RUN_SCOPE';
        throw error;
      }
      return getLatestMetricRun(fundId, query);
    },
  });
}

export function useMetricRunDetail(fundId: number | null, metricRunId: number | null) {
  return useQuery<MetricRunDetailResponse, LpReportingHookError>({
    queryKey: metricRunDetailQueryKey(fundId, metricRunId),
    enabled: fundId !== null && metricRunId !== null,
    queryFn: async () => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_DETAIL_SCOPE';
        throw error;
      }
      return getMetricRunDetail(fundId, metricRunId);
    },
  });
}

export function useMetricRunEvidenceList(fundId: number | null, metricRunId: number | null) {
  return useQuery<MetricRunEvidenceListResponse, LpReportingHookError>({
    queryKey: metricRunEvidenceQueryKey(fundId, metricRunId),
    enabled: fundId !== null && metricRunId !== null,
    queryFn: async () => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_EVIDENCE_SCOPE';
        throw error;
      }

      return getMetricRunEvidenceList(fundId, metricRunId);
    },
  });
}

export function useMetricRunNarrativeList(fundId: number | null, metricRunId: number | null) {
  return useQuery<NarrativeRunListResponse, LpReportingHookError>({
    queryKey: metricRunNarrativeQueryKey(fundId, metricRunId),
    enabled: fundId !== null && metricRunId !== null,
    queryFn: async () => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_NARRATIVE_SCOPE';
        throw error;
      }

      return getMetricRunNarrativeList(fundId, metricRunId);
    },
  });
}

export function useMetricRunNarrativeDetail(
  fundId: number | null,
  metricRunId: number | null,
  narrativeRunId: number | null
) {
  return useQuery<NarrativeRunDetailResponse, LpReportingHookError>({
    queryKey: metricRunNarrativeDetailQueryKey(fundId, metricRunId, narrativeRunId),
    enabled: fundId !== null && metricRunId !== null && narrativeRunId !== null,
    queryFn: async () => {
      if (fundId === null || metricRunId === null || narrativeRunId === null) {
        const error = new Error(
          'fundId, metricRunId, and narrativeRunId are required'
        ) as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_NARRATIVE_SCOPE';
        throw error;
      }

      return getMetricRunNarrativeDetail(fundId, metricRunId, narrativeRunId);
    },
  });
}

export function useMetricRunApprove(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<MetricRunLifecycleResponse, LpReportingHookError, MetricRunApproveRequest>({
    mutationFn: async (request) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_LIFECYCLE_SCOPE';
        throw error;
      }
      return postMetricRunApprove(fundId, metricRunId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'metric-runs'] });
      queryClient.invalidateQueries({ queryKey: metricRunEvidenceQueryKey(fundId, metricRunId) });
    },
  });
}

export function useMetricRunLock(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<MetricRunLifecycleResponse, LpReportingHookError, MetricRunLockRequest>({
    mutationFn: async (request) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_LIFECYCLE_SCOPE';
        throw error;
      }
      return postMetricRunLock(fundId, metricRunId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'metric-runs'] });
      queryClient.invalidateQueries({ queryKey: metricRunEvidenceQueryKey(fundId, metricRunId) });
    },
  });
}

export function useMetricRunEvidenceCreate(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<
    MetricRunEvidenceCreateResponse,
    LpReportingHookError,
    MetricRunEvidenceCreateRequest
  >({
    mutationFn: async (request) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_EVIDENCE_SCOPE';
        throw error;
      }

      return postMetricRunEvidence(fundId, metricRunId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lp-reporting', 'metric-runs'] });
      queryClient.invalidateQueries({ queryKey: metricRunEvidenceQueryKey(fundId, metricRunId) });
    },
  });
}

export function useMetricRunNarrativeCreate(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<NarrativeRunCreateResponse, LpReportingHookError, NarrativeRunCreateRequest>({
    mutationFn: async (request) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_NARRATIVE_SCOPE';
        throw error;
      }

      return postMetricRunNarrative(fundId, metricRunId, request);
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: metricRunNarrativeQueryKey(fundId, metricRunId) });
      queryClient.invalidateQueries({
        queryKey: metricRunNarrativeDetailQueryKey(
          fundId,
          metricRunId,
          response.record.narrativeRunId
        ),
      });
    },
  });
}

export type {
  LatestMetricRunQuery,
  LatestMetricRunResponse,
  MetricRunApproveRequest,
  MetricRunDetailResponse,
  MetricRunEvidenceCreateRequest,
  MetricRunEvidenceCreateResponse,
  MetricRunEvidenceListResponse,
  MetricRunLifecycleResponse,
  MetricRunLockRequest,
  NarrativeRunCreateRequest,
  NarrativeRunCreateResponse,
  NarrativeRunDetailResponse,
  NarrativeRunListResponse,
};
