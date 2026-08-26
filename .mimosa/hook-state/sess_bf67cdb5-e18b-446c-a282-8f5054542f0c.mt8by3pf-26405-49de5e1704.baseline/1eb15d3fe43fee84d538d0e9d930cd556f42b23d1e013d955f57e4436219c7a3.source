import React from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  enabledCalls: [] as boolean[],
  fundProviderMounts: 0,
  session: {
    data: undefined as
      undefined | null | { user: { id: string; email: string; role: string; fundIds: number[] } },
    isPending: false,
    isError: false,
    refetch: vi.fn(),
  },
}));

vi.mock('@/lib/auth-session', () => ({
  AUTH_SESSION_QUERY_KEY: ['auth', 'session'],
  useAuthSession: (enabled: boolean) => {
    mocks.enabledCalls.push(enabled);
    return mocks.session;
  },
}));

vi.mock('@/contexts/FundContext', () => ({
  FundProvider: ({ children }: { children: React.ReactNode }) => {
    mocks.fundProviderMounts += 1;
    return <div data-testid="fund-provider">{children}</div>;
  },
  useFundContext: () => ({ needsSetup: false, isLoading: false, fundLoadError: false }),
}));

vi.mock('@/contexts/LPContext', () => ({
  LPProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/app/app-layout', () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-layout">{children}</div>
  ),
}));

vi.mock('@/app/route-control-flags', () => ({ resolveRouteControlFlag: () => false }));
vi.mock('@/components/AdminRoute', () => ({
  AdminRoute: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/queryClient', () => ({
  queryClient: { invalidateQueries: vi.fn() },
}));
vi.mock('@/pages/login', () => ({ default: () => <div>Login Page</div> }));

vi.mock('@/app/app-routes', () => ({
  ADMIN_GATED_ROUTES: { uiCatalog: '/admin/ui-catalog' },
  APP_ROUTES: [
    {
      path: '/dashboard',
      isProtected: true,
      component: () => <div>Dashboard Page</div>,
    },
  ],
  ARCHIVED_PLACEHOLDER_ROUTES: [],
  LEGACY_REDIRECT_ROUTES: {
    analyticsLegacy: '/analytics-legacy',
    planningLegacy: '/planning-legacy',
  },
  LP_INDEX_REDIRECT_PATH: '/lp',
  LP_INDEX_REDIRECT_TARGET: '/lp/dashboard',
  LP_ROUTES: [],
  PUBLIC_ENTRY_ROUTES: {
    sharedDashboard: '/shared/:shareId',
    portalCatchAll: '/portal/:rest*',
  },
  NotFound: () => <div>Not Found Page</div>,
  PageLoadingFallback: () => <div>Session Loading</div>,
  PortalAccessDenied: () => <div>Portal Access Denied Page</div>,
  SharedDashboard: () => <div>Shared Dashboard Page</div>,
  UICatalog: () => <div>UI Catalog Page</div>,
}));

import { AppRouter } from '@/app/app-router';

function renderAt(path: string) {
  window.history.pushState({}, '', path);
  render(<AppRouter enforceAuth />);
}

describe('production auth session gate', () => {
  beforeEach(() => {
    mocks.enabledCalls.length = 0;
    mocks.fundProviderMounts = 0;
    mocks.session.data = undefined;
    mocks.session.isPending = false;
    mocks.session.isError = false;
    mocks.session.refetch.mockReset();
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  it.each([
    ['/shared/share-123', 'Shared Dashboard Page'],
    ['/portal/investor', 'Portal Access Denied Page'],
  ])('keeps public entry %s outside session and fund providers', (path, expected) => {
    mocks.session.isPending = true;
    renderAt(path);

    expect(screen.getByText(expected)).toBeInTheDocument();
    expect(mocks.enabledCalls).toEqual([false]);
    expect(mocks.fundProviderMounts).toBe(0);
  });

  it('keeps fund providers unmounted while session bootstrap is pending', () => {
    mocks.session.isPending = true;
    renderAt('/dashboard');

    expect(screen.getByText('Session Loading')).toBeInTheDocument();
    expect(mocks.fundProviderMounts).toBe(0);
  });

  it('redirects an unauthenticated protected request to login without mounting fund providers', async () => {
    mocks.session.data = null;
    renderAt('/dashboard');

    expect(await screen.findByText('Login Page')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(mocks.fundProviderMounts).toBe(0);
  });

  it('mounts the authenticated shell and fund provider after session resolution', async () => {
    mocks.session.data = {
      user: { id: '7', email: 'admin@example.com', role: 'admin', fundIds: [] },
    };
    renderAt('/dashboard');

    expect(await screen.findByText('Dashboard Page')).toBeInTheDocument();
    expect(screen.getByTestId('app-layout')).toBeInTheDocument();
    expect(mocks.fundProviderMounts).toBe(1);
  });
});
