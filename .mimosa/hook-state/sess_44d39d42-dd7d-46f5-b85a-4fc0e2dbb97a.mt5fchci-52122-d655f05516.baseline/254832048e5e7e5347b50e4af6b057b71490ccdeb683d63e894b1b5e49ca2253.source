import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentFundId: 1,
  currentFundName: 'Fund I',
  performAnalysisPending: false,
  performAnalysisMutateAsync: vi.fn(),
  createBaselineMutateAsync: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({
    currentFund: { id: mocks.currentFundId, name: mocks.currentFundName, size: 100_000_000 },
  }),
}));

vi.mock('@/hooks/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/hooks/useFundMetrics', () => ({
  useFundMetrics: () => ({
    data: {
      actual: {
        totalCommitted: 100_000_000,
        totalDeployed: 25_000_000,
        totalUncalled: 50_000_000,
      },
      variance: { deploymentVariance: { target: 40_000_000 } },
      _status: { engines: { target: 'success', variance: 'success' } },
    },
    isLoading: false,
  }),
}));

vi.mock('@/components/analytics', () => ({
  DashboardLoadingState: () => <div>Loading variance dashboard</div>,
  ErrorState: ({ title }: { title: string }) => <div>{title}</div>,
  ApiErrorState: () => <div>Unable to load variance dashboard</div>,
  StatCardGrid: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="stat-card-grid">{children}</div>
  ),
  StatCard: ({
    title,
    value,
    description,
  }: {
    title: string;
    value: React.ReactNode;
    description?: string;
  }) => (
    <section aria-label={title} data-testid={`stat-${title}`}>
      <h3>{title}</h3>
      <div>{value}</div>
      {description ? <p>{description}</p> : null}
    </section>
  ),
}));

function createMutation(
  overrides: { isPending?: boolean; mutateAsync?: () => Promise<unknown> } = {}
) {
  return {
    isPending: overrides.isPending ?? false,
    mutate: vi.fn(),
    mutateAsync: overrides.mutateAsync ?? vi.fn().mockResolvedValue({ success: true }),
  };
}

vi.mock('@/hooks/useVarianceData', () => ({
  useVarianceDashboard: () => ({
    data: {
      success: true,
      data: {
        summary: {
          totalActiveAlerts: 0,
          totalBaselines: 0,
          lastAnalysisDate: null,
        },
        alertsBySeverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
      },
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useBaselines: () => ({
    data: { success: true, data: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useActiveAlerts: () => ({
    data: { success: true, data: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useVarianceReports: () => ({ data: { success: true, data: [] }, isLoading: false, error: null }),
  useVarianceReport: () => ({ data: { success: true, data: null }, isLoading: false }),
  useCreateBaseline: () =>
    createMutation({ mutateAsync: mocks.createBaselineMutateAsync as () => Promise<unknown> }),
  useSetDefaultBaseline: () => createMutation(),
  useDeactivateBaseline: () => createMutation(),
  useCreateAlertRule: () => createMutation(),
  useAcknowledgeAlert: () => createMutation(),
  useResolveAlert: () => createMutation(),
  usePerformVarianceAnalysis: () =>
    createMutation({
      isPending: mocks.performAnalysisPending,
      mutateAsync: mocks.performAnalysisMutateAsync as () => Promise<unknown>,
    }),
  useGenerateVarianceReport: () => createMutation(),
}));

describe('VarianceTrackingPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.replaceState(null, '', '/');
    mocks.currentFundId = 1;
    mocks.currentFundName = 'Fund I';
    mocks.performAnalysisPending = false;
    mocks.performAnalysisMutateAsync.mockReset();
    mocks.performAnalysisMutateAsync.mockResolvedValue({
      data: { alertsGenerated: [] },
    });
    mocks.createBaselineMutateAsync.mockReset();
    mocks.createBaselineMutateAsync.mockResolvedValue({ success: true });
    mocks.toast.mockReset();
  });

  it('places tab navigation before overview metric rows', async () => {
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    const tablist = screen.getByRole('tablist');
    const statusMetric = screen.getByTestId('stat-Analysis Status');

    expect(tablist.compareDocumentPosition(statusMetric) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('does not show Not Run while analysis is pending', async () => {
    mocks.performAnalysisPending = true;
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    expect(screen.getAllByText('Analyzing...').length).toBeGreaterThan(0);
    expect(screen.getByTestId('stat-Analysis Status')).toHaveTextContent('Running');
    expect(screen.queryByText('Not Run')).not.toBeInTheDocument();
  });

  it('has an explicit settings save action with feedback', async () => {
    const user = userEvent.setup();
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    expect(screen.getByText('Settings saved in this browser.')).toBeInTheDocument();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Settings saved',
      })
    );
  });

  it('persists settings locally with accessible control names', async () => {
    const user = userEvent.setup();
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    const { unmount } = render(<VarianceTrackingPage />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));

    const dailyDigest = screen.getByRole('switch', { name: 'Daily Digest' });
    const emailNotifications = screen.getByRole('switch', { name: 'Email Notifications' });
    const realtimeAlerts = screen.getByRole('switch', { name: 'Real-time Alerts' });
    const thresholdInput = screen.getByRole('spinbutton', {
      name: 'Default Variance Threshold (%)',
    });
    const frequencySelect = screen.getByRole('combobox', { name: 'Analysis Frequency' });

    expect(emailNotifications).toHaveAttribute('aria-checked', 'true');
    expect(realtimeAlerts).toHaveAttribute('aria-checked', 'true');
    expect(dailyDigest).toHaveAttribute('aria-checked', 'false');
    expect(thresholdInput).toHaveValue(10);
    expect(frequencySelect).toHaveTextContent('Daily');

    await user.click(dailyDigest);
    await user.clear(thresholdInput);
    await user.type(thresholdInput, '15');
    await user.click(screen.getByRole('button', { name: 'Save Settings' }));

    unmount();
    render(<VarianceTrackingPage />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));

    expect(screen.getByRole('switch', { name: 'Daily Digest' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByRole('spinbutton', { name: 'Default Variance Threshold (%)' })).toHaveValue(
      15
    );
  });

  it('preserves unsaved settings drafts per fund instead of discarding them on fund switch', async () => {
    const user = userEvent.setup();
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    const { rerender } = render(<VarianceTrackingPage />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    await user.click(screen.getByRole('switch', { name: 'Daily Digest' }));
    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument();

    mocks.currentFundId = 2;
    mocks.currentFundName = 'Fund II';
    rerender(<VarianceTrackingPage />);

    expect(screen.getByRole('switch', { name: 'Daily Digest' })).toHaveAttribute(
      'aria-checked',
      'false'
    );

    mocks.currentFundId = 1;
    mocks.currentFundName = 'Fund I';
    rerender(<VarianceTrackingPage />);

    expect(screen.getByRole('switch', { name: 'Daily Digest' })).toHaveAttribute(
      'aria-checked',
      'true'
    );
    expect(screen.getByText('Unsaved changes.')).toBeInTheDocument();
  });
});
