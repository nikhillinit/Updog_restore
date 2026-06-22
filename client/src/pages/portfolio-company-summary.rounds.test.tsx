import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import PortfolioCompanySummaryPage from './portfolio-company-summary';
import { usePortfolioCompany } from '@/hooks/use-fund-data';
import { useFlag } from '@/shared/useFlags';

vi.mock('wouter', () => ({
  useRoute: () => [true, { id: '42' }],
  useLocation: () => ['/portfolio/company/42', vi.fn()],
}));
vi.mock('@/contexts/FundContext', () => ({ useFundContext: () => ({ fundId: 7 }) }));
vi.mock('@/hooks/use-fund-data', () => ({ usePortfolioCompany: vi.fn() }));
vi.mock('@/shared/useFlags', () => ({ useFlag: vi.fn() }));
vi.mock('@/components/investments/investment-rounds-section', () => ({
  InvestmentRoundsSection: () => <div data-testid="rounds-section" />,
}));

const mockCompany = vi.mocked(usePortfolioCompany);
const mockFlag = vi.mocked(useFlag);

beforeEach(() => {
  mockCompany.mockReturnValue({
    company: {
      id: 42,
      name: 'Acme',
      sector: 'SaaS',
      stage: 'Series A',
      status: 'active',
      investmentAmount: '1000',
      currentValuation: '2000',
      fundId: 7,
    } as never,
    isLoading: false,
    error: null,
  });
});

describe('PortfolioCompanySummaryPage rounds mount', () => {
  it('renders the section when the flag is on', () => {
    mockFlag.mockReturnValue(true);
    render(<PortfolioCompanySummaryPage />);
    expect(screen.getByTestId('rounds-section')).toBeInTheDocument();
  });

  it('hides the section when the flag is off', () => {
    mockFlag.mockReturnValue(false);
    render(<PortfolioCompanySummaryPage />);
    expect(screen.queryByTestId('rounds-section')).toBeNull();
  });
});
