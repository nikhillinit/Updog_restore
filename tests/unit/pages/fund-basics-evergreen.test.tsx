import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  bindFundWorkspaceActor,
  fundStore,
  resetFundWorkspace,
  unbindFundWorkspaceActor,
} from '@/stores/fundStore';

const TEST_ACTOR_ID = 'fund-basics-evergreen-user';

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

vi.mock('@/services/funds', () => ({
  createFund: vi.fn(),
  handleCredentialRenewalMarker: vi.fn(() => false),
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
  beforeEach(async () => {
    vi.clearAllMocks();
    resetFundWorkspace();
    await bindFundWorkspaceActor(TEST_ACTOR_ID);
    fundStore.setState({
      fundName: 'Evergreen Coverage Fund',
      fundSize: 50_000_000,
      isEvergreen: false,
      fundLife: 10,
      investmentPeriod: 5,
      managementFeeRate: 2,
      carriedInterest: 20,
      establishmentDate: '2026-01-15',
      modelInputsAsOfDate: '2026-09-12',
      vintageYear: 2026,
      hydrated: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    unbindFundWorkspaceActor();
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
    renderFundBasicsStep();

    fireEvent.click(screen.getByRole('switch', { name: /evergreen fund structure/i }));

    expect(fundStore.getState().isEvergreen).toBe(true);
    expect(screen.queryByLabelText(/fund life \(years\)/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/investment period \(years\)/i)).not.toBeInTheDocument();
  });
});
