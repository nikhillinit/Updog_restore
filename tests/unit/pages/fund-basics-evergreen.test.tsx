import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

const mockNavigate = vi.fn();
vi.mock('wouter', () => ({
  useLocation: () => ['/fund-setup?step=1', mockNavigate],
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: null,
    setCurrentFund: vi.fn(),
  }),
}));

const mockFundState = {
  fundName: 'Evergreen Coverage Fund',
  fundSize: 50_000_000,
  isEvergreen: false,
  fundLife: 10,
  investmentPeriod: 5,
  managementFeeRate: 2,
  carriedInterest: 20,
  establishmentDate: '2026-01-15',
  vintageYear: 2026,
  draftFundId: null as number | null,
  draftServerReady: false,
};

const mockUpdateFundBasics = vi.fn((update: Partial<typeof mockFundState>) => {
  Object.assign(mockFundState, update);
});

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (state: typeof mockFundState) => unknown) => selector(mockFundState),
  useFundAction: (
    selector: (actions: {
      updateFundBasics: typeof mockUpdateFundBasics;
      setDraftFundId: (value: number | null) => void;
      setDraftServerReady: (value: boolean) => void;
    }) => unknown
  ) =>
    selector({
      updateFundBasics: mockUpdateFundBasics,
      setDraftFundId: vi.fn(),
      setDraftServerReady: vi.fn(),
    }),
}));

vi.mock('@/stores/fundStore', () => ({
  fundStore: {
    getState: () => mockFundState,
  },
}));

vi.mock('@/services/funds', () => ({
  createFund: vi.fn(),
  normalizeCreateFundResponse: vi.fn(),
}));

vi.mock('@/services/fund-drafts', () => ({
  saveFundDraft: vi.fn(),
}));

import FundBasicsStep from '@/pages/FundBasicsStep';

function renderFundBasicsStep() {
  return render(<FundBasicsStep />);
}

describe('FundBasicsStep evergreen controls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFundState.isEvergreen = false;
    mockFundState.fundLife = 10;
    mockFundState.investmentPeriod = 5;
  });

  it('renders the current closed-end defaults', () => {
    renderFundBasicsStep();

    expect(screen.getByRole('switch', { name: /evergreen fund structure/i })).not.toBeChecked();
    expect(screen.getByLabelText(/fund life \(years\)/i)).toHaveValue(10);
    expect(screen.getByLabelText(/investment period \(years\)/i)).toHaveValue(5);
  });

  it('shows closed-end fields while evergreen is off', () => {
    renderFundBasicsStep();

    expect(screen.getByLabelText(/fund life \(years\)/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/investment period \(years\)/i)).toBeInTheDocument();
  });

  it('hides closed-end fields after enabling evergreen mode', () => {
    const view = renderFundBasicsStep();

    fireEvent.click(screen.getByRole('switch', { name: /evergreen fund structure/i }));
    view.rerender(<FundBasicsStep />);

    expect(mockUpdateFundBasics).toHaveBeenCalledWith({ isEvergreen: true });
    expect(screen.queryByLabelText(/fund life \(years\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/investment period \(years\)/i)).not.toBeInTheDocument();
  });
});
