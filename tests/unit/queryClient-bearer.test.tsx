import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { setToken, clearToken } from '@/lib/auth-token';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('queryClient Bearer injection', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    clearToken();
  });

  it('apiRequest attaches Authorization when a token is set', async () => {
    setToken('tok123');
    const fetchMock = mockFetch({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('GET', '/api/x');
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok123');
  });

  it('apiRequest omits Authorization when no token is set', async () => {
    const fetchMock = mockFetch({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('GET', '/api/x');
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('getQueryFn attaches Authorization when a token is set', async () => {
    setToken('tok456');
    const fetchMock = mockFetch({ data: 1 });
    vi.stubGlobal('fetch', fetchMock);
    await getQueryFn({ on401: 'returnNull' })({ queryKey: ['/api/y'] } as never);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBe('Bearer tok456');
  });

  it('getQueryFn omits Authorization when no token is set', async () => {
    const fetchMock = mockFetch({ data: 1 });
    vi.stubGlobal('fetch', fetchMock);
    await getQueryFn({ on401: 'returnNull' })({ queryKey: ['/api/y'] } as never);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect((options.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('getQueryFn returns null on a 401 when on401 is returnNull', async () => {
    const fetchMock = mockFetch({}, 401);
    vi.stubGlobal('fetch', fetchMock);
    const result = await getQueryFn({ on401: 'returnNull' })({ queryKey: ['/api/y'] } as never);
    expect(result).toBeNull();
  });
});
