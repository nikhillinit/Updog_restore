import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

function passthrough(children: React.ReactNode) {
  return <>{children}</>;
}

type FlagOverrides = Partial<{
  enable_lp_reporting: boolean;
  onboarding_tour: boolean;
  ui_catalog: boolean;
}>;

async function loadApp(flagOverrides: FlagOverrides = {}) {
  vi.resetModules();

  const resolvedFlags = {
    enable_lp_reporting: flagOverrides.enable_lp_reporting ?? false,
    onboarding_tour: flagOverrides.onboarding_tour ?? false,
    ui_catalog: flagOverrides.ui_catalog ?? false,
  } as const;

  vi.doMock('@/app/route-control-flags', () => ({
    resolveRouteControlFlag: (flag: keyof typeof resolvedFlags) => resolvedFlags[flag],
    useRouteControlFlag: (flag: keyof typeof resolvedFlags) => resolvedFlags[flag],
  }));

  vi.doMock('@/contexts/FundContext', () => ({
    FundProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
    useFundContext: () => ({
      needsSetup: false,
      isLoading: false,
      currentFund: { id: 42, name: 'Fund Forty Two', size: 50_000_000 },
    }),
  }));
  vi.doMock('@/contexts/LPContext', () => ({
    LPProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
  }));
  vi.doMock('@/providers/FeatureFlagProvider', () => ({
    FeatureFlagProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
  }));
  vi.doMock('@/lib/chart-theme/chart-theme-provider', () => ({
    BrandChartThemeProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
  }));
  vi.doMock('@/components/ui/error-boundary', () => ({
    ErrorBoundary: ({ children }: { children: React.ReactNode }) => passthrough(children),
  }));
  vi.doMock('@/components/ui/tooltip', () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
  }));
  vi.doMock('@/components/layout/sidebar', () => ({
    default: ({ activeModule }: { activeModule: string }) => (
      <div data-testid="sidebar">{activeModule}</div>
    ),
  }));
  vi.doMock('@/components/layout/dynamic-fund-header', () => ({ default: () => null }));
  vi.doMock('@/components/StagingRibbon', () => ({ StagingRibbon: () => null }));
  vi.doMock('@/components/demo/DemoBanner', () => ({ default: () => null }));
  vi.doMock('@/components/onboarding/GuidedTour', () => ({ GuidedTour: () => null }));
  vi.doMock('@/components/ui/toaster', () => ({ Toaster: () => null }));
  vi.doMock('@/components/AdminRoute', () => ({
    AdminRoute: ({ children }: { children: React.ReactNode }) => passthrough(children),
  }));

  vi.doMock('@/pages/dashboard', () => ({ default: () => <div>Dashboard Page</div> }));
  vi.doMock('@/pages/fund-setup', () => ({ default: () => <div>Fund Setup Page</div> }));
  vi.doMock('@/pages/portfolio', () => ({ default: () => <div>Portfolio Page</div> }));
  vi.doMock('@/pages/performance', () => ({ default: () => <div>Performance Page</div> }));
  vi.doMock('@/pages/financial-modeling', () => ({
    default: () => <div>Financial Modeling Page</div>,
  }));
  vi.doMock('@/pages/pipeline', () => ({ default: () => <div>Pipeline Page</div> }));
  vi.doMock('@/pages/reports', () => ({ default: () => <div>Reports Page</div> }));
  vi.doMock('@/pages/sensitivity-analysis', () => ({
    default: () => <div>Sensitivity Analysis Page</div>,
  }));
  vi.doMock('@/pages/settings', () => ({ default: () => <div>Settings Page</div> }));
  vi.doMock('@/pages/help', () => ({ default: () => <div>Help Page</div> }));
  vi.doMock('@/pages/reserves-demo', () => ({ default: () => <div>Reserves Demo Page</div> }));
  vi.doMock('@/pages/fund-model-results', () => ({
    default: () => <div>Fund Model Results Page</div>,
  }));
  vi.doMock('@/pages/planning', () => ({ default: () => <div>Planning Page</div> }));
  vi.doMock('@/pages/kpi-manager', () => ({ default: () => <div>KPI Manager Page</div> }));
  vi.doMock('@/pages/kpi-submission', () => ({ default: () => <div>KPI Submission Page</div> }));
  vi.doMock('@/pages/lp/dashboard', () => ({ default: () => <div>LP Dashboard Page</div> }));
  vi.doMock('@/pages/shared-dashboard', () => ({
    default: () => <div>Shared Dashboard Page</div>,
  }));
  vi.doMock('@/pages/portal/access-denied', () => ({
    default: () => <div>Portal Access Denied Page</div>,
  }));
  vi.doMock('@/pages/not-found', () => ({ default: () => <div>Not Found Page</div> }));

  return (await import('@/App')).default;
}

async function renderAt(path: string, flags?: FlagOverrides) {
  window.history.pushState({}, '', path);
  const App = await loadApp(flags);
  render(<App />);
}

describe('route perimeter governance', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.resetModules();
  });

  it('keeps the home route live as the entrypoint into the core workflow', async () => {
    await renderAt('/');

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it.each([
    ['/dashboard', 'Dashboard Page'],
    ['/portfolio', 'Portfolio Page'],
    ['/performance', 'Performance Page'],
    ['/pipeline', 'Pipeline Page'],
    ['/financial-modeling', 'Financial Modeling Page'],
    ['/reports', 'Reports Page'],
    ['/sensitivity-analysis', 'Sensitivity Analysis Page'],
    ['/settings', 'Settings Page'],
    ['/help', 'Help Page'],
    ['/reserves-demo', 'Reserves Demo Page'],
    ['/fund-model-results/42', 'Fund Model Results Page'],
  ])('keeps mounted route %s live', async (path, expectedText) => {
    await renderAt(path);
    expect(await screen.findByText(expectedText)).toBeInTheDocument();
  });

  it.each([
    ['/planning', '/portfolio', '?tab=reserve-planning', 'Portfolio Page'],
    ['/kpi-manager', '/dashboard', '', 'Dashboard Page'],
    ['/kpi-submission', '/dashboard', '', 'Dashboard Page'],
  ])(
    'redirects archived placeholder route %s to %s%s',
    async (path, expectedPathname, expectedSearch, expectedText) => {
      await renderAt(path);

      expect(await screen.findByText(expectedText)).toBeInTheDocument();
      expect(window.location.pathname).toBe(expectedPathname);
      expect(window.location.search).toBe(expectedSearch);
    }
  );

  it.each([
    '/analytics',
    '/forecasting',
    '/monte-carlo',
    '/secondary-market',
    '/notion-integration',
    '/scenario-builder',
    '/dev-dashboard',
  ])('removes non-core internal route %s from the default runtime perimeter', async (path) => {
    await renderAt(path);

    expect(await screen.findByText('Not Found Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
  });

  it('hides the LP dashboard when LP reporting is disabled', async () => {
    await renderAt('/lp/dashboard', { enable_lp_reporting: false });

    expect(await screen.findByText('Not Found Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lp/dashboard');
  });

  it('keeps the LP dashboard reachable when LP reporting is enabled', async () => {
    await renderAt('/lp/dashboard', { enable_lp_reporting: true });

    expect(await screen.findByText('LP Dashboard Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/lp/dashboard');
  });

  it('preserves the shared dashboard public contract', async () => {
    await renderAt('/shared/demo-share');

    expect(await screen.findByText('Shared Dashboard Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/shared/demo-share');
  });

  it('preserves the portal catch-all entrypoint as an access-denied surface', async () => {
    await renderAt('/portal/demo');

    expect(await screen.findByText('Portal Access Denied Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/portal/demo');
  });
});
