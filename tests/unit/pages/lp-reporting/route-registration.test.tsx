/**
 * LP Reporting -- /lp-reporting/* route registration tests.
 *
 * Mirrors `route-perimeter-governance.test.tsx`: stubs the providers
 * and heavy page modules so we can render `<App />` against each
 * `/lp-reporting/*` path and assert the right placeholder mounts.
 */

import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

function passthrough(children: React.ReactNode) {
  return <>{children}</>;
}

const mocks = vi.hoisted(() => ({
  flags: {
    enable_lp_reporting: false,
    onboarding_tour: false,
    ui_catalog: false,
  },
  currentFund: { id: 42, name: 'Fund Forty Two', size: 50_000_000 },
}));

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
  AdminRoute: ({
    children,
    flag,
  }: {
    children: React.ReactNode;
    flag: keyof typeof mocks.flags;
  }) => (mocks.flags[flag] ? passthrough(children) : <div>Admin Access Denied Page</div>),
}));

// Lightweight stand-ins for every page module App.tsx lazy-imports.
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
vi.mock('@/pages/forecasting', () => ({
  default: () => <div>Forecasting Page</div>,
}));
vi.mock('@/pages/pipeline', () => ({ default: () => <div>Pipeline Page</div> }));
vi.mock('@/pages/reports', () => ({ default: () => <div>Reports Page</div> }));
vi.mock('@/pages/variance-tracking', () => ({ default: () => <div>Variance Tracking Page</div> }));
vi.mock('@/pages/sensitivity-analysis', () => ({
  default: () => <div>Sensitivity Analysis Page</div>,
}));
vi.mock('@/pages/settings', () => ({ default: () => <div>Settings Page</div> }));
vi.mock('@/pages/help', () => ({ default: () => <div>Help Page</div> }));
vi.mock('@/pages/fund-model-results', () => ({
  default: () => <div>Fund Model Results Page</div>,
}));
vi.mock('@/pages/model-results', () => ({
  default: () => <div>Model Results Compatibility Page</div>,
}));
vi.mock('@/pages/lp/dashboard', () => ({ default: () => <div>LP Dashboard Page</div> }));
vi.mock('@/pages/lp/fund-detail', () => ({ default: () => <div>LP Fund Detail Page</div> }));
vi.mock('@/pages/lp/capital-account', () => ({
  default: () => <div>LP Capital Account Page</div>,
}));
vi.mock('@/pages/lp/performance', () => ({ default: () => <div>LP Performance Page</div> }));
vi.mock('@/pages/lp/reports', () => ({ default: () => <div>LP Reports Page</div> }));
vi.mock('@/pages/lp/settings', () => ({ default: () => <div>LP Settings Page</div> }));
vi.mock('@/pages/admin/ui-catalog', () => ({ default: () => <div>UI Catalog Page</div> }));
vi.mock('@/pages/shared-dashboard', () => ({
  default: () => <div>Shared Dashboard Page</div>,
}));
vi.mock('@/pages/portal/access-denied', () => ({
  default: () => <div>Portal Access Denied Page</div>,
}));
vi.mock('@/pages/not-found', () => ({ default: () => <div>Not Found Page</div> }));

// LP Reporting placeholder pages -- we mock the barrel because that
// is what App.tsx imports from. The named exports each render a
// distinct sentinel string so route assertions can disambiguate.
vi.mock('@/pages/lp-reporting', () => ({
  LpReportingLedgerPage: () => <div>LP Reporting Ledger Placeholder</div>,
  LpReportingValuationsPage: () => <div>LP Reporting Valuations Placeholder</div>,
  LpReportingMetricsPage: () => <div>LP Reporting Metrics Placeholder</div>,
  LpReportingImportsPage: () => <div>LP Reporting Imports Placeholder</div>,
}));

async function renderAt(path: string) {
  window.history.pushState({}, '', path);
  const App = (await import('@/App')).default;
  render(<App />);
}

describe('LP Reporting route registration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  it.each([
    ['/lp-reporting/ledger', 'LP Reporting Ledger Placeholder'],
    ['/lp-reporting/valuations', 'LP Reporting Valuations Placeholder'],
    ['/lp-reporting/metrics', 'LP Reporting Metrics Placeholder'],
    ['/lp-reporting/imports', 'LP Reporting Imports Placeholder'],
  ])('mounts the right placeholder at %s', async (path, expected) => {
    await renderAt(path);

    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(window.location.pathname).toBe(path);
  });
});
