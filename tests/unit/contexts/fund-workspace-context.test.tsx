/**
 * FundWorkspaceContext (F_1.9.0).
 *
 * Pins the served-basis-only resolution contract: `asOfDate` and
 * `currentPlanVersionId` come from the served `currentForecastV2` block or are
 * null (never the facts date, never the current-plan head), vehicle identity is
 * the sole `main_fund` roster entry of the accepted facts snapshot, and the
 * `viewPreset` URL override plus presentation-only preset changes.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Router } from 'wouter';
import { memoryLocation } from 'wouter/memory-location';
import {
  FundWorkspaceProvider,
  useFundWorkspaceContext,
  type FundWorkspaceContextValue,
} from '@/contexts/FundWorkspaceContext';

const mocks = vi.hoisted(() => ({
  // Resolved route fund id passed as the provider's input (the provider never
  // reads the ambient FundContext fund — cross-fund leak guard).
  fundId: 42 as number | null,
  dualForecast: { data: undefined as unknown, isSuccess: false, isError: false, error: null },
}));

vi.mock('@/hooks/useDualForecast', () => ({
  useDualForecast: () => mocks.dualForecast,
}));

const SERVED_BLOCK = {
  status: 'live',
  engineStatus: 'available',
  asOfDate: '2026-02-14',
  currentPlanVersionId: 'cpv-served-1',
  financialFactsSnapshotId: '9001',
  inputHash: 'ab'.repeat(32),
  resultHash: 'cd'.repeat(32),
  assumptionsHash: 'ef'.repeat(32),
  engineVersion: 'current-forecast-v2/1.0.0',
  methodologyVersion: 'methodology/1.0.0',
  unavailableReasons: [],
  held: null,
};

function factsBody(vehicleRoster: Array<{ vehicleId: number; vehicleType: string }>) {
  return {
    asOfDate: '2026-01-31',
    snapshotInputHash: 'a1b2c3d4'.repeat(8),
    payload: {
      sourceObservationIds: [11, 'obs-12'],
      // Policy 1.1.0+ persisted snapshots carry structured term refs; the
      // ingress schema must accept them (they used to be rejected as strings).
      participationTermRefs: [
        { participationId: 5, participationVersion: 1, financingTrancheId: 9, trancheVersion: 2 },
      ],
      vehicleRoster,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let captured: FundWorkspaceContextValue | null = null;

function Probe() {
  captured = useFundWorkspaceContext();
  return (
    <div>
      <span data-testid="as-of">{String(captured.asOfDate)}</span>
      <span data-testid="plan">{String(captured.currentPlanVersionId)}</span>
      <span data-testid="vehicle">{String(captured.vehicleId)}</span>
      <span data-testid="preset">{captured.viewPreset}</span>
    </div>
  );
}

function renderProvider(path = '/fund-model-results/42') {
  const location = memoryLocation({ path, record: true });
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <Router hook={location.hook}>
        <FundWorkspaceProvider fundId={mocks.fundId}>
          <Probe />
        </FundWorkspaceProvider>
      </Router>
    </QueryClientProvider>
  );
  return { location, ...view };
}

describe('FundWorkspaceProvider', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    captured = null;
    mocks.fundId = 42;
    mocks.dualForecast = { data: undefined, isSuccess: false, isError: false, error: null };
    fetchSpy = vi.fn(async () => jsonResponse({ message: 'not found' }, 404));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves asOfDate and currentPlanVersionId from the served currentForecastV2 block only', async () => {
    mocks.dualForecast = {
      data: { currentForecastV2: SERVED_BLOCK },
      isSuccess: true,
      isError: false,
      error: null,
    };
    fetchSpy.mockResolvedValue(
      jsonResponse(factsBody([{ vehicleId: 7, vehicleType: 'main_fund' }]))
    );

    renderProvider();

    expect(screen.getByTestId('as-of')).toHaveTextContent('2026-02-14');
    expect(screen.getByTestId('plan')).toHaveTextContent('cpv-served-1');
    await waitFor(() => expect(screen.getByTestId('vehicle')).toHaveTextContent('7'));
    // Served basis, never the facts date.
    expect(screen.getByTestId('as-of')).not.toHaveTextContent('2026-01-31');
  });

  it('keeps asOfDate and currentPlanVersionId null when the block is absent, with no facts-date fallback', async () => {
    mocks.dualForecast = {
      data: { currentForecastV2: undefined },
      isSuccess: true,
      isError: false,
      error: null,
    };
    fetchSpy.mockResolvedValue(
      jsonResponse(factsBody([{ vehicleId: 7, vehicleType: 'main_fund' }]))
    );

    renderProvider();

    // Wait until the facts snapshot has definitely arrived (vehicle resolved)
    // and assert the facts asOfDate was NOT substituted for the basis date.
    await waitFor(() => expect(screen.getByTestId('vehicle')).toHaveTextContent('7'));
    expect(screen.getByTestId('as-of')).toHaveTextContent(/^null$/);
    expect(screen.getByTestId('plan')).toHaveTextContent(/^null$/);
  });

  it('nulls vehicleId when the facts read 404s, keeping served basis fields intact', async () => {
    mocks.dualForecast = {
      data: { currentForecastV2: SERVED_BLOCK },
      isSuccess: true,
      isError: false,
      error: null,
    };
    fetchSpy.mockResolvedValue(jsonResponse({ message: 'No accepted snapshot' }, 404));

    renderProvider();

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    expect(screen.getByTestId('vehicle')).toHaveTextContent(/^null$/);
    expect(screen.getByTestId('as-of')).toHaveTextContent('2026-02-14');
    expect(screen.getByTestId('plan')).toHaveTextContent('cpv-served-1');
  });

  it('resolves the vehicle only from a sole main_fund roster entry', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        factsBody([
          { vehicleId: 7, vehicleType: 'main_fund' },
          { vehicleId: 8, vehicleType: 'spv' },
          { vehicleId: 9, vehicleType: 'co_invest' },
        ])
      )
    );

    renderProvider();

    await waitFor(() => expect(screen.getByTestId('vehicle')).toHaveTextContent('7'));
  });

  it.each([
    ['zero main_fund entries', [{ vehicleId: 8, vehicleType: 'spv' }]],
    [
      'multiple main_fund entries',
      [
        { vehicleId: 7, vehicleType: 'main_fund' },
        { vehicleId: 9, vehicleType: 'main_fund' },
      ],
    ],
  ])('nulls vehicleId for %s', async (_label, roster) => {
    fetchSpy.mockResolvedValue(jsonResponse(factsBody(roster)));

    renderProvider();

    await waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByTestId('vehicle')).toHaveTextContent(/^null$/));
  });

  it('defaults viewPreset to gp and honors a valid URL override', () => {
    renderProvider('/fund-model-results/42?viewPreset=analyst');
    expect(screen.getByTestId('preset')).toHaveTextContent('analyst');
  });

  it('falls back to gp for an invalid viewPreset URL value', () => {
    renderProvider('/fund-model-results/42?viewPreset=bogus');
    expect(screen.getByTestId('preset')).toHaveTextContent('gp');
  });

  it('setViewPreset changes presentation state only, mirrored to the URL search param', async () => {
    mocks.dualForecast = {
      data: { currentForecastV2: SERVED_BLOCK },
      isSuccess: true,
      isError: false,
      error: null,
    };
    const { location } = renderProvider('/fund-model-results/42');

    act(() => captured!.setViewPreset('operations'));

    expect(screen.getByTestId('preset')).toHaveTextContent('operations');
    // Mirrored to the URL so links can carry it; same path, no navigation.
    expect(location.history.at(-1)).toContain('/fund-model-results/42');
    expect(location.history.at(-1)).toContain('viewPreset=operations');
    // Presentation-only: basis identity is untouched.
    expect(screen.getByTestId('as-of')).toHaveTextContent('2026-02-14');
    expect(screen.getByTestId('plan')).toHaveTextContent('cpv-served-1');

    act(() => captured!.setViewPreset('gp'));
    expect(screen.getByTestId('preset')).toHaveTextContent('gp');
    expect(location.history.at(-1)).not.toContain('viewPreset');
  });

  it('renders children with defaults and issues no queries when no route fund is resolved', () => {
    // Null resolved route fund (missing, invalid, or scope-rejected): the
    // provider issues no fetches and exposes only unavailable defaults.
    mocks.fundId = null;

    renderProvider();

    expect(screen.getByTestId('preset')).toHaveTextContent('gp');
    expect(screen.getByTestId('as-of')).toHaveTextContent(/^null$/);
    expect(screen.getByTestId('vehicle')).toHaveTextContent(/^null$/);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(captured!.fundId).toBe(0);
  });
});
