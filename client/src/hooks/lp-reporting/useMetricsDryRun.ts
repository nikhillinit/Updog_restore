/**
 * LP Reporting -- metric-run preview and commit mutation hooks.
 *
 * Dry-run returns the full server envelope, including the preview hash that
 * commit must echo with the original request. Commit parses the server-owned
 * draft-row response and invalidates metric-run consumers.
 *
 * @module client/hooks/lp-reporting/useMetricsDryRun
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
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
  NarrativeRunApproveRequestSchema,
  NarrativeRunCreateRequestSchema,
  NarrativeRunCreateResponseSchema,
  NarrativeRunDetailResponseSchema,
  NarrativeRunEditRequestSchema,
  NarrativeRunLifecycleResponseSchema,
  NarrativeRunListResponseSchema,
  NarrativeRunReviewRequestSchema,
  ReportPackageAssembleRequestSchema,
  ReportPackageAssembleResponseSchema,
  ReportPackageGetResponseSchema,
  ReportPackageJsonExportBlockedResponseSchema,
  ReportPackageJsonExportResponseSchema,
  ReportPackageRenderModelResponseSchema,
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
  type NarrativeRunApproveRequest,
  type NarrativeRunCreateRequest,
  type NarrativeRunCreateResponse,
  type NarrativeRunDetailResponse,
  type NarrativeRunEditRequest,
  type NarrativeRunLifecycleResponse,
  type NarrativeRunListResponse,
  type NarrativeRunReviewRequest,
  type ReportPackageAssembleRequest,
  type ReportPackageAssembleResponse,
  type ReportPackageGetResponse,
  type ReportPackageJsonExportBlocker,
  type ReportPackageJsonExportResponse,
  type ReportPackageRenderModelResponse,
} from '@shared/contracts/lp-reporting';

export type MetricsDryRunRequest = MetricRunDryRunRequest;

export type NarrativeRunEditMutationRequest = NarrativeRunEditRequest & {
  narrativeRunId: number;
};

export type NarrativeRunReviewMutationRequest = NarrativeRunReviewRequest & {
  narrativeRunId: number;
};

export type NarrativeRunApproveMutationRequest = NarrativeRunApproveRequest & {
  narrativeRunId: number;
};

export type ReportPackageAssembleMutationRequest = ReportPackageAssembleRequest;

export interface DryRunErrorBody {
  code?: string;
  error?: string;
  message?: string;
}

export type LpReportingHookError = Error & {
  code?: string;
  status?: number;
  blockers?: ReportPackageJsonExportBlocker[];
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

async function readReportPackageJsonExportResponse(
  res: Response
): Promise<ReportPackageJsonExportResponse> {
  const raw = (await res.json().catch(() => ({}))) as unknown;

  if (!res.ok) {
    const blocked = ReportPackageJsonExportBlockedResponseSchema.safeParse(raw);
    if (blocked.success) {
      const error = buildHookError(
        res.status,
        {
          error: blocked.data.error,
          message: blocked.data.message,
        },
        `HTTP ${res.status}`
      );
      error.blockers = blocked.data.blockers;
      throw error;
    }

    throw buildHookError(res.status, raw as Partial<DryRunErrorBody>, `HTTP ${res.status}`);
  }

  const parsed = ReportPackageJsonExportResponseSchema.safeParse(raw);
  if (!parsed.success) {
    const error = new Error(
      'Metric-run report package JSON export response did not match the locked contract.'
    ) as LpReportingHookError;
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

function metricRunReportPackageQueryKey(fundId: number | null, metricRunId: number | null) {
  return ['lp-reporting', 'metric-run-report-package', fundId, metricRunId] as const;
}

function metricRunReportPackageRenderModelQueryKey(
  fundId: number | null,
  metricRunId: number | null
) {
  return ['lp-reporting', 'metric-run-report-package-render-model', fundId, metricRunId] as const;
}

function metricRunReportPackageJsonExportQueryKey(
  fundId: number | null,
  metricRunId: number | null
) {
  return ['lp-reporting', 'metric-run-report-package-json-export', fundId, metricRunId] as const;
}

function invalidateMetricRunNarrativeQueries(
  queryClient: QueryClient,
  fundId: number | null,
  metricRunId: number | null,
  narrativeRunId: number
): void {
  queryClient.invalidateQueries({ queryKey: metricRunNarrativeQueryKey(fundId, metricRunId) });
  queryClient.invalidateQueries({
    queryKey: metricRunNarrativeDetailQueryKey(fundId, metricRunId, narrativeRunId),
  });
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

async function getMetricRunReportPackage(
  fundId: number,
  metricRunId: number
): Promise<ReportPackageGetResponse> {
  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/report-package`, {
    method: 'GET',
    credentials: 'include',
  });

  return readContractResponse(
    res,
    ReportPackageGetResponseSchema,
    'Metric-run report package response did not match the locked contract.'
  );
}

async function getMetricRunReportPackageRenderModel(
  fundId: number,
  metricRunId: number
): Promise<ReportPackageRenderModelResponse> {
  const res = await fetch(
    `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/render-model`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );

  return readContractResponse(
    res,
    ReportPackageRenderModelResponseSchema,
    'Metric-run report package render-model response did not match the locked contract.'
  );
}

async function getMetricRunReportPackageJsonExport(
  fundId: number,
  metricRunId: number
): Promise<ReportPackageJsonExportResponse> {
  const res = await fetch(
    `/api/funds/${fundId}/metric-runs/${metricRunId}/report-package/export/json`,
    {
      method: 'GET',
      credentials: 'include',
    }
  );

  return readReportPackageJsonExportResponse(res);
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

async function patchMetricRunNarrative(
  fundId: number,
  metricRunId: number,
  narrativeRunId: number,
  body: NarrativeRunEditRequest
): Promise<NarrativeRunLifecycleResponse> {
  NarrativeRunEditRequestSchema.parse(body);

  const res = await fetch(
    `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }
  );

  return readContractResponse(
    res,
    NarrativeRunLifecycleResponseSchema,
    'Metric-run narrative edit response did not match the locked contract.'
  );
}

async function postMetricRunNarrativeReview(
  fundId: number,
  metricRunId: number,
  narrativeRunId: number,
  body: NarrativeRunReviewRequest
): Promise<NarrativeRunLifecycleResponse> {
  NarrativeRunReviewRequestSchema.parse(body);

  const res = await fetch(
    `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }
  );

  return readContractResponse(
    res,
    NarrativeRunLifecycleResponseSchema,
    'Metric-run narrative review response did not match the locked contract.'
  );
}

async function postMetricRunNarrativeApprove(
  fundId: number,
  metricRunId: number,
  narrativeRunId: number,
  body: NarrativeRunApproveRequest
): Promise<NarrativeRunLifecycleResponse> {
  NarrativeRunApproveRequestSchema.parse(body);

  const res = await fetch(
    `/api/funds/${fundId}/metric-runs/${metricRunId}/narrative-runs/${narrativeRunId}/approve`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(body),
    }
  );

  return readContractResponse(
    res,
    NarrativeRunLifecycleResponseSchema,
    'Metric-run narrative approve response did not match the locked contract.'
  );
}

async function postMetricRunReportPackage(
  fundId: number,
  metricRunId: number,
  body: ReportPackageAssembleRequest
): Promise<ReportPackageAssembleResponse> {
  ReportPackageAssembleRequestSchema.parse(body);

  const res = await fetch(`/api/funds/${fundId}/metric-runs/${metricRunId}/report-package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });

  return readContractResponse(
    res,
    ReportPackageAssembleResponseSchema,
    'Metric-run report package assemble response did not match the locked contract.'
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

export function useMetricRunReportPackage(fundId: number | null, metricRunId: number | null) {
  return useQuery<ReportPackageGetResponse, LpReportingHookError>({
    queryKey: metricRunReportPackageQueryKey(fundId, metricRunId),
    enabled: fundId !== null && metricRunId !== null,
    queryFn: async () => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_REPORT_PACKAGE_SCOPE';
        throw error;
      }
      return getMetricRunReportPackage(fundId, metricRunId);
    },
  });
}

export function useMetricRunReportPackageRenderModel(
  fundId: number | null,
  metricRunId: number | null
) {
  return useQuery<ReportPackageRenderModelResponse, LpReportingHookError>({
    queryKey: metricRunReportPackageRenderModelQueryKey(fundId, metricRunId),
    enabled: fundId !== null && metricRunId !== null,
    queryFn: async () => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_REPORT_PACKAGE_RENDER_MODEL_SCOPE';
        throw error;
      }
      return getMetricRunReportPackageRenderModel(fundId, metricRunId);
    },
  });
}

export function useMetricRunReportPackageJsonExport(
  fundId: number | null,
  metricRunId: number | null
) {
  return useQuery<ReportPackageJsonExportResponse, LpReportingHookError>({
    queryKey: metricRunReportPackageJsonExportQueryKey(fundId, metricRunId),
    enabled: false,
    retry: false,
    queryFn: async () => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_REPORT_PACKAGE_JSON_EXPORT_SCOPE';
        throw error;
      }
      return getMetricRunReportPackageJsonExport(fundId, metricRunId);
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
      invalidateMetricRunNarrativeQueries(
        queryClient,
        fundId,
        metricRunId,
        response.record.narrativeRunId
      );
    },
  });
}

export function useMetricRunNarrativeEdit(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<
    NarrativeRunLifecycleResponse,
    LpReportingHookError,
    NarrativeRunEditMutationRequest
  >({
    mutationFn: async ({ narrativeRunId, ...request }) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_NARRATIVE_SCOPE';
        throw error;
      }

      return patchMetricRunNarrative(fundId, metricRunId, narrativeRunId, request);
    },
    onSuccess: (response) => {
      invalidateMetricRunNarrativeQueries(
        queryClient,
        fundId,
        metricRunId,
        response.record.narrativeRunId
      );
    },
  });
}

export function useMetricRunNarrativeReview(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<
    NarrativeRunLifecycleResponse,
    LpReportingHookError,
    NarrativeRunReviewMutationRequest
  >({
    mutationFn: async ({ narrativeRunId, ...request }) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_NARRATIVE_SCOPE';
        throw error;
      }

      return postMetricRunNarrativeReview(fundId, metricRunId, narrativeRunId, request);
    },
    onSuccess: (response) => {
      invalidateMetricRunNarrativeQueries(
        queryClient,
        fundId,
        metricRunId,
        response.record.narrativeRunId
      );
    },
  });
}

export function useMetricRunNarrativeApprove(fundId: number | null, metricRunId: number | null) {
  const queryClient = useQueryClient();

  return useMutation<
    NarrativeRunLifecycleResponse,
    LpReportingHookError,
    NarrativeRunApproveMutationRequest
  >({
    mutationFn: async ({ narrativeRunId, ...request }) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_NARRATIVE_SCOPE';
        throw error;
      }

      return postMetricRunNarrativeApprove(fundId, metricRunId, narrativeRunId, request);
    },
    onSuccess: (response) => {
      invalidateMetricRunNarrativeQueries(
        queryClient,
        fundId,
        metricRunId,
        response.record.narrativeRunId
      );
    },
  });
}

export function useMetricRunReportPackageAssemble(
  fundId: number | null,
  metricRunId: number | null
) {
  const queryClient = useQueryClient();

  return useMutation<
    ReportPackageAssembleResponse,
    LpReportingHookError,
    ReportPackageAssembleMutationRequest
  >({
    mutationFn: async (request) => {
      if (fundId === null || metricRunId === null) {
        const error = new Error('fundId and metricRunId are required') as LpReportingHookError;
        error.code = 'MISSING_METRIC_RUN_REPORT_PACKAGE_SCOPE';
        throw error;
      }

      return postMetricRunReportPackage(fundId, metricRunId, request);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: metricRunReportPackageQueryKey(fundId, metricRunId),
      });
      queryClient.invalidateQueries({
        queryKey: metricRunReportPackageRenderModelQueryKey(fundId, metricRunId),
      });
      queryClient.invalidateQueries({ queryKey: metricRunDetailQueryKey(fundId, metricRunId) });
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
  NarrativeRunApproveRequest,
  NarrativeRunCreateRequest,
  NarrativeRunCreateResponse,
  NarrativeRunDetailResponse,
  NarrativeRunEditRequest,
  NarrativeRunLifecycleResponse,
  NarrativeRunListResponse,
  NarrativeRunReviewRequest,
  ReportPackageAssembleRequest,
  ReportPackageAssembleResponse,
  ReportPackageGetResponse,
  ReportPackageJsonExportBlocker,
  ReportPackageJsonExportResponse,
  ReportPackageRenderModelResponse,
};
