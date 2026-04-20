import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

function passthrough(children: React.ReactNode) {
  return <>{children}</>;
}

type FlagOverrides = Partial<{
  enable_lp_reporting: boolean;
  onboarding_tour: boolean;
  ui_catalog: boolean;
}>;

const mocks = vi.hoisted(() => ({
  flags: {
    enable_lp_reporting: false,
    onboarding_tour: false,
    ui_catalog: false,
  },
  currentFund: { id: 42, name: 'Fund Forty Two', size: 50_000_000 },
}));

function setFlags(flagOverrides: FlagOverrides = {}) {
  mocks.flags.enable_lp_reporting = flagOverrides.enable_lp_reporting ?? false;
  mocks.flags.onboarding_tour = flagOverrides.onboarding_tour ?? false;
  mocks.flags.ui_catalog = flagOverrides.ui_catalog ?? false;
}

vi.mock('@/app/route-control-flags', () => ({
  resolveRouteControlFlag: (flag: keyof typeof mocks.flags) => mocks.flags[flag],
  useRouteControlFlag: (flag: keyof typeof mocks.flags) => mocks.flags[flag],
}));

vi.mock('@/contexts/FundContext', () => ({
  FundProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
  useFundContext: () => ({
    needsSetup: false,
    isLoading: false,
    currentFund: mocks.currentFund,
  }),
}));

vi.mock('@/contexts/LPContext', () => ({
  LPProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
}));

vi.mock('@/providers/FeatureFlagProvider', () => ({
  FeatureFlagProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
}));

vi.mock('@/lib/chart-theme/chart-theme-provider', () => ({
  BrandChartThemeProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
}));

vi.mock('@/components/ui/error-boundary', () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => passthrough(children),
}));

vi.mock('@/components/ui/tooltip', () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
}));

vi.mock('@/components/layout/sidebar', () => ({
  default: ({ activeModule }: { activeModule: string }) => (
    <div data-testid="sidebar">{activeModule}</div>
  ),
}));

vi.mock('@/components/layout/dynamic-fund-header', () => ({ default: () => null }));
vi.mock('@/components/StagingRibbon', () => ({ StagingRibbon: () => null }));
vi.mock('@/components/demo/DemoBanner', () => ({ default: () => null }));
vi.mock('@/components/onboarding/GuidedTour', () => ({ GuidedTour: () => null }));
vi.mock('@/components/ui/toaster', () => ({ Toaster: () => null }));
vi.mock('@/components/AdminRoute', () => ({
  AdminRoute: ({ children }: { children: React.ReactNode }) => passthrough(children),
}));

vi.mock('@/pages/dashboard', () => ({ default: () => <div>Dashboard Page</div> }));
vi.mock('@/pages/fund-setup', () => ({ default: () => <div>Fund Setup Page</div> }));
vi.mock('@/pages/portfolio', () => ({ default: () => <div>Portfolio Page</div> }));
vi.mock('@/pages/portfolio-company-summary', () => ({
  default: () => <div>Portfolio Company Summary Page</div>,
}));
vi.mock('@/pages/performance', () => ({ default: () => <div>Performance Page</div> }));
vi.mock('@/pages/financial-modeling', () => ({
  default: () => <div>Financial Modeling Page</div>,
}));
vi.mock('@/pages/pipeline', () => ({ default: () => <div>Pipeline Page</div> }));
vi.mock('@/pages/reports', () => ({ default: () => <div>Reports Page</div> }));
vi.mock('@/pages/sensitivity-analysis', () => ({
  default: () => <div>Sensitivity Analysis Page</div>,
}));
vi.mock('@/pages/settings', () => ({ default: () => <div>Settings Page</div> }));
vi.mock('@/pages/help', () => ({ default: () => <div>Help Page</div> }));
vi.mock('@/pages/reserves-demo', () => ({ default: () => <div>Reserves Demo Page</div> }));
vi.mock('@/pages/fund-model-results', () => ({
  default: () => <div>Fund Model Results Page</div>,
}));
vi.mock('@/pages/planning', () => ({ default: () => <div>Planning Page</div> }));
vi.mock('@/pages/kpi-manager', () => ({ default: () => <div>KPI Manager Page</div> }));
vi.mock('@/pages/kpi-submission', () => ({ default: () => <div>KPI Submission Page</div> }));
vi.mock('@/pages/lp/dashboard', () => ({ default: () => <div>LP Dashboard Page</div> }));
vi.mock('@/pages/shared-dashboard', () => ({
  default: () => <div>Shared Dashboard Page</div>,
}));
vi.mock('@/pages/portal/access-denied', () => ({
  default: () => <div>Portal Access Denied Page</div>,
}));
vi.mock('@/pages/not-found', () => ({ default: () => <div>Not Found Page</div> }));

async function renderAt(path: string, flags?: FlagOverrides) {
  setFlags(flags);
  window.history.pushState({}, '', path);
  const App = (await import('@/App')).default;
  render(<App />);
}

describe('route perimeter governance', () => {
  beforeEach(() => {
    setFlags();
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  it('keeps the home route live as the entrypoint into the core workflow', async () => {
    await renderAt('/');

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
  });

  it.each([
    ['/dashboard', 'Dashboard Page'],
    ['/portfolio', 'Portfolio Page'],
    ['/portfolio/company/1', 'Portfolio Company Summary Page'],
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
    '/time-travel',
    '/secondary-market',
    '/notion-integration',
    '/scenario-builder',
    '/dev-dashboard',
    '/portfolio/1',
    '/investments',
    '/investments/1',
    '/investments/company/1',
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
