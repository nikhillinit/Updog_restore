import { afterEach, describe, expect, it, vi } from 'vitest';
import { AUTH_SESSION_QUERY_KEY } from '@/lib/auth-session';
import { apiRequest, queryClient } from '@/lib/queryClient';

describe('client JSON request authentication handling', () => {
  afterEach(() => {
    queryClient.clear();
    vi.unstubAllGlobals();
  });

  it('clears the cached session on an unexpected 401', async () => {
    queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, {
      user: { id: '1', email: 'admin@example.com', role: 'admin', fundIds: [1] },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        headers: new Headers(),
        json: async () => ({ message: 'Session expired' }),
      } as Response)
    );

    await expect(apiRequest('GET', '/api/funds/1/performance/timeseries')).rejects.toThrow(
      'Session expired'
    );
    expect(queryClient.getQueryData(AUTH_SESSION_QUERY_KEY)).toBeNull();
  });
});
