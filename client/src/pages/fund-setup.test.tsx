import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FundSetup from './fund-setup';

const state = vi.hoisted(() => ({
  location: '/fund-setup',
  search: '',
  draftFundId: null as number | null,
  sync: {
    status: 'idle' as 'idle' | 'hydrating' | 'saving' | 'synced' | 'error',
    error: null as string | null,
    retry: vi.fn(),
    isHydrating: false,
  },
  redirectUrl: null as string | null,
  navigate: vi.fn(),
  markStepVisited: vi.fn(),
  emitWizard: vi.fn(),
  progress: vi.fn(),
}));

vi.mock('wouter', () => ({
  useLocation: () => [state.location, state.navigate],
  useSearch: () => state.search,
}));

vi.mock('./FundBasicsStep', () => ({ default: () => <div>Fund Basics Step</div> }));
vi.mock('./InvestmentRoundsStepV2', () => ({ default: () => <div>Investment Rounds Step</div> }));
vi.mock('./CapitalStructureStep', () => ({ default: () => <div>Capital Structure Step</div> }));
vi.mock('./InvestmentStrategyStep', () => ({ default: () => <div>Investment Strategy Step</div> }));
vi.mock('./InvestmentStrategyStepNew', () => ({
  default: () => <div>Investment Strategy New Step</div>,
}));
vi.mock('./DistributionsStep', () => ({ default: () => <div>Distributions Step</div> }));
vi.mock('./CashflowManagementStep', () => ({ default: () => <div>Cashflow Management Step</div> }));
vi.mock('./ReviewStep', () => ({ default: () => <div>Review Step</div> }));
vi.mock('./steps/StepNotFound', () => ({ default: () => <div>Step Not Found</div> }));

vi.mock('@/components/ErrorBoundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/wizard/ModernWizardProgress', () => ({
  ModernWizardProgress: (props: {
    steps: Array<{ id: string; title: string }>;
    currentStepId: string;
  }) => {
    state.progress(props);
    return <div data-testid="wizard-progress">{props.currentStepId}</div>;
  },
}));

vi.mock('@/hooks/useWizardStepGuard', () => ({
  useWizardStepGuard: () => ({
    markStepVisited: state.markStepVisited,
    getRedirectUrl: () => state.redirectUrl,
  }),
}));

vi.mock('@/hooks/useFundDraftSync', () => ({
  useFundDraftSync: () => state.sync,
}));

vi.mock('@/stores/useFundSelector', () => ({
  useFundSelector: (selector: (value: { draftFundId: number | null }) => unknown) =>
    selector({ draftFundId: state.draftFundId }),
}));

vi.mock('@/lib/wizard-telemetry', () => ({
  emitWizard: (...args: unknown[]) => state.emitWizard(...args),
}));

describe('FundSetup', () => {
  beforeEach(() => {
    state.location = '/fund-setup';
    state.search = '';
    state.draftFundId = null;
    state.sync.status = 'idle';
    state.sync.error = null;
    state.sync.isHydrating = false;
    state.redirectUrl = null;
    vi.clearAllMocks();
  });

  it('renders the wizard root without crashing', () => {
    expect(() => render(<FundSetup />)).not.toThrow();
    expect(screen.getByTestId('fund-setup-wizard')).toBeInTheDocument();
  });

  it('renders the first step in its route-scoped container', () => {
    render(<FundSetup />);
    expect(screen.getByTestId('wizard-step-fund-basics-container')).toHaveTextContent(
      'Fund Basics Step'
    );
  });

  it('renders the unified progress component for the active step', () => {
    render(<FundSetup />);
    expect(screen.getByTestId('wizard-progress')).toHaveTextContent('fund-basics');
  });

  it('passes all seven wizard steps to progress', () => {
    render(<FundSetup />);
    expect(state.progress).toHaveBeenCalledWith(
      expect.objectContaining({
        steps: expect.arrayContaining([expect.objectContaining({ id: 'review' })]),
      })
    );
    expect(state.progress.mock.calls[0]?.[0].steps).toHaveLength(7);
  });

  it('marks the first step visited after route resolution', async () => {
    render(<FundSetup />);
    await waitFor(() => expect(state.markStepVisited).toHaveBeenCalledWith(1));
  });

  it('resolves the second step from the query string', () => {
    state.search = 'step=2';
    render(<FundSetup />);
    expect(screen.getByTestId('wizard-step-investment-rounds-container')).toHaveTextContent(
      'Investment Rounds Step'
    );
  });

  it('renders the not-found step for an invalid query step', () => {
    state.search = 'step=99';
    render(<FundSetup />);
    expect(screen.getByText('Step Not Found')).toBeInTheDocument();
  });

  it('redirects when the step guard rejects the route', async () => {
    state.search = 'step=3';
    state.redirectUrl = '/fund-setup?step=1';
    render(<FundSetup />);
    await waitFor(() => expect(state.navigate).toHaveBeenCalledWith('/fund-setup?step=1'));
  });

  it('shows hydration state for a persisted draft', () => {
    state.draftFundId = 42;
    state.sync.isHydrating = true;
    state.sync.status = 'hydrating';
    render(<FundSetup />);
    expect(screen.getByTestId('draft-hydrating')).toBeInTheDocument();
  });

  it('shows draft sync errors', () => {
    state.draftFundId = 42;
    state.sync.status = 'error';
    state.sync.error = 'Draft fetch failed';
    render(<FundSetup />);
    expect(screen.getByTestId('draft-sync-error')).toHaveTextContent('Draft fetch failed');
  });

  it('retries draft sync from the error alert', () => {
    state.draftFundId = 42;
    state.sync.status = 'error';
    state.sync.error = 'Draft fetch failed';
    render(<FundSetup />);
    fireEvent.click(screen.getByRole('button', { name: 'Retry Sync' }));
    expect(state.sync.retry).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['saving', 'Saving authoritative server draft...'],
    ['synced', 'Draft saved'],
  ] as const)('shows %s draft status', (status, label) => {
    state.draftFundId = 42;
    state.sync.status = status;
    render(<FundSetup />);
    expect(screen.getByTestId('draft-sync-status')).toHaveTextContent(label);
  });

  it('emits step-loaded telemetry for the resolved route', async () => {
    render(<FundSetup />);
    await waitFor(() =>
      expect(state.emitWizard).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'step_loaded', step: 'fund-basics' })
      )
    );
  });
});
