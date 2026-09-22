import { afterEach, describe, expect, it, vi } from 'vitest';
import { createFund, finalizeFund, startCreateFund } from '@/services/funds';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const KEY = '11111111-1111-4111-8111-111111111111';

function jsonResponse(body: unknown, status: number, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

describe('fund creation command keys', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('joins concurrent dispatches of the same reserved key into one request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 7 }, 201, { ETag: '"0123456789abcdef"' }));
    vi.stubGlobal('fetch', fetchMock);

    const payload = { name: 'Idem', size: 1_000_000 };
    const [first, second] = await Promise.all([
      startCreateFund(payload, { idempotencyKey: KEY }),
      startCreateFund(payload, { idempotencyKey: KEY }),
    ]);

    expect(first.key).toBe(KEY);
    expect(second.key).toBe(KEY);
    expect(first.etag).toBe('"0123456789abcdef"');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ 'Idempotency-Key': KEY }),
      })
    );
  });

  it('mints a UUID key when none is reserved and never derives it from the payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 8 }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const payload = { name: 'Same', size: 1 };
    const first = await startCreateFund(payload);
    const second = await startCreateFund(payload);

    expect(first.key).toMatch(UUID_RE);
    expect(second.key).toMatch(UUID_RE);
    expect(first.key).not.toBe(second.key);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('surfaces the replay marker of a stored response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ id: 9 }, 201, { 'Idempotency-Replay': 'true' }))
    );

    const result = await createFund(
      { name: 'Replay', size: 1 },
      { idempotencyKey: '33333333-3333-4333-8333-333333333333' }
    );

    expect(result.replayed).toBe(true);
    expect(result.status).toBe(201);
    expect(result.body).toEqual({ id: 9 });
  });
});

describe('finalizeFund command', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  const payload = {
    draftFundId: 77,
    name: 'Test Fund',
    size: 50_000_000,
    managementFee: 0.02,
    carryPercentage: 0.2,
    vintageYear: 2026,
    modelInputsAsOfDate: '2026-06-30',
  };

  it('sends the reserved key and the reviewed revision as If-Match', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: { fundId: 77, configVersion: 1, correlationId: KEY, published: true },
        },
        201
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    await finalizeFund(payload, { key: KEY, etag: '"0123456789abcdef"' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/funds/finalize'),
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({
          'Idempotency-Key': KEY,
          'If-Match': '"0123456789abcdef"',
        }),
      })
    );
  });

  it('omits If-Match for an ID-less finalize', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          success: true,
          data: { fundId: 78, configVersion: 1, correlationId: KEY, published: true },
        },
        201
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const { draftFundId: _ignored, ...idless } = payload;
    await finalizeFund(idless, { key: KEY, etag: '"0123456789abcdef"' });

    const headers = (fetchMock.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers['If-Match']).toBeUndefined();
    expect(headers['Idempotency-Key']).toBe(KEY);
  });
});
