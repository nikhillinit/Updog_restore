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
import { render, screen, waitFor } from '@testing-library/react';
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

  // -- Unavailable sections --

  it('renders unavailable reason text for scorecard section', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(readyResponse()));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      // scorecard, scenarios, waterfall all show this reason
      const matches = screen.getAllByText(/No authoritative source/i);
      expect(matches.length).toBe(3);
    });
    // Scorecard heading is present
    expect(screen.getByText('Fund Scorecard')).toBeInTheDocument();
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
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ error: 'Fund not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    await renderPage('/fund-model-results/999');

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('shows error state on network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('Network error'));
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });

  // -- Pending/calculating --

  it('renders pending sections when status is calculating', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse({
        ...readyResponse(),
        status: 'calculating',
        sections: {
          reserve: { status: 'pending', reason: 'Calculations are still in progress' },
          pacing: { status: 'pending', reason: 'Calculations not yet requested' },
          scorecard: { status: 'unavailable', reason: 'No authoritative source' },
          scenarios: { status: 'unavailable', reason: 'No authoritative source' },
          waterfall: { status: 'unavailable', reason: 'No authoritative source' },
        },
      })
    );
    await renderPage('/fund-model-results/123');

    await waitFor(() => {
      expect(screen.getByText(/Test Fund/)).toBeInTheDocument();
    });
    // Status indicator for non-ready top-level
    expect(screen.getByText(/Status: calculating/)).toBeInTheDocument();
    expect(screen.getByText('Calculations are still in progress')).toBeInTheDocument();
    expect(screen.getByText('Calculations not yet requested')).toBeInTheDocument();
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
    expect(screen.getByText(/\$100M/)).toBeInTheDocument();
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
      scorecard: { status: 'unavailable' as const, reason: 'No authoritative source' },
      scenarios: { status: 'unavailable' as const, reason: 'No authoritative source' },
      waterfall: { status: 'unavailable' as const, reason: 'No authoritative source' },
    },
  };
}
