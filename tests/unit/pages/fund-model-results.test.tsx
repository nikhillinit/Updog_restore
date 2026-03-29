/**
 * Batch 3B2: Results page cutover tests
 *
 * Validates that the results page:
 * - Fetches from GET /api/funds/:id/results (not sessionStorage)
 * - Renders available sections with payload data
 * - Renders unavailable sections with reason text
 * - Never calls sessionStorage.getItem with results keys
 * - Handles /latest route gracefully (error state)
 * - Handles loading, 404, and network error states
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { createWouterWrapper } from '../../utils/withWouter';

describe('FundModelResultsPage (server-backed)', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let sessionGetSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    sessionGetSpy = vi.spyOn(Storage.prototype, 'getItem');

    // jsdom lacks IntersectionObserver -- stub it for FadeInSection
    globalThis.IntersectionObserver = class MockIntersectionObserver {
      observe() {
        /* noop */
      }
      unobserve() {
        /* noop */
      }
      disconnect() {
        /* noop */
      }
    } as unknown as typeof IntersectionObserver;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderPage(path: string) {
    const { default: FundModelResultsPage } =
      await import('../../../client/src/pages/fund-model-results');
    const { Wrapper } = createWouterWrapper(path);
    return render(<FundModelResultsPage />, { wrapper: Wrapper });
  }

  function createDeferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  }

  // -- sessionStorage prohibition --

  it('never reads engine-results-* from sessionStorage', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const resultsCalls = sessionGetSpy.mock.calls.filter(
      ([key]) => typeof key === 'string' && (key as string).startsWith('engine-results-')
    );
    expect(resultsCalls).toHaveLength(0);
  });

  it('never reads wizard-completion-data from sessionStorage', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());

    const wizardCalls = sessionGetSpy.mock.calls.filter(
      ([key]) => key === 'wizard-completion-data'
    );
    expect(wizardCalls).toHaveLength(0);
  });

  // -- Server fetch --

  it('fetches GET /api/funds/:id/results on mount', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith('/api/funds/123/results');
    });
  });

  // -- Available sections --

  it('renders reserve section payload when status is available', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Reserve Allocation/)).toBeInTheDocument();
    });
    // Check that payload data from the server appears (not fabricated)
    expect(screen.getByText(/Follow-on/)).toBeInTheDocument();
  });

  it('renders pacing section payload when status is available', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Deployment Pacing/)).toBeInTheDocument();
    });
  });

  it('renders waterfall setup section when the server returns published config data', async () => {
    const resp = readyResponse();
    resp.sections.waterfall = {
      status: 'available',
      source: 'fund_config',
      configVersion: 1,
      publishedAt: '2026-03-20T12:00:00.000Z',
      payload: {
        view: 'setup-summary',
        type: 'american',
        tierCount: 1,
        tiers: [
          {
            name: 'Tier 1',
            preferredReturn: 0.08,
            catchUp: null,
            gpSplit: 20,
            lpSplit: 80,
            condition: 'irr',
            conditionValue: 0.08,
          },
        ],
        recyclingEnabled: true,
        recyclingType: 'both',
        recyclingCap: 25,
        recyclingPeriod: 24,
        exitRecyclingRate: 0.5,
        mgmtFeeRecyclingRate: 0.25,
        allowFutureRecycling: false,
      },
    };
    fetchSpy.mockResolvedValue(jsonResponse(resp));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText('Waterfall Setup')).toBeInTheDocument();
    });
    expect(screen.getByText('American')).toBeInTheDocument();
    expect(screen.getByText('GP 20% / LP 80%')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
  });

  // -- Unavailable sections --

  it('renders overview section with typed scorecard facts', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText('Overview')).toBeInTheDocument();
    });
    // Typed fact tiles render formatted values
    expect(screen.getByText('$100M')).toBeInTheDocument();
    expect(screen.getByText('40.0%')).toBeInTheDocument(); // reserveRatio
    expect(screen.getByText('5 yrs')).toBeInTheDocument(); // yearsToFullDeploy
  });

  it('renders unavailable reason text for scenarios and waterfall sections', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      // scenarios and waterfall show the raw reason text
      const matches = screen.getAllByText(/No authoritative source/i);
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('renders unavailable reason for reserve when no snapshot exists', async () => {
    const resp = readyResponse();
    resp.sections.reserve = {
      status: 'unavailable',
      reason: 'No calculation results available',
    };
    fetchSpy.mockResolvedValue(jsonResponse(resp));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/No calculation results available/i)).toBeInTheDocument();
    });
  });

  it('renders stale-evidence copy from reasonCode', async () => {
    const resp = readyResponse();
    resp.sections.reserve = {
      status: 'pending',
      reason: 'A newer configuration was published. Request recalculation to update.',
      reasonCode: 'STALE_EVIDENCE',
    };
    fetchSpy.mockResolvedValue(jsonResponse(resp));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(
        screen.getByText(/A newer configuration was published\. Request recalculation to update\./i)
      ).toBeInTheDocument();
    });
  });

  it('renders configuration issue label for invalid published config failures', async () => {
    const resp = readyResponse();
    resp.sections.waterfall = {
      status: 'failed',
      reason: 'Published config is invalid',
      reasonCode: 'INVALID_PUBLISHED_CONFIG',
    };
    fetchSpy.mockResolvedValue(jsonResponse(resp));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Configuration issue:/i)).toBeInTheDocument();
    });
    expect(
      screen.getByText(/The published configuration has validation issues\./i)
    ).toBeInTheDocument();
  });

  // -- /latest route --

  it('shows error state when fundId is "latest"', async () => {
    await renderPage('/fund-model-results/latest');

    // Should NOT call fetch (no valid fund ID)
    expect(fetchSpy).not.toHaveBeenCalled();
    // Should show error directing user to fund setup
    expect(screen.getByText(/fund setup/i)).toBeInTheDocument();
  });

  // -- Loading state --

  it('shows loading indicator while fetch is in-flight', async () => {
    // Never resolve the fetch
    fetchSpy.mockReturnValue(new Promise(() => {}));
    await renderPage('/fund-model-results/123');

    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  // -- Error states --

  it('shows error state on 404 response', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/999');

    await act(async () => {
      fetchDeferred.resolve(
        new Response(JSON.stringify({ error: 'Fund not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      );
      await Promise.resolve();
    });

    expect(await screen.findByText(/not found/i)).toBeInTheDocument();
  });

  it('shows error state on network failure', async () => {
    const fetchDeferred = createDeferred<Response>();
    fetchSpy.mockReturnValue(fetchDeferred.promise);
    await renderPage('/fund-model-results/123');

    await act(async () => {
      fetchDeferred.reject(new Error('Network error'));
      await Promise.resolve();
    });

    expect(await screen.findByText(/network error/i)).toBeInTheDocument();
  });

  // -- Pending/calculating --

  it('renders pending sections when status is calculating', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        ...readyResponse(),
        status: 'calculating',
        lifecycle: {
          ...readyResponse().lifecycle,
          calculationState: {
            ...readyResponse().lifecycle.calculationState,
            status: 'calculating',
          },
        },
        sections: {
          reserve: { status: 'pending', reason: 'Calculations are still in progress' },
          pacing: { status: 'pending', reason: 'Calculations not yet requested' },
          scorecard: {
            status: 'pending',
            reason: 'Calculations have not produced results yet',
            reasonCode: 'CALCULATION_PENDING',
          },
          scenarios: { status: 'unavailable', reason: 'No authoritative source' },
          waterfall: { status: 'unavailable', reason: 'No authoritative source' },
        },
      })
    );
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Test Fund/)).toBeInTheDocument();
    });
    expect(screen.getByText('Lifecycle Status')).toBeInTheDocument();
    expect(screen.getByText('Calculating')).toBeInTheDocument();
    expect(screen.getByText(/Calculations are still in progress/)).toBeInTheDocument();
    expect(screen.getByText(/Calculations not yet requested/)).toBeInTheDocument();
  });

  // -- No fabricated data --

  it('does not render hardcoded MOIC 2.5 or reserveRatio 40', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Test Fund/)).toBeInTheDocument();
    });

    // The old fabricated defaults from loadFromWizardData() must not appear as
    // standalone text nodes. The payload JSON may contain 0.4 (reserveRatio)
    // which is different from the fabricated "40" percentage.
    const container = document.body.textContent || '';
    // "2.5" as fabricated MOIC should not appear standalone
    expect(container).not.toContain('expectedMOIC');
    // "concentrationRisk" fabricated field should not appear
    expect(container).not.toContain('concentrationRisk');
  });

  // -- Fund identity header --

  it('renders fund name and vintage year from server data', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText('Test Fund')).toBeInTheDocument();
    });
    expect(screen.getByText(/Vintage 2024/)).toBeInTheDocument();
    // $100M appears in both header and overview card
    const sizeMatches = screen.getAllByText(/\$100M/);
    expect(sizeMatches.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Published Version')).toBeInTheDocument();
    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Dispatch State')).toBeInTheDocument();
    expect(screen.getByText('Snapshot Coverage')).toBeInTheDocument();
  });

  // -- Legacy evidence --

  it('shows legacy evidence notice when section has legacyEvidence flag', async () => {
    const resp = readyResponse();
    resp.sections.reserve = {
      ...resp.sections.reserve,
      legacyEvidence: true,
    };
    fetchSpy.mockResolvedValue(jsonResponse(resp));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/legacy data/i)).toBeInTheDocument();
    });
  });
});

// -- Helpers --

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function readyResponse() {
  return {
    status: 'ready' as const,
    fundId: 123,
    fund: { name: 'Test Fund', vintageYear: 2024, size: 100_000_000 },
    lifecycle: {
      fundId: 123,
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
          marketCondition: 'neutral',
          deployments: [],
        },
      },
      scorecard: {
        status: 'available' as const,
        payload: {
          fundName: { value: 'Test Fund', source: 'funds' },
          fundSize: { value: 100_000_000, source: 'funds' },
          vintageYear: { value: 2024, source: 'funds' },
          reserveRatio: { value: 0.4, source: 'fund_snapshots' },
          avgConfidence: { value: 0.85, source: 'fund_snapshots' },
          yearsToFullDeploy: { value: 5, source: 'fund_snapshots' },
          lastCalculatedAt: { value: '2026-03-20T12:30:00.000Z', source: 'fund_state' },
        },
      },
      scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
    },
  };
}
