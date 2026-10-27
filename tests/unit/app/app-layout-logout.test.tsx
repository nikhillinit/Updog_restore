import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  apiRequest: vi.fn(),
  bindFundWorkspaceActor: vi.fn(),
  unbindFundWorkspaceActor: vi.fn(),
  fundConstructionHeader: vi.fn(),
}));

vi.mock('@/lib/queryClient', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/queryClient')>();
  return { ...actual, apiRequest: mocks.apiRequest };
});
vi.mock('@/contexts/FundContext', () => ({
  useFundContext: () => ({ currentFund: null, needsSetup: false, isLoading: false }),
}));
vi.mock('@/components/layout/sidebar', () => ({ default: () => null }));
vi.mock('@/components/layout/dynamic-fund-header', () => ({ default: () => null }));
vi.mock('@/components/wizard/FundConstructionKpiHeader', () => ({
  FundConstructionKpiHeader: () => mocks.fundConstructionHeader(),
}));
vi.mock('@/components/layout/navigation-config', () => ({
  getActiveNavigationId: () => 'dashboard',
  getFooterNavigationItems: () => [],
  getNavigationItems: () => [],
  isNavigationItemEnabled: () => true,
  resolveNavigationHref: () => '/dashboard',
}));
vi.mock('@/stores/fundStore', () => ({
  bindFundWorkspaceActor: mocks.bindFundWorkspaceActor,
  unbindFundWorkspaceActor: mocks.unbindFundWorkspaceActor,
}));

import { AppLayout } from '@/app/app-layout';
import { AUTH_SESSION_QUERY_KEY, type AuthSession } from '@/lib/auth-session';
import { ApiError } from '@/lib/queryClient';

const session: AuthSession = {
  user: { id: '7', email: 'admin@example.com', role: 'admin', fundIds: [] },
};

function renderLayout() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(AUTH_SESSION_QUERY_KEY, session);
  render(
    <QueryClientProvider client={client}>
      <AppLayout session={session}>
        <div>Protected Content</div>
      </AppLayout>
    </QueryClientProvider>
  );
  return client;
}

describe('AppLayout logout', () => {
  beforeEach(() => {
    mocks.apiRequest.mockReset();
    mocks.bindFundWorkspaceActor.mockReset().mockResolvedValue(undefined);
    mocks.unbindFundWorkspaceActor.mockReset();
    mocks.fundConstructionHeader.mockReset().mockReturnValue(null);
    window.history.pushState({}, '', '/dashboard');
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  it('keeps content and logout available while the fund construction header is suspended', async () => {
    window.history.pushState({}, '', '/fund-setup');
    let resolveHeader!: () => void;
    let headerReady = false;
    const headerLoading = new Promise<void>((resolve) => {
      resolveHeader = resolve;
    });
    mocks.fundConstructionHeader.mockImplementation(() => {
      if (!headerReady) throw headerLoading;
      return <div>Fund construction KPIs</div>;
    });
    const client = renderLayout();

    try {
      expect(await screen.findByText('Protected Content')).toBeVisible();
      expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled();
      expect(screen.queryByText('Fund construction KPIs')).not.toBeInTheDocument();
      expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(session);
    } finally {
      await act(async () => {
        headerReady = true;
        resolveHeader();
      });
    }

    expect(await screen.findByText('Fund construction KPIs')).toBeVisible();
    const unbindsBeforeLogout = mocks.unbindFundWorkspaceActor.mock.calls.length;
    mocks.apiRequest.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(mocks.unbindFundWorkspaceActor).toHaveBeenCalledTimes(unbindsBeforeLogout + 1);
  });

  it('keeps the active session visible and retryable when logout never reaches the server', async () => {
    mocks.apiRequest.mockRejectedValueOnce(new TypeError('Network request failed'));
    const client = renderLayout();

    fireEvent.click(await screen.findByRole('button', { name: 'Log out' }));

    expect(
      await screen.findByText(
        'Logout failed. Your session is still active; retry when the API is reachable.'
      )
    ).toBeInTheDocument();
    expect(window.location.pathname).toBe('/dashboard');
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(session);
    expect(screen.getByRole('button', { name: 'Log out' })).toBeEnabled();
  });

  it('finishes local logout when the server reports revocation failure after clearing cookies', async () => {
    mocks.apiRequest.mockRejectedValueOnce(
      new ApiError(503, 'logout_incomplete', 'logout_incomplete')
    );
    const client = renderLayout();
    await screen.findByText('Protected Content');
    const unbindsBeforeLogout = mocks.unbindFundWorkspaceActor.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(mocks.unbindFundWorkspaceActor).toHaveBeenCalledTimes(unbindsBeforeLogout + 1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('clears the workspace binding after a successful logout', async () => {
    mocks.apiRequest.mockResolvedValueOnce(undefined);
    const client = renderLayout();
    await screen.findByText('Protected Content');
    const unbindsBeforeLogout = mocks.unbindFundWorkspaceActor.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(mocks.unbindFundWorkspaceActor).toHaveBeenCalledTimes(unbindsBeforeLogout + 1);
  });

  it('does not erase the workspace binding on shell mount or remount', async () => {
    const first = renderLayout();
    await screen.findByText('Protected Content');
    expect(mocks.unbindFundWorkspaceActor).not.toHaveBeenCalled();

    cleanup();
    renderLayout();
    await screen.findByText('Protected Content');
    expect(mocks.unbindFundWorkspaceActor).not.toHaveBeenCalled();
    expect(first.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(session);
  });

  it('removes identity-scoped queries but keeps the session when the actor changes', async () => {
    const nextSession: AuthSession = {
      user: { id: '8', email: 'partner@example.com', role: 'viewer', fundIds: [] },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(AUTH_SESSION_QUERY_KEY, session);
    client.setQueryData(['/api/funds'], [{ id: 1 }]);
    client.setQueryData(['/api/funds', 1], { id: 1 });
    const view = render(
      <QueryClientProvider client={client}>
        <AppLayout session={session}>
          <div>Protected Content</div>
        </AppLayout>
      </QueryClientProvider>
    );
    await screen.findByText('Protected Content');
    expect(client.getQueryData(['/api/funds'])).toEqual([{ id: 1 }]);
    expect(client.getQueryData(['/api/funds', 1])).toEqual({ id: 1 });

    client.setQueryData(AUTH_SESSION_QUERY_KEY, nextSession);
    const sessionQuery = client.getQueryCache().find({ queryKey: AUTH_SESSION_QUERY_KEY });
    view.rerender(
      <QueryClientProvider client={client}>
        <AppLayout session={nextSession}>
          <div>Next actor workspace</div>
        </AppLayout>
      </QueryClientProvider>
    );

    await screen.findByText('Next actor workspace');
    expect(mocks.bindFundWorkspaceActor).toHaveBeenLastCalledWith('8', 'viewer');
    expect(client.getQueryCache().getAll()).toEqual([sessionQuery]);
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(nextSession);
  });

  it('clears identity-scoped queries when the actor changes before the first bind resolves', async () => {
    mocks.bindFundWorkspaceActor.mockReturnValueOnce(new Promise<void>(() => {}));
    const nextSession: AuthSession = {
      user: { id: '8', email: 'partner@example.com', role: 'viewer', fundIds: [] },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(AUTH_SESSION_QUERY_KEY, session);
    client.setQueryData(['/api/funds'], [{ id: 1 }]);
    const view = render(
      <QueryClientProvider client={client}>
        <AppLayout session={session}>
          <div>Protected Content</div>
        </AppLayout>
      </QueryClientProvider>
    );
    expect(client.getQueryData(['/api/funds'])).toEqual([{ id: 1 }]);

    client.setQueryData(AUTH_SESSION_QUERY_KEY, nextSession);
    view.rerender(
      <QueryClientProvider client={client}>
        <AppLayout session={nextSession}>
          <div>Next actor workspace</div>
        </AppLayout>
      </QueryClientProvider>
    );

    await screen.findByText('Next actor workspace');
    expect(client.getQueryData(['/api/funds'])).toBeUndefined();
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(nextSession);
  });

  it('keeps descendants gated and ignores a superseded actor binding', async () => {
    let resolveNextBinding: (() => void) | undefined;
    const nextBinding = new Promise<void>((resolve) => {
      resolveNextBinding = resolve;
    });
    let resolveFinalBinding: (() => void) | undefined;
    const finalBinding = new Promise<void>((resolve) => {
      resolveFinalBinding = resolve;
    });
    const nextSession: AuthSession = {
      user: { id: '8', email: 'partner@example.com', role: 'viewer', fundIds: [] },
    };
    const finalSession: AuthSession = {
      user: { id: '9', email: 'owner@example.com', role: 'admin', fundIds: [] },
    };
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(
      <QueryClientProvider client={client}>
        <AppLayout session={session}>
          <div>Prior actor draft</div>
        </AppLayout>
      </QueryClientProvider>
    );
    await screen.findByText('Prior actor draft');
    mocks.bindFundWorkspaceActor.mockReturnValueOnce(nextBinding).mockReturnValueOnce(finalBinding);

    view.rerender(
      <QueryClientProvider client={client}>
        <AppLayout session={nextSession}>
          <div>Next actor workspace</div>
        </AppLayout>
      </QueryClientProvider>
    );

    expect(screen.queryByText('Prior actor draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Next actor workspace')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(mocks.bindFundWorkspaceActor).toHaveBeenLastCalledWith('8', 'viewer');
    });

    view.rerender(
      <QueryClientProvider client={client}>
        <AppLayout session={finalSession}>
          <div>Final actor workspace</div>
        </AppLayout>
      </QueryClientProvider>
    );
    await waitFor(() => {
      expect(mocks.bindFundWorkspaceActor).toHaveBeenLastCalledWith('9', 'admin');
    });

    await act(async () => resolveNextBinding?.());
    expect(screen.queryByText('Next actor workspace')).not.toBeInTheDocument();
    expect(screen.queryByText('Final actor workspace')).not.toBeInTheDocument();

    await act(async () => resolveFinalBinding?.());
    expect(await screen.findByText('Final actor workspace')).toBeInTheDocument();
  });
});
