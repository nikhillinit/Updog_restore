/**
 * LP Reporting -- Metrics page integration test.
 *
 * Asserts:
 *   - Page renders header + form + empty state by default.
 *   - On a successful dry-run the metric cards, XIRR diagnostic panel,
 *     and mark-confidence mix populate.
 *   - Successful dry-run exposes a commit action and successful commit
 *     renders the saved draft envelope.
 *   - The page calls `LpMetricRunResultsSchema.parse` defensively at the
 *     trust boundary (asserted via the source file containing the call).
 *   - On 401 the typed error envelope renders above the form.
 *   - When fundId is null, the "select a fund" notice is shown and submit
 *     is disabled.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';

const fundContextMock = vi.hoisted(() => ({
  fundId: 7 as number | null,
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    fundId: fundContextMock.fundId,
    currentFund: null,
    setCurrentFund: () => {},
    isLoading: false,
    needsSetup: false,
    fundLoadError: false,
    fundLoadErrorMessage: null,
    isDemoMode: false,
  }),
  FundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import LpReportingMetricsPage from '@/pages/lp-reporting/metrics';
import type {
  LpMetricRunResults,
  MetricRunCommitResponse,
  MetricRunDetailResponse,
  MetricRunDryRunResponse,
  MetricRunLifecycleResponse,
  NarrativeRunRecord,
} from '@shared/contracts/lp-reporting';

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <LpReportingMetricsPage />
    </QueryClientProvider>
  );
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
        convergence: 'bounded_high',
        iterations: 100,
        method: 'bisection',
        boundHit: 'max',
        failureReason: null,
      },
    },
    contributionsTotal: '50000000',
    distributionsTotal: '22500000',
    currentNav: '62500000',
    markConfidenceMix: { high: 8, medium: 3, low: 1 },
  };
}

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
    runType: 'internal_review',
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
    evidenceSource: 'board_update',
    sourceDate: '2026-03-31',
    receivedDate: null,
    expirationDate: null,
    confidenceLevel: 'medium',
    materialityLevel: 'high',
    confidentiality: 'internal',
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

function makeNarrativeRecord(overrides: Partial<NarrativeRunRecord> = {}): NarrativeRunRecord {
  return {
    narrativeRunId: 41,
    fundId: 7,
    metricRunId: 17,
    asOfDate: '2026-03-31',
    narrativeType: 'methodology',
    generatedText: 'Methodology draft as of 2026-03-31. Engine version: lp-reporting-engine@1.2.0.',
    editedText: null,
    status: 'draft',
    generatedBy: 7,
    editedBy: null,
    approvedBy: null,
    approvedAt: null,
    exportedAt: null,
    createdAt: '2026-05-10T00:00:00.000Z',
    updatedAt: '2026-05-10T00:00:00.000Z',
    ...overrides,
  };
}

function makeMetricRunDetail(
  overrides: Partial<MetricRunDetailResponse> = {}
): MetricRunDetailResponse {
  return {
    metricRunId: 17,
    fundId: 7,
    asOfDate: '2026-03-31',
    runType: 'internal_review',
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

describe('LpReportingMetricsPage', () => {
  beforeEach(() => {
    fundContextMock.fundId = 7;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders the header, form, and empty-state card by default', () => {
    renderPage();

    expect(screen.getByRole('heading', { name: /^metrics$/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/^as-of date/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^run type/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^perspective/i)).toBeInTheDocument();
    expect(screen.getByTestId('metrics-empty-state')).toBeInTheDocument();
    expect(screen.queryByTestId('metrics-results')).toBeNull();
    expect(screen.queryByTestId('metrics-commit-button')).toBeNull();
    expect(screen.queryByTestId('metrics-error-envelope')).toBeNull();
  });

  it('populates cards + diagnostic panel + confidence mix after a successful dry-run', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(makeDryRunResponse()), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-results')).toBeInTheDocument();
    });

    // Cards
    expect(screen.getByTestId('metric-card-dpi-value').textContent).toBe('0.45x');
    expect(screen.getByTestId('metric-card-tvpi-value').textContent).toBe('1.70x');
    expect(screen.getByTestId('metric-card-net-irr-value').textContent).toBe('15.00%');
    expect(screen.getByTestId('metric-card-gross-irr-value').textContent).toBe('18.00%');

    // XIRR panel: gross has bounded_high + boundHit=max
    expect(screen.getByTestId('xirr-net-convergence-badge').textContent).toBe('Converged');
    expect(screen.getByTestId('xirr-gross-convergence-badge').textContent).toBe('Bounded high');
    expect(screen.getByTestId('xirr-gross-bound-hit')).toBeInTheDocument();

    // Confidence mix
    expect(screen.getByTestId('confidence-mix-high-count').textContent).toBe('8');
    expect(screen.getByTestId('confidence-mix-medium-count').textContent).toBe('3');
    expect(screen.getByTestId('confidence-mix-low-count').textContent).toBe('1');

    // Empty state is gone after results land
    expect(screen.queryByTestId('metrics-empty-state')).toBeNull();
    expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    expect(screen.queryByTestId('metrics-error-envelope')).toBeNull();
  });

  it('commits the successful preview and renders the saved draft result', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(JSON.stringify({ metricRun: makeMetricRunDetail() }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17')) {
        return new Response(JSON.stringify(makeMetricRunDetail()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        return new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-result')).toBeInTheDocument();
    });

    const commitCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/metric-runs/commit')
    );
    expect(commitCall).toBeTruthy();
    const [, commitInit] = commitCall!;
    expect(JSON.parse(commitInit?.body as string)).toMatchObject({
      asOfDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      runType: 'internal_review',
      perspective: 'lp_net',
      sourceEventIds: [],
      sourceMarkIds: [],
      previewHash: 'b'.repeat(64),
    });
    expect(screen.getByTestId('metrics-commit-result').textContent).toMatch(/metric run #17/i);
    await waitFor(() => {
      expect(screen.getByTestId('metric-run-evidence-card')).toBeInTheDocument();
    });
  });

  it('uses committed run detail when latest returns a newer same-context run', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(
          JSON.stringify({
            metricRun: makeMetricRunDetail({
              metricRunId: 99,
              evidenceCount: 2,
              version: 4,
            }),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify({ ...makeCommitResponse(), inserted: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17')) {
        return new Response(JSON.stringify(makeMetricRunDetail({ evidenceCount: 1 })), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/approve') && init?.method === 'POST') {
        return new Response(
          JSON.stringify(
            makeLifecycleResponse({
              status: 'approved',
              evidenceCount: 1,
              sourceEvidenceIds: [1000],
              approvedBy: 7,
              approvedAt: '2026-05-10T01:00:00.000Z',
              version: 2,
            })
          ),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        return new Response(JSON.stringify({ records: [makeEvidenceRecord()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/narrative-runs')) {
        return new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-approve-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metric-run-approve-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-status-badge').textContent).toBe('approved');
    });

    const approveCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/metric-runs/17/approve')
    );
    expect(approveCall).toBeTruthy();
    expect(JSON.parse(approveCall?.[1]?.body as string)).toEqual({ expectedVersion: 1 });
    expect(screen.getByTestId('metrics-commit-result').textContent).toMatch(/metric run #17/i);
  });

  it('adds evidence metadata after a draft metric run is committed', async () => {
    let evidenceListCalls = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(
          JSON.stringify({
            metricRun: makeMetricRunDetail({ evidenceCount: evidenceListCalls > 1 ? 1 : 0 }),
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metric-runs/17')) {
        return new Response(
          JSON.stringify(makeMetricRunDetail({ evidenceCount: evidenceListCalls > 1 ? 1 : 0 })),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metric-runs/17/evidence-records') && init?.method === 'POST') {
        return new Response(JSON.stringify({ record: makeEvidenceRecord(), inserted: true }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        evidenceListCalls += 1;
        return new Response(
          JSON.stringify({
            records: evidenceListCalls === 1 ? [] : [makeEvidenceRecord()],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metrics-commit-button'));
    await waitFor(() => {
      expect(screen.getByTestId('metric-run-evidence-card')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByTestId('metric-run-evidence-empty')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/^description/i), {
      target: { value: 'Q1 board materials' },
    });
    fireEvent.click(screen.getByTestId('metric-run-evidence-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-evidence-record')).toBeInTheDocument();
    });

    const postCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/metric-runs/17/evidence-records') && init?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toMatchObject({
      evidenceSource: 'board_update',
      sourceDate: '2026-03-31',
      confidenceLevel: 'medium',
      materialityLevel: 'medium',
      confidentiality: 'internal',
      redactionRequired: false,
      description: 'Q1 board materials',
    });
    expect(body.idempotencyKey).toEqual(expect.stringMatching(/^metric-run-17-evidence-/));
    expect(body).not.toHaveProperty('fundId');
    expect(body).not.toHaveProperty('metricRunId');
    expect(body).not.toHaveProperty('attachments');
    expect(screen.getByTestId('metric-run-evidence-record').textContent).toMatch(
      /q1 board materials/i
    );
  });

  it('approves after evidence and then locks the metric run', async () => {
    let latestStatus: MetricRunDetailResponse = makeMetricRunDetail({ evidenceCount: 1 });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(JSON.stringify({ metricRun: latestStatus }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17')) {
        return new Response(JSON.stringify(latestStatus), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/approve') && init?.method === 'POST') {
        latestStatus = makeMetricRunDetail({
          status: 'approved',
          evidenceCount: 1,
          sourceEvidenceIds: [1000],
          approvedBy: 7,
          approvedAt: '2026-05-10T01:00:00.000Z',
          version: 2,
        });
        return new Response(JSON.stringify(makeLifecycleResponse(latestStatus)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/lock') && init?.method === 'POST') {
        latestStatus = makeMetricRunDetail({
          ...latestStatus,
          status: 'locked',
          lockedBy: 7,
          lockedAt: '2026-05-10T02:00:00.000Z',
          version: 3,
        });
        return new Response(JSON.stringify(makeLifecycleResponse(latestStatus)), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        return new Response(JSON.stringify({ records: [makeEvidenceRecord()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-approve-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metric-run-approve-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-status-badge').textContent).toBe('approved');
    });
    expect(screen.queryByTestId('metric-run-evidence-form')).toBeNull();
    expect(screen.getByTestId('metric-run-evidence-readonly')).toBeInTheDocument();
    expect(screen.getByTestId('metric-run-lock-button')).toBeEnabled();

    fireEvent.click(screen.getByTestId('metric-run-lock-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-status-badge').textContent).toBe('locked');
    });

    const approveCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/metric-runs/17/approve')
    );
    const lockCall = fetchSpy.mock.calls.find(([url]) =>
      String(url).endsWith('/metric-runs/17/lock')
    );
    expect(JSON.parse(approveCall?.[1]?.body as string)).toEqual({ expectedVersion: 1 });
    expect(JSON.parse(lockCall?.[1]?.body as string)).toEqual({ expectedVersion: 2 });
  });

  it.each(['draft', 'approved', 'exported', 'superseded'] as const)(
    'keeps the narrative panel hidden for %s metric runs',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        const metricRun = makeMetricRunDetail({
          status,
          evidenceCount: status === 'draft' ? 0 : 1,
          version: status === 'draft' ? 1 : 2,
        });
        if (url.endsWith('/metric-runs/dry-run')) {
          return new Response(JSON.stringify(makeDryRunResponse()), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/metric-runs/commit')) {
          return new Response(JSON.stringify(makeCommitResponse()), {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.includes('/metric-runs/latest')) {
          return new Response(JSON.stringify({ metricRun }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/metric-runs/17')) {
          return new Response(JSON.stringify(metricRun), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        if (url.endsWith('/metric-runs/17/evidence-records')) {
          return new Response(JSON.stringify({ records: [] }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          });
        }
        return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
      });

      renderPage();

      fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
      await waitFor(() => {
        expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
      });
      fireEvent.click(screen.getByTestId('metrics-commit-button'));

      await waitFor(() => {
        expect(screen.getByTestId('metric-run-status-badge').textContent).toBe(status);
      });

      expect(screen.queryByTestId('metric-run-narrative-card')).toBeNull();
    }
  );

  it('shows narrative draft controls for locked metric runs only', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const locked = makeMetricRunDetail({
        status: 'locked',
        evidenceCount: 1,
        lockedBy: 7,
        lockedAt: '2026-05-10T02:00:00.000Z',
        version: 3,
      });
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(JSON.stringify({ metricRun: locked }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17')) {
        return new Response(JSON.stringify(locked), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        return new Response(JSON.stringify({ records: [makeEvidenceRecord()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/narrative-runs')) {
        return new Response(JSON.stringify({ records: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-narrative-card')).toBeInTheDocument();
    });
    expect(screen.getByTestId('metric-run-narrative-empty')).toBeInTheDocument();
    expect(screen.getByTestId('metric-run-narrative-create-no_dpi')).toBeEnabled();
    expect(screen.getByTestId('metric-run-narrative-create-methodology')).toBeEnabled();
    expect(screen.getByTestId('metric-run-narrative-create-portfolio_update')).toBeEnabled();
    expect(screen.getByTestId('metric-run-narrative-create-risk_disclosure')).toBeEnabled();
  });

  it('creates a narrative draft and renders deterministic generated text', async () => {
    let narrativeListCalls = 0;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      const locked = makeMetricRunDetail({
        status: 'locked',
        evidenceCount: 1,
        lockedBy: 7,
        lockedAt: '2026-05-10T02:00:00.000Z',
        version: 3,
      });
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(JSON.stringify({ metricRun: locked }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17')) {
        return new Response(JSON.stringify(locked), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        return new Response(JSON.stringify({ records: [makeEvidenceRecord()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/narrative-runs') && init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            record: makeNarrativeRecord(),
            inserted: true,
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metric-runs/17/narrative-runs')) {
        narrativeListCalls += 1;
        return new Response(
          JSON.stringify({
            records: narrativeListCalls === 1 ? [] : [makeNarrativeRecord()],
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metrics-commit-button'));
    await waitFor(() => {
      expect(screen.getByTestId('metric-run-narrative-card')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('metric-run-narrative-create-methodology'));

    await waitFor(() => {
      expect(screen.getByTestId('metric-run-narrative-record')).toBeInTheDocument();
    });

    const postCall = fetchSpy.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/metric-runs/17/narrative-runs') && init?.method === 'POST'
    );
    expect(postCall).toBeTruthy();
    const body = JSON.parse(postCall?.[1]?.body as string) as Record<string, unknown>;
    expect(body).toEqual({ narrativeType: 'methodology' });
    expect(body).not.toHaveProperty('fundId');
    expect(body).not.toHaveProperty('metricRunId');
    expect(screen.getByTestId('metric-run-narrative-record').textContent).toMatch(
      /engine version: lp-reporting-engine@1\.2\.0/i
    );
    expect(screen.getByTestId('metric-run-narrative-create-methodology')).toBeDisabled();
  });

  it('does not expose narrative edit, review, export, share, upload, or AI controls', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      const locked = makeMetricRunDetail({
        status: 'locked',
        evidenceCount: 1,
        lockedBy: 7,
        lockedAt: '2026-05-10T02:00:00.000Z',
        version: 3,
      });
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(JSON.stringify(makeCommitResponse()), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest') || url.endsWith('/metric-runs/17')) {
        return new Response(
          JSON.stringify(url.includes('/latest') ? { metricRun: locked } : locked),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      if (url.endsWith('/metric-runs/17/evidence-records')) {
        return new Response(JSON.stringify({ records: [makeEvidenceRecord()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/17/narrative-runs')) {
        return new Response(JSON.stringify({ records: [makeNarrativeRecord()] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });
    fireEvent.click(screen.getByTestId('metrics-commit-button'));
    await waitFor(() => {
      expect(screen.getByTestId('metric-run-narrative-card')).toBeInTheDocument();
    });

    const card = within(screen.getByTestId('metric-run-narrative-card'));
    expect(card.queryByRole('button', { name: /edit/i })).toBeNull();
    expect(card.queryByRole('button', { name: /review/i })).toBeNull();
    expect(card.queryByRole('button', { name: /export/i })).toBeNull();
    expect(card.queryByRole('button', { name: /share/i })).toBeNull();
    expect(card.queryByRole('button', { name: /upload/i })).toBeNull();
    expect(card.queryByRole('button', { name: /ai/i })).toBeNull();
  });

  it('renders the commit error envelope on preview mismatch', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/metric-runs/dry-run')) {
        return new Response(JSON.stringify(makeDryRunResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.includes('/metric-runs/latest')) {
        return new Response(JSON.stringify({ metricRun: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (url.endsWith('/metric-runs/commit')) {
        return new Response(
          JSON.stringify({
            error: 'PREVIEW_HASH_MISMATCH',
            message: 'Metric-run preview hash no longer matches.',
          }),
          {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      return new Response(JSON.stringify({ error: 'UNEXPECTED_URL' }), { status: 500 });
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));
    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-button')).toBeEnabled();
    });

    fireEvent.click(screen.getByTestId('metrics-commit-button'));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-commit-error-envelope')).toBeInTheDocument();
    });
    expect(screen.getByTestId('metrics-commit-error-envelope')).toHaveAttribute(
      'data-error-status',
      '409'
    );
    expect(screen.getByTestId('metrics-commit-error-envelope').textContent).toMatch(
      /preview changed/i
    );
  });

  it('renders the 401 error envelope when the dry-run is unauthorized', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ code: 'UNAUTHORIZED', message: 'Session expired' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-error-envelope')).toBeInTheDocument();
    });
    const envelope = screen.getByTestId('metrics-error-envelope');
    expect(envelope).toHaveAttribute('data-error-status', '401');
    expect(envelope.textContent).toMatch(/sign-in required/i);
  });

  it('renders the CONTRACT_PARSE_ERROR envelope on contract drift', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ asOfDate: 'not-a-date' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /run metrics/i }));

    await waitFor(() => {
      expect(screen.getByTestId('metrics-error-envelope')).toBeInTheDocument();
    });
    expect(screen.getByTestId('metrics-error-envelope').textContent).toMatch(
      /unexpected response/i
    );
  });

  it('shows a "select a fund" notice and disables submit when fundId is null', () => {
    fundContextMock.fundId = null;

    renderPage();

    expect(screen.getByText(/select a fund/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /run metrics/i })).toBeDisabled();
  });

  it('source-discipline: page calls LpMetricRunResultsSchema.parse defensively', () => {
    const file = path.resolve(__dirname, '../../../../client/src/pages/lp-reporting/metrics.tsx');
    const text = readFileSync(file, 'utf-8');

    expect(text).toMatch(/LpMetricRunResultsSchema\.parse\s*\(/);
  });

  it('source-discipline: page never imports the XIRR solver', () => {
    const file = path.resolve(__dirname, '../../../../client/src/pages/lp-reporting/metrics.tsx');
    const text = readFileSync(file, 'utf-8');

    expect(text).not.toMatch(/from ['"][^'"]*\/finance\/xirr['"]/);
  });
});
