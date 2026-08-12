import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { Route, Switch } from 'wouter';
import { APP_ROUTE_DEFINITIONS } from '@shared/routes/app-route-definitions';
import PortfolioPage from '@/pages/portfolio';
import { TestQueryClientProvider } from '../../utils/test-query-client';
import type {
  AllocationScenarioDetail,
  AllocationScenarioListResponse,
  AllocationsResponse,
} from '@/components/portfolio/tabs/types';

const routeMocks = vi.hoisted(() => ({
  latestAllocations: vi.fn(),
  scenarioList: vi.fn(),
  scenarioDetail: vi.fn(),
  toast: vi.fn(),
  liveAllocationMutate: vi.fn(),
  mutationAsync: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  FundProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useFundContext: () => ({
    currentFund: { id: 42, name: 'Route Test Fund' },
    fundId: 42,
    needsSetup: false,
    isLoading: false,
    fundLoadError: false,
    fundLoadErrorMessage: null,
  }),
}));

vi.mock('@/components/portfolio/tabs/OverviewTab', () => ({
  OverviewTab: () => <div>Companies workspace</div>,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: routeMocks.toast }),
}));

vi.mock('@/shared/useFlags', () => ({
  useFlag: () => false,
}));

vi.mock('@/core/flags/flagAdapter', () => ({
  useFeatureFlag: () => false,
}));

vi.mock('@/components/portfolio/tabs/hooks/useLatestAllocations', () => ({
  useLatestAllocations: () => routeMocks.latestAllocations(),
}));

vi.mock('@/components/portfolio/tabs/hooks/useAllocationScenarios', () => ({
  useAllocationScenarioList: () => routeMocks.scenarioList(),
  useAllocationScenarioDetail: (scenarioId: string | null) =>
    routeMocks.scenarioDetail(scenarioId),
  useAllocationScenarioDecisions: () => ({ data: { decisions: [] }, isLoading: false, error: null }),
  useCreateAllocationScenario: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
  useCreateReserveIcDecision: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
  useUpdateAllocationScenario: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
  useUpdateReserveIcDecision: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
  useAllocationScenarioApplyPreview: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
  useSyncAllocationScenario: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
  useApplyAllocationScenario: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
}));

vi.mock('@/components/portfolio/tabs/hooks/useReserveIcPacketEvidence', () => ({
  useReserveIcPacketEvidence: () => ({
    publishedResultsQuery: { data: null, isLoading: false, error: null },
    comparisonQuery: { data: null, isLoading: false, error: null },
  }),
}));

vi.mock('@/components/portfolio/tabs/hooks/usePlanningFmvOverrides', () => ({
  useLatestPlanningFmvOverrides: () => ({ data: { marks: [] }, error: null }),
  useCreatePlanningFmvOverride: () => ({
    mutateAsync: routeMocks.mutationAsync,
    isPending: false,
  }),
}));

vi.mock('@/components/portfolio/tabs/hooks/useUpdateAllocations', () => ({
  useUpdateAllocations: () => ({
    mutate: routeMocks.liveAllocationMutate,
    isPending: false,
  }),
}));

const allocations: AllocationsResponse = {
  companies: [
    {
      company_id: 7,
      company_name: 'Northstar Systems',
      sector: 'Enterprise',
      stage: 'Series A',
      status: 'active',
      invested_amount_cents: 100_000_000,
      deployed_reserves_cents: 25_000_000,
      planned_reserves_cents: 150_000_000,
      allocation_cap_cents: 300_000_000,
      allocation_reason: 'Protect ownership through next round',
      allocation_version: 3,
      last_allocation_at: '2026-08-01T00:00:00.000Z',
      actuals_drift: {
        contractVersion: 'allocation-actuals-drift-v1',
        companyId: 7,
        asOfDate: '2026-08-01',
        allocationVersion: 3,
        lastAllocationAt: '2026-08-01T00:00:00.000Z',
        factsInputHash: 'a'.repeat(64),
        trustState: 'LIVE',
        planningFmvStatus: 'active',
        currencyStatus: 'base_currency',
        activeRoundIds: [70],
        supersedeLineage: [],
        comparisons: [
          {
            basis: 'deployed_reserves_vs_observed_follow_on',
            state: 'exact',
            planCents: '25000000',
            actualCents: '25000000',
            deltaCents: '0',
            relativeDelta: '0',
            material: false,
            subCentRemainder: null,
            unavailableReason: null,
          },
          {
            basis: 'legacy_invested_vs_observed_total',
            state: 'exact',
            planCents: '100000000',
            actualCents: '100000000',
            deltaCents: '0',
            relativeDelta: '0',
            material: false,
            subCentRemainder: null,
            unavailableReason: null,
          },
        ],
        warnings: [],
      },
    },
  ],
  metadata: {
    total_planned_cents: 150_000_000,
    total_deployed_cents: 25_000_000,
    companies_count: 1,
    last_updated_at: '2026-08-01T00:00:00.000Z',
    actuals_drift_summary: {
      facts_status: 'available',
      drifted_company_count: 0,
      material_company_count: 0,
      degraded_company_count: 0,
      facts_input_hash: 'a'.repeat(64),
      as_of_date: '2026-08-01',
    },
  },
};

const scenarioDetail: AllocationScenarioDetail = {
  id: '00000000-0000-0000-0000-000000000007',
  fund_id: 42,
  name: 'Downside reserve plan',
  notes: 'Preserve runway under slower exits.',
  source_allocation_version: 3,
  company_count: 1,
  total_planned_cents: 150_000_000,
  last_applied_at: null,
  last_applied_by: null,
  last_applied_allocation_version: null,
  last_synced_at: null,
  last_synced_by: null,
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
  snapshot_items: [
    {
      company_id: 7,
      planned_reserves_cents: 150_000_000,
      allocation_cap_cents: 300_000_000,
      allocation_reason: 'Protect ownership through next round',
    },
  ],
  context: {
    scenario_notes: 'Preserve runway under slower exits.',
    last_sync: null,
    last_apply: null,
  },
};

const scenarioList: AllocationScenarioListResponse = {
  scenarios: [scenarioDetail],
};

function renderPortfolioRoute(path = '/portfolio') {
  const portfolioRoute = APP_ROUTE_DEFINITIONS.find((route) => route.path === '/portfolio');
  if (!portfolioRoute) {
    throw new Error('Mounted /portfolio route is missing');
  }

  window.history.pushState({}, '', path);
  return render(
    <TestQueryClientProvider>
      <Switch>
        <Route path={portfolioRoute.path} component={PortfolioPage} />
        <Route>{() => <div>Route not found</div>}</Route>
      </Switch>
    </TestQueryClientProvider>
  );
}

describe('mounted portfolio route behavior', () => {
  beforeEach(() => {
    routeMocks.latestAllocations.mockReturnValue({
      data: allocations,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    routeMocks.scenarioList.mockReturnValue({
      data: scenarioList,
      isLoading: false,
      error: null,
    });
    routeMocks.scenarioDetail.mockImplementation((scenarioId: string | null) => ({
      data: scenarioId ? scenarioDetail : undefined,
      isLoading: false,
      error: null,
    }));
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  it('renders the current portfolio workspace at /portfolio', async () => {
    renderPortfolioRoute();

    expect(await screen.findByRole('heading', { name: 'Portfolio' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Companies' })).toHaveAttribute(
      'data-state',
      'active'
    );
  });

  it('keeps a planned-reserves edit local to the active allocation scenario', async () => {
    const user = userEvent.setup();
    renderPortfolioRoute('/portfolio?tab=reserve-planning');

    await user.click(await screen.findByRole('button', { name: 'Resume' }));
    expect(await screen.findByText('Scenario: Downside reserve plan')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Edit' }));
    const plannedReserves = screen.getByLabelText(/planned reserves/i);
    await user.clear(plannedReserves);
    await user.type(plannedReserves, '2000000');
    await user.click(screen.getByRole('button', { name: 'Save to Scenario' }));

    expect(screen.getByText('Unsaved local edits')).toBeInTheDocument();
    const totalPlannedReserves = screen.getByText('Total Planned Reserves').parentElement;
    expect(totalPlannedReserves).not.toBeNull();
    expect(within(totalPlannedReserves!).getByText('$2.0M')).toBeInTheDocument();
  });

  it('switches from Companies to Reserve Planning and reveals the scenario workspace', async () => {
    const user = userEvent.setup();
    renderPortfolioRoute();

    expect(screen.getByText('Companies workspace')).toBeInTheDocument();
    expect(screen.queryByText('Reserve Planning Workspace')).not.toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: 'Reserve Planning' }));

    expect(await screen.findByText('Reserve Planning Workspace')).toBeInTheDocument();
    expect(screen.getByText('Saved Scenarios')).toBeInTheDocument();
    expect(screen.getByText('Downside reserve plan')).toBeInTheDocument();
    expect(window.location.search).toBe('?tab=reserve-planning');
  });
});
