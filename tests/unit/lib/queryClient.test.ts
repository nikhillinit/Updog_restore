import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { apiRequest, ApiError } from '../../../client/src/lib/queryClient';

describe('apiRequest', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
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
