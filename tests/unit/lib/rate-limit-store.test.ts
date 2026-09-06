import { afterEach, expect, it, vi } from 'vitest';
import { createRateLimitStore } from '../../../server/lib/rateLimitStore';

const { ping, disconnect } = vi.hoisted(() => ({
  ping: vi.fn().mockRejectedValue(new Error('Redis unavailable')),
  disconnect: vi.fn(),
}));
vi.mock('ioredis', () => ({
  default: class {
    ping = ping;
    disconnect = disconnect;
  },
}));
vi.mock('rate-limit-redis', () => ({ default: class {} }));
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
