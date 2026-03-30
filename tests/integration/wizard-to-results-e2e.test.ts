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
const mockCreateFund = vi.fn().mockResolvedValue({
  success: true,
  data: { id: 42, name: 'Test Fund', size: '50000000' },
});
const mockFetch = vi.fn();

const mockFundState = {
  fundName: 'Test Fund',
  fundSize: 50_000_000,
  managementFeeRate: 2.0,
  carriedInterest: 20.0,
  vintageYear: 2026,
  fundLife: 10,
  establishmentDate: '2026-01-15',
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

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mockInvalidateQueries,
  }),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    setCurrentFund: mockSetCurrentFund,
  }),
}));

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (s: typeof mockFundState) => unknown) => selector(mockFundState),
}));

vi.mock('@/stores/fundStore', () => ({
  fundStore: {
    getState: () => mockFundState,
  },
}));

vi.mock('@/services/funds', () => ({
  createFund: (...args: unknown[]) => mockCreateFund(...args),
  normalizeCreateFundResponse: (raw: Record<string, unknown>) => {
    const data = (raw as { data?: Record<string, unknown> }).data ?? raw;
    return { id: Number(data['id']), name: data['name'], size: data['size'] };
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
    mockCreateFund.mockReset().mockResolvedValue({
      success: true,
      data: { id: 42, name: 'Test Fund', size: '50000000' },
    });
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

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === '/api/funds/42/draft') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url === '/api/funds/42/publish') {
        return new Response(
          JSON.stringify({
            success: true,
            data: { id: 100, fundId: 42, version: 1, isPublished: true },
            runId: 10,
            dispatchState: 'dispatched',
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }

      if (url === '/api/funds/42/results') {
        return new Response(JSON.stringify(readyResponse()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    });

    await sandbox.isolate(async () => {
      const firstRender = renderFlow('/fund-setup?step=7');

      await userEvent.click(screen.getByTestId('create-fund-button'));

      await waitFor(() => {
        expect(screen.getByTestId('location').textContent).toBe('/fund-model-results/42');
      });

      await waitFor(() => {
        expect(screen.getByText('Test Fund')).toBeTruthy();
      });

      expect(screen.getByText(/Vintage 2026/)).toBeTruthy();
      expect(screen.getAllByText('No authoritative source')).toHaveLength(3);

      firstRender.unmount();

      renderFlow('/fund-model-results/42');

      await waitFor(() => {
        expect(screen.getByText('Test Fund')).toBeTruthy();
      });

      const sessionCalls = sessionGetSpy.mock.calls
        .map(([key]) => key)
        .filter(
          (key) => key === 'wizard-completion-data' || String(key).startsWith('engine-results-')
        );

      expect(sessionCalls).toHaveLength(0);
      expect(mockCreateFund).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith('/api/funds/42/publish', { method: 'POST' });
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/funds/42/results',
        expect.objectContaining({ signal: expect.any(AbortSignal) })
      );
      expect(mockFetch).toHaveBeenCalledWith('/api/funds/42/lifecycle-history');
    });
  });
});

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
    },
  };
}
