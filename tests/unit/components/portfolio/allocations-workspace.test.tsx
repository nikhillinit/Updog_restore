import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AllocationsTab } from '../../../../client/src/components/portfolio/tabs/AllocationsTab';
import { EditAllocationDialog } from '../../../../client/src/components/portfolio/tabs/EditAllocationDialog';
import type {
  AllocationCompany,
  AllocationScenarioDetail,
  AllocationScenarioListResponse,
  AllocationsResponse,
} from '../../../../client/src/components/portfolio/tabs/types';

const {
  latestAllocationsHookMock,
  scenarioListHookMock,
  scenarioDetailHookMock,
  createScenarioMutateAsyncMock,
  updateScenarioMutateAsyncMock,
  liveAllocationMutateMock,
  mockToast,
  mockRefetch,
} = vi.hoisted(() => ({
  latestAllocationsHookMock: vi.fn(),
  scenarioListHookMock: vi.fn(),
  scenarioDetailHookMock: vi.fn(),
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
  useCreateAllocationScenario: () => ({
    mutateAsync: createScenarioMutateAsyncMock,
    isPending: false,
  }),
  useUpdateAllocationScenario: () => ({
    mutateAsync: updateScenarioMutateAsyncMock,
    isPending: false,
  }),
}));

vi.mock('../../../../client/src/components/portfolio/tabs/hooks/useUpdateAllocations', () => ({
  useUpdateAllocations: () => ({
    mutate: liveAllocationMutateMock,
    isPending: false,
  }),
}));

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
    },
  ],
  metadata: {
    total_planned_cents: 450000000,
    total_deployed_cents: 150000000,
    companies_count: 3,
    last_updated_at: '2024-02-15T00:00:00Z',
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
  created_at: '2026-03-28T12:00:00.000Z',
  updated_at: '2026-02-15T16:00:00.000Z',
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
      created_at: mockScenarioDetail.created_at,
      updated_at: mockScenarioDetail.updated_at,
    },
  ],
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

describe('portfolio reserve planning workspace', () => {
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
    updateScenarioMutateAsyncMock.mockResolvedValue(mockScenarioDetail);
  });

  it('renders the live reserve-planning workspace summary and saved scenario controls', () => {
    renderWithQuery(<AllocationsTab />);

    expect(screen.getByText('Reserve Planning Workspace')).toBeInTheDocument();
    expect(screen.getByText('Companies with plans')).toBeInTheDocument();
    expect(screen.getByText('Documented notes')).toBeInTheDocument();
    expect(screen.getByText('Saved Scenarios')).toBeInTheDocument();
    expect(screen.getByText('Upside reserve plan')).toBeInTheDocument();
    expect(screen.getByText('Strong growth trajectory')).toBeInTheDocument();
    expect(screen.getByText('Last synced Feb 15, 2024')).toBeInTheDocument();
  });

  it('creates a scenario from the current workspace snapshot', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.type(screen.getByLabelText(/scenario name/i), 'Fresh scenario');
    await user.type(screen.getByLabelText(/scenario notes/i), 'Seeded from live workspace');
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

    await waitFor(() => {
      expect(screen.getByText('Scenario: Upside reserve plan')).toBeInTheDocument();
    });

    expect(screen.getByLabelText(/scenario notes/i)).toHaveValue(
      'Resume this for aggressive follow-ons.'
    );
    expect(screen.getAllByText(/Last modified Feb 15, 2026/).length).toBeGreaterThanOrEqual(1);

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save to scenario/i })).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/planned reserves/i)).toHaveValue(2500000);
  });

  it('renames the active scenario', async () => {
    const user = userEvent.setup();
    renderWithQuery(<AllocationsTab />);

    await user.click(screen.getByRole('button', { name: /resume/i }));
    await waitFor(() => {
      expect(screen.getByDisplayValue('Upside reserve plan')).toBeInTheDocument();
    });

    const nameInput = screen.getByLabelText(/scenario name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Board upside reserve plan');
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
    await waitFor(() => {
      expect(screen.getByText('Scenario: Upside reserve plan')).toBeInTheDocument();
    });

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);

    const plannedReservesInput = await screen.findByLabelText(/planned reserves/i);
    await user.clear(plannedReservesInput);
    await user.type(plannedReservesInput, '2600000');
    await user.click(screen.getByRole('button', { name: /save to scenario/i }));

    expect(liveAllocationMutateMock).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Scenario workspace updated',
      })
    );
    expect(screen.getByText('Unsaved local edits')).toBeInTheDocument();
  });

  it('shows allocation version and last-updated context in the edit dialog', () => {
    renderWithQuery(
      <EditAllocationDialog company={mockCompany} open={true} onOpenChange={vi.fn()} />
    );

    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2024')).toBeInTheDocument();
  });
});
