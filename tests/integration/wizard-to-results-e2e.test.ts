// @vitest-environment jsdom

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'wouter';
import { createWouterWrapper } from '../utils/withWouter';
import { createSandbox } from '../setup/test-infrastructure';
import ReviewStep from '@/pages/ReviewStep';
import FundModelResultsPage from '@/pages/fund-model-results';

const mockSetCurrentFund = vi.fn();
const mockInvalidateQueries = vi.fn().mockResolvedValue(undefined);
const mockFetch = vi.fn();

const mockFundState = {
  fundName: 'Test Fund',
  fundSize: 50_000_000,
  managementFeeRate: 2.0,
  carriedInterest: 20.0,
  vintageYear: 2026,
  fundLife: 10,
  establishmentDate: '2026-01-15',
  modelInputsAsOfDate: '2026-06-30',
  stages: [{ id: 'stg-1', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
  waterfallType: 'american' as const,
  recyclingEnabled: false,
  isEvergreen: false,
  investmentPeriod: 5,
  gpCommitment: 2_500_000,
  lpClasses: [],
  lps: [],
  sectorProfiles: [],
  allocations: [],
  followOnChecks: { A: 1, B: 2, C: 3 },
  capitalStageAllocations: [],
  capitalPlanAllocations: [],
  pipelineProfiles: [],
  waterfallTiers: [],
  recyclingType: undefined,
  recyclingCap: undefined,
  recyclingPeriod: undefined,
  exitRecyclingRate: undefined,
  mgmtFeeRecyclingRate: undefined,
  allowFutureRecycling: undefined,
  feeProfiles: [],
  fundExpenses: [],
  hydrated: true,
  setHydrated: vi.fn(),
  draftFundId: null as number | null,
  setDraftFundId: vi.fn((fundId: number | null) => {
    mockFundState.draftFundId = fundId;
  }),
  draftServerReady: false,
  setDraftServerReady: vi.fn((ready: boolean) => {
    mockFundState.draftServerReady = ready;
  }),
};

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidateQueries,
    }),
  };
});

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    setCurrentFund: mockSetCurrentFund,
  }),
}));

// Plan 9 Wave 9B2: the readiness rollup's data-source hooks are react-query
// hooks; this harness has no QueryClientProvider and its strict fetch mock
// deliberately rejects unexpected URLs. Mock them at the module boundary
// (same pattern as the release-owned page suite) so the rollup renders its
// fail-closed rows while the wizard flow under test stays fetch-strict.
vi.mock('@/hooks/useDualForecast', () => ({
  useDualForecast: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('dual forecast unavailable'),
  }),
}));
vi.mock('@/hooks/use-moic', () => ({
  useFundMoicRankingsV2: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('rankings unavailable'),
  }),
}));
vi.mock('@/components/portfolio/tabs/hooks/useLatestAllocations', () => ({
  useLatestAllocations: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('allocations unavailable'),
  }),
}));
vi.mock('@/hooks/use-scenario-set-list', () => ({
  useScenarioSetList: () => ({
    isSuccess: false,
    isError: true,
    data: undefined,
    error: new Error('scenario set list unavailable'),
  }),
}));

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (s: typeof mockFundState) => unknown) => selector(mockFundState),
  useFundTuple: (selector: (s: typeof mockFundState) => readonly unknown[]) =>
    selector(mockFundState),
}));

vi.mock('@/stores/fundStore', () => ({
  fundStore: {
    getState: () => mockFundState,
  },
}));

function FlowHarness() {
  const [location] = useLocation();
  const reviewMatch = location.startsWith('/fund-setup');
  const resultsMatch = location.startsWith('/fund-model-results/');

  return React.createElement(
    React.Fragment,
    null,
    React.createElement('div', { 'data-testid': 'location' }, location),
    reviewMatch ? React.createElement(ReviewStep) : null,
    resultsMatch ? React.createElement(FundModelResultsPage) : null,
    !reviewMatch && !resultsMatch ? React.createElement('div', null, 'unknown route') : null
  );
}

describe('wizard to results flow', () => {
  beforeEach(() => {
    mockSetCurrentFund.mockReset();
    mockInvalidateQueries.mockClear();
    mockFundState.draftFundId = null;
    mockFundState.draftServerReady = false;
    mockFundState.setDraftFundId.mockClear();
    mockFundState.setDraftServerReady.mockClear();
    mockFetch.mockReset();
    vi.stubGlobal('fetch', mockFetch);
    vi.stubGlobal(
      'IntersectionObserver',
      class MockIntersectionObserver {
        observe() {
          /* noop */
        }
        unobserve() {
          /* noop */
        }
        disconnect() {
          /* noop */
        }
      } as unknown as typeof IntersectionObserver
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('submits, lands on the concrete results route, and reloads with the same server-backed truth', async () => {
    const sandbox = createSandbox();
    const sessionGetSpy = vi.spyOn(Storage.prototype, 'getItem');
    sandbox.addCleanup(() => sessionGetSpy.mockRestore());

    mockFetch.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === 'string' || input instanceof URL
          ? String(input)
          : input instanceof Request
            ? input.url
            : String(input);

      if (url.endsWith('/api/funds/finalize')) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              fundId: 42,
              configVersion: 1,
              correlationId: 'corr-finalize-42',
              runId: 10,
              dispatchState: 'dispatched',
              published: true,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url.endsWith('/api/funds/42/results')) {
        return new Response(JSON.stringify(readyResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/funds/42/lifecycle-history')) {
        return new Response(JSON.stringify(lifecycleHistoryResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.endsWith('/api/funds/42/results-comparison')) {
        return new Response(JSON.stringify(resultsComparisonResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url} (${init?.method ?? 'GET'})`);
    });

    await sandbox.isolate(async () => {
      const firstRender = renderFlow('/fund-setup?step=7');

      await userEvent.click(screen.getByTestId('create-fund-button'));

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/fund-model-results/42');
      });

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Test Fund' })).toBeTruthy();
      });

      expect(screen.getByText(/Vintage 2026/)).toBeTruthy();
      expect(screen.queryByText(/No published configuration yet/i)).toBeNull();
      expect(screen.getAllByText('v1').length).toBeGreaterThan(0);
      expect(screen.getAllByText(/Run 10/i).length).toBeGreaterThan(0);
      // 9B2: 3 unavailable sections + the readiness rollup's Scenarios row,
      // which honestly repeats the scenarios section's unavailability reason.
      expect(screen.getAllByText('No authoritative source')).toHaveLength(4);

      firstRender.unmount();

      renderFlow('/fund-model-results/42');

      await waitFor(() => {
        expect(screen.getByRole('heading', { level: 1, name: 'Test Fund' })).toBeTruthy();
      });

      const sessionCalls = sessionGetSpy.mock.calls
        .map(([key]) => key)
        .filter(
          (key) => key === 'wizard-completion-data' || String(key).startsWith('engine-results-')
        );

      expect(sessionCalls).toHaveLength(0);
      expectFetchCall('/api/funds/finalize', {
        method: 'POST',
        credentials: 'include',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': expect.any(String),
        }),
        body: expect.any(String),
      });
      expectFetchCall('/api/funds/42/results', { signal: expect.any(AbortSignal) });
      expectFetchCall('/api/funds/42/lifecycle-history');
      expectFetchCall('/api/funds/42/results-comparison');
    });
  });
});

function expectFetchCall(path: string, init?: Record<string, unknown>) {
  const matchingCall = mockFetch.mock.calls.find(([input]) => {
    const url =
      typeof input === 'string' || input instanceof URL
        ? String(input)
        : input instanceof Request
          ? input.url
          : String(input);
    return url.endsWith(path);
  });

  expect(matchingCall).toBeDefined();
  if (init !== undefined) {
    expect(matchingCall?.[1]).toEqual(expect.objectContaining(init));
  }
}

function renderFlow(initialPath: string) {
  const { Wrapper, location } = createWouterWrapper(initialPath);
  const rendered = render(React.createElement(FlowHarness), { wrapper: Wrapper });

  return {
    ...rendered,
    location,
  };
}

function readyResponse() {
  return {
    status: 'ready' as const,
    fundId: 42,
    fund: { name: 'Test Fund', vintageYear: 2026, size: 50_000_000 },
    lifecycle: {
      fundId: 42,
      configState: {
        latestVersion: 1,
        draftVersion: null,
        publishedVersion: 1,
        hasDraft: false,
        hasPublished: true,
        publishedAt: '2026-03-20T12:00:00.000Z',
        draftUpdatedAt: null,
        publishedUpdatedAt: '2026-03-20T12:00:00.000Z',
      },
      calculationState: {
        status: 'ready' as const,
        configVersion: 1,
        runId: 10,
        correlationId: 'test-corr-id',
        dispatchState: 'dispatched',
        availableSnapshotTypes: ['RESERVE', 'PACING'],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: '2026-03-20T12:30:00.000Z',
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: {
        status: 'available' as const,
        calculatedAt: '2026-03-20T12:30:00.000Z',
        source: 'fund_snapshots' as const,
        legacyEvidence: false,
        payload: {
          totalAllocation: 40_000_000,
          reserveRatio: 0.4,
          avgConfidence: 0.85,
          allocations: [{ allocation: 40_000_000, confidence: 0.85, rationale: 'Follow-on' }],
        },
      },
      pacing: {
        status: 'available' as const,
        calculatedAt: '2026-03-20T12:30:00.000Z',
        source: 'fund_snapshots' as const,
        legacyEvidence: false,
        payload: {
          deploymentRate: 5_000_000,
          yearsToFullDeploy: 5,
          totalQuarters: 20,
          marketCondition: 'neutral' as const,
          deployments: [],
        },
      },
      scorecard: { status: 'unavailable' as const, reason: 'No authoritative source' },
      scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
      economics: {
        status: 'unavailable' as const,
        reason: 'GP economics is disabled',
        reasonCode: 'ECONOMICS_DISABLED' as const,
      },
    },
  };
}

function lifecycleHistoryResponse() {
  return {
    fundId: 42,
    entries: [
      {
        version: 1,
        publishedAt: '2026-03-20T12:00:00.000Z',
        publishedBy: 1,
        fundSize: 50_000_000,
        numCompanies: 1,
        calcRun: {
          runId: 10,
          status: 'ready' as const,
          dispatchState: 'dispatched' as const,
          lastCalculatedAt: '2026-03-20T12:30:00.000Z',
          correlationId: 'corr-finalize-42',
        },
      },
    ],
  };
}

function resultsComparisonResponse() {
  return {
    fundId: 42,
    comparisonStatus: 'no_previous_version' as const,
    currentVersion: {
      version: 1,
      publishedAt: '2026-03-20T12:00:00.000Z',
      calcRun: {
        runId: 10,
        status: 'ready' as const,
        dispatchState: 'dispatched' as const,
        lastCalculatedAt: '2026-03-20T12:30:00.000Z',
        correlationId: 'corr-finalize-42',
      },
      metrics: {
        fundSize: 50_000_000,
        reserveRatio: 0.4,
        avgConfidence: 0.85,
        yearsToFullDeploy: 5,
      },
    },
    previousVersion: null,
    metricDeltas: [],
  };
}
