import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentFundId: 1,
  currentFundName: 'Fund I',
  fetch: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: { id: mocks.currentFundId, name: mocks.currentFundName, size: 100_000_000 },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/hooks/useFundMetrics', () => ({
  useFundMetrics: () => ({
    data: {
      actual: {
        totalCommitted: 100_000_000,
        totalDeployed: 25_000_000,
        totalUncalled: 50_000_000,
      },
      variance: { deploymentVariance: { target: 40_000_000 } },
      _status: { engines: { target: 'success', variance: 'success' } },
    },
    isLoading: false,
  }),
}));

vi.mock('@/hooks/useCurrentPlanVersions', () => ({
  useCurrentPlanVersions: () => ({
    headVersion: { id: '11', sourceFactsSnapshotId: '31' },
    isLoading: false,
    error: null,
    mint: {
      isPending: false,
      mutate: vi.fn(),
      mutateAsync: vi.fn(),
    },
  }),
}));

vi.mock('@/components/analytics', () => ({
  DashboardLoadingState: () => <div>Loading variance dashboard</div>,
  ErrorState: ({ title }: { title: string }) => <div>{title}</div>,
  ApiErrorState: () => <div>Unable to load variance dashboard</div>,
  StatCardGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stat-card-grid">{children}</div>
  ),
  StatCard: ({
    title,
    value,
    description,
  }: {
    title: string;
    value: React.ReactNode;
    description?: string;
  }) => (
    <section aria-label={title} data-testid={`stat-${title}`}>
      <h3>{title}</h3>
      <div>{value}</div>
      {description ? <p>{description}</p> : null}
    </section>
  ),
}));

function createMutation() {
  return {
    isPending: false,
    mutate: vi.fn(),
    mutateAsync: vi.fn().mockResolvedValue({ success: true }),
  };
}

vi.mock('@/hooks/useVarianceData', async () => {
  const actual =
    await vi.importActual<typeof import('@/hooks/useVarianceData')>('@/hooks/useVarianceData');

  return {
    ...actual,
    useVarianceDashboard: () => ({
      data: {
        success: true,
        data: {
          summary: {
            totalActiveAlerts: 0,
            totalBaselines: 0,
            lastAnalysisDate: null,
          },
          alertsBySeverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
        },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useBaselines: () => ({
      data: { success: true, data: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useActiveAlerts: () => ({
      data: { success: true, data: [] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    }),
    useVarianceReports: () => ({
      data: { success: true, data: [] },
      isLoading: false,
      error: null,
    }),
    useVarianceReport: () => ({ data: { success: true, data: null }, isLoading: false }),
    useCreateBaseline: () => createMutation(),
    useSetDefaultBaseline: () => createMutation(),
    useDeactivateBaseline: () => createMutation(),
    useCreateAlertRule: () => createMutation(),
    useAcknowledgeAlert: () => createMutation(),
    useResolveAlert: () => createMutation(),
    usePerformVarianceAnalysis: () => createMutation(),
    useGenerateVarianceReport: () => createMutation(),
  };
});

import VarianceTrackingPage from '@/pages/variance-tracking';

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <VarianceTrackingPage />
    </QueryClientProvider>
  );
}

const persistedResponse = {
  result: {
    state: 'available',
    basis: {
      contractVersion: 'calc-substrate/1.0.0',
      calculationKey: 'construction-reconciliation',
      configuredMode: 'on',
      effectiveMode: 'on',
      killSwitchActive: false,
      engineVersion: 'construction-rec-v1',
      methodologyVersion: 'construction-reconciliation/1.0.0',
      inputHash: 'a'.repeat(64),
      assumptionsHash: 'b'.repeat(64),
    },
    value: {
      deployableCapitalUsd: '100.000000',
      plannedInitialUsd: '70.000000',
      plannedFollowOnUsd: '50.000000',
      plannedTotalUsd: '120.000000',
      plannedCapitalOverDeployableUsd: '20.000000',
      actualInitialUsd: '10.000000',
      actualFollowOnUsd: '0.000000',
      actualTotalEquityUsd: '10.000000',
      excludedNonEquityUsd: '0.000000',
      remainingDeployableUsd: '90.000000',
      plannedRemainingUsd: '110.000000',
      remainingDeployableGapUsd: '-20.000000',
      asOfDate: '2026-07-21',
      currency: 'USD',
    },
    resultHash: 'c'.repeat(64),
    reasonCodes: [],
  },
  structuredWarnings: [],
  trustState: 'LIVE',
};

const persistedLatestResponse = {
  state: 'persisted',
  ...persistedResponse,
  currentPlanVersionId: 11,
  financialFactsSnapshotId: 31,
  asOfDate: '2026-07-21',
  basisRef: {
    schemaId: 'financial-facts-basis-ref/1.0.0',
    fundId: 1,
    snapshotId: 31,
    snapshotInputHash: 'd'.repeat(64),
    sourceFactsInputHash: 'e'.repeat(64),
    policyVersion: 'financial-facts-policy/1.4.0',
    asOfDate: '2026-07-21',
    knowledgeCutoff: '2026-07-21T23:59:59.999Z',
  },
};

describe('VarianceTrackingPage construction reconciliation card', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    mocks.currentFundId = 1;
    mocks.currentFundName = 'Fund I';
    mocks.fetch.mockReset();
    mocks.toast.mockReset();
    vi.stubGlobal('fetch', mocks.fetch);
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue(
      '00000000-0000-4000-8000-000000000001'
    );
  });

  it('loads latest persisted state without posting during render', async () => {
    mocks.fetch.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.method ?? 'GET').toBe('GET');
      return response({ state: 'no_persisted_reconciliation' });
    });

    renderPage();

    expect(await screen.findByText('No persisted reconciliation yet')).toBeInTheDocument();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.fetch.mock.calls[0]?.[0]).toBe('/api/funds/1/construction-reconciliation/latest');
    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    expect(screen.getByRole('button', { name: 'Generate reconciliation' })).toBeInTheDocument();
  });

  it('posts only after explicit refresh and renders persisted labels and over-plan value', async () => {
    let posted = false;
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted = true;
        return response(persistedResponse);
      }
      // GET-latest serves the server-labeled persisted snapshot only after the
      // POST persisted it; the labels must come from this refetch, not the POST.
      return response(posted ? persistedLatestResponse : { state: 'no_persisted_reconciliation' });
    });

    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole('button', { name: 'Generate reconciliation' });

    expect(mocks.fetch.mock.calls.some(([, init]) => init?.method === 'POST')).toBe(false);
    await user.click(button);

    await waitFor(() => {
      expect(screen.getByText('Persisted reconciliation')).toBeInTheDocument();
    });

    const postCall = mocks.fetch.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(postCall).toBeDefined();
    expect(postCall?.[0]).toBe('/api/funds/1/construction-reconciliation/runs');
    expect(postCall?.[1]?.headers).toEqual(
      expect.objectContaining({
        'Idempotency-Key': '00000000-0000-4000-8000-000000000001',
      })
    );
    const postBody = JSON.parse(String(postCall?.[1]?.body)) as Record<string, unknown>;
    expect(postBody).toMatchObject({
      contractVersion: 'construction-reconciliation/1.0.0',
      fundId: 1,
      currentPlanVersionId: 11,
    });
    // The server resolves the current facts snapshot; the client never pins one.
    expect(postBody).not.toHaveProperty('financialFactsSnapshotId');
    expect(screen.getByText('11', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('31', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('2026-07-21', { exact: true })).toBeInTheDocument();
    expect(
      screen.getByText('Basis: facts snapshot 31 (policy 1.4, 2026-07-21)')
    ).toBeInTheDocument();
    expect(screen.getByText('$20', { exact: true })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeInTheDocument();
  });

  it('stays busy through readback and surfaces a persisted-but-unreloadable failure', async () => {
    let posted = false;
    let releaseReadback: (() => void) | undefined;
    mocks.fetch.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted = true;
        return response(persistedResponse);
      }
      if (!posted) return response({ state: 'no_persisted_reconciliation' });
      // Readback after the persisted POST: hold until released, then fail.
      await new Promise<void>((resolve) => {
        releaseReadback = resolve;
      });
      return response({ error: 'internal_error' }, 500);
    });

    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole('button', { name: 'Generate reconciliation' });
    await user.click(button);

    // Mutation resolved but readback is still in flight: the button must stay
    // disabled or a second click would mint a duplicate-key POST.
    await waitFor(() => {
      expect(releaseReadback).toBeDefined();
    });
    expect(screen.getByRole('button', { name: /Generating|Refreshing/ })).toBeDisabled();

    releaseReadback?.();

    expect(
      await screen.findByText('Reconciliation persisted, but reloading it failed')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate reconciliation|Refresh/ })).toBeEnabled();
  });

  it('keeps cached persisted labels visible with a stale-data warning when refetch fails', async () => {
    let posted = false;
    mocks.fetch.mockImplementation(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posted = true;
        return response(persistedResponse);
      }
      // Initial GET serves a persisted snapshot; the post-POST readback fails.
      return posted
        ? response({ error: 'internal_error' }, 500)
        : response(persistedLatestResponse);
    });

    const user = userEvent.setup();
    renderPage();
    const button = await screen.findByRole('button', { name: 'Refresh' });
    expect(screen.getByText('Persisted reconciliation')).toBeInTheDocument();

    await user.click(button);

    // React Query keeps the previous data alongside the refetch error: the old
    // snapshot's labels stay on screen, explicitly flagged as possibly stale.
    expect(await screen.findByText(/the snapshot shown above may be stale/i)).toBeInTheDocument();
    expect(screen.getByText('Persisted reconciliation')).toBeInTheDocument();
    expect(screen.getByText('11', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('31', { exact: true })).toBeInTheDocument();
    expect(screen.getByText('2026-07-21', { exact: true })).toBeInTheDocument();
  });
});
