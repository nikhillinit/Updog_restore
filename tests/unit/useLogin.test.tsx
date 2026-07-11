import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogin } from '@/hooks/useLogin';
import { getToken, clearToken } from '@/lib/auth-token';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe('useLogin', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearToken();
  });

  it('stores the token on a successful login', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ token: 'jwt-xyz' }),
      } as Response)
    );
    const { result } = renderHook(() => useLogin(), { wrapper: makeWrapper() });
    result.current.mutate({ username: 'admin', password: 'admin-dev-2026' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getToken()).toBe('jwt-xyz');
  });

  it('surfaces a 401 as an error and stores no token', async () => {
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
    const { result } = renderHook(() => useLogin(), { wrapper: makeWrapper() });
    result.current.mutate({ username: 'admin', password: 'wrong' });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.status).toBe(401);
    expect(getToken()).toBeNull();
  });
});
