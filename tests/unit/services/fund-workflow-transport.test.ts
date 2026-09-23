import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/lib/queryClient';
import {
  classifyWorkflowError,
  currentETagFrom,
  FundWorkflowUncertainError,
  isStaleRevisionError,
  newWorkflowKey,
  workflowRequest,
} from '@/services/fund-workflow';
import { fetchFundDraft, saveFundDraft } from '@/services/fund-drafts';

const KEY = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('workflowRequest', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('mints lowercase UUID keys', () => {
    expect(newWorkflowKey()).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('sends key and If-Match and returns the ETag and replay marker', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ ok: 1 }, 200, { ETag: '"0000000000000002"', 'Idempotency-Replay': 'true' })
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await workflowRequest(
      'PUT',
      '/api/funds/1/draft',
      { fundName: 'x' },
      {
        key: KEY,
        etag: '"0000000000000001"',
      }
    );

    expect(result).toEqual({
      status: 200,
      body: { ok: 1 },
      etag: '"0000000000000002"',
      replayed: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds/1/draft'),
      expect.objectContaining({
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': KEY,
          'If-Match': '"0000000000000001"',
        },
        body: JSON.stringify({ fundName: 'x' }),
      })
    );
  });

  it('sends no body, key or If-Match on a read', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ config: {} }, 200));
    vi.stubGlobal('fetch', fetchMock);

    await workflowRequest('GET', '/api/funds/1/draft', undefined);

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(init.headers).toEqual({});
    expect(init.body).toBeUndefined();
  });

  it('maps a 412 into a stale ApiError carrying the current ETag', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          {
            error: 'Draft revision is stale',
            code: 'PRECONDITION_FAILED',
            details: { current: '"0000000000000009"' },
          },
          412,
          { ETag: '"0000000000000009"' }
        )
      )
    );

    const failure = await workflowRequest('PUT', '/api/funds/1/draft', {}, { key: KEY }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect(isStaleRevisionError(failure)).toBe(true);
    expect((failure as ApiError).errorCode).toBe('PRECONDITION_FAILED');
    expect(currentETagFrom(failure)).toBe('"0000000000000009"');
    expect(classifyWorkflowError(failure)).toBe('rejected');
  });

  it('classifies lock contention and pauses as retry-same-key with Retry-After', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: 'Retry the same fund command', code: 'REQUEST_IN_PROGRESS' }, 409, {
          'Retry-After': '2',
        })
      )
    );

    const failure = (await workflowRequest('POST', '/api/funds', {}, { key: KEY }).catch(
      (error: unknown) => error
    )) as ApiError;

    expect(failure.status).toBe(409);
    expect(failure.retryAfterMs).toBe(2000);
    expect(classifyWorkflowError(failure)).toBe('retry_same_key');
    expect(classifyWorkflowError(new ApiError(503, 'paused', 'FUND_WORKFLOW_WRITES_PAUSED'))).toBe(
      'retry_same_key'
    );
    expect(classifyWorkflowError(new ApiError(409, 'reuse', 'IDEMPOTENCY_KEY_REUSE'))).toBe(
      'rejected'
    );
    expect(classifyWorkflowError(new ApiError(500, 'boom'))).toBe('uncertain');
  });

  it('turns a network failure into an uncertain outcome', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    const failure = await workflowRequest('POST', '/api/funds', {}, { key: KEY }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(FundWorkflowUncertainError);
    expect((failure as FundWorkflowUncertainError).aborted).toBe(false);
    expect(classifyWorkflowError(failure)).toBe('uncertain');
  });

  it('aborts after the timeout and reports an uncertain outcome', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () =>
              reject(new DOMException('Aborted', 'AbortError'))
            );
          })
      )
    );

    const settled = workflowRequest('POST', '/api/funds', {}, { key: KEY, timeoutMs: 50 }).catch(
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(60);
    const failure = await settled;

    expect(failure).toBeInstanceOf(FundWorkflowUncertainError);
    expect((failure as FundWorkflowUncertainError).aborted).toBe(true);
  });

  it('keeps the timeout active while reading a stalled response body', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const response = jsonResponse(null, 200);
        vi.spyOn(response, 'json').mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError'))
              );
              setTimeout(() => reject(new TypeError('Body stalled')), 100);
            })
        );
        return Promise.resolve(response);
      })
    );

    const settled = workflowRequest('POST', '/api/funds', {}, { key: KEY, timeoutMs: 50 }).catch(
      (error: unknown) => error
    );
    await vi.advanceTimersByTimeAsync(110);
    const failure = await settled;

    expect(failure).toBeInstanceOf(FundWorkflowUncertainError);
    expect((failure as FundWorkflowUncertainError).aborted).toBe(true);
  });

  it('honors an external abort while reading the response body', async () => {
    vi.useFakeTimers();
    const external = new AbortController();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        const response = jsonResponse(null, 200);
        vi.spyOn(response, 'json').mockImplementation(
          () =>
            new Promise((_resolve, reject) => {
              init.signal?.addEventListener('abort', () =>
                reject(new DOMException('Aborted', 'AbortError'))
              );
              setTimeout(() => reject(new TypeError('Body stalled')), 100);
            })
        );
        return Promise.resolve(response);
      })
    );

    const settled = workflowRequest(
      'POST',
      '/api/funds',
      {},
      { key: KEY, signal: external.signal }
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(1);
    external.abort();
    await vi.advanceTimersByTimeAsync(100);
    const failure = await settled;

    expect(failure).toBeInstanceOf(FundWorkflowUncertainError);
    expect((failure as FundWorkflowUncertainError).aborted).toBe(true);
  });

  it('turns a response body interruption into an uncertain outcome', async () => {
    const response = jsonResponse(null, 200);
    vi.spyOn(response, 'json').mockRejectedValue(new TypeError('terminated'));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    const failure = await workflowRequest('POST', '/api/funds', {}, { key: KEY }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(FundWorkflowUncertainError);
    expect((failure as FundWorkflowUncertainError).aborted).toBe(false);
  });

  it.each([
    ['proxy HTML 401', 401, 'rejected'],
    ['empty 502', 502, 'uncertain'],
  ])('classifies a non-JSON %s by status', async (_label, status, outcome) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(status === 401 ? '<html>Sign in</html>' : '', {
          status,
          headers: { 'Content-Type': 'text/html' },
        })
      )
    );

    const failure = await workflowRequest('PUT', '/api/funds/1/draft', {}, { key: KEY }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(status);
    expect(classifyWorkflowError(failure)).toBe(outcome);
  });

  it('preserves normal ApiError classification for a valid error response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ error: 'Draft is invalid', code: 'VALIDATION_FAILED' }, 400)
        )
    );

    const failure = await workflowRequest('PUT', '/api/funds/1/draft', {}, { key: KEY }).catch(
      (error: unknown) => error
    );

    expect(failure).toBeInstanceOf(ApiError);
    expect((failure as ApiError).status).toBe(400);
    expect((failure as ApiError).errorCode).toBe('VALIDATION_FAILED');
    expect(classifyWorkflowError(failure)).toBe('rejected');
  });
});

describe('draft response validation', () => {
  const ETAG = '"0000000000000003"';

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns the contract-parsed config and revision', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ config: { fundName: 'Draft' } }, 200, { ETag: ETAG }))
    );
    await expect(fetchFundDraft(1)).resolves.toEqual({ config: { fundName: 'Draft' }, etag: ETAG });
  });

  it.each([
    ['a config that breaks the contract', { config: { fundName: '', legacy: true } }, ETAG],
    ['no config', { data: {} }, ETAG],
    ['no revision', { config: { fundName: 'Draft' } }, null],
    ['a weak revision', { config: { fundName: 'Draft' } }, 'W/"0000000000000003"'],
  ])('refuses to hydrate %s', async (_label, body, etag) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(body, 200, etag ? { ETag: etag } : {}))
    );
    await expect(fetchFundDraft(1)).rejects.toThrow(/draft contract|revision/);
  });

  it('treats a committed save without a revision as uncertain so the key is kept', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ success: true, data: { config: {} } }, 200))
    );
    const failure = await saveFundDraft(1, { fundName: 'Draft' }, { key: KEY, etag: ETAG }).catch(
      (error: unknown) => error
    );
    expect(failure).toBeInstanceOf(FundWorkflowUncertainError);
    expect(classifyWorkflowError(failure)).toBe('uncertain');
  });
});
