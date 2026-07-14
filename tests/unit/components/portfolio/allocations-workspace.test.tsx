import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AllocationsTab } from '../../../../client/src/components/portfolio/tabs/AllocationsTab';
import { EditAllocationDialog } from '../../../../client/src/components/portfolio/tabs/EditAllocationDialog';
import {
  AllocationCompanyActualsDriftV1Schema,
  type AllocationCompanyActualsDriftV1,
} from '@shared/contracts/allocations/allocation-actuals-drift-v1.contract';
import type { ReserveIcDecisionRecordV1 } from '@shared/contracts/reserve-ic-decision-v1.contract';
import type {
  AllocationCompany,
  AllocationScenarioApplyPreview,
  AllocationScenarioApplyResult,
  AllocationScenarioDetail,
  AllocationScenarioListResponse,
  AllocationScenarioSyncResult,
  AllocationsResponse,
} from '../../../../client/src/components/portfolio/tabs/types';

const {
  latestAllocationsHookMock,
  scenarioListHookMock,
  scenarioDetailHookMock,
  reserveIcPublishedResultsHookMock,
  reserveIcComparisonHookMock,
  previewScenarioMutateAsyncMock,
  reserveIcDecisionCreateMutateAsyncMock,
  reserveIcDecisionListHookMock,
  reserveIcDecisionUpdateMutateAsyncMock,
  syncScenarioMutateAsyncMock,
  applyScenarioMutateAsyncMock,
  createScenarioMutateAsyncMock,
  updateScenarioMutateAsyncMock,
  liveAllocationMutateMock,
  mockToast,
  mockRefetch,
} = vi.hoisted(() => ({
  latestAllocationsHookMock: vi.fn(),
  scenarioListHookMock: vi.fn(),
  scenarioDetailHookMock: vi.fn(),
  reserveIcPublishedResultsHookMock: vi.fn(),
  reserveIcComparisonHookMock: vi.fn(),
  previewScenarioMutateAsyncMock: vi.fn(),
  reserveIcDecisionCreateMutateAsyncMock: vi.fn(),
  reserveIcDecisionListHookMock: vi.fn(),
  reserveIcDecisionUpdateMutateAsyncMock: vi.fn(),
  syncScenarioMutateAsyncMock: vi.fn(),
  applyScenarioMutateAsyncMock: vi.fn(),
  createScenarioMutateAsyncMock: vi.fn(),
  updateScenarioMutateAsyncMock: vi.fn(),
  liveAllocationMutateMock: vi.fn(),
  mockToast: vi.fn(),
  mockRefetch: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: mockToast,
  }),
}));

vi.mock('../../../../client/src/components/portfolio/tabs/hooks/useLatestAllocations', () => ({
  useLatestAllocations: () => latestAllocationsHookMock(),
}));

vi.mock('../../../../client/src/components/portfolio/tabs/hooks/useAllocationScenarios', () => ({
  useAllocationScenarioList: () => scenarioListHookMock(),
  useAllocationScenarioDetail: (scenarioId: string | null) => scenarioDetailHookMock(scenarioId),
  useAllocationScenarioDecisions: () => reserveIcDecisionListHookMock(),
  useCreateAllocationScenario: () => ({
    mutateAsync: createScenarioMutateAsyncMock,
    isPending: false,
  }),
  useCreateReserveIcDecision: () => ({
    mutateAsync: reserveIcDecisionCreateMutateAsyncMock,
    isPending: false,
  }),
  useUpdateAllocationScenario: () => ({
    mutateAsync: updateScenarioMutateAsyncMock,
    isPending: false,
  }),
  useUpdateReserveIcDecision: () => ({
    mutateAsync: reserveIcDecisionUpdateMutateAsyncMock,
    isPending: false,
  }),
  useAllocationScenarioApplyPreview: () => ({
    mutateAsync: previewScenarioMutateAsyncMock,
    isPending: false,
  }),
  useSyncAllocationScenario: () => ({
    mutateAsync: syncScenarioMutateAsyncMock,
    isPending: false,
  }),
  useApplyAllocationScenario: () => ({
    mutateAsync: applyScenarioMutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock(
  '../../../../client/src/components/portfolio/tabs/hooks/useReserveIcPacketEvidence',
  () => ({
    useReserveIcPacketEvidence: () => ({
      publishedResultsQuery: reserveIcPublishedResultsHookMock(),
      comparisonQuery: reserveIcComparisonHookMock(),
    }),
  })
);

vi.mock('../../../../client/src/components/portfolio/tabs/hooks/useUpdateAllocations', () => ({
  useUpdateAllocations: () => ({
    mutate: liveAllocationMutateMock,
    isPending: false,
  }),
}));

const FACTS_INPUT_HASH = 'b'.repeat(64);

function buildActualsDrift(
  companyId: number,
  overrides: Partial<AllocationCompanyActualsDriftV1> = {}
): AllocationCompanyActualsDriftV1 {
  return AllocationCompanyActualsDriftV1Schema.parse({
    contractVersion: 'allocation-actuals-drift-v1',
    companyId,
    asOfDate: '2026-07-11',
    allocationVersion: 1,
    lastAllocationAt: '2024-01-01T00:00:00.000Z',
    factsInputHash: FACTS_INPUT_HASH,
    trustState: 'LIVE',
    planningFmvStatus: 'active',
    currencyStatus: 'base_currency',
    activeRoundIds: [companyId * 100],
    supersedeLineage: [],
    comparisons: [
      {
        basis: 'deployed_reserves_vs_observed_follow_on',
        state: 'exact',
        planCents: '50000000',
        actualCents: '50000000',
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
    ...overrides,
  });
}

const mockActualsDriftSummary = {
  facts_status: 'available' as const,
  drifted_company_count: 1,
  material_company_count: 1,
  degraded_company_count: 1,
  facts_input_hash: FACTS_INPUT_HASH,
  as_of_date: '2026-07-11',
};

const mockAllocationsData: AllocationsResponse = {
  companies: [
    {
      company_id: 1,
      company_name: 'TechCorp',
      sector: 'FinTech',
      stage: 'Series A',
      status: 'active',
      invested_amount_cents: 100000000,
      deployed_reserves_cents: 50000000,
      planned_reserves_cents: 150000000,
      allocation_cap_cents: 300000000,
      allocation_reason: 'Strong growth trajectory',
      allocation_version: 1,
      last_allocation_at: '2024-01-01T00:00:00Z',
      actuals_drift: buildActualsDrift(1),
    },
    {
      company_id: 2,
      company_name: 'HealthStart',
      sector: 'HealthTech',
      stage: 'Seed',
      status: 'active',
      invested_amount_cents: 50000000,
      deployed_reserves_cents: 0,
      planned_reserves_cents: 100000000,
      allocation_cap_cents: null,
      allocation_reason: null,
      allocation_version: 1,
      last_allocation_at: null,
      actuals_drift: buildActualsDrift(2, {
        comparisons: [
          {
            basis: 'deployed_reserves_vs_observed_follow_on',
            state: 'drifted',
            planCents: '0',
            actualCents: '25000000',
            deltaCents: '25000000',
            relativeDelta: null,
            material: true,
            subCentRemainder: null,
            unavailableReason: null,
          },
          {
            basis: 'legacy_invested_vs_observed_total',
            state: 'exact',
            planCents: '50000000',
            actualCents: '50000000',
            deltaCents: '0',
            relativeDelta: '0',
            material: false,
            subCentRemainder: null,
            unavailableReason: null,
          },
        ],
      }),
    },
    {
      company_id: 3,
      company_name: 'ExitedCo',
      sector: 'SaaS',
      stage: 'Series B',
      status: 'exited',
      invested_amount_cents: 200000000,
      deployed_reserves_cents: 100000000,
      planned_reserves_cents: 200000000,
      allocation_cap_cents: 500000000,
      allocation_reason: 'Exited via acquisition',
      allocation_version: 2,
      last_allocation_at: '2024-02-15T00:00:00Z',
      actuals_drift: buildActualsDrift(3, {
        allocationVersion: 2,
        trustState: 'PARTIAL',
        planningFmvStatus: 'stale',
        comparisons: [
          {
            basis: 'deployed_reserves_vs_observed_follow_on',
            state: 'unavailable',
            planCents: '100000000',
            actualCents: null,
            deltaCents: null,
            relativeDelta: null,
            material: false,
            subCentRemainder: null,
            unavailableReason: 'facts_missing',
          },
          {
            basis: 'legacy_invested_vs_observed_total',
            state: 'exact',
            planCents: '200000000',
            actualCents: '200000000',
            deltaCents: '0',
            relativeDelta: '0',
            material: false,
            subCentRemainder: null,
            unavailableReason: null,
          },
        ],
        warnings: [
          {
            code: 'DATA_STALE',
            severity: 'warning',
            message: 'Planning FMV is stale.',
          },
        ],
      }),
    },
  ],
  metadata: {
    total_planned_cents: 450000000,
    total_deployed_cents: 150000000,
    companies_count: 3,
    last_updated_at: '2024-02-15T00:00:00Z',
    actuals_drift_summary: mockActualsDriftSummary,
  },
};

const mockScenarioDetail: AllocationScenarioDetail = {
  id: '00000000-0000-0000-0000-000000000101',
  fund_id: 1,
  name: 'Upside reserve plan',
  notes: 'Resume this for aggressive follow-ons.',
  source_allocation_version: 2,
  company_count: 3,
  total_planned_cents: 500000000,
  last_applied_at: '2026-03-27T11:00:00.000Z',
  last_applied_by: 'analyst@example.com',
  last_applied_allocation_version: 7,
  last_synced_at: '2026-03-29T09:30:00.000Z',
  last_synced_by: 'system',
  created_at: '2026-03-28T12:00:00.000Z',
  updated_at: '2026-02-15T16:00:00.000Z',
  context: {
    scenario_notes: 'Resume this for aggressive follow-ons.',
    last_sync: {
      event_id: '00000000-0000-0000-0000-000000000202',
      at: '2026-03-29T09:30:00.000Z',
      by: 'system',
      note: 'Refresh from live before committee review',
      source_allocation_version: 1,
      resulting_allocation_version: 2,
      change_summary: {
        companies_changed: 1,
        companies_unchanged: 2,
        scenario_only_count: 0,
        live_only_count: 0,
        total_planned_delta_cents: -50000000,
        headline: 'Synced 1 company',
      },
    },
    last_apply: {
      event_id: '00000000-0000-0000-0000-000000000203',
      at: '2026-03-27T11:00:00.000Z',
      by: 'analyst@example.com',
      note: 'Apply approved reserve plan',
      source_allocation_version: 6,
      resulting_allocation_version: 7,
      change_summary: {
        companies_changed: 1,
        companies_unchanged: 2,
        scenario_only_count: 0,
        live_only_count: 0,
        total_planned_delta_cents: 50000000,
        headline: 'Applied 1 company',
      },
    },
  },
  snapshot_items: [
    {
      company_id: 1,
      planned_reserves_cents: 250000000,
      allocation_cap_cents: 325000000,
      allocation_reason: 'Reserve for a larger Series B check',
    },
    {
      company_id: 2,
      planned_reserves_cents: 50000000,
      allocation_cap_cents: null,
      allocation_reason: 'Hold back until next milestone',
    },
    {
      company_id: 3,
      planned_reserves_cents: 200000000,
      allocation_cap_cents: 500000000,
      allocation_reason: 'Exited via acquisition',
    },
  ],
};

const mockScenarioList: AllocationScenarioListResponse = {
  scenarios: [
    {
      id: mockScenarioDetail.id,
      fund_id: 1,
      name: mockScenarioDetail.name,
      notes: mockScenarioDetail.notes,
      source_allocation_version: mockScenarioDetail.source_allocation_version,
      company_count: mockScenarioDetail.company_count,
      total_planned_cents: mockScenarioDetail.total_planned_cents,
      last_applied_at: mockScenarioDetail.last_applied_at,
      last_applied_by: mockScenarioDetail.last_applied_by,
      last_applied_allocation_version: mockScenarioDetail.last_applied_allocation_version,
      last_synced_at: mockScenarioDetail.last_synced_at,
      last_synced_by: mockScenarioDetail.last_synced_by,
      created_at: mockScenarioDetail.created_at,
      updated_at: mockScenarioDetail.updated_at,
    },
  ],
};

const mockApplyPreview: AllocationScenarioApplyPreview = {
  scenario: {
    id: mockScenarioDetail.id,
    fund_id: 1,
    name: mockScenarioDetail.name,
    notes: mockScenarioDetail.notes,
    source_allocation_version: mockScenarioDetail.source_allocation_version,
    company_count: mockScenarioDetail.company_count,
    total_planned_cents: mockScenarioDetail.total_planned_cents,
    last_applied_at: mockScenarioDetail.last_applied_at,
    last_applied_by: mockScenarioDetail.last_applied_by,
    last_applied_allocation_version: mockScenarioDetail.last_applied_allocation_version,
    last_synced_at: mockScenarioDetail.last_synced_at,
    last_synced_by: mockScenarioDetail.last_synced_by,
    created_at: mockScenarioDetail.created_at,
    updated_at: mockScenarioDetail.updated_at,
  },
  live: {
    fund_id: 1,
    company_count: 3,
    total_planned_cents: 450000000,
    total_deployed_cents: 150000000,
    max_allocation_version: 2,
    last_updated_at: '2026-03-30T18:00:00.000Z',
  },
  drift_status: 'exact_match',
  apply_state: 'apply_allowed',
  live_token: 'a'.repeat(64),
  summary: {
    companies_changed: 1,
    companies_unchanged: 2,
    scenario_only_count: 0,
    live_only_count: 0,
    total_planned_delta_cents: 50000000,
  },
};

const mockSyncResult: AllocationScenarioSyncResult = {
  scenario: {
    ...mockScenarioDetail,
    source_allocation_version: 3,
    total_planned_cents: 450000000,
    last_synced_at: '2026-03-30T18:15:00.000Z',
    last_synced_by: 'analyst@example.com',
    updated_at: '2026-03-30T18:15:00.000Z',
    snapshot_items: mockAllocationsData.companies.map((company) => ({
      company_id: company.company_id,
      planned_reserves_cents: company.planned_reserves_cents,
      allocation_cap_cents: company.allocation_cap_cents,
      allocation_reason: company.allocation_reason,
    })),
  },
  event: {
    id: '00000000-0000-0000-0000-000000000202',
    event_type: 'synced',
    actor_user_id: 17,
    actor_label: 'analyst@example.com',
    note: 'Refresh from live before committee review',
    source_allocation_version: 2,
    resulting_allocation_version: 3,
    change_summary: {
      companies_changed: 1,
      companies_unchanged: 2,
      scenario_only_count: 0,
      live_only_count: 0,
      total_planned_delta_cents: -50000000,
      headline: 'Synced 1 company',
    },
    created_at: '2026-03-30T18:15:00.000Z',
  },
};

const mockApplyResult: AllocationScenarioApplyResult = {
  scenario: {
    ...mockScenarioDetail,
    source_allocation_version: 8,
    last_applied_at: '2026-03-30T18:30:00.000Z',
    last_applied_by: 'analyst@example.com',
    last_applied_allocation_version: 8,
    updated_at: '2026-03-30T18:30:00.000Z',
  },
  event: {
    id: '00000000-0000-0000-0000-000000000203',
    event_type: 'applied',
    actor_user_id: 17,
    actor_label: 'analyst@example.com',
    note: 'Apply approved reserve plan',
    source_allocation_version: 7,
    resulting_allocation_version: 8,
    change_summary: {
      companies_changed: 1,
      companies_unchanged: 2,
      scenario_only_count: 0,
      live_only_count: 0,
      total_planned_delta_cents: 50000000,
      headline: 'Applied 1 company',
    },
    created_at: '2026-03-30T18:30:00.000Z',
  },
  live: {
    updated_count: 1,
    resulting_allocation_version: 8,
    previous_preview_token: mockApplyPreview.live_token,
    current_live_token: 'b'.repeat(64),
  },
};

const mockReserveIcDecision: ReserveIcDecisionRecordV1 = {
  id: '00000000-0000-0000-0000-000000000301',
  fundId: 1,
  companyId: 1,
  decisionType: 'follow_on',
  decisionStatus: 'proposed',
  rationale: 'Reserve for a larger Series B check',
  proposedPlannedReservesCents: 250000000,
  finalPlannedReservesCents: null,
  decidedByUserId: null,
  decidedByLabel: null,
  decidedAt: null,
  provenance: {
    sourceScenarioId: mockScenarioDetail.id,
    sourceAllocationVersion: 2,
    liveAllocationVersion: 2,
  },
  createdAt: '2026-03-30T18:45:00.000Z',
  updatedAt: '2026-03-30T18:45:00.000Z',
};

const mockCompany: AllocationCompany = mockAllocationsData.companies[0]!;

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function setControlValue(control: HTMLElement, value: string) {
  fireEvent.change(control, { target: { value } });
}

describe('portfolio reserve planning workspace', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  beforeEach(() => {
    vi.clearAllMocks();

    latestAllocationsHookMock.mockReturnValue({
      data: mockAllocationsData,
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    scenarioListHookMock.mockReturnValue({
      data: mockScenarioList,
      isLoading: false,
      error: null,
    });

    scenarioDetailHookMock.mockImplementation((scenarioId: string | null) => ({
      data: scenarioId === mockScenarioDetail.id ? mockScenarioDetail : undefined,
      isLoading: false,
      error: null,
    }));

    createScenarioMutateAsyncMock.mockResolvedValue(mockScenarioDetail);
    reserveIcDecisionCreateMutateAsyncMock.mockResolvedValue(mockReserveIcDecision);
    reserveIcDecisionUpdateMutateAsyncMock.mockResolvedValue(mockReserveIcDecision);
    updateScenarioMutateAsyncMock.mockResolvedValue(mockScenarioDetail);
    previewScenarioMutateAsyncMock.mockResolvedValue(mockApplyPreview);
    syncScenarioMutateAsyncMock.mockResolvedValue(mockSyncResult);
    applyScenarioMutateAsyncMock.mockResolvedValue(mockApplyResult);
    reserveIcDecisionListHookMock.mockReturnValue({
      data: { decisions: [mockReserveIcDecision] },
      isLoading: false,
      error: null,
    });
    reserveIcPublishedResultsHookMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
    reserveIcComparisonHookMock.mockReturnValue({
      data: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders the live reserve-planning workspace summary and saved scenario controls', () => {
    renderWithQuery(<AllocationsTab />);

    for (const company of mockAllocationsData.companies) {
      expect(AllocationCompanyActualsDriftV1Schema.parse(company.actuals_drift)).toEqual(
        company.actuals_drift
      );
    }
    expect(screen.getByText('Reserve Planning Workspace')).toBeInTheDocument();
    expect(screen.getByText('Companies with plans')).toBeInTheDocument();
    expect(screen.getByText('Documented notes')).toBeInTheDocument();
    expect(screen.getByText('Saved Scenarios')).toBeInTheDocument();
    expect(screen.getByText('Upside reserve plan')).toBeInTheDocument();
    expect(screen.getByText('Strong growth trajectory')).toBeInTheDocument();
    expect(screen.getByText('Reserve IC Decisions')).toBeInTheDocument();
    expect(screen.getByText('Last synced Feb 15, 2024')).toBeInTheDocument();
    expect(screen.getByText('Synced Mar 29, 2026 by system')).toBeInTheDocument();
    expect(
      screen.getByText('Applied Mar 27, 2026 by analyst@example.com (v7)')
    ).toBeInTheDocument();
  });

  it('renders drift summary counts and toggles disclosure by keyboard without mutations', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    expect(screen.getByText('1 drifted')).toBeInTheDocument();
    expect(screen.getByText('1 material')).toBeInTheDocument();
    expect(screen.getByText('1 degraded')).toBeInTheDocument();

    const expander = screen.getByRole('button', {
      name: 'Expand Plan vs actual for TechCorp. Status: no drift',
    });
    const disclosure = document.getElementById('allocation-actuals-disclosure-1');

    expect(expander).toHaveAttribute('aria-expanded', 'false');
    expect(expander).toHaveAccessibleName('Expand Plan vs actual for TechCorp. Status: no drift');
    expect(disclosure).toHaveAttribute('aria-hidden', 'true');

    expander.focus();
    await user.keyboard('{Enter}');

    expect(expander).toHaveAttribute('aria-expanded', 'true');
    expect(disclosure).toHaveAttribute('aria-hidden', 'false');
    expect(screen.getByText('Deployed reserves vs observed follow-on')).toBeInTheDocument();
    expect(screen.getByText('Legacy invested vs observed total')).toBeInTheDocument();

    await user.keyboard(' ');

    expect(expander).toHaveAttribute('aria-expanded', 'false');
    expect(disclosure).toHaveAttribute('aria-hidden', 'true');
    expect(liveAllocationMutateMock).not.toHaveBeenCalled();
    expect(createScenarioMutateAsyncMock).not.toHaveBeenCalled();
    expect(updateScenarioMutateAsyncMock).not.toHaveBeenCalled();
    expect(previewScenarioMutateAsyncMock).not.toHaveBeenCalled();
    expect(syncScenarioMutateAsyncMock).not.toHaveBeenCalled();
    expect(applyScenarioMutateAsyncMock).not.toHaveBeenCalled();
    expect(reserveIcDecisionCreateMutateAsyncMock).not.toHaveBeenCalled();
    expect(reserveIcDecisionUpdateMutateAsyncMock).not.toHaveBeenCalled();
  });

  // -- Plan 9 Wave 9B1: scenario seed deep link inside the expanded disclosure --

  it('deep-links to the scenario seed picker from an expanded row while the flag is on', async () => {
    vi.stubEnv('VITE_ENABLE_SCENARIO_SEED_PICKER', 'true');
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    // Collapsed rows stay chrome-free.
    expect(screen.queryByTestId('allocation-seed-link-1')).not.toBeInTheDocument();

    const expander = screen.getByRole('button', {
      name: 'Expand Plan vs actual for TechCorp. Status: no drift',
    });
    expander.focus();
    await user.keyboard('{Enter}');

    const seedLink = screen.getByTestId('allocation-seed-link-1');
    expect(seedLink).toHaveTextContent("Start scenario from this company's actuals");
    expect(seedLink).toHaveAttribute(
      'href',
      '/fund-model-results/1/scenarios?seedPicker=1&seedCompany=1'
    );
  });

  it('renders the seed link disabled with a reason while the flag is off', async () => {
    vi.stubEnv('VITE_ENABLE_SCENARIO_SEED_PICKER', 'false');
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    const expander = screen.getByRole('button', {
      name: 'Expand Plan vs actual for TechCorp. Status: no drift',
    });
    expander.focus();
    await user.keyboard('{Enter}');

    const disabled = screen.getByTestId('allocation-seed-link-1-disabled');
    expect(disabled).toHaveAttribute('aria-disabled', 'true');
    expect(disabled).toHaveTextContent('the scenario seed picker is not enabled');
    expect(screen.queryByTestId('allocation-seed-link-1')).not.toBeInTheDocument();
  });

  it('renders the disclosure loading rail with tabular placeholders', () => {
    latestAllocationsHookMock.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: mockRefetch,
    });

    renderWithQuery(<AllocationsTab />);

    const rail = screen.getByLabelText('Actuals drift summary');
    expect(rail).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Loading actuals drift disclosure')).toBeInTheDocument();
    expect(rail.querySelectorAll('.tabular-nums').length).toBeGreaterThanOrEqual(3);
  });

  it('renders the no-drift disclosure state with its as-of date', () => {
    latestAllocationsHookMock.mockReturnValue({
      data: {
        ...mockAllocationsData,
        metadata: {
          ...mockAllocationsData.metadata,
          actuals_drift_summary: {
            ...mockActualsDriftSummary,
            drifted_company_count: 0,
            material_company_count: 0,
            degraded_company_count: 0,
          },
        },
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithQuery(<AllocationsTab />);

    expect(screen.getByText('No drift disclosed')).toBeInTheDocument();
    expect(screen.getByText('As of 2026-07-11')).toBeInTheDocument();
  });

  it('keeps plan values visible when the facts summary failed', () => {
    const failedDrift = buildActualsDrift(1, {
      factsInputHash: null,
      trustState: 'FAILED',
      planningFmvStatus: 'none',
      currencyStatus: 'unknown',
      comparisons: [
        {
          basis: 'deployed_reserves_vs_observed_follow_on',
          state: 'unavailable',
          planCents: '50000000',
          actualCents: null,
          deltaCents: null,
          relativeDelta: null,
          material: false,
          subCentRemainder: null,
          unavailableReason: 'facts_failed',
        },
        {
          basis: 'legacy_invested_vs_observed_total',
          state: 'unavailable',
          planCents: '100000000',
          actualCents: null,
          deltaCents: null,
          relativeDelta: null,
          material: false,
          subCentRemainder: null,
          unavailableReason: 'facts_failed',
        },
      ],
      warnings: [
        {
          code: 'ROUND_ADAPTER_FAILED',
          severity: 'blocking',
          message: 'Round facts adapter failed.',
        },
      ],
    });
    latestAllocationsHookMock.mockReturnValue({
      data: {
        companies: [{ ...mockAllocationsData.companies[0]!, actuals_drift: failedDrift }],
        metadata: {
          ...mockAllocationsData.metadata,
          companies_count: 1,
          actuals_drift_summary: {
            facts_status: 'failed',
            drifted_company_count: 0,
            material_company_count: 0,
            degraded_company_count: 1,
            facts_input_hash: null,
            as_of_date: '2026-07-11',
          },
        },
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithQuery(<AllocationsTab />);
    fireEvent.click(
      screen.getByRole('button', {
        name: 'Expand Plan vs actual for TechCorp. Status: facts unavailable',
      })
    );

    expect(screen.getAllByText(/facts unavailable/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText('$500,000.00').length).toBeGreaterThan(0);
  });

  it('renders a true empty state only when the fund has no portfolio companies', () => {
    latestAllocationsHookMock.mockReturnValue({
      data: {
        companies: [],
        metadata: {
          total_planned_cents: 0,
          total_deployed_cents: 0,
          companies_count: 0,
          allocation_facts_missing_count: 0,
          last_updated_at: null,
          actuals_drift_summary: {
            ...mockActualsDriftSummary,
            drifted_company_count: 0,
            material_company_count: 0,
            degraded_company_count: 0,
          },
        },
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithQuery(<AllocationsTab />);

    expect(screen.getByText('No drift disclosed')).toBeInTheDocument();
    expect(screen.getByText('As of 2026-07-11')).toBeInTheDocument();
    expect(screen.getByText('No portfolio companies found')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Add a company to this fund before creating reserve allocations and IC decisions.'
      )
    ).toBeInTheDocument();
    expect(screen.getByTestId('reserve-planning-add-company-button')).toBeInTheDocument();
    expect(screen.queryByText('Reserve Planning Workspace')).not.toBeInTheDocument();
  });

  it('keeps company rows visible when allocation facts are missing', () => {
    latestAllocationsHookMock.mockReturnValue({
      data: {
        companies: [
          {
            ...mockAllocationsData.companies[0]!,
            planned_reserves_cents: 0,
            deployed_reserves_cents: 0,
            allocation_version: 0,
            allocation_facts_missing: true,
            actuals_drift: buildActualsDrift(1, {
              factsInputHash: null,
              trustState: 'UNAVAILABLE',
              planningFmvStatus: 'none',
              currencyStatus: 'unknown',
              comparisons: [
                {
                  basis: 'deployed_reserves_vs_observed_follow_on',
                  state: 'unavailable',
                  planCents: '0',
                  actualCents: null,
                  deltaCents: null,
                  relativeDelta: null,
                  material: false,
                  subCentRemainder: null,
                  unavailableReason: 'facts_missing',
                },
                {
                  basis: 'legacy_invested_vs_observed_total',
                  state: 'unavailable',
                  planCents: '100000000',
                  actualCents: null,
                  deltaCents: null,
                  relativeDelta: null,
                  material: false,
                  subCentRemainder: null,
                  unavailableReason: 'facts_missing',
                },
              ],
            }),
            missing_allocation_fields: [
              'planned_reserves_cents',
              'deployed_reserves_cents',
              'allocation_version',
            ],
          },
        ],
        metadata: {
          total_planned_cents: 0,
          total_deployed_cents: 0,
          companies_count: 1,
          allocation_facts_missing_count: 1,
          last_updated_at: null,
          actuals_drift_summary: {
            ...mockActualsDriftSummary,
            drifted_company_count: 0,
            material_company_count: 0,
            degraded_company_count: 1,
            facts_input_hash: null,
          },
        },
      },
      isLoading: false,
      error: null,
      refetch: mockRefetch,
    });

    renderWithQuery(<AllocationsTab />);

    expect(screen.getByText(/Allocation facts are missing for 1 company/)).toBeInTheDocument();
    expect(screen.getByText('TechCorp')).toBeInTheDocument();
    expect(screen.getAllByText('Missing').length).toBeGreaterThanOrEqual(2);
  });

  it('creates a scenario from the current workspace snapshot', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    setControlValue(screen.getByLabelText(/scenario name/i), 'Fresh scenario');
    setControlValue(screen.getByLabelText(/scenario notes/i), 'Seeded from live workspace');
    await user.click(screen.getByRole('button', { name: /save scenario/i }));

    await waitFor(() => {
      expect(createScenarioMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Fresh scenario',
          notes: 'Seeded from live workspace',
          snapshot_items: expect.arrayContaining([
            expect.objectContaining({
              company_id: 1,
              planned_reserves_cents: 150000000,
            }),
          ]),
        })
      );
    });
  });

  it('resumes a saved scenario and hydrates the workspace snapshot', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    expect(screen.getByLabelText(/scenario notes/i)).toHaveValue(
      'Resume this for aggressive follow-ons.'
    );
    expect(screen.getAllByText(/Last modified Feb 15, 2026/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Synced Mar 29, 2026 by system/).length).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByText(/Applied Mar 27, 2026 by analyst@example.com \(v7\)/).length
    ).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('IC Reserve Packet')).toBeInTheDocument();
    expect(screen.getAllByText('follow on').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('proposed').length).toBeGreaterThanOrEqual(1);
    await user.click(
      screen.getByRole('button', {
        name: 'Expand Plan vs actual for TechCorp. Status: no drift',
      })
    );
    expect(screen.getByText('Live fund company actuals facts')).toBeInTheDocument();

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);
    await screen.findByRole('button', { name: /save to scenario/i });
    expect(screen.getByLabelText(/planned reserves/i)).toHaveValue(2500000);
  });

  it('renames the active scenario', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByDisplayValue('Upside reserve plan');

    const nameInput = screen.getByLabelText(/scenario name/i);
    setControlValue(nameInput, 'Board upside reserve plan');
    await user.click(screen.getByRole('button', { name: /rename scenario/i }));

    await waitFor(() => {
      expect(updateScenarioMutateAsyncMock).toHaveBeenCalledWith({
        name: 'Board upside reserve plan',
        notes: 'Resume this for aggressive follow-ons.',
      });
    });
  });

  it('keeps dialog edits local in scenario mode and marks the workspace dirty', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);

    const plannedReservesInput = await screen.findByLabelText(/planned reserves/i);
    setControlValue(plannedReservesInput, '2600000');
    await user.click(screen.getByRole('button', { name: /save to scenario/i }));

    expect(liveAllocationMutateMock).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Scenario workspace updated',
      })
    );
    expect(screen.getByText('Unsaved local edits')).toBeInTheDocument();
  });

  it('previews apply and sends the preview token when applying a scenario', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    setControlValue(screen.getByLabelText(/action note/i), 'Committee approved apply');
    await user.click(screen.getByRole('button', { name: /preview apply/i }));

    await waitFor(() => {
      expect(previewScenarioMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByText('Apply Preview')).toBeInTheDocument();
    expect(screen.getByText('Apply allowed')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /confirm apply/i }));

    await waitFor(() => {
      expect(applyScenarioMutateAsyncMock).toHaveBeenCalledWith({
        preview_token: mockApplyPreview.live_token,
        note: 'Committee approved apply',
      });
    });
    expect(mockRefetch).toHaveBeenCalled();
  });

  it('syncs the active scenario from live with an action note', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    setControlValue(screen.getByLabelText(/action note/i), 'Refresh from IC feedback');
    await user.click(screen.getByRole('button', { name: /sync from live/i }));

    await waitFor(() => {
      expect(syncScenarioMutateAsyncMock).toHaveBeenCalledWith({
        note: 'Refresh from IC feedback',
      });
    });
  });

  it('disables preview and sync actions while the scenario workspace is dirty', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);

    const plannedReservesInput = await screen.findByLabelText(/planned reserves/i);
    setControlValue(plannedReservesInput, '2600000');
    await user.click(screen.getByRole('button', { name: /save to scenario/i }));

    expect(screen.getByRole('button', { name: /preview apply/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /sync from live/i })).toBeDisabled();
    expect(previewScenarioMutateAsyncMock).not.toHaveBeenCalled();
    expect(syncScenarioMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('disables reserve IC decision persistence while the scenario workspace is dirty', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);

    const plannedReservesInput = await screen.findByLabelText(/planned reserves/i);
    setControlValue(plannedReservesInput, '2600000');
    await user.click(screen.getByRole('button', { name: /save to scenario/i }));

    const updateDecisionButton = screen.getByRole('button', { name: /update decision/i });
    expect(updateDecisionButton).toBeDisabled();

    await user.click(updateDecisionButton);

    expect(reserveIcDecisionUpdateMutateAsyncMock).not.toHaveBeenCalled();
    expect(reserveIcDecisionCreateMutateAsyncMock).not.toHaveBeenCalled();
  });

  it('shows allocation version and last-updated context in the edit dialog', () => {
    renderWithQuery(
      <EditAllocationDialog company={mockCompany} open={true} onOpenChange={vi.fn()} />
    );

    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2024')).toBeInTheDocument();
  });

  it('creates a reserve IC decision for the active scenario company', async () => {
    const user = userEvent.setup();
    reserveIcDecisionListHookMock.mockReturnValue({
      data: { decisions: [] },
      isLoading: false,
      error: null,
    });
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    setControlValue(
      screen.getByLabelText(/decision rationale/i),
      'Reserve for a larger Series B check'
    );
    await user.click(screen.getByRole('button', { name: /save decision/i }));

    await waitFor(() => {
      expect(reserveIcDecisionCreateMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          fundId: 1,
          companyId: 1,
          decisionType: 'follow_on',
          decisionStatus: 'draft',
          rationale: 'Reserve for a larger Series B check',
        })
      );
    });
  });

  it('updates an existing reserve IC decision for the active scenario company', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await screen.findByText('Scenario: Upside reserve plan');

    await user.selectOptions(screen.getByLabelText(/decision status/i), 'approved');
    await user.click(screen.getByRole('button', { name: /update decision/i }));

    await waitFor(() => {
      expect(reserveIcDecisionUpdateMutateAsyncMock).toHaveBeenCalledWith(
        expect.objectContaining({
          decisionId: mockReserveIcDecision.id,
          payload: expect.objectContaining({
            decisionStatus: 'approved',
          }),
        })
      );
    });
  });
});
