import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { OverviewTab } from '../../../../client/src/components/portfolio/tabs/OverviewTab';
import { TestQueryClientProvider } from '../../../utils/test-query-client';

const mockSetLocation = vi.fn();
const mockUsePortfolioCompanies = vi.fn();
const mockApiRequest = vi.fn();
const mockToast = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-fund-data', () => ({
  usePortfolioCompanies: (...args: unknown[]) => mockUsePortfolioCompanies(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/portfolio?tab=companies', mockSetLocation],
  useSearch: () => 'tab=companies&asOf=2025-03',
}));

vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: unknown[]) => mockApiRequest(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function renderOverviewTab() {
  return render(
    <TestQueryClientProvider>
      <OverviewTab />
    </TestQueryClientProvider>
  );
}

describe('OverviewTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders live companies from the portfolio hook', () => {
    mockUsePortfolioCompanies.mockReturnValue({
      portfolioCompanies: [
        {
          id: 1,
          fundId: 1,
          name: 'TechCorp',
          sector: 'Fintech',
          stage: 'Series B',
          currentStage: 'Series B',
          investmentAmount: '5000000',
          investmentDate: new Date('2024-01-15T00:00:00.000Z'),
          currentValuation: '12500000',
          foundedYear: 2019,
          status: 'Growing',
          description: null,
          dealTags: ['B2B'],
          createdAt: new Date('2024-01-15T00:00:00.000Z'),
          deployedReservesCents: 0,
          plannedReservesCents: 0,
          exitMoicBps: null,
          ownershipCurrentPct: '8.5000',
          allocationCapCents: null,
          allocationReason: null,
          allocationIteration: 0,
          lastAllocationAt: null,
          allocationVersion: 1,
        },
      ],
      meta: {
        mode: 'live',
        requestedAsOf: null,
        resolvedAsOf: null,
        source: 'live',
        historicalAvailable: false,
      },
      isLoading: false,
      error: null,
    });

    renderOverviewTab();

    expect(screen.getAllByText('TechCorp').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Total Invested').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Current Value').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Average MOIC').length).toBeGreaterThan(0);
  });

  it('shows historical-mode notice and resets URL state back to today', () => {
    mockUsePortfolioCompanies.mockReturnValue({
      portfolioCompanies: [
        {
          id: 1,
          fundId: 1,
          name: 'TechCorp',
          sector: 'Fintech',
          stage: 'Series B',
          currentStage: 'Series B',
          investmentAmount: '5000000',
          investmentDate: new Date('2024-01-15T00:00:00.000Z'),
          currentValuation: '9800000',
          foundedYear: 2019,
          status: 'Growing',
          description: null,
          dealTags: ['B2B'],
          createdAt: new Date('2024-01-15T00:00:00.000Z'),
          deployedReservesCents: 0,
          plannedReservesCents: 0,
          exitMoicBps: null,
          ownershipCurrentPct: '8.5000',
          allocationCapCents: null,
          allocationReason: null,
          allocationIteration: 0,
          lastAllocationAt: null,
          allocationVersion: 1,
        },
      ],
      meta: {
        mode: 'historical',
        requestedAsOf: '2025-03',
        resolvedAsOf: '2025-03-31T23:59:59.999Z',
        source: 'snapshot',
        historicalAvailable: true,
      },
      isLoading: false,
      error: null,
    });

    renderOverviewTab();

    expect(screen.getByText('Historical mode')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: /reset to today/i })[0]!);

    expect(mockSetLocation).toHaveBeenCalledWith('/portfolio?tab=companies', { replace: true });
  });

  it('renders deterministic no-snapshot historical empty state', () => {
    mockUsePortfolioCompanies.mockReturnValue({
      portfolioCompanies: [],
      meta: {
        mode: 'historical',
        requestedAsOf: '2025-03',
        resolvedAsOf: '2025-03',
        source: 'snapshot',
        historicalAvailable: false,
        emptyReason: 'no_snapshot',
      },
      isLoading: false,
      error: null,
    });

    renderOverviewTab();

    expect(screen.getByText('No Historical Snapshot')).toBeTruthy();
    expect(screen.getByText(/there is no historical portfolio snapshot available/i)).toBeTruthy();
  });

  it('submits a live add-company request with the current fund id', async () => {
    mockApiRequest.mockResolvedValue({
      id: 99,
      fundId: 1,
      name: 'Northwind AI',
      sector: 'AI',
      stage: 'Seed',
    });
    mockUsePortfolioCompanies.mockReturnValue({
      portfolioCompanies: [],
      meta: {
        mode: 'live',
        requestedAsOf: null,
        resolvedAsOf: null,
        source: 'live',
        historicalAvailable: false,
      },
      isLoading: false,
      error: null,
    });

    renderOverviewTab();

    fireEvent.click(screen.getByRole('button', { name: /^add company$/i }));
    fireEvent.change(screen.getByLabelText(/company name/i), {
      target: { value: 'Northwind AI' },
    });
    fireEvent.change(screen.getByLabelText(/sector/i), {
      target: { value: 'AI' },
    });
    fireEvent.change(screen.getByLabelText(/initial investment/i), {
      target: { value: '1500000' },
    });

    fireEvent.click(screen.getByRole('button', { name: /create company/i }));

    await waitFor(() =>
      expect(mockApiRequest).toHaveBeenCalledWith('POST', '/api/portfolio-companies', {
        fundId: 1,
        name: 'Northwind AI',
        sector: 'AI',
        stage: 'Seed',
        currentStage: 'Seed',
        investmentAmount: '1500000',
      })
    );
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Company added',
      })
    );
  });

  it('keeps company creation disabled in historical mode', () => {
    mockUsePortfolioCompanies.mockReturnValue({
      portfolioCompanies: [],
      meta: {
        mode: 'historical',
        requestedAsOf: '2025-03',
        resolvedAsOf: '2025-03-31T23:59:59.999Z',
        source: 'snapshot',
        historicalAvailable: true,
      },
      isLoading: false,
      error: null,
    });

    renderOverviewTab();

    expect(screen.getByRole('button', { name: /^add company$/i })).toBeDisabled();
  });
});
