import React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fundStore } from '@/stores/fundStore';

const mockLocation = { value: '/fund-setup?step=1' };
const mockSetLocation = vi.fn((next: string) => {
  mockLocation.value = next;
});
const mockMarkStepVisited = vi.fn();
const mockFetchFundDraft = vi.fn();
const mockSaveFundDraft = vi.fn();

vi.mock('wouter', () => ({
  useLocation: () => [mockLocation.value.split('?')[0] ?? mockLocation.value, mockSetLocation],
  useSearch: () => mockLocation.value.split('?')[1] ?? '',
}));

vi.mock('@/pages/FundBasicsStep', () => ({ default: () => 'Fund Basics Step' }));
vi.mock('@/pages/InvestmentRoundsStepV2', () => ({ default: () => 'Investment Rounds Step' }));
vi.mock('@/pages/CapitalStructureStep', () => ({ default: () => 'Capital Structure Step' }));
vi.mock('@/pages/InvestmentStrategyStep', () => ({ default: () => 'Investment Strategy Step' }));
vi.mock('@/pages/InvestmentStrategyStepNew', () => ({
  default: () => 'Investment Strategy New Step',
}));
vi.mock('@/pages/DistributionsStep', () => ({ default: () => 'Distributions Step' }));
vi.mock('@/pages/CashflowManagementStep', () => ({ default: () => 'Cashflow Management Step' }));
vi.mock('@/pages/ReviewStep', () => ({ default: () => 'Review Step' }));
vi.mock('@/pages/steps/StepNotFound', () => ({ default: () => 'Step Not Found' }));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock('@/components/wizard/ModernWizardProgress', () => ({
  ModernWizardProgress: () => 'Wizard Progress',
}));

vi.mock('@/hooks/useWizardStepGuard', () => ({
  useWizardStepGuard: () => ({
    markStepVisited: mockMarkStepVisited,
    getRedirectUrl: () => null,
  }),
}));

vi.mock('@/lib/wizard-telemetry', () => ({
  emitWizard: vi.fn(),
}));

vi.mock('@/services/fund-drafts', () => ({
  fetchFundDraft: (...args: unknown[]) => mockFetchFundDraft(...args),
  saveFundDraft: (...args: unknown[]) => mockSaveFundDraft(...args),
}));

describe('FundSetup draft sync', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockLocation.value = '/fund-setup?step=1';
    mockSetLocation.mockReset();
    mockMarkStepVisited.mockReset();
    mockFetchFundDraft.mockReset();
    mockSaveFundDraft.mockReset();
    localStorage.clear();

    const initialState = fundStore.getInitialState();
    act(() => {
      fundStore.setState(
        {
          ...initialState,
          hydrated: true,
          draftFundId: null,
          draftServerReady: false,
        },
        true
      );
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders a fresh wizard without a draft-sync alert or draft service calls', async () => {
    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expect(screen.getByText('Fund Basics Step')).toBeInTheDocument();
    expect(screen.queryByTestId('draft-sync-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('draft-sync-status')).not.toBeInTheDocument();
    expect(mockFetchFundDraft).not.toHaveBeenCalled();
    expect(mockSaveFundDraft).not.toHaveBeenCalled();
  });

  it('hydrates a recovered authoritative draft from the server before rendering the routed step', async () => {
    mockFetchFundDraft.mockResolvedValue({
      fundName: 'Server Fund',
      fundSize: 123_000_000,
      managementFeeRate: 2,
      carriedInterest: 20,
      stages: [{ id: 'srv-stage', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      sectorProfiles: [{ id: 'srv-sector', name: 'FinTech', targetPercentage: 100 }],
      allocations: [{ id: 'srv-alloc', category: 'New Investments', percentage: 100 }],
      followOnChecks: { A: 100, B: 200, C: 300 },
    });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Local Cache Fund',
        draftFundId: 88,
        draftServerReady: true,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    expect(screen.getByTestId('draft-hydrating')).toBeInTheDocument();

    await waitFor(() => {
      expect(mockFetchFundDraft).toHaveBeenCalledWith(88);
    });

    await waitFor(() => {
      expect(screen.getByText('Fund Basics Step')).toBeInTheDocument();
    });

    expect(fundStore.getState().fundName).toBe('Server Fund');
    expect(fundStore.getState().draftServerReady).toBe(true);
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Draft saved to server');
  });

  it('autosaves the routed wizard to the server after draft identity bootstrap', async () => {
    mockSaveFundDraft.mockResolvedValue({ success: true });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Initial Draft',
        draftFundId: 55,
        draftServerReady: false,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        fundName: 'Changed Draft Name',
      });
    });

    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent(
      'Saving authoritative server draft...'
    );

    await waitFor(() => {
      expect(mockSaveFundDraft).toHaveBeenCalledWith(
        55,
        expect.objectContaining({ fundName: 'Changed Draft Name' })
      );
    });

    expect(fundStore.getState().draftServerReady).toBe(true);
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent('Draft saved to server');
  });

  it('retries authoritative draft hydration when the initial server load fails', async () => {
    mockFetchFundDraft.mockRejectedValueOnce(new Error('Draft load failed')).mockResolvedValueOnce({
      fundName: 'Recovered Fund',
      fundSize: 75_000_000,
      stages: [{ id: 'recovered-stage', name: 'Seed', graduate: 30, exit: 10, months: 18 }],
      sectorProfiles: [{ id: 'recovered-sector', name: 'AI', targetPercentage: 100 }],
      allocations: [{ id: 'recovered-alloc', category: 'New Investments', percentage: 100 }],
      followOnChecks: { A: 10, B: 20, C: 30 },
    });

    act(() => {
      fundStore.setState({
        ...fundStore.getState(),
        draftFundId: 90,
        draftServerReady: true,
      });
    });

    const { default: FundSetup } = await import('@/pages/fund-setup');
    render(<FundSetup />);

    await waitFor(() => {
      expect(screen.getByTestId('draft-sync-error')).toHaveTextContent('Draft load failed');
    });

    await userEvent.click(screen.getByRole('button', { name: 'Retry Sync' }));

    await waitFor(() => {
      expect(mockFetchFundDraft).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(screen.getByText('Fund Basics Step')).toBeInTheDocument();
    });

    expect(fundStore.getState().fundName).toBe('Recovered Fund');
  });
});
