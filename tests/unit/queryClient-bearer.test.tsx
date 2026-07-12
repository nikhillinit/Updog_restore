import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { apiRequest, getQueryFn } from '@/lib/queryClient';

function mockFetch(body: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: 'OK',
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response);
}

describe('queryClient cookie session transport', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('apiRequest uses credentials and never attaches Authorization', async () => {
    const fetchMock = mockFetch({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('GET', '/api/x');
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('Authorization')).toBeNull();
  });

  it('getQueryFn uses credentials and never attaches Authorization', async () => {
    const fetchMock = mockFetch({ data: 1 });
    vi.stubGlobal('fetch', fetchMock);
    await getQueryFn({ on401: 'returnNull' })({ queryKey: ['/api/y'] } as never);
    const options = fetchMock.mock.calls[0][1] as RequestInit;
    expect(options.credentials).toBe('include');
    expect(new Headers(options.headers).get('Authorization')).toBeNull();
  });

  it('getQueryFn returns null on a 401 when on401 is returnNull', async () => {
    const fetchMock = mockFetch({}, 401);
    vi.stubGlobal('fetch', fetchMock);
    const result = await getQueryFn({ on401: 'returnNull' })({ queryKey: ['/api/y'] } as never);
    expect(result).toBeNull();
  });

  it('handles empty 204 responses', async () => {
    const fetchMock = mockFetch(undefined, 204);
    vi.stubGlobal('fetch', fetchMock);
    await expect(apiRequest<void>('POST', '/api/auth/logout')).resolves.toBeUndefined();
  });
});
