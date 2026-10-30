import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type React from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  currentFundId: 1,
  currentFundName: 'Fund I',
  performAnalysisPending: false,
  performAnalysisMutateAsync: vi.fn(),
  createBaselineMutateAsync: vi.fn(),
  toast: vi.fn(),
  alertsError: null as Error | null,
  alertsAwaitingResponse: false,
  refetchAlerts: vi.fn(),
  dashboardResponse: undefined as unknown,
  dashboardError: null as Error | null,
  varianceReports: [] as unknown[],
}));

const DEFAULT_BASELINE = {
  id: '00000000-0000-0000-0000-000000000121',
  fundId: 1,
  name: 'Q4 2024 Quarterly Baseline',
  isDefault: true,
};

function dashboardResponse({
  defaultBaseline = null,
  lastAnalysisDate = null,
  overallRiskLevel = 'low',
}: {
  defaultBaseline?: typeof DEFAULT_BASELINE | null;
  lastAnalysisDate?: string | null;
  overallRiskLevel?: 'low' | 'medium' | 'high' | 'critical';
} = {}) {
  return {
    success: true,
    data: {
      defaultBaseline,
      recentBaselines: defaultBaseline ? [defaultBaseline] : [],
      activeAlerts: [],
      alertsBySeverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
      summary: {
        totalActiveAlerts: 0,
        totalBaselines: defaultBaseline ? 1 : 0,
        lastAnalysisDate,
        overallRiskLevel,
        trendDirection: 'stable',
      },
      recentReports: [],
    },
  };
}

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
  useConstructionReconciliation: () => ({
    latest: {
      data: { state: 'no_persisted_reconciliation' },
      isLoading: false,
      error: null,
    },
    run: createMutation(),
  }),
  useVarianceDashboard: () => ({
    data: mocks.dashboardResponse,
    isLoading: false,
    error: mocks.dashboardError,
    refetch: vi.fn(),
  }),
  useBaselines: () => ({
    data: { success: true, data: [] },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useActiveAlerts: () => ({
    data:
      mocks.alertsError || mocks.alertsAwaitingResponse
        ? undefined
        : { success: true, data: [], count: 0 },
    isLoading: false,
    error: mocks.alertsError,
    refetch: mocks.refetchAlerts,
  }),
  useVarianceReports: () => ({
    data: { success: true, data: mocks.varianceReports },
    isLoading: false,
    error: null,
  }),
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

vi.mock('@/hooks/useCurrentPlanVersions', () => ({
  useCurrentPlanVersions: () => ({
    headVersion: { id: '11', sourceFactsSnapshotId: '31' },
    isLoading: false,
    error: null,
    mint: createMutation(),
  }),
}));

describe('VarianceTrackingPage', () => {
  beforeAll(() => {
    // Radix Select needs pointer-capture and scroll APIs that jsdom lacks.
    for (const name of [
      'hasPointerCapture',
      'setPointerCapture',
      'releasePointerCapture',
    ] as const) {
      if (!Element.prototype[name]) {
        Object.defineProperty(Element.prototype, name, { value: () => false, configurable: true });
      }
    }
    if (!Element.prototype.scrollIntoView) {
      Object.defineProperty(Element.prototype, 'scrollIntoView', {
        value: () => undefined,
        configurable: true,
      });
    }
  });

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
    mocks.alertsError = null;
    mocks.alertsAwaitingResponse = false;
    mocks.refetchAlerts.mockReset();
    mocks.dashboardResponse = dashboardResponse();
    mocks.dashboardError = null;
    mocks.varianceReports = [];
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

  it('renders unsupported settings as unavailable without saving browser preferences', async () => {
    const user = userEvent.setup();
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    await user.click(screen.getByRole('tab', { name: 'Settings' }));
    expect(screen.getByText(/configuration are unavailable/i)).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Email Notifications' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Real-time Alerts' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Daily Digest' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save Settings' })).toBeDisabled();
    expect(window.localStorage.getItem('variance-tracking-settings')).toBeNull();
    expect(mocks.toast).not.toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Settings saved' })
    );
  });

  it('shows Alerts unavailable with a retry instead of empty-state copy in both alert scopes', async () => {
    mocks.alertsError = new Error('500: alerts failed');
    window.history.replaceState(null, '', '/?tab=alerts');
    const user = userEvent.setup();
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    expect(screen.getByText('Alerts unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No Current-Baseline Alerts')).not.toBeInTheDocument();
    expect(screen.queryByText('No open alerts returned for this scope.')).not.toBeInTheDocument();
    expect(screen.queryByText(/acceptable variance/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mocks.refetchAlerts).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'All open incidents' }));

    expect(screen.getByText('Alerts unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No Open Alerts')).not.toBeInTheDocument();
    expect(
      screen.queryByText('There are no open incidents across current or historical baselines.')
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mocks.refetchAlerts).toHaveBeenCalledTimes(2);
  });

  it('does not read a failed alerts request as no recent alerts on the overview', async () => {
    mocks.alertsError = new Error('500: alerts failed');
    const user = userEvent.setup();
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    expect(screen.getByText('Alerts unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No recent alerts')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /retry/i }));
    expect(mocks.refetchAlerts).toHaveBeenCalledTimes(1);
  });

  it('keeps the neutral current-scope sentence when the dashboard has not answered', async () => {
    // A paused dashboard query has neither data nor an error. A dashboard error
    // replaces the whole page, so this is the reachable non-success state.
    mocks.dashboardResponse = undefined;
    window.history.replaceState(null, '', '/?tab=alerts');
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    expect(screen.getByText('No Current-Baseline Alerts')).toBeInTheDocument();
    expect(screen.getByText('No open alerts returned for this scope.')).toBeInTheDocument();
    expect(screen.queryByText('No baseline')).not.toBeInTheDocument();
    expect(screen.queryByText('Not analyzed')).not.toBeInTheDocument();
    expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/acceptable variance/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Alerts unavailable')).not.toBeInTheDocument();
  });

  it('shows no empty-alert copy before any alerts response arrives', async () => {
    mocks.alertsAwaitingResponse = true;
    window.history.replaceState(null, '', '/?tab=alerts');
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    expect(screen.queryByText('No Current-Baseline Alerts')).not.toBeInTheDocument();
    expect(screen.queryByText('No open alerts returned for this scope.')).not.toBeInTheDocument();
    expect(screen.queryByText('No baseline')).not.toBeInTheDocument();
    expect(screen.queryByText('Alerts unavailable')).not.toBeInTheDocument();
  });

  it('shows no recent-alerts empty copy on the overview before any alerts response arrives', async () => {
    mocks.alertsAwaitingResponse = true;
    const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
    render(<VarianceTrackingPage />);

    expect(screen.queryByText('No recent alerts')).not.toBeInTheDocument();
  });

  describe('current-baseline analysis state (exact default baseline)', () => {
    async function renderAlertsTab() {
      window.history.replaceState(null, '', '/?tab=alerts');
      const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
      render(<VarianceTrackingPage />);
    }

    function expectNoAnalysisClaims() {
      expect(screen.queryByText('No open alerts returned for this scope.')).not.toBeInTheDocument();
      expect(screen.queryByText(/acceptable variance/i)).not.toBeInTheDocument();
    }

    it('renders No baseline when the dashboard has no default baseline', async () => {
      mocks.dashboardResponse = dashboardResponse({ defaultBaseline: null });
      await renderAlertsTab();

      expect(screen.getByText('No Current-Baseline Alerts')).toBeInTheDocument();
      expect(screen.getByText('No baseline')).toBeInTheDocument();
      expect(screen.queryByText('Not analyzed')).not.toBeInTheDocument();
      expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
      expectNoAnalysisClaims();
    });

    it('renders Not analyzed when no report matches the current default baseline', async () => {
      mocks.dashboardResponse = dashboardResponse({
        defaultBaseline: DEFAULT_BASELINE,
        lastAnalysisDate: null,
      });
      await renderAlertsTab();

      expect(screen.getByText('Not analyzed')).toBeInTheDocument();
      expect(screen.queryByText('No baseline')).not.toBeInTheDocument();
      expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
      expectNoAnalysisClaims();
    });

    it('ignores newer client-list reports for other baselines', async () => {
      mocks.dashboardResponse = dashboardResponse({
        defaultBaseline: DEFAULT_BASELINE,
        lastAnalysisDate: null,
      });
      mocks.varianceReports = [
        {
          id: 'report-other-baseline',
          baselineId: '00000000-0000-0000-0000-000000000199',
          reportName: 'Other Baseline Report',
          reportType: 'periodic',
          generatedAt: '2026-03-31T12:00:00.000Z',
          summary: { totalVariances: 3, significantVariances: 1, criticalVariances: 0 },
        },
      ];
      await renderAlertsTab();

      expect(screen.getByText('Not analyzed')).toBeInTheDocument();
      expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
    });

    it('renders the dated factual sentence when the current baseline was analyzed', async () => {
      mocks.dashboardResponse = dashboardResponse({
        defaultBaseline: DEFAULT_BASELINE,
        lastAnalysisDate: '2025-01-15T12:00:00.000Z',
      });
      const user = userEvent.setup();
      await renderAlertsTab();

      expect(
        screen.getByText('No open alerts for the current baseline. Last analyzed Jan 15, 2025.')
      ).toBeInTheDocument();
      expect(screen.queryByText('No baseline')).not.toBeInTheDocument();
      expect(screen.queryByText('Not analyzed')).not.toBeInTheDocument();
      expectNoAnalysisClaims();

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'All open incidents' }));

      expect(
        screen.getByText('There are no open incidents across current or historical baselines.')
      ).toBeInTheDocument();
      expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
    });

    it('states facts only for a resolved high-risk analysis', async () => {
      mocks.dashboardResponse = dashboardResponse({
        defaultBaseline: DEFAULT_BASELINE,
        lastAnalysisDate: '2025-01-15T12:00:00.000Z',
        overallRiskLevel: 'high',
      });
      await renderAlertsTab();

      expect(
        screen.getByText('No open alerts for the current baseline. Last analyzed Jan 15, 2025.')
      ).toBeInTheDocument();
      expectNoAnalysisClaims();
      expect(screen.queryByText(/within (tolerance|threshold)/i)).not.toBeInTheDocument();
    });

    it('never reads a failed alerts query as no alerts for an analyzed baseline', async () => {
      mocks.dashboardResponse = dashboardResponse({
        defaultBaseline: DEFAULT_BASELINE,
        lastAnalysisDate: '2025-01-15T12:00:00.000Z',
      });
      mocks.alertsError = new Error('500: alerts failed');
      await renderAlertsTab();

      expect(screen.getByText('Alerts unavailable')).toBeInTheDocument();
      expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
      expect(screen.queryByText('Not analyzed')).not.toBeInTheDocument();
    });

    it('shows the dashboard error and no analysis-state copy when the dashboard fails', async () => {
      mocks.dashboardResponse = undefined;
      mocks.dashboardError = new Error('500: dashboard failed');
      await renderAlertsTab();

      expect(screen.getByText('Unable to load variance dashboard')).toBeInTheDocument();
      expect(screen.queryByText('No baseline')).not.toBeInTheDocument();
      expect(screen.queryByText('Not analyzed')).not.toBeInTheDocument();
      expect(screen.queryByText(/Last analyzed/)).not.toBeInTheDocument();
    });

    it('labels the overview analysis stats as current-baseline values', async () => {
      mocks.dashboardResponse = dashboardResponse({
        defaultBaseline: DEFAULT_BASELINE,
        lastAnalysisDate: null,
      });
      const { default: VarianceTrackingPage } = await import('@/pages/variance-tracking');
      render(<VarianceTrackingPage />);

      const lastAnalysis = screen.getByTestId('stat-Last Analysis');
      expect(within(lastAnalysis).getByText('Never')).toBeInTheDocument();
      expect(
        within(lastAnalysis).getByText('Latest analysis for the current baseline')
      ).toBeInTheDocument();
      const status = screen.getByTestId('stat-Analysis Status');
      expect(within(status).getByText('Not Run')).toBeInTheDocument();
      expect(within(status).getByText('No report for the current baseline')).toBeInTheDocument();
    });
  });
});
