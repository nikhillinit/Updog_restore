import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError, getQueryFn, queryClient } from '../../../client/src/lib/queryClient';
import { readHttpErrorMessage } from '../../../client/src/lib/http-response';

describe('apiRequest', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    JSON.stringify({
      message: 'SELECT private_column FROM private_funds',
      code: 'logout_incomplete',
    }),
    JSON.stringify({ error: 'logout_incomplete' }),
    '<html>SQLSTATE password=private-value</html>',
    'null',
  ])('suppresses internal server details across shared request paths: %s', async (body) => {
    vi.mocked(globalThis.fetch).mockImplementation(async () => new Response(body, { status: 503 }));
    const requestError = await apiRequest('GET', '/api/test').catch((error: unknown) => error);
    expect(requestError).toBeInstanceOf(ApiError);
    expect(requestError).toMatchObject({
      status: 503,
      message: 'The service is temporarily unavailable. Please try again.',
    });
    if (body.includes('logout_incomplete')) {
      expect(requestError).toMatchObject({ errorCode: 'logout_incomplete' });
    }
    const query = getQueryFn({ on401: 'throw' });
    await expect(
      query({
        queryKey: ['/api/test'],
        signal: new AbortController().signal,
        client: queryClient,
        meta: undefined,
      })
    ).rejects.toThrow('The service is temporarily unavailable. Please try again.');
    await expect(
      readHttpErrorMessage(new Response(body, { status: 503 }), 'Could not load records')
    ).resolves.toBe('The service is temporarily unavailable. Please try again.');
  });

  it('suppresses 5xx validation details and free-form error codes', async () => {
    const internalMessage = 'SELECT private_column FROM private_funds';
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: internalMessage,
          details: { nested: { _errors: [internalMessage] } },
          issues: [{ path: ['name'], message: internalMessage }],
        }),
        { status: 503, headers: { 'Retry-After': '2' } }
      )
    );
    const error = await apiRequest('GET', '/api/test').catch((value: unknown) => value);
    expect(error).toMatchObject({
      status: 503,
      errorCode: undefined,
      details: undefined,
      issues: undefined,
      fieldErrors: {},
      retryAfterMs: 2000,
    });
  });

  it('keeps actionable validation and conflict metadata', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          code: 'stale_version',
          message: 'Reload before saving',
          issues: [{ path: ['name'], message: 'Name is required' }],
        }),
        { status: 409, headers: { 'Retry-After': '2' } }
      )
    );
    const error = await apiRequest('POST', '/api/test', {}).catch((value: unknown) => value);
    expect(error).toMatchObject({
      message: 'Reload before saving',
      errorCode: 'stale_version',
      retryAfterMs: 2000,
      fieldErrors: { name: 'Name is required' },
    });
  });

  it('preserves specific server error code over generic error field', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'conflict',
          code: 'duplicate_scenario_set_name',
          message: 'Already exists',
        }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const err = await apiRequest('POST', '/api/test', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('duplicate_scenario_set_name');
  });

  it('falls back to generic error field when no specific code', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'not_found', message: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const err = await apiRequest('GET', '/api/test').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('not_found');
  });

  it('does not crash when response includes a details field', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: 'invalid_request',
          message: 'Bad input',
          details: { issues: [{ path: ['name'], message: 'Required' }] },
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const err = await apiRequest('POST', '/api/test', {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).errorCode).toBe('invalid_request');
  });

  it('merges caller-provided headers into the request', async () => {
    vi.mocked(globalThis.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    await apiRequest(
      'POST',
      '/api/test',
      { name: 'Scenario' },
      {
        headers: { 'Idempotency-Key': 'scenario-create-1' },
      }
    );

    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/test',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'Idempotency-Key': 'scenario-create-1',
        }),
      })
    );
  });
});
