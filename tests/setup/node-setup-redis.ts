import { vi } from 'vitest';

/**
 * Redis mock for server tests (Node.js environment)
 *
 * Prevents real connections to localhost:6379 by mocking ioredis.
 * This mock is loaded ONLY for the server test project (Node.js environment).
 *
 * See vitest.config.ts server project setupFiles configuration.
 */

vi.mock('ioredis', () => ({
  default: class MockRedis {
    constructor() {
      // No-op constructor - prevents real Redis connection
    }

    connect = vi.fn().mockResolvedValue(undefined);
    get = vi.fn().mockResolvedValue(null);
    set = vi.fn().mockResolvedValue('OK');
    mset = vi.fn().mockResolvedValue('OK');
    del = vi.fn().mockResolvedValue(1);
    exists = vi.fn().mockResolvedValue(0);
    expire = vi.fn().mockResolvedValue(1);
    ttl = vi.fn().mockResolvedValue(-1);
    quit = vi.fn().mockResolvedValue(undefined);
    disconnect = vi.fn();
    on = vi.fn().mockReturnThis();
    once = vi.fn().mockReturnThis();
  },
}));

// Ensure REDIS_URL is set to in-memory mode for tests
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'memory://';
}
