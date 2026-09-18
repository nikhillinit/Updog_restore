import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchAuthSession, useAuthSession, type AuthSession } from '@/lib/auth-session';

const session: AuthSession = {
  user: { id: 'user-1', email: 'admin@example.com', role: 'admin', fundIds: [7] },
};

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
}

describe('auth session', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns null for an unauthenticated bootstrap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 401, ok: false } as Response));
    await expect(fetchAuthSession()).resolves.toBeNull();
  });

  it('loads sanitized identity with cookie credentials', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      status: 200,
      ok: true,
      json: async () => session,
    } as Response);
    vi.stubGlobal('fetch', fetchMock);

    const { result } = renderHook(() => useAuthSession(), { wrapper });
    await waitFor(() => expect(result.current.data).toEqual(session));
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/session',
      expect.objectContaining({ credentials: 'include' })
    );
  });

  it('rejects malformed successful session payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          user: { id: 'user-1', email: 'admin@example.com', role: 'owner', fundIds: [7] },
        }),
      } as Response)
    );

    await expect(fetchAuthSession()).rejects.toThrow();
  });

  it('rejects successful session payloads with an empty user id', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          user: { id: '   ', email: 'admin@example.com', role: 'admin', fundIds: [7] },
        }),
      } as Response)
    );

    await expect(fetchAuthSession()).rejects.toThrow('User id is required');
  });

  it('accepts non-email development usernames returned in the email field', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ user: { id: '1', email: 'admin', role: 'admin', fundIds: [7] } }),
      } as Response)
    );

    await expect(fetchAuthSession()).resolves.toEqual({
      user: { id: '1', email: 'admin', role: 'admin', fundIds: [7] },
    });
  });
});
