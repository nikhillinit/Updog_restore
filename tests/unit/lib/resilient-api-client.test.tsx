import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const loggerMocks = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

vi.mock('@/lib/logger', () => ({
  logger: loggerMocks,
}));

import { apiClient, ResilientApiClient, reservesApi } from '@/lib/resilient-api-client';

describe('Wave 2 resilient-api client boundary', () => {
  const fetchMock = vi.fn();
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    apiClient.resetCircuitBreaker();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  it('retries retryable failures before succeeding', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network down')).mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const client = new ResilientApiClient({
      baseUrl: 'https://example.test',
      maxRetries: 2,
      baseDelayMs: 0,
      maxDelayMs: 0,
    });

    await expect(client.post<{ status: string }>('/health', { requested: true })).resolves.toEqual({
      status: 'ok',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(loggerMocks.debug).toHaveBeenCalledWith(
      'resilient api retry scheduled',
      expect.objectContaining({ attempt: 1, path: '/health' })
    );
  });

  it('opens the circuit after repeated failures and blocks the next request', async () => {
    fetchMock.mockRejectedValue(new TypeError('still down'));

    const client = new ResilientApiClient({
      baseUrl: 'https://example.test',
      maxRetries: 0,
      circuitBreakerThreshold: 1,
    });

    await expect(client.get('/health')).rejects.toThrow('still down');
    await expect(client.get('/health')).rejects.toThrow('Circuit breaker is OPEN');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('targets the api-prefixed reserve calculate route for the singleton client', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ allocations: [], totalAllocated: 0, remaining: 0, rid: 'rid-1' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    await reservesApi.calculate({} as Parameters<typeof reservesApi.calculate>[0]);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(requestUrl, 'http://localhost').pathname).toBe('/api/v1/reserves/calculate');
    expect(requestInit).toEqual(expect.objectContaining({ method: 'POST' }));
  });

  it('exposes only the real reserve-backed singleton methods', () => {
    expect(Object.keys(reservesApi)).toEqual(['calculate', 'config']);
  });

  it('targets the api-prefixed reserve config route for the singleton client', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ '/healthz': 'http://localhost:3001', '/readyz': 'http://localhost:3001' }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      )
    );

    await reservesApi.config();

    const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new URL(requestUrl, 'http://localhost').pathname).toBe('/api/v1/reserves/config');
    expect(requestInit).toEqual(expect.objectContaining({ method: 'GET' }));
  });
});
