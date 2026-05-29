import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/ci_test';

describe('server config env preservation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it('keeps explicit CI database settings after dotenv loading', async () => {
    process.env.NODE_ENV = 'test';
    process.env._EXPLICIT_NODE_ENV = 'test';
    process.env.DATABASE_URL = DATABASE_URL;
    process.env._EXPLICIT_DATABASE_URL = DATABASE_URL;
    process.env.ALLOW_MEMORY_STORAGE = '0';
    process.env._EXPLICIT_ALLOW_MEMORY_STORAGE = '0';
    process.env.REDIS_URL = 'memory://';
    process.env._EXPLICIT_REDIS_URL = 'memory://';
    process.env.JWT_ALG = 'HS256';
    process.env._EXPLICIT_JWT_ALG = 'HS256';
    process.env.JWT_SECRET = 'config-test-secret-minimum-32-characters';
    process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;

    const { loadEnv } = await import('../../../server/config/index.js');
    const config = loadEnv();

    expect(config.NODE_ENV).toBe('test');
    expect(config.DATABASE_URL).toBe(DATABASE_URL);
    expect(config.ALLOW_MEMORY_STORAGE).toBe(false);
  });
});
