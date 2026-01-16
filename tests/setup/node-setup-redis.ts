import { vi } from 'vitest';

/**
 * Redis mock for server tests (Node.js environment)
 *
 * Prevents real connections to localhost:6379 by mocking ioredis.
 * This mock is loaded ONLY for the server test project (Node.js environment).
 *
 * See vitest.config.ts server project setupFiles configuration.
 */

vi.mock('ioredis', () => {
  // Shared in-memory store across all MockRedis instances
  const store = new Map<string, { value: string; expiry?: number }>();

  return {
    default: class MockRedis {
      constructor() {
        // No-op constructor - prevents real Redis connection
      }

      connect = vi.fn().mockResolvedValue(undefined);

      get = vi.fn().mockImplementation(async (key: string) => {
        const entry = store.get(key);
        if (!entry) return null;
        if (entry.expiry && Date.now() > entry.expiry) {
          store.delete(key);
          return null;
        }
        return entry.value;
      });

      set = vi.fn().mockImplementation(async (key: string, value: string, ...args: unknown[]) => {
        let expiry: number | undefined;
        // Handle EX option: set('key', 'val', 'EX', seconds)
        for (let i = 0; i < args.length; i++) {
          if (args[i] === 'EX' && typeof args[i + 1] === 'number') {
            expiry = Date.now() + (args[i + 1] as number) * 1000;
          }
        }
        store.set(key, { value, expiry });
        return 'OK';
      });

      setex = vi.fn().mockImplementation(async (key: string, seconds: number, value: string) => {
        const expiry = Date.now() + seconds * 1000;
        store.set(key, { value, expiry });
        return 'OK';
      });

      mset = vi.fn().mockResolvedValue('OK');

      del = vi.fn().mockImplementation(async (key: string) => {
        const existed = store.has(key);
        store.delete(key);
        return existed ? 1 : 0;
      });

      exists = vi.fn().mockImplementation(async (key: string) => {
        return store.has(key) ? 1 : 0;
      });

      expire = vi.fn().mockImplementation(async (key: string, seconds: number) => {
        const entry = store.get(key);
        if (!entry) return 0;
        entry.expiry = Date.now() + seconds * 1000;
        return 1;
      });

      ttl = vi.fn().mockImplementation(async (key: string) => {
        const entry = store.get(key);
        if (!entry) return -2;
        if (!entry.expiry) return -1;
        return Math.max(0, Math.floor((entry.expiry - Date.now()) / 1000));
      });

      quit = vi.fn().mockResolvedValue(undefined);
      disconnect = vi.fn();
      on = vi.fn().mockReturnThis();
      once = vi.fn().mockReturnThis();

      // Clear store for test isolation
      static _clearStore() {
        store.clear();
      }
    },
  };
});

// Ensure REDIS_URL is set to in-memory mode for tests
if (!process.env.REDIS_URL) {
  process.env.REDIS_URL = 'memory://';
}
