import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createReserveCalculationIntent,
  executeReserveCalculationCommand,
  type ReserveCalculationIntent,
} from '../../../client/src/lib/fund-scenario-reserve-command';

const FUND_ID = 123;
const SCENARIO_SET_ID = '00000000-0000-0000-0000-000000000211';
const RESERVE_URL = `/api/funds/${FUND_ID}/scenario-sets/${SCENARIO_SET_ID}/calculate-reserve`;

function queuedBody() {
  return {
    fundId: FUND_ID,
    scenarioSetId: SCENARIO_SET_ID,
    calculationMode: 'async_reserve_allocation' as const,
    status: 'queued' as const,
    jobId: 'fund-scenario-123-reserve',
    correlationId: '00000000-0000-0000-0000-000000000998',
  };
}

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function intent(key = 'test-key-1'): ReserveCalculationIntent {
  return { idempotencyKey: key, body: { calculationMode: 'async_reserve_allocation' } };
}

function execute(overrides: { intent?: ReserveCalculationIntent; sleep?: (ms: number) => Promise<void> } = {}) {
  return executeReserveCalculationCommand({
    fundId: FUND_ID,
    scenarioSetId: SCENARIO_SET_ID,
    intent: overrides.intent ?? intent(),
    ...(overrides.sleep ? { sleep: overrides.sleep } : {}),
  });
}

describe('createReserveCalculationIntent', () => {
  it('mints one key per intent from the injected uuid source', () => {
    const created = createReserveCalculationIntent(() => 'uuid-1');
    expect(created).toEqual({
      idempotencyKey: 'uuid-1',
      body: { calculationMode: 'async_reserve_allocation' },
    });
  });

  it('produces a non-empty key with the default uuid source', () => {
    const created = createReserveCalculationIntent();
    expect(created.idempotencyKey.length).toBeGreaterThan(0);
  });
});

describe('executeReserveCalculationCommand', () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function sentKeys(): string[] {
    return fetchSpy.mock.calls.map(
      ([, init]) => (init?.headers as Record<string, string>)['Idempotency-Key']
    );
  }

  it('posts the intent body with the Idempotency-Key header and parses the 202 reply', async () => {
    fetchSpy.mockResolvedValueOnce(jsonResponse(queuedBody(), 202));

    const outcome = await execute({ intent: intent('key-abc') });

    expect(outcome).toEqual({ kind: 'queued', response: queuedBody() });
    expect(fetchSpy).toHaveBeenCalledWith(
      RESERVE_URL,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ calculationMode: 'async_reserve_allocation' }),
        headers: expect.objectContaining({ 'Idempotency-Key': 'key-abc' }),
      })
    );
  });

  it('retries a 409 lease conflict at most twice with the same key, then reports in_progress', async () => {
    // Fresh Response per call: a Response body is single-use.
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error: 'idempotency_request_in_progress', code: 'idempotency_request_in_progress' },
          409,
          { 'Retry-After': '1' }
        )
      )
    );
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await execute({ sleep });

    expect(outcome).toEqual({ kind: 'in_progress' });
    expect(fetchSpy).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    expect(sentKeys()).toEqual(['test-key-1', 'test-key-1', 'test-key-1']);
  });

  it('waits the parsed Retry-After duration between 409 retries', async () => {
    fetchSpy.mockImplementation(() =>
      Promise.resolve(
        jsonResponse(
          { error: 'idempotency_request_in_progress', code: 'idempotency_request_in_progress' },
          409,
          { 'Retry-After': '2' }
        )
      )
    );
    const sleep = vi.fn().mockResolvedValue(undefined);

    await execute({ sleep });

    expect(sleep).toHaveBeenNthCalledWith(1, 2000);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000);
  });

  it.each([['abc'], ['-1'], ['31'], ['1.5']])(
    'falls back to 1000ms when Retry-After is %s',
    async (retryAfter) => {
      fetchSpy.mockImplementation(() =>
        Promise.resolve(
          jsonResponse(
            { error: 'idempotency_request_in_progress', code: 'idempotency_request_in_progress' },
            409,
            { 'Retry-After': retryAfter }
          )
        )
      );
      const sleep = vi.fn().mockResolvedValue(undefined);

      await execute({ sleep });

      expect(sleep).toHaveBeenNthCalledWith(1, 1000);
    }
  );

  it('resolves queued when a 409 lease clears before the retry budget runs out', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        jsonResponse(
          { error: 'idempotency_request_in_progress', code: 'idempotency_request_in_progress' },
          409
        )
      )
      .mockResolvedValueOnce(jsonResponse(queuedBody(), 202));
    const sleep = vi.fn().mockResolvedValue(undefined);

    const outcome = await execute({ sleep });

    expect(outcome.kind).toBe('queued');
    expect(sleep).toHaveBeenCalledTimes(1);
    expect(sentKeys()).toEqual(['test-key-1', 'test-key-1']);
  });

  it('maps 422 idempotency_key_reused to inputs_changed', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: 'idempotency_key_reused', code: 'idempotency_key_reused' }, 422)
    );

    expect(await execute()).toEqual({ kind: 'inputs_changed' });
  });

  it('maps 503 scenario_calculation_queue_unavailable to queue_unavailable', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse(
        { error: 'internal_error', code: 'scenario_calculation_queue_unavailable' },
        503
      )
    );

    expect(await execute()).toEqual({ kind: 'queue_unavailable' });
  });

  it.each([[400], [401], [403], [404], [428]])(
    'maps pre-claim terminal status %d to terminal_error without retrying',
    async (status) => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ error: 'request_rejected', message: 'Request rejected' }, status)
      );

      const outcome = await execute();

      expect(outcome).toEqual({ kind: 'terminal_error', message: 'Request rejected' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }
  );

  it.each([[408], [429], [500]])(
    'maps ambiguous status %d to retryable_error without an automatic retry',
    async (status) => {
      fetchSpy.mockResolvedValueOnce(
        jsonResponse({ error: 'transient', message: 'Try again' }, status)
      );

      const outcome = await execute();

      expect(outcome).toEqual({ kind: 'retryable_error', message: 'Try again' });
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    }
  );

  it('maps a 409 without the lease error code to retryable_error, not the lease loop', async () => {
    fetchSpy.mockResolvedValueOnce(
      jsonResponse({ error: 'conflict', message: 'Some other conflict' }, 409)
    );
    const sleep = vi.fn();

    const outcome = await execute({ sleep });

    expect(outcome).toEqual({ kind: 'retryable_error', message: 'Some other conflict' });
    expect(sleep).not.toHaveBeenCalled();
  });

  it('maps a network failure to retryable_error', async () => {
    fetchSpy.mockRejectedValueOnce(new TypeError('Failed to fetch'));

    expect(await execute()).toEqual({ kind: 'retryable_error', message: 'Failed to fetch' });
  });
});
