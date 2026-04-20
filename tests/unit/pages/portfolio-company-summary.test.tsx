import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PortfolioCompanySummaryPage from '../../../client/src/pages/portfolio-company-summary';
import { TestQueryClientProvider } from '../../utils/test-query-client';

const mockSetLocation = vi.fn();
const mockUsePortfolioCompany = vi.fn();

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ fundId: 1 }),
}));

vi.mock('@/hooks/use-fund-data', () => ({
  usePortfolioCompany: (...args: unknown[]) => mockUsePortfolioCompany(...args),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/portfolio/company/1', mockSetLocation],
  useRoute: () => [true, { id: '1' }],
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
    vi.clearAllMocks();
  });

  it('navigates back to the mounted portfolio surface without tab coupling', () => {
    mockUsePortfolioCompany.mockReturnValue({
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
        ownershipCurrentPct: '8.5000',
        allocationCapCents: null,
        allocationReason: null,
        allocationIteration: 0,
        lastAllocationAt: null,
        allocationVersion: 1,
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(screen.getByRole('button', { name: /back to companies/i }));

    expect(mockSetLocation).toHaveBeenCalledWith('/portfolio');
  });
});
