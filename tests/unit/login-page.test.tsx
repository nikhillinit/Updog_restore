import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/pages/login';
import { AUTH_SESSION_QUERY_KEY, type AuthSession } from '@/lib/auth-session';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock('wouter', () => ({
  useLocation: () => ['/login', navigateMock],
}));

function makeRender(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return { qc, tree: React.createElement(QueryClientProvider, { client: qc }, ui) };
}

const session: AuthSession = {
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fundIds: [] },
};

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigateMock.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits, publishes the cookie-backed session, and redirects home', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => session,
      } as Response)
    );
    const { qc, tree } = makeRender(React.createElement(LoginPage));
    render(tree);
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'admin-dev-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(qc.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(session));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
