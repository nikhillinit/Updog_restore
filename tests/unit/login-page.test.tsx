import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginPage from '@/pages/login';
import { getToken, clearToken } from '@/lib/auth-token';

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));
vi.mock('wouter', () => ({
  useLocation: () => ['/login', navigateMock],
}));

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return React.createElement(QueryClientProvider, { client: qc }, ui);
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    navigateMock.mockClear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearToken();
  });

  it('submits, stores the token, and redirects home', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt-home' }),
      } as Response)
    );
    render(wrap(React.createElement(LoginPage)));
    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: 'admin' } });
    fireEvent.change(screen.getByLabelText(/password/i), {
      target: { value: 'admin-dev-2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(getToken()).toBe('jwt-home'));
    expect(navigateMock).toHaveBeenCalledWith('/');
  });
});
