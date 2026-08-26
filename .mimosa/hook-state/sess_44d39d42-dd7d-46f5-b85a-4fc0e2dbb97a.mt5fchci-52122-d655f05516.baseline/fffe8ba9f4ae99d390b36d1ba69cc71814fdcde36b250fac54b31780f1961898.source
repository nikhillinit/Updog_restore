import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ apiRequest: vi.fn() }));

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
  FundConstructionKpiHeader: () => null,
}));
vi.mock('@/components/layout/navigation-config', () => ({
  getActiveNavigationId: () => 'dashboard',
  getFooterNavigationItems: () => [],
  getNavigationItems: () => [],
  isNavigationItemEnabled: () => true,
  resolveNavigationHref: () => '/dashboard',
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
    window.history.pushState({}, '', '/dashboard');
  });

  afterEach(() => {
    cleanup();
    window.history.pushState({}, '', '/');
  });

  it('keeps the active session visible and retryable when logout never reaches the server', async () => {
    mocks.apiRequest.mockRejectedValueOnce(new TypeError('Network request failed'));
    const client = renderLayout();

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

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

    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));

    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(client.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
