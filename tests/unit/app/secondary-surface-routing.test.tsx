import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

function passthrough(children: React.ReactNode) {
  return <>{children}</>;
}

async function loadApp() {
  vi.resetModules();

  vi.doMock('@/contexts/FundContext', () => ({
    FundProvider: ({ children }: { children: React.ReactNode }) => passthrough(children),
    useFundContext: () => ({ needsSetup: false, isLoading: false, currentFund: null }),
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
  vi.doMock('@/pages/portfolio', () => ({ default: () => <div>Portfolio Page</div> }));
  vi.doMock('@/pages/planning', () => ({ default: () => <div>Planning Page</div> }));
  vi.doMock('@/pages/kpi-manager', () => ({ default: () => <div>KPI Manager Page</div> }));
  vi.doMock('@/pages/kpi-submission', () => ({ default: () => <div>KPI Submission Page</div> }));

  return (await import('@/App')).default;
}

describe('secondary surface routing', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    window.history.pushState({}, '', '/');
    vi.resetModules();
  });

  it(
    'archives /planning as a permanent redirect to the truthful reserve-planning destination',
    async () => {
      window.history.pushState({}, '', '/planning');
      const App = await loadApp();

      render(<App />);

      expect(await screen.findByText('Portfolio Page')).toBeInTheDocument();
      expect(window.location.pathname).toBe('/portfolio');
      expect(window.location.search).toBe('?tab=reserve-planning');
      expect(screen.queryByText('Planning Page')).not.toBeInTheDocument();
    },
    10000
  );

  it('redirects /kpi-manager to /dashboard by default', async () => {
    window.history.pushState({}, '', '/kpi-manager');
    const App = await loadApp();

    render(<App />);

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(screen.queryByText('KPI Manager Page')).not.toBeInTheDocument();
  });

  it('redirects /kpi-submission to /dashboard by default', async () => {
    window.history.pushState({}, '', '/kpi-submission');
    const App = await loadApp();

    render(<App />);

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(screen.queryByText('KPI Submission Page')).not.toBeInTheDocument();
  });
});
