import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AllocationsTab } from '../../../../client/src/components/portfolio/tabs/AllocationsTab';
import { EditAllocationDialog } from '../../../../client/src/components/portfolio/tabs/EditAllocationDialog';
import type {
  AllocationCompany,
  AllocationsResponse,
} from '../../../../client/src/components/portfolio/tabs/types';

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

const mockCompany: AllocationCompany = mockAllocationsData.companies[0]!;
const mockRefetch = vi.fn();
const mockMutate = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock('../../../../client/src/components/portfolio/tabs/hooks/useLatestAllocations', () => ({
  useLatestAllocations: () => ({
    data: mockAllocationsData,
    isLoading: false,
    error: null,
    refetch: mockRefetch,
  }),
}));

vi.mock('../../../../client/src/components/portfolio/tabs/hooks/useUpdateAllocations', () => ({
  useUpdateAllocations: () => ({
    mutate: mockMutate,
    isPending: false,
  }),
}));

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('portfolio reserve planning workspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the live reserve-planning workspace summary and persisted notes', () => {
    renderWithQuery(<AllocationsTab />);

    expect(screen.getByText('Reserve Planning Workspace')).toBeInTheDocument();
    expect(screen.getByText('Companies with plans')).toBeInTheDocument();
    expect(screen.getByText('Documented notes')).toBeInTheDocument();
    expect(screen.getByText('Last synced')).toBeInTheDocument();
    expect(
      screen.getByText(/canonical persisted reserve-planning surface/i)
    ).toBeInTheDocument();
    expect(screen.getByText('Strong growth trajectory')).toBeInTheDocument();
    expect(screen.getByText('Feb 15, 2024')).toBeInTheDocument();
  });

  it('shows allocation version and last-updated context in the edit dialog', () => {
    renderWithQuery(
      <EditAllocationDialog company={mockCompany} open={true} onOpenChange={vi.fn()} />
    );

    expect(screen.getByText('v1')).toBeInTheDocument();
    expect(screen.getByText('Jan 1, 2024')).toBeInTheDocument();
  });
});
