import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioCompanySummaryPage from '../../../client/src/pages/portfolio-company-summary';
import { ApiError } from '../../../client/src/lib/queryClient';
import { TestQueryClientProvider } from '../../utils/test-query-client';

const mocks = vi.hoisted(() => ({
  fundId: 1 as number | null,
  currentFund: { id: 1, name: 'Test Fund I' } as { id: number; name: string } | null,
  location: '/portfolio/company/1',
  routeId: '1',
  setLocation: vi.fn(),
  usePortfolioCompany: vi.fn(),
  usePortfolioOverview: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: mocks.fundId, currentFund: mocks.currentFund }),
}));

vi.mock('@/hooks/use-fund-data', () => ({
  usePortfolioCompany: (...args: unknown[]) => mocks.usePortfolioCompany(...args),
  usePortfolioOverview: (...args: unknown[]) => mocks.usePortfolioOverview(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => [mocks.location, mocks.setLocation],
  useRoute: () => [true, { id: mocks.routeId }],
}));

function renderPage() {
  return render(
    <TestQueryClientProvider>
      <PortfolioCompanySummaryPage />
    </TestQueryClientProvider>
  );
}

describe('PortfolioCompanySummaryPage', () => {
  beforeEach(() => {
    mocks.fundId = 1;
    mocks.currentFund = { id: 1, name: 'Test Fund I' };
    mocks.location = '/portfolio/company/1';
    mocks.routeId = '1';
    vi.clearAllMocks();
    mocks.usePortfolioCompany.mockReturnValue({
      company: {
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
        ownershipCurrentPct: '0.085',
        allocationCapCents: null,
        allocationReason: null,
        allocationIteration: 0,
        lastAllocationAt: null,
        allocationVersion: 1,
      },
      isLoading: false,
      error: null,
    });
    mocks.usePortfolioOverview.mockReturnValue({
      data: {
        companies: [
          {
            id: 1,
            name: 'TechCorp',
            sector: 'Fintech',
            stage: 'Series B',
            status: 'Growing',
            invested: '5000000',
            currentValue: '5000000',
            moic: '1',
          },
        ],
      },
    });
  });

  it('navigates back to the mounted portfolio surface without tab coupling', () => {
    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /back to companies/i }));

    expect(mocks.setLocation).toHaveBeenCalledWith('/portfolio');
  });

  it('renders the missing-fund guard when no fund is selected', () => {
    mocks.fundId = null;

    renderPage();

    expect(screen.getByText('Select a fund to view company details.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to companies/i }));
    expect(mocks.setLocation).toHaveBeenCalledWith('/portfolio');
    expect(mocks.usePortfolioCompany).toHaveBeenCalledWith(undefined, 1);
  });

  it('renders the invalid-route guard for a non-numeric company id', () => {
    mocks.location = '/portfolio/company/not-a-number';
    mocks.routeId = 'not-a-number';

    renderPage();

    expect(screen.getByText('The requested company detail route is invalid.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /back to companies/i }));
    expect(mocks.setLocation).toHaveBeenCalledWith('/portfolio');
    expect(mocks.usePortfolioCompany).toHaveBeenCalledWith(1, undefined);
  });

  it('renders the not-found state when the selected-fund lookup returns 404', () => {
    mocks.usePortfolioCompany.mockReturnValue({
      company: null,
      isLoading: false,
      error: new ApiError(404, 'Company not found'),
    });

    renderPage();

    expect(
      screen.getByText('The requested company could not be found in the selected fund.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /return to the portfolio companies surface/i })
    ).toBeInTheDocument();
  });

  it('renders the transient API error state for non-404 failures', () => {
    mocks.usePortfolioCompany.mockReturnValue({
      company: null,
      isLoading: false,
      error: new ApiError(503, 'Service temporarily unavailable'),
    });

    renderPage();

    expect(
      screen.getByText('Company details are temporarily unavailable. Please try again.')
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /return to the portfolio companies surface/i })
    ).toBeInTheDocument();
  });

  it('uses the portfolio overview position value and MOIC rather than gross company valuation', () => {
    renderPage();

    expect(screen.getByText('Current position value')).toBeInTheDocument();
    expect(screen.getAllByText('$5,000,000')).toHaveLength(2);
    expect(screen.getByText('1.00x')).toBeInTheDocument();
    expect(screen.queryByText('$12,500,000')).not.toBeInTheDocument();
    expect(screen.getByText('8.50%')).toBeInTheDocument();
    expect(screen.getByText('Test Fund I')).toBeInTheDocument();
  });
});
