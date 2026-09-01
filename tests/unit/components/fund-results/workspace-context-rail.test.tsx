/**
 * WorkspaceContextRail + view model (F_1.9.0).
 *
 * Pins the view-model mapping from `DualForecastCurrentForecastV2` fixtures:
 * basis-identity short-hashes come from the served block's own hashes, the
 * facts `snapshotInputHash` renders ONLY under the freshness label, an absent
 * or unavailable block renders disabled-with-reason, and a present `held`
 * block is a SERVED golden state (pinned identity + held disclosure), never
 * basis-unavailable. Bridge and evidence rows stay disabled-with-reason;
 * recompute is role-gated and reports awaited command outcomes; focus
 * treatment uses the solid charcoal accent.
 */

import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWouterWrapper } from '../../../utils/withWouter';
import type { CurrentPlanVersionV1 } from '@shared/contracts/current-plan-version-v1.contract';
import type { DualForecastCurrentForecastV2 } from '@shared/contracts/dual-forecast/dual-forecast-response.contract';
import { presson } from '@/theme/presson.tokens';
import { WorkspaceContextRail } from '@/components/fund-results/WorkspaceContextRail';
import { buildWorkspaceContextRailViewModel } from '@/components/fund-results/workspace-context-rail-view-model';
import type { FinancialFactsLatestRead } from '@/contexts/FundWorkspaceContext';

const FACTS_INPUT_HASH = 'a1b2c3d4'.repeat(8);

const LIVE_BLOCK: DualForecastCurrentForecastV2 = {
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

const HELD_BLOCK: DualForecastCurrentForecastV2 = {
  ...LIVE_BLOCK,
  status: 'held',
  engineStatus: 'held',
  held: {
    referenceId: 77,
    reason: 'kill_switch',
    pinnedAt: '2026-02-11T00:00:00.000Z',
    ageDays: 3,
  },
};

const UNAVAILABLE_BLOCK: DualForecastCurrentForecastV2 = {
  ...LIVE_BLOCK,
  status: 'live',
  engineStatus: 'unavailable',
  unavailableReasons: [
    { code: 'NO_ACCEPTED_FACTS', detail: 'No accepted facts snapshot exists for this fund.' },
  ],
};

const FACTS_LATEST: FinancialFactsLatestRead = {
  asOfDate: '2026-01-31',
  snapshotInputHash: FACTS_INPUT_HASH,
  payload: {
    sourceObservationIds: [11, 'obs-12'],
    participationTermRefs: ['term-1', 'term-2', 'term-3'],
    vehicleRoster: [{ vehicleId: 7, vehicleType: 'main_fund' }],
  },
};

// The view model reads only `id` and `version` for the plan label; a minimal
// cast keeps this suite free of the full plan-version fixture.
const PLAN_VERSIONS = [
  { id: 'cpv-served-1', version: 3, supersededByVersionId: null },
] as unknown as readonly CurrentPlanVersionV1[];

const CONTEXT = {
  fundId: 42,
  vehicleId: '7',
  asOfDate: '2026-02-14',
  currentPlanVersionId: 'cpv-served-1',
  viewPreset: 'gp',
} as const;

describe('buildWorkspaceContextRailViewModel', () => {
  it('maps a live block to basis identity short-hashes from the served hashes', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      fundName: 'Fund Forty Two',
      currentForecastV2: LIVE_BLOCK,
      factsLatest: FACTS_LATEST,
      planVersions: PLAN_VERSIONS,
    });

    expect(model.basis.state).toBe('live');
    expect(model.basis.label).toBe('Live');
    expect(model.basis.asOfDate).toBe('2026-02-14');
    expect(model.basis.asOfLabel).toBe('As of Feb 14, 2026');
    expect(model.basis.currentPlanVersionId).toBe('cpv-served-1');
    expect(model.basis.planLabel).toBe('Plan v3');
    expect(model.basis.servedHashes).toEqual([
      { key: 'input', label: 'Input hash', fullHash: 'ab'.repeat(32), shortHash: 'abababab' },
      { key: 'result', label: 'Result hash', fullHash: 'cd'.repeat(32), shortHash: 'cdcdcdcd' },
      {
        key: 'assumptions',
        label: 'Assumptions hash',
        fullHash: 'ef'.repeat(32),
        shortHash: 'efefefef',
      },
    ]);
    expect(model.basis.unavailableReasons).toEqual([]);
    expect(model.basis.heldDisclosure).toBeNull();
  });

  it('renders a null resultHash as a null short-hash instead of fabricating identity', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: { ...LIVE_BLOCK, resultHash: null },
    });

    const result = model.basis.servedHashes.find((hash) => hash.key === 'result');
    expect(result).toEqual({
      key: 'result',
      label: 'Result hash',
      fullHash: null,
      shortHash: null,
    });
  });

  it('exposes the facts snapshotInputHash only under the freshness label, never as basis identity', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: LIVE_BLOCK,
      factsLatest: FACTS_LATEST,
      planVersions: PLAN_VERSIONS,
    });

    expect(model.factsFreshness).toEqual({
      asOfDate: '2026-01-31',
      label: `Facts as of 2026-01-31 · input a1b2c3d4`,
      inputHash: FACTS_INPUT_HASH,
      shortHash: 'a1b2c3d4',
    });
    // The facts hash never appears among the served basis identity hashes.
    expect(
      model.basis.servedHashes.some(
        (hash) => hash.fullHash === FACTS_INPUT_HASH || hash.shortHash === 'a1b2c3d4'
      )
    ).toBe(false);
  });

  it('treats a present held block as a served golden state with pinned identity and disclosure', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: HELD_BLOCK,
      factsLatest: FACTS_LATEST,
      planVersions: PLAN_VERSIONS,
    });

    expect(model.basis.state).toBe('held');
    expect(model.basis.label).toBe('Held reference');
    // Pinned basis identity is rendered, never basis-unavailable.
    expect(model.basis.asOfDate).toBe('2026-02-14');
    expect(model.basis.currentPlanVersionId).toBe('cpv-served-1');
    expect(model.basis.servedHashes.map((hash) => hash.shortHash)).toEqual([
      'abababab',
      'cdcdcdcd',
      'efefefef',
    ]);
    expect(model.basis.unavailableReasons).toEqual([]);
    expect(model.basis.heldDisclosure).toMatchObject({
      headline: 'Current forecast is held',
      reason: 'The calculation kill switch is active.',
      age: 'Pinned 3 days ago',
    });
  });

  it('maps an absent block to disabled-with-reason basis unavailability', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: { ...CONTEXT, asOfDate: null, currentPlanVersionId: null },
    });

    expect(model.basis.state).toBe('unavailable');
    expect(model.basis.asOfDate).toBeNull();
    expect(model.basis.currentPlanVersionId).toBeNull();
    expect(model.basis.servedHashes).toEqual([]);
    expect(model.basis.unavailableReasons).toEqual(['No served current forecast was returned.']);
    expect(model.basis.heldDisclosure).toBeNull();
    expect(model.factsFreshness).toBeNull();
  });

  it('maps an unavailable engineStatus to the contract unavailableReasons', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: UNAVAILABLE_BLOCK,
    });

    expect(model.basis.state).toBe('unavailable');
    expect(model.basis.unavailableReasons).toEqual([
      'No accepted facts snapshot exists for this fund.',
    ]);
    expect(model.basis.servedHashes).toEqual([]);
  });

  it('always ships the bridge and recompute panels disabled with their reasons', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: LIVE_BLOCK,
    });

    expect(model.bridge.disabledReason).toBe(
      'Bridge amounts not yet exposed by an authorized read contract'
    );
    expect(model.recompute.disabledReason).toBe('Recompute requires an idempotency-keyed command');
  });

  it('ships every evidence kind disabled with a reason and no destination', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: LIVE_BLOCK,
      factsLatest: FACTS_LATEST,
    });

    expect(model.evidence.map((item) => item.kind)).toEqual([
      'snapshot',
      'observation',
      'reconciliation',
      'resolved-term',
    ]);
    for (const item of model.evidence) {
      expect(item.href).toBeNull();
      expect(item.disabledReason.length).toBeGreaterThan(0);
    }
  });

  it('never renders uncorrelated latest-facts counts in basis evidence rows (deviation 5)', () => {
    // The facts-latest read has no correlation to the served (possibly
    // held/pinned) basis: observation and resolved-term rows stay
    // unavailable-with-reason; latest-facts data appears ONLY under the
    // freshness label.
    const model = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      currentForecastV2: LIVE_BLOCK,
      factsLatest: FACTS_LATEST,
    });

    expect(model.evidence[1]!.detail).toBe(
      'Basis-matched observations are not identifiable from this read'
    );
    expect(model.evidence[3]!.detail).toBe(
      'Basis-matched resolved terms are not identifiable from this read'
    );
    for (const item of model.evidence) {
      expect(item.detail).not.toMatch(/\d+ (source observation|participation-term)/);
    }
    // Latest-facts data still surfaces under the freshness label.
    expect(model.factsFreshness?.label).toContain('a1b2c3d4');
  });

  it('models pending, error, and genuine absence as distinct basis states', () => {
    const pending = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      forecastStatus: 'pending',
      factsStatus: 'pending',
    });
    expect(pending.basis.state).toBe('pending');
    expect(pending.basis.unavailableReasons).toEqual([]);
    expect(pending.factsState).toBe('pending');
    // Identity slots render non-authoritative pending wording, never the
    // domain-unavailable claims.
    expect(pending.vehicle.label).toBe('Loading');
    expect(pending.vehicle.disabledReason).toBeNull();
    expect(pending.context.asOfLabel).toBe('Loading');
    expect(pending.context.planLabel).toBe('Loading');

    const errored = buildWorkspaceContextRailViewModel({
      context: CONTEXT,
      forecastStatus: 'error',
      forecastErrorDetail: 'HTTP 500: Failed to fetch dual forecast',
      factsStatus: 'error',
    });
    expect(errored.basis.state).toBe('error');
    expect(errored.basis.errorDetail).toBe('HTTP 500: Failed to fetch dual forecast');
    expect(errored.basis.unavailableReasons).toEqual([]);
    expect(errored.factsState).toBe('error');
    // Identity slots render error wording, never the domain-unavailable claims.
    expect(errored.vehicle.label).toBe('Not loaded');
    expect(errored.vehicle.disabledReason).toBe('Accepted facts could not be loaded.');
    expect(errored.context.asOfLabel).toBe('Not loaded');
    expect(errored.context.planLabel).toBe('Not loaded');

    // Only a settled read with no block is genuine domain absence — the
    // unavailable identity wording appears only here.
    const absent = buildWorkspaceContextRailViewModel({
      context: { ...CONTEXT, vehicleId: null, asOfDate: null, currentPlanVersionId: null },
    });
    expect(absent.basis.state).toBe('unavailable');
    expect(absent.basis.unavailableReasons).toEqual(['No served current forecast was returned.']);
    expect(absent.factsState).toBe('absent');
    expect(absent.vehicle.label).toBe('Vehicle unavailable');
    expect(absent.vehicle.disabledReason).toBe(
      'A single main fund vehicle is required; accepted facts did not provide one.'
    );
    expect(absent.context.asOfLabel).toBe('Basis unavailable');
    expect(absent.context.planLabel).toBe('Basis unavailable');
  });

  it('orders rail sections per preset without touching queries or actions', () => {
    const gp = buildWorkspaceContextRailViewModel({ context: CONTEXT });
    const analyst = buildWorkspaceContextRailViewModel({
      context: { ...CONTEXT, viewPreset: 'analyst' },
    });
    const operations = buildWorkspaceContextRailViewModel({
      context: { ...CONTEXT, viewPreset: 'operations' },
    });

    expect(gp.sectionOrder[0]).toBe('identity');
    expect(analyst.sectionOrder[0]).toBe('basis');
    expect(operations.sectionOrder[0]).toBe('recompute');
    // Same section set in every preset — emphasis/ordering only.
    for (const model of [gp, analyst, operations]) {
      expect([...model.sectionOrder].sort()).toEqual([
        'basis',
        'bridge',
        'evidence',
        'freshness',
        'identity',
        'recompute',
      ]);
    }
  });

  it('nulls the vehicle with a reason when the context could not resolve one', () => {
    const model = buildWorkspaceContextRailViewModel({
      context: { ...CONTEXT, vehicleId: null },
    });

    expect(model.vehicle.id).toBeNull();
    expect(model.vehicle.disabledReason).toBe(
      'A single main fund vehicle is required; accepted facts did not provide one.'
    );
  });
});

const mocks = vi.hoisted(() => ({
  workspaceContext: {
    fundId: 42,
    vehicleId: '7' as string | null,
    asOfDate: '2026-02-14' as string | null,
    currentPlanVersionId: 'cpv-served-1' as string | null,
    viewPreset: 'gp' as 'gp' | 'analyst' | 'operations',
    setViewPreset: vi.fn(),
  },
  fundContext: {
    fundId: 42 as number | null,
    currentFund: { id: 42, name: 'Fund Forty Two' } as { id: number; name: string } | null,
    isLoading: false,
  },
  dualForecast: {
    data: undefined as unknown,
    isSuccess: false,
    isError: false,
    error: null as Error | null,
    refetch: vi.fn(),
  },
  authSession: {
    data: {
      user: { id: '9', email: 'analyst@example.com', role: 'analyst', fundIds: [42] },
    } as { user: { id: string; email: string; role: string; fundIds: number[] } } | null,
    isPending: false,
  },
  planVersions: [] as unknown[],
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => mocks.fundContext,
}));

vi.mock('@/hooks/useFundWorkspaceContext', () => ({
  useFundWorkspaceContext: () => mocks.workspaceContext,
}));

vi.mock('@/hooks/useDualForecast', () => ({
  useDualForecast: () => mocks.dualForecast,
}));

vi.mock('@/hooks/useCurrentPlanVersions', () => ({
  useCurrentPlanVersions: () => ({
    versions: mocks.planVersions,
    headVersion: null,
    isLoading: false,
    error: null,
    mint: {},
  }),
}));

// Internal-analysis page dependencies for the mount-presence assertion (that
// page has no dedicated suite; the plan routes its presence pin here).
vi.mock('@/hooks/useInternalAnalysis', () => ({
  useInternalAnalysis: () => ({ drafts: [], references: [], isLoading: false, error: null }),
}));
vi.mock('@/lib/auth-session', () => ({
  useAuthSession: () => mocks.authSession,
}));
vi.mock('@/components/fund-results/InternalNarrativePanel', () => ({
  InternalNarrativePanel: () => <div data-testid="internal-narrative-stub" />,
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderRail() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceContextRail />
    </QueryClientProvider>
  );
}

describe('WorkspaceContextRail', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mocks.workspaceContext.fundId = 42;
    mocks.workspaceContext.vehicleId = '7';
    mocks.workspaceContext.asOfDate = '2026-02-14';
    mocks.workspaceContext.currentPlanVersionId = 'cpv-served-1';
    mocks.workspaceContext.viewPreset = 'gp';
    mocks.workspaceContext.setViewPreset = vi.fn();
    mocks.fundContext = {
      fundId: 42,
      currentFund: { id: 42, name: 'Fund Forty Two' },
      isLoading: false,
    };
    mocks.dualForecast = {
      data: { currentForecastV2: LIVE_BLOCK },
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn().mockResolvedValue({ data: { currentForecastV2: LIVE_BLOCK } }),
    };
    mocks.authSession = {
      data: {
        user: { id: '9', email: 'analyst@example.com', role: 'analyst', fundIds: [42] },
      },
      isPending: false,
    };
    mocks.planVersions = [...PLAN_VERSIONS];
    fetchSpy = vi.fn(async () => jsonResponse(FACTS_LATEST));
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders the served basis identity and facts freshness on the golden live path', async () => {
    renderRail();

    expect(screen.getByTestId('workspace-context-rail')).toBeInTheDocument();
    const basis = screen.getByTestId('workspace-context-basis');
    expect(within(basis).getByText('Live')).toBeInTheDocument();
    expect(within(basis).getByText('abababab')).toBeInTheDocument();
    expect(within(basis).getByText('cdcdcdcd')).toBeInTheDocument();
    expect(within(basis).getByText('efefefef')).toBeInTheDocument();
    expect(within(basis).getByText('As of Feb 14, 2026')).toBeInTheDocument();
    expect(within(basis).getByText('Plan v3')).toBeInTheDocument();
    expect(within(basis).queryByText(/basis unavailable/i)).not.toBeInTheDocument();

    // Facts hash renders only under the freshness label, never in the basis block.
    await waitFor(() =>
      expect(screen.getByText('Facts as of 2026-01-31 · input a1b2c3d4')).toBeInTheDocument()
    );
    expect(within(basis).queryByText(/a1b2c3d4/)).not.toBeInTheDocument();
  });

  it('renders a present held block as the golden held state, never basis-unavailable', () => {
    mocks.dualForecast = {
      data: { currentForecastV2: HELD_BLOCK },
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    renderRail();

    const basis = screen.getByTestId('workspace-context-basis');
    expect(within(basis).getByText('Held reference')).toBeInTheDocument();
    // Pinned basis identity renders.
    expect(within(basis).getByText('abababab')).toBeInTheDocument();
    expect(within(basis).getByText('As of Feb 14, 2026')).toBeInTheDocument();
    // Held disclosure renders as a served state.
    expect(within(basis).getByText('Current forecast is held')).toBeInTheDocument();
    expect(within(basis).getByText('The calculation kill switch is active.')).toBeInTheDocument();
    expect(within(basis).getByText('Pinned 3 days ago')).toBeInTheDocument();
    // Never the unavailable treatment.
    expect(within(basis).queryByText(/basis unavailable/i)).not.toBeInTheDocument();
  });

  it('renders the unavailable path with reasons when no block is served and facts 404', async () => {
    mocks.workspaceContext.vehicleId = null;
    mocks.workspaceContext.asOfDate = null;
    mocks.workspaceContext.currentPlanVersionId = null;
    mocks.dualForecast = {
      data: {},
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    fetchSpy.mockResolvedValue(jsonResponse({ message: 'No accepted snapshot' }, 404));

    renderRail();

    const basis = screen.getByTestId('workspace-context-basis');
    expect(within(basis).getByText('No served current forecast was returned.')).toBeInTheDocument();
    expect(within(basis).getAllByText('Basis unavailable').length).toBeGreaterThan(0);
    // The vehicle-unavailable claim renders only after the facts read settles
    // (the 404 proves genuine absence).
    await waitFor(() =>
      expect(screen.getByText('Accepted facts unavailable.')).toBeInTheDocument()
    );
    expect(
      screen.getByText(
        'A single main fund vehicle is required; accepted facts did not provide one.'
      )
    ).toBeInTheDocument();
  });

  it('disables the bridge panel with its reason', () => {
    renderRail();

    const bridge = screen.getByTestId('workspace-context-bridge');
    expect(bridge).toHaveAttribute('aria-disabled', 'true');
    const reasonId = bridge.getAttribute('aria-describedby')!;
    expect(document.getElementById(reasonId)).toHaveTextContent(
      'Bridge amounts not yet exposed by an authorized read contract.'
    );
  });

  it('keeps recompute visible but disabled with a reason for read-only roles', () => {
    mocks.authSession.data = {
      user: { id: '10', email: 'service@example.com', role: 'service', fundIds: [42] },
    };
    renderRail();

    const recompute = screen.getByTestId('workspace-context-recompute');
    const button = within(recompute).getByRole('button', {
      name: 'Recompute from latest accepted facts',
    });
    expect(button).toBeDisabled();
    const reasonId = button.getAttribute('aria-describedby')!;
    expect(document.getElementById(reasonId)).toHaveTextContent(
      'Your current role has read-only access to recompute.'
    );

    const callsBefore = fetchSpy.mock.calls.length;
    fireEvent.click(button);
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });

  it.each(['operator', 'viewer'])(
    'normalizes legacy %s role before recompute authorization',
    (role) => {
      mocks.authSession.data = {
        user: { id: '10', email: `${role}@example.com`, role, fundIds: [42] },
      };
      renderRail();

      expect(
        within(screen.getByTestId('workspace-context-recompute')).getByRole('button', {
          name: 'Recompute from latest accepted facts',
        })
      ).toBeEnabled();
    }
  );

  it('posts a fresh idempotency key per click and refreshes rail reads after completion', async () => {
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).endsWith('/current-forecast/recompute')) {
        return jsonResponse({ status: 'completed', shadowReconciliationId: 501, replayed: false });
      }
      return jsonResponse(FACTS_LATEST);
    });
    renderRail();

    const button = within(screen.getByTestId('workspace-context-recompute')).getByRole('button', {
      name: 'Recompute from latest accepted facts',
    });
    expect(button).toBeEnabled();

    fireEvent.click(button);
    expect(button).toBeDisabled();
    await screen.findByText('Recompute completed. Reconciliation 501.');
    await waitFor(() => expect(mocks.dualForecast.refetch).toHaveBeenCalledTimes(1));

    fireEvent.click(button);
    await waitFor(() => expect(mocks.dualForecast.refetch).toHaveBeenCalledTimes(2));

    const commandCalls = fetchSpy.mock.calls.filter(([input]) =>
      String(input).endsWith('/current-forecast/recompute')
    );
    expect(commandCalls).toHaveLength(2);
    const keys = commandCalls.map(([, init]) =>
      new Headers((init as RequestInit).headers).get('Idempotency-Key')
    );
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(keys[1]).toMatch(/^[0-9a-f-]{36}$/i);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it.each([
    [
      { status: 'failed', failureCode: 'execution_timeout', replayed: false },
      'Recompute timed out before completion.',
    ],
    [
      { status: 'failed', failureCode: 'stale_pending', replayed: true },
      'A stale recompute claim was closed. Try again.',
    ],
    [
      { status: 'skipped', replayed: false },
      'Recompute skipped because the current forecast mode is not eligible.',
    ],
  ])('renders awaited typed recompute outcome %#', async (outcome, expectedMessage) => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('/current-forecast/recompute')
        ? jsonResponse(outcome)
        : jsonResponse(FACTS_LATEST)
    );
    renderRail();

    fireEvent.click(
      within(screen.getByTestId('workspace-context-recompute')).getByRole('button', {
        name: 'Recompute from latest accepted facts',
      })
    );

    expect(await screen.findByText(expectedMessage)).toBeInTheDocument();
  });

  it('renders an in-flight conflict as a readable result', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('/current-forecast/recompute')
        ? jsonResponse(
            { error: 'RECOMPUTE_IN_FLIGHT', message: 'Current-forecast recompute already running' },
            409
          )
        : jsonResponse(FACTS_LATEST)
    );
    renderRail();

    fireEvent.click(
      within(screen.getByTestId('workspace-context-recompute')).getByRole('button', {
        name: 'Recompute from latest accepted facts',
      })
    );

    expect(await screen.findByText('A recompute is already running.')).toBeInTheDocument();
  });

  it('falls back to a visible disabled state when the server returns 403', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('/current-forecast/recompute')
        ? jsonResponse({ error: 'FORBIDDEN', message: 'Forbidden' }, 403)
        : jsonResponse(FACTS_LATEST)
    );
    renderRail();

    const recompute = screen.getByTestId('workspace-context-recompute');
    fireEvent.click(
      within(recompute).getByRole('button', { name: 'Recompute from latest accepted facts' })
    );

    expect(
      await within(recompute).findByText('Server denied write access for this fund.')
    ).toBeInTheDocument();
    expect(
      within(recompute).getByRole('button', { name: 'Recompute from latest accepted facts' })
    ).toBeDisabled();
  });

  it('renders every evidence row disabled with an aria-described reason', () => {
    renderRail();

    for (const kind of ['snapshot', 'observation', 'reconciliation', 'resolved-term'] as const) {
      const row = screen.getByTestId(`workspace-context-evidence-${kind}`);
      expect(row).toBeDisabled();
      const reasonId = row.getAttribute('aria-describedby')!;
      const reason = document.getElementById(reasonId);
      expect(reason?.textContent?.length ?? 0).toBeGreaterThan(1);
    }
  });

  it('applies the solid charcoal focus treatment to interactive controls', () => {
    renderRail();

    // The presson accent is the charcoal primary; the focus ring uses it solid.
    expect(presson.color.accent).toBe('#292929');
    const preset = screen.getByRole('radio', { name: 'Analyst' });
    expect(preset.className).toContain('focus-visible:ring-presson-accent');
    expect(preset.className).not.toContain('ring-presson-accent/');
    const recomputeButton = within(screen.getByTestId('workspace-context-recompute')).getByRole(
      'button'
    );
    expect(recomputeButton.className).toContain('focus-visible:ring-presson-accent');
  });

  it('treats preset changes as presentation-only state changes', () => {
    renderRail();

    const callsBefore = fetchSpy.mock.calls.length;
    fireEvent.click(screen.getByRole('radio', { name: 'Analyst' }));
    expect(mocks.workspaceContext.setViewPreset).toHaveBeenCalledWith('analyst');
    expect(fetchSpy.mock.calls.length).toBe(callsBefore);
  });

  it('renders loading as a non-authoritative pending state, never domain unavailability', () => {
    mocks.dualForecast = {
      data: undefined,
      isSuccess: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
    // Keep the facts read in flight for the duration of the assertion.
    fetchSpy.mockImplementation(() => new Promise(() => undefined));

    renderRail();

    expect(screen.getByTestId('workspace-context-basis-pending')).toHaveTextContent(
      'Loading served basis'
    );
    expect(screen.getByTestId('workspace-context-facts-pending')).toHaveTextContent(
      'Loading accepted facts'
    );
    // Identity slots (vehicle, as-of, plan) also render pending, never the
    // domain-unavailable claims.
    const identity = within(screen.getByTestId('workspace-context-identity'));
    expect(identity.getAllByText('Loading').length).toBe(3);
    expect(identity.queryByText('Vehicle unavailable')).not.toBeInTheDocument();
    expect(identity.queryByText('Basis unavailable')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'A single main fund vehicle is required; accepted facts did not provide one.'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No served current forecast was returned.')).not.toBeInTheDocument();
    expect(screen.queryByText('Accepted facts unavailable.')).not.toBeInTheDocument();
  });

  it('renders transport errors as an error presentation, never domain unavailability', async () => {
    mocks.dualForecast = {
      data: undefined,
      isSuccess: false,
      isError: true,
      error: new Error('HTTP 500: Failed to fetch dual forecast'),
      refetch: vi.fn(),
    };
    fetchSpy.mockResolvedValue(jsonResponse({ message: 'boom' }, 500));

    renderRail();

    expect(screen.getByTestId('workspace-context-basis-error')).toHaveTextContent(
      'HTTP 500: Failed to fetch dual forecast'
    );
    await waitFor(() =>
      expect(screen.getByTestId('workspace-context-facts-error')).toHaveTextContent(
        'Accepted facts could not be loaded.'
      )
    );
    // Identity slots (vehicle, as-of, plan) also render the error wording,
    // never the domain-unavailable claims.
    const identity = within(screen.getByTestId('workspace-context-identity'));
    expect(identity.getAllByText('Not loaded').length).toBe(3);
    expect(identity.getByText('Accepted facts could not be loaded.')).toBeInTheDocument();
    expect(identity.queryByText('Vehicle unavailable')).not.toBeInTheDocument();
    expect(identity.queryByText('Basis unavailable')).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        'A single main fund vehicle is required; accepted facts did not provide one.'
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText('No served current forecast was returned.')).not.toBeInTheDocument();
    expect(screen.queryByText('Accepted facts unavailable.')).not.toBeInTheDocument();
  });

  it('reorders section emphasis per preset as a rendered, presentation-only difference', () => {
    const { unmount } = renderRail();

    const gpIdentity = screen.getByTestId('workspace-context-identity');
    const gpEvidence = screen.getByTestId('workspace-context-evidence');
    // gp: identity leads.
    expect(
      gpIdentity.compareDocumentPosition(gpEvidence) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    unmount();

    mocks.workspaceContext.viewPreset = 'analyst';
    renderRail();

    const analystIdentity = screen.getByTestId('workspace-context-identity');
    const analystBasis = screen.getByTestId('workspace-context-basis');
    const analystEvidence = screen.getByTestId('workspace-context-evidence');
    // analyst: basis and evidence lead identity — a rendered difference.
    expect(
      analystBasis.compareDocumentPosition(analystIdentity) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      analystEvidence.compareDocumentPosition(analystIdentity) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    // Presentation-only: both presets issued the SAME read (facts-latest);
    // no preset-specific query exists.
    const requestedUrls = new Set(fetchSpy.mock.calls.map((call) => String(call[0])));
    expect(requestedUrls.size).toBe(1);
  });

  it('never displays a mismatched ambient FundContext fund identity', () => {
    // Route resolved to no fund (provider input null -> context fundId 0)
    // while the ambient workspace still holds another fund.
    mocks.workspaceContext.fundId = 0;
    mocks.workspaceContext.vehicleId = null;
    mocks.workspaceContext.asOfDate = null;
    mocks.workspaceContext.currentPlanVersionId = null;
    mocks.fundContext = {
      fundId: 7,
      currentFund: { id: 7, name: 'Other Fund' },
      isLoading: false,
    };
    mocks.dualForecast = {
      data: undefined,
      isSuccess: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };

    renderRail();

    expect(screen.queryByText(/Other Fund/)).not.toBeInTheDocument();
    expect(screen.getAllByText('No fund selected').length).toBeGreaterThan(0);
    // No fetches for an unresolved fund.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('reserves rail width in a two-column grid instead of overlaying content at xl', () => {
    render(
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <WorkspaceContextRail>
          <div data-testid="page-content">page content</div>
        </WorkspaceContextRail>
      </QueryClientProvider>
    );

    const rail = screen.getByTestId('workspace-context-rail');
    // dashboard-modern two-column reserved-width precedent: content reflows
    // in the first grid column; the rail is never position-fixed at xl.
    expect(rail.parentElement?.className).toContain('xl:grid-cols-[minmax(0,1fr)_320px]');
    expect(rail.className).not.toContain('fixed');
    const content = screen.getByTestId('page-content');
    expect(content.parentElement?.className).toContain('min-w-0');
    expect(rail.parentElement).toBe(content.parentElement?.parentElement);
  });

  it('keeps the compact trigger in page flow instead of fixing it over the viewport', () => {
    renderRail();

    const trigger = screen.getByTestId('workspace-context-trigger-compact');
    expect(trigger.parentElement?.className).toContain('lg:hidden');
    expect(trigger.parentElement?.className).toContain('justify-end');
    expect(trigger.parentElement?.className).not.toContain('fixed');
  });

  it('mounts on the internal-analysis page (presence pin for the suite-less page)', async () => {
    const { default: InternalAnalysisPage } =
      await import('@/pages/fund-model-results-internal-analysis');
    const { Wrapper } = createWouterWrapper('/fund-model-results/42/internal-analysis');
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    render(
      <QueryClientProvider client={queryClient}>
        <Wrapper>
          <InternalAnalysisPage />
        </Wrapper>
      </QueryClientProvider>
    );

    expect(screen.getByTestId('workspace-context-rail')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Fund workspace' })).toBeInTheDocument();
  });
});
