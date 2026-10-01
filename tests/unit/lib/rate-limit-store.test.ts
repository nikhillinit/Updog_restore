import type { Options } from 'express-rate-limit';
import { afterEach, expect, it, vi } from 'vitest';
import { createRateLimitStore } from '../../../server/lib/rateLimitStore';

const { ping, disconnect, call } = vi.hoisted(() => ({
  ping: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
  disconnect: vi.fn(),
  call: vi.fn(),
}));
vi.mock('ioredis', () => ({
  default: class {
    ping = ping;
    disconnect = disconnect;
    call = call;
  },
}));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

it('requires shared storage for a global limiter', async () => {
  vi.stubEnv('RATE_LIMIT_REDIS_URL', '');
  await expect(createRateLimitStore(true)).rejects.toMatchObject({ status: 503 });
  await expect(createRateLimitStore()).resolves.toBeUndefined();
});

it('fails closed and closes the failed Redis connection', async () => {
  vi.stubEnv('RATE_LIMIT_REDIS_URL', 'redis://127.0.0.1:6379');
  await expect(createRateLimitStore(true)).rejects.toMatchObject({ status: 503 });
  expect(disconnect).toHaveBeenCalledOnce();
});

it('preserves the Redis increment tuple for the shared limiter', async () => {
  vi.stubEnv('RATE_LIMIT_REDIS_URL', 'redis://127.0.0.1:6379');
  ping.mockResolvedValueOnce('PONG');
  call.mockImplementation(async (command: string) => {
    if (command === 'SCRIPT') return 'script-sha';
    if (command === 'EVALSHA') return [1, 60_000];
    throw new Error('Unexpected Redis command');
  });

  const store = await createRateLimitStore(true);
  expect(store).toBeDefined();
  await store!.init!({ windowMs: 60_000 } as Options);
  await expect(store!.increment('test-client')).resolves.toEqual({
    totalHits: 1,
    resetTime: expect.any(Date),
  });
  expect(call).toHaveBeenCalledWith(
    'EVALSHA',
    'script-sha',
    '1',
    'rate-limit:test-client',
    '60000'
  );
});
