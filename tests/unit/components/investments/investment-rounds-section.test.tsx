import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvestmentRoundsSection } from '@/components/investments/investment-rounds-section';
import { useCompanyInvestments } from '@/hooks/useCompanyInvestments';
import { useInvestmentRounds } from '@/hooks/useInvestmentRounds';

vi.mock('@/hooks/useCompanyInvestments', () => ({ useCompanyInvestments: vi.fn() }));
vi.mock('@/hooks/useInvestmentRounds', () => ({ useInvestmentRounds: vi.fn() }));
vi.mock('@/components/investments/new-round-dialog', () => ({
  default: () => <div data-testid="round-dialog" />,
}));

const mockInvestments = vi.mocked(useCompanyInvestments);
const mockRounds = vi.mocked(useInvestmentRounds);

beforeEach(() => {
  mockInvestments.mockReset();
  mockRounds.mockReset();
  mockRounds.mockReturnValue({ rounds: [], isLoading: false, error: null });
});

describe('InvestmentRoundsSection', () => {
  it('shows the no-investment empty state', () => {
    mockInvestments.mockReturnValue({ investments: [], isLoading: false, error: null });
    render(<InvestmentRoundsSection fundId={7} companyId={42} />);
    expect(screen.getByText(/nothing to attach a round to/i)).toBeInTheDocument();
  });

  it('auto-selects the single investment and lists rounds', () => {
    mockInvestments.mockReturnValue({
      investments: [{ id: 5, round: 'Seed', amount: '1000', companyId: 42, fundId: 7 }] as never,
      isLoading: false,
      error: null,
    });
    render(<InvestmentRoundsSection fundId={7} companyId={42} />);
    expect(mockRounds).toHaveBeenCalledWith(5);
    expect(screen.getByText(/investment rounds/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^investment$/i)).toBeNull();
  });

  it('renders an investment picker when there are several', () => {
    mockInvestments.mockReturnValue({
      investments: [
        { id: 5, round: 'Seed', amount: '1000', companyId: 42, fundId: 7 },
        { id: 6, round: 'Series A', amount: '5000', companyId: 42, fundId: 7 },
      ] as never,
      isLoading: false,
      error: null,
    });
    render(<InvestmentRoundsSection fundId={7} companyId={42} />);
    expect(screen.getByLabelText(/^investment$/i)).toBeInTheDocument();
    expect(screen.getByText(/select an investment to view/i)).toBeInTheDocument();
  });
});
