/**
 * Unit tests for AllocationsTab component
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AllocationsTab } from '../AllocationsTab';
import type { AllocationsResponse } from '../types';

// Mock dependencies
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
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
      invested_amount_cents: 100000000, // $1M
      deployed_reserves_cents: 50000000, // $500K
      planned_reserves_cents: 150000000, // $1.5M
      allocation_cap_cents: 300000000, // $3M
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
      invested_amount_cents: 50000000, // $500K
      deployed_reserves_cents: 0,
      planned_reserves_cents: 100000000, // $1M
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
      invested_amount_cents: 200000000, // $2M
      deployed_reserves_cents: 100000000, // $1M
      planned_reserves_cents: 200000000, // $2M
      allocation_cap_cents: 500000000, // $5M
      allocation_reason: 'Exited via acquisition',
      allocation_version: 2,
      last_allocation_at: '2024-02-15T00:00:00Z',
    },
  ],
  metadata: {
    total_planned_cents: 450000000, // $4.5M
    total_deployed_cents: 150000000, // $1.5M
    companies_count: 3,
    last_updated_at: '2024-02-15T00:00:00Z',
  },
};

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

function renderWithQuery(ui: React.ReactElement) {
  const queryClient = createTestQueryClient();
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('AllocationsTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders loading state initially', () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise(() => {}) // Never resolves
    );

    renderWithQuery(<AllocationsTab />);

    expect(screen.getByTestId('skeleton') || document.querySelector('.animate-pulse')).toBeTruthy();
  });

  it('renders error state when fetch fails', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('Failed to fetch')
    );

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText(/failed to load allocations/i)).toBeTruthy();
      expect(screen.getByText(/retry/i)).toBeTruthy();
    });
  });

  it('renders empty state when no companies', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => ({ companies: [], metadata: { total_planned_cents: 0, total_deployed_cents: 0, companies_count: 0, last_updated_at: null } }),
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText(/no companies found/i)).toBeTruthy();
    });
  });

  it('renders company list with correct data', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
      expect(screen.getByText('HealthStart')).toBeTruthy();
      expect(screen.getByText('ExitedCo')).toBeTruthy();
    });
  });

  it('displays summary cards with correct totals', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('Total Planned Reserves')).toBeTruthy();
      expect(screen.getByText('Total Deployed Reserves')).toBeTruthy();
      expect(screen.getByText('Remaining to Deploy')).toBeTruthy();
    });
  });

  it('filters companies by search query', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/search companies/i);
    await user.type(searchInput, 'Tech');

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
      expect(screen.queryByText('HealthStart')).toBeFalsy();
    });
  });

  it('filters companies by sector', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
    });

    const sectorSelect = screen.getByRole('combobox', { name: '' });
    await user.selectOptions(sectorSelect, 'FinTech');

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
      expect(screen.queryByText('HealthStart')).toBeFalsy();
    });
  });

  it('filters companies by status', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('ExitedCo')).toBeTruthy();
    });

    const statusSelects = screen.getAllByRole('combobox');
    const statusSelect = statusSelects[1]; // Second select is status filter
    await user.selectOptions(statusSelect!, 'exited');

    await waitFor(() => {
      expect(screen.getByText('ExitedCo')).toBeTruthy();
      expect(screen.queryByText('TechCorp')).toBeFalsy();
    });
  });

  it('opens edit dialog when clicking edit button', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
    });

    const editButtons = screen.getAllByRole('button', { name: /edit/i });
    await user.click(editButtons[0]!);

    await waitFor(() => {
      expect(screen.getByText(/edit allocation/i)).toBeTruthy();
    });
  });

  it('shows clear filters button when filters are active', async () => {
    const user = userEvent.setup();
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: async () => mockAllocationsData,
    });

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
    });

    const searchInput = screen.getByPlaceholderText(/search companies/i);
    await user.type(searchInput, 'Tech');

    await waitFor(() => {
      expect(screen.getByText(/clear filters/i)).toBeTruthy();
    });

    const clearButton = screen.getByText(/clear filters/i);
    await user.click(clearButton);

    await waitFor(() => {
      expect(searchInput).toHaveValue('');
    });
  });

  it('refetches data when clicking refresh button', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockAllocationsData,
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => mockAllocationsData,
      });

    global.fetch = fetchMock;

    renderWithQuery(<AllocationsTab />);

    await waitFor(() => {
      expect(screen.getByText('TechCorp')).toBeTruthy();
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);

    const refreshButton = screen.getByRole('button', { name: /refresh/i });
    await user.click(refreshButton);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
