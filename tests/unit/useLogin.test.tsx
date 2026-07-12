import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogin } from '@/hooks/useLogin';
import { AUTH_SESSION_QUERY_KEY, type AuthSession } from '@/lib/auth-session';
import { LEGACY_AUTH_TOKEN_KEY } from '@/lib/auth-token';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client: qc }, children),
  };
}

const session: AuthSession = {
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fundIds: [] },
};

describe('useLogin', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('publishes sanitized session data and removes a legacy token', async () => {
    window.localStorage.setItem(LEGACY_AUTH_TOKEN_KEY, 'jwt-legacy');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => session,
      } as Response)
    );
    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ username: 'admin', password: 'admin-dev-2026' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(qc.getQueryData(AUTH_SESSION_QUERY_KEY)).toEqual(session);
    expect(window.localStorage.getItem(LEGACY_AUTH_TOKEN_KEY)).toBeNull();
  });

  it('surfaces a 401 without publishing a session', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: 'invalid_credentials' }),
        text: async () => '{"error":"invalid_credentials"}',
      } as Response)
    );
    const { qc, wrapper } = makeWrapper();
    const { result } = renderHook(() => useLogin(), { wrapper });
    result.current.mutate({ username: 'admin', password: 'wrong' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(401);
    expect(qc.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeUndefined();
  });
});
