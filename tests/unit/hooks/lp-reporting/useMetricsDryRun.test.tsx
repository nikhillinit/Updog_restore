/**
 * LP Reporting -- useMetricsDryRun hook tests.
 *
 * MSW-style fetch stubbing (mirrors `useSensitivityRuns.test.tsx`):
 * - Happy path: hook returns the full dry-run response envelope.
 * - Commit path: hook posts the original request plus preview hash.
 * - 401 path: hook surfaces the typed error envelope with status +
 *   code from the server response body.
 * - Synchronous null fundId: the mutation rejects without making a
 *   network call.
 * - Contract drift: parse failure surfaces `code = 'CONTRACT_PARSE_ERROR'`.
 */

import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';

import {
  useLatestMetricRun,
  useMetricRunApprove,
  useMetricRunCommit,
  useMetricRunDetail,
  useMetricRunEvidenceCreate,
  useMetricRunEvidenceList,
  useMetricRunLock,
  useMetricRunNarrativeApprove,
  useMetricRunNarrativeCreate,
  useMetricRunNarrativeDetail,
  useMetricRunNarrativeEdit,
  useMetricRunNarrativeList,
  useMetricRunNarrativeReview,
  useMetricRunReportPackage,
  useMetricRunReportPackageAssemble,
  useMetricRunReportPackageJsonExport,
  useMetricRunReportPackageRenderModel,
  useMetricsDryRun,
} from '@/hooks/lp-reporting';
import type { MetricsDryRunRequest } from '@/hooks/lp-reporting';
import type {
  LpMetricRunResults,
  MetricRunCommitResponse,
  MetricRunDetailResponse,
  MetricRunDryRunResponse,
  MetricRunEvidenceCreateResponse,
  MetricRunEvidenceListResponse,
  MetricRunLifecycleResponse,
  NarrativeRunCreateResponse,
  NarrativeRunDetailResponse,
  NarrativeRunLifecycleResponse,
  NarrativeRunListResponse,
  NarrativeRunRecord,
  ReportPackageAssembleResponse,
  ReportPackageGetResponse,
  ReportPackageJsonExportResponse,
  ReportPackageRecord,
  ReportPackageRenderModelResponse,
} from '@shared/contracts/lp-reporting';

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: queryClient }, children);
  return { Wrapper, queryClient };
}

function makeCanonicalResults(): LpMetricRunResults {
  return {
    asOfDate: '2026-03-31',
    currency: 'USD',
    dpi: '0.450000',
    rvpi: '1.250000',
    tvpi: '1.700000',
    moic: '1.700000',
    netIrr: '0.150000',
    grossIrr: '0.180000',
    xirrDiagnostic: {
      net: {
        convergence: 'converged',
        iterations: 5,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
      gross: {
        convergence: 'converged',
        iterations: 4,
        method: 'newton',
        boundHit: null,
        failureReason: null,
      },
    },
    contributionsTotal: '50000000',
    distributionsTotal: '22500000',
    currentNav: '62500000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

const baseRequest: MetricsDryRunRequest = {
  asOfDate: '2026-03-31',
  perspective: 'lp_net',
  runType: 'quarterly_report',
  sourceEventIds: [],
  sourceMarkIds: [],
};

function makeDryRunResponse(): MetricRunDryRunResponse {
  return {
    results: makeCanonicalResults(),
    diagnostics: {
      engineVersion: 'lp-reporting-engine@1.2.0',
      decimalPrecision: 6,
      excludedFutureMarks: [],
      warnings: [],
    },
    inputsHash: 'a'.repeat(64),
    runType: 'quarterly_report',
    previewHash: 'b'.repeat(64),
  };
}

function makeCommitResponse(): MetricRunCommitResponse {
  return {
    metricRunId: 17,
    status: 'draft',
    inputsHash: 'a'.repeat(64),
    previewHash: 'b'.repeat(64),
    inserted: true,
  };
}

function makeEvidenceRecord() {
  return {
    id: 1000,
    fundId: 7,
    metricRunId: 17,
    idempotencyKey: 'metric-run-17-evidence-0',
    evidenceSource: 'board_update' as const,
    sourceDate: '2026-03-31',
    receivedDate: null,
    expirationDate: null,
    confidenceLevel: 'medium' as const,
    materialityLevel: 'high' as const,
    confidentiality: 'internal' as const,
    redactionRequired: false,
    documentHash: null,
    valuationPolicyVersion: null,
    description: 'Q1 board materials',
    internalNotes: null,
    lpObjection: null,
    uploadedBy: 7,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
  };
}

function makeEvidenceListResponse(): MetricRunEvidenceListResponse {
  return {
    records: [makeEvidenceRecord()],
  };
}

function makeEvidenceCreateResponse(): MetricRunEvidenceCreateResponse {
  return {
    record: makeEvidenceRecord(),
    inserted: true,
  };
}

function makeNarrativeRecord(overrides: Partial<NarrativeRunRecord> = {}): NarrativeRunRecord {
  return {
    narrativeRunId: 41,
    fundId: 7,
    metricRunId: 17,
    asOfDate: '2026-03-31',
    narrativeType: 'methodology' as const,
    generatedText: 'Methodology draft as of 2026-03-31.',
    editedText: null,
    status: 'draft' as const,
    generatedBy: 7,
    editedBy: null,
    reviewedBy: null,
    reviewedAt: null,
    approvedBy: null,
    approvedAt: null,
    exportedAt: null,
    version: 1,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeNarrativeListResponse(): NarrativeRunListResponse {
  return {
    records: [makeNarrativeRecord()],
  };
}

function makeNarrativeCreateResponse(): NarrativeRunCreateResponse {
  return {
    record: makeNarrativeRecord(),
    inserted: true,
  };
}

function makeNarrativeDetailResponse(): NarrativeRunDetailResponse {
  return {
    record: makeNarrativeRecord(),
  };
}

function makeNarrativeLifecycleResponse(
  changed = true,
  overrides: Partial<NarrativeRunRecord> = {}
): NarrativeRunLifecycleResponse {
  return {
    record: makeNarrativeRecord(overrides),
    changed,
  };
}

function makeMetricRunDetail(
  overrides: Partial<MetricRunDetailResponse> = {}
): MetricRunDetailResponse {
  return {
    metricRunId: 17,
    fundId: 7,
    asOfDate: '2026-03-31',
    runType: 'quarterly_report',
    perspective: 'lp_net',
    status: 'draft',
    inputsHash: 'a'.repeat(64),
    sourceEventIds: [],
    sourceMarkIds: [],
    sourceEvidenceIds: [],
    evidenceCount: 0,
    generatedBy: 7,
    approvedBy: null,
    approvedAt: null,
    lockedBy: null,
    lockedAt: null,
    exportedAt: null,
    version: 1,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeLifecycleResponse(
  overrides: Partial<MetricRunDetailResponse> = {}
): MetricRunLifecycleResponse {
  return {
    metricRun: makeMetricRunDetail(overrides),
    changed: true,
  };
}

function makeReportPackageRecord(): ReportPackageRecord {
  const narrative = makeNarrativeRecord({
    status: 'approved',
    editedText: 'Approved methodology copy.',
    approvedBy: 7,
    approvedAt: '2026-05-10T01:00:00.000Z',
    version: 3,
  });
  const narrativeRef = {
    narrativeType: narrative.narrativeType,
    narrativeRunId: narrative.narrativeRunId,
    narrativeVersion: narrative.version,
    approvedBy: narrative.approvedBy,
    approvedAt: narrative.approvedAt!,
    textHash: 'a'.repeat(64),
  };
  return {
    reportPackageId: 501,
    fundId: 7,
    metricRunId: 17,
    status: 'assembled',
    asOfDate: '2026-03-31',
    metricRunVersion: 4,
    metricRunLockedBy: 7,
    metricRunLockedAt: '2026-05-10T00:30:00.000Z',
    narrativeRefs: [narrativeRef],
    payload: {
      payloadVersion: 1,
      results: makeCanonicalResults(),
      diagnostics: makeDryRunResponse().diagnostics,
      sourceEventIds: [1, 2],
      sourceMarkIds: [10],
      evidenceRecordIds: [1000],
      narratives: [
        {
          ...narrativeRef,
          effectiveText: 'Approved methodology copy.',
        },
      ],
    },
    assembledBy: 7,
    assembledAt: '2026-05-10T01:05:00.000Z',
    version: 1,
    createdAt: '2026-05-10T01:05:00.000Z',
    updatedAt: '2026-05-10T01:05:00.000Z',
  };
}

function makeReportPackageGetResponse(
  record: ReportPackageRecord | null
): ReportPackageGetResponse {
  return { record };
}

function makeReportPackageAssembleResponse(inserted = true): ReportPackageAssembleResponse {
  return {
    record: makeReportPackageRecord(),
    inserted,
  };
}

function makeReportPackageRenderModelResponse(): ReportPackageRenderModelResponse {
  const record = makeReportPackageRecord();
  const narrativeRef = record.narrativeRefs[0]!;
  return {
    renderModel: {
      renderModelVersion: 1,
      source: {
        reportPackageId: record.reportPackageId,
        fundId: record.fundId,
        metricRunId: record.metricRunId,
        reportPackageStatus: record.status,
        asOfDate: record.asOfDate,
        metricRunVersion: record.metricRunVersion,
        metricRunLockedBy: record.metricRunLockedBy,
        metricRunLockedAt: record.metricRunLockedAt,
        assembledBy: record.assembledBy,
        assembledAt: record.assembledAt,
        packageVersion: record.version,
        payloadVersion: record.payload.payloadVersion,
      },
      fundDisplay: {
        fundId: 7,
        name: 'Press On Fund I',
        vintageYear: 2024,
        size: '100000000.00',
      },
      metricSections: [
        {
          sectionId: 'performance',
          title: 'Performance',
          rows: [
            {
              metricId: 'dpi',
              label: 'DPI',
              value: '0.450000',
              valueKind: 'multiple',
              currency: null,
            },
          ],
        },
      ],
      narrativeSections: [
        {
          sectionId: narrativeRef.narrativeType,
          title: 'Methodology',
          narrativeType: narrativeRef.narrativeType,
          narrativeRunId: narrativeRef.narrativeRunId,
          narrativeVersion: narrativeRef.narrativeVersion,
          approvedBy: narrativeRef.approvedBy,
          approvedAt: narrativeRef.approvedAt,
          textHash: narrativeRef.textHash,
          body: 'Approved methodology copy.',
        },
      ],
      diagnostics: {
        engineVersion: record.payload.diagnostics.engineVersion,
        decimalPrecision: record.payload.diagnostics.decimalPrecision,
        excludedFutureMarks: [],
        warnings: record.payload.diagnostics.warnings,
        xirr: record.payload.results.xirrDiagnostic,
      },
      references: {
        sourceEventIds: [1, 2],
        sourceMarkIds: [10],
        evidenceRecordIds: [1000],
        narrativeRunIds: [narrativeRef.narrativeRunId],
      },
    },
  };
}

function makeReportPackageJsonExportResponse(): ReportPackageJsonExportResponse {
  const renderModelResponse = makeReportPackageRenderModelResponse();
  return {
    export: {
      exportVersion: 1,
      format: 'json',
      source: renderModelResponse.renderModel.source,
      renderModel: renderModelResponse.renderModel,
      contentHashAlgorithm: 'sha256',
      contentHash: 'c'.repeat(64),
    },
  };
}

describe('useMetricsDryRun', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/funds/:id/metric-runs/dry-run and parses the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/dry-run');
    expect(init?.method).toBe('POST');
    expect((init?.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init?.body as string)).toEqual(baseRequest);

    expect(result.current.data?.previewHash).toBe('b'.repeat(64));
    expect(result.current.data?.results.tvpi).toBe('1.700000');
    expect(result.current.data?.results.xirrDiagnostic.net.convergence).toBe('converged');
    expect(result.current.data?.results.markConfidenceMix.high).toBe(8);
  });

  it('surfaces a typed error envelope on 401 unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const err = result.current.error;
    expect(err).toBeTruthy();
    expect(err?.code).toBe('UNAUTHORIZED');
    expect(err?.status).toBe(401);
    expect(err?.message).toBe('Not authenticated');
  });

  it('rejects synchronously when fundId is null', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(null), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toMatch(/fundId is required/);
    expect(result.current.error?.code).toBe('MISSING_FUND_ID');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('flags contract drift with code=CONTRACT_PARSE_ERROR when the response is malformed', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ asOfDate: 'not-a-date' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricsDryRun(7), { wrapper: Wrapper });

    result.current.mutate(baseRequest);

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });
});

describe('useMetricRunCommit', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /api/funds/:id/metric-runs/commit with original request plus preview hash', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeCommitResponse()), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunCommit(7), { wrapper: Wrapper });

    result.current.mutate({ ...baseRequest, previewHash: 'b'.repeat(64) });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/commit');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      ...baseRequest,
      previewHash: 'b'.repeat(64),
    });
    expect(result.current.data?.metricRunId).toBe(17);
    expect(result.current.data?.inserted).toBe(true);
  });

  it('surfaces preview mismatch errors from commit', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'PREVIEW_HASH_MISMATCH',
          message: 'Metric-run preview hash no longer matches.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunCommit(7), { wrapper: Wrapper });

    result.current.mutate({ ...baseRequest, previewHash: 'b'.repeat(64) });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.status).toBe(409);
    expect(result.current.error?.code).toBe('PREVIEW_HASH_MISMATCH');
  });
});

describe('metric-run lifecycle hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs exact-context latest metric-run state', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ metricRun: makeMetricRunDetail() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(
      () =>
        useLatestMetricRun(7, {
          asOfDate: '2026-03-31',
          runType: 'quarterly_report',
          perspective: 'lp_net',
        }),
      { wrapper: Wrapper }
    );

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe(
      '/api/funds/7/metric-runs/latest?runType=quarterly_report&perspective=lp_net&asOfDate=2026-03-31'
    );
    expect(init?.method).toBe('GET');
    expect(result.current.data?.metricRun?.version).toBe(1);
  });

  it('does not fetch latest until all filters exist', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useLatestMetricRun(7, null), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GETs metric-run detail by committed run ID', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeMetricRunDetail({ evidenceCount: 1 })), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunDetail(7, 17), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17');
    expect(init?.method).toBe('GET');
    expect(result.current.data?.metricRunId).toBe(17);
    expect(result.current.data?.evidenceCount).toBe(1);
  });

  it('POSTs expectedVersion to approve endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          makeLifecycleResponse({
            status: 'approved',
            approvedBy: 7,
            approvedAt: '2026-05-10T01:00:00.000Z',
            version: 2,
          })
        ),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunApprove(7, 17), { wrapper: Wrapper });

    result.current.mutate({ expectedVersion: 1 });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/approve');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ expectedVersion: 1 });
    expect(result.current.data?.metricRun.status).toBe('approved');
  });

  it('POSTs expectedVersion to lock endpoint and preserves 409 server code', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'METRIC_RUN_VERSION_CONFLICT',
          message: 'Metric run version no longer matches the request.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunLock(7, 17), { wrapper: Wrapper });

    result.current.mutate({ expectedVersion: 2 });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/lock');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ expectedVersion: 2 });
    expect(result.current.error?.status).toBe(409);
    expect(result.current.error?.code).toBe('METRIC_RUN_VERSION_CONFLICT');
  });
});

describe('metric-run evidence hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs /api/funds/:id/metric-runs/:metricRunId/evidence-records and parses the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeEvidenceListResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunEvidenceList(7, 17), { wrapper: Wrapper });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/evidence-records');
    expect(init?.method).toBe('GET');
    expect(result.current.data?.records[0]?.idempotencyKey).toBe('metric-run-17-evidence-0');
  });

  it('does not fetch the evidence list until both fundId and metricRunId exist', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunEvidenceList(7, null), { wrapper: Wrapper });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs metric-run evidence metadata with the explicit idempotency key', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeEvidenceCreateResponse()), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunEvidenceCreate(7, 17), { wrapper: Wrapper });

    result.current.mutate({
      idempotencyKey: 'metric-run-17-evidence-0',
      evidenceSource: 'board_update',
      sourceDate: '2026-03-31',
      materialityLevel: 'high',
      description: 'Q1 board materials',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/evidence-records');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({
      idempotencyKey: 'metric-run-17-evidence-0',
      evidenceSource: 'board_update',
      sourceDate: '2026-03-31',
      materialityLevel: 'high',
      description: 'Q1 board materials',
    });
    expect(result.current.data?.record.metricRunId).toBe(17);
  });

  it('surfaces METRIC_RUN_NOT_EDITABLE evidence create errors', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'METRIC_RUN_NOT_EDITABLE',
          message: 'Evidence records can only be added to draft metric runs.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunEvidenceCreate(7, 17), { wrapper: Wrapper });

    result.current.mutate({
      idempotencyKey: 'metric-run-17-evidence-0',
      evidenceSource: 'board_update',
      sourceDate: '2026-03-31',
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.status).toBe(409);
    expect(result.current.error?.code).toBe('METRIC_RUN_NOT_EDITABLE');
  });
});

describe('metric-run narrative hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs route-scoped narrative drafts and parses the response', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeNarrativeListResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeList(7, 17), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/narrative-runs');
    expect(init?.method).toBe('GET');
    expect(result.current.data?.records[0]?.narrativeType).toBe('methodology');
  });

  it('keeps the narrative list disabled without fundId or metricRunId', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeList(7, null), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GETs narrative detail by route-scoped ID', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeNarrativeDetailResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeDetail(7, 17, 41), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/narrative-runs/41');
    expect(init?.method).toBe('GET');
    expect(result.current.data?.record.narrativeRunId).toBe(41);
  });

  it('POSTs only narrativeType and invalidates narrative queries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeNarrativeCreateResponse()), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMetricRunNarrativeCreate(7, 17), {
      wrapper: Wrapper,
    });

    result.current.mutate({ narrativeType: 'methodology' });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/narrative-runs');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ narrativeType: 'methodology' });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-run-narratives', 7, 17],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-run-narratives', 7, 17, 41],
    });
  });

  it('PATCHes narrative edits and invalidates narrative queries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          makeNarrativeLifecycleResponse(true, {
            editedText: 'Reviewed copy',
            editedBy: 7,
            version: 2,
          })
        ),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMetricRunNarrativeEdit(7, 17), {
      wrapper: Wrapper,
    });

    result.current.mutate({
      narrativeRunId: 41,
      expectedVersion: 1,
      editedText: 'Reviewed copy',
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/narrative-runs/41');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({
      expectedVersion: 1,
      editedText: 'Reviewed copy',
    });
    expect(result.current.data?.changed).toBe(true);
    expect(result.current.data?.record.version).toBe(2);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-run-narratives', 7, 17],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-run-narratives', 7, 17, 41],
    });
  });

  it('POSTs narrative review and accepts changed false responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify(
          makeNarrativeLifecycleResponse(false, {
            editedText: 'Reviewed copy',
            editedBy: 7,
            status: 'reviewed',
            reviewedBy: 7,
            reviewedAt: '2026-05-10T01:00:00.000Z',
            version: 2,
          })
        ),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeReview(7, 17), {
      wrapper: Wrapper,
    });

    result.current.mutate({ narrativeRunId: 41, expectedVersion: 1 });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/narrative-runs/41/review');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual({ expectedVersion: 1 });
    expect(result.current.data?.changed).toBe(false);
    expect(result.current.data?.record.reviewedBy).toBe(7);
  });

  it('POSTs narrative approve and preserves server conflict codes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'NARRATIVE_RUN_VERSION_CONFLICT',
          message: 'Narrative run version no longer matches the request.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeApprove(7, 17), {
      wrapper: Wrapper,
    });

    result.current.mutate({ narrativeRunId: 41, expectedVersion: 2 });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.error?.code).toBe('NARRATIVE_RUN_VERSION_CONFLICT');
    expect(result.current.error?.status).toBe(409);
  });

  it('preserves narrative create server error codes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'METRIC_RUN_NOT_LOCKED',
          message: 'Narrative drafts can only be generated from locked metric runs.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeCreate(7, 17), {
      wrapper: Wrapper,
    });

    result.current.mutate({ narrativeType: 'risk_disclosure' });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.status).toBe(409);
    expect(result.current.error?.code).toBe('METRIC_RUN_NOT_LOCKED');
  });

  it('flags narrative contract drift with CONTRACT_PARSE_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ records: [{ bad: true }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunNarrativeList(7, 17), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });
});

describe('metric-run report package hooks', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('GETs the route-scoped report package and parses nullable responses', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeReportPackageGetResponse(null)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackage(7, 17), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/report-package');
    expect(init?.method).toBe('GET');
    expect(result.current.data?.record).toBeNull();
  });

  it('keeps the report package query disabled without metricRunId', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackage(7, null), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('GETs the route-scoped report package render model', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeReportPackageRenderModelResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageRenderModel(7, 17), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/report-package/render-model');
    expect(init?.method).toBe('GET');
    expect(result.current.data?.renderModel.fundDisplay.name).toBe('Press On Fund I');
  });

  it('keeps the render-model query disabled without metricRunId', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageRenderModel(7, null), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('fetches the route-scoped package JSON export on demand', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeReportPackageJsonExportResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageJsonExport(7, 17), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();

    const response = await result.current.refetch();

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/report-package/export/json');
    expect(init?.method).toBe('GET');
    expect(response.data?.export.format).toBe('json');
    expect(response.data?.export.contentHash).toBe('c'.repeat(64));
  });

  it('keeps the package JSON export query disabled without metricRunId', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageJsonExport(7, null), {
      wrapper: Wrapper,
    });

    expect(result.current.fetchStatus).toBe('idle');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('preserves package JSON export blockers on 409 responses', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'REPORT_PACKAGE_JSON_EXPORT_BLOCKED',
          message: 'Report package JSON export is blocked by readiness checks.',
          blockers: [
            {
              code: 'EVIDENCE_REFERENCE_INVALID',
              message: 'One or more evidence references could not be resolved.',
              evidenceRecordIds: [1000],
            },
          ],
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageJsonExport(7, 17), {
      wrapper: Wrapper,
    });

    const response = await result.current.refetch();

    expect(response.error?.status).toBe(409);
    expect(response.error?.code).toBe('REPORT_PACKAGE_JSON_EXPORT_BLOCKED');
    expect(response.error?.blockers?.[0]).toEqual({
      code: 'EVIDENCE_REFERENCE_INVALID',
      message: 'One or more evidence references could not be resolved.',
      evidenceRecordIds: [1000],
    });
  });

  it('flags package JSON export contract drift with CONTRACT_PARSE_ERROR', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ export: { bad: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageJsonExport(7, 17), {
      wrapper: Wrapper,
    });

    const response = await result.current.refetch();

    expect(response.error?.code).toBe('CONTRACT_PARSE_ERROR');
  });

  it('POSTs assemble refs and invalidates report-package/detail queries', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeReportPackageAssembleResponse(false)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const { Wrapper, queryClient } = makeWrapper();
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    const { result } = renderHook(() => useMetricRunReportPackageAssemble(7, 17), {
      wrapper: Wrapper,
    });

    const request = {
      expectedMetricRunVersion: 4,
      expectedNarratives: [
        { narrativeType: 'methodology' as const, narrativeRunId: 41, expectedVersion: 3 },
      ],
    };
    result.current.mutate(request);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('/api/funds/7/metric-runs/17/report-package');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(init?.body as string)).toEqual(request);
    expect(result.current.data?.inserted).toBe(false);
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-run-report-package', 7, 17],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-run-report-package-render-model', 7, 17],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['lp-reporting', 'metric-runs', 'detail', 7, 17],
    });
  });

  it('preserves report package conflict codes', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: 'REPORT_PACKAGE_ALREADY_ASSEMBLED',
          message: 'A package already exists.',
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    const { Wrapper } = makeWrapper();
    const { result } = renderHook(() => useMetricRunReportPackageAssemble(7, 17), {
      wrapper: Wrapper,
    });

    result.current.mutate({
      expectedMetricRunVersion: 4,
      expectedNarratives: [
        { narrativeType: 'methodology', narrativeRunId: 41, expectedVersion: 3 },
      ],
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.status).toBe(409);
    expect(result.current.error?.code).toBe('REPORT_PACKAGE_ALREADY_ASSEMBLED');
  });
});
