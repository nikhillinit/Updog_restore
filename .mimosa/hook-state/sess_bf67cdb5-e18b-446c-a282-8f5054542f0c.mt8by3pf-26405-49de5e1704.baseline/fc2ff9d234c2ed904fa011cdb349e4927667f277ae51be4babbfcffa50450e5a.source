import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = {
  NODE_ENV: process.env.NODE_ENV,
  REQUIRE_AUTH: process.env.REQUIRE_AUTH,
  _EXPLICIT_NODE_ENV: process.env._EXPLICIT_NODE_ENV,
};

describe('development auth bypass configuration', () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.NODE_ENV = 'development';
    process.env._EXPLICIT_NODE_ENV = 'development';
    delete process.env.REQUIRE_AUTH;
  });

  afterEach(() => {
    vi.resetModules();
    if (ORIGINAL_ENV.NODE_ENV === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = ORIGINAL_ENV.NODE_ENV;
    }

    if (ORIGINAL_ENV.REQUIRE_AUTH === undefined) {
      delete process.env.REQUIRE_AUTH;
    } else {
      process.env.REQUIRE_AUTH = ORIGINAL_ENV.REQUIRE_AUTH;
    }

    if (ORIGINAL_ENV._EXPLICIT_NODE_ENV === undefined) {
      delete process.env._EXPLICIT_NODE_ENV;
    } else {
      process.env._EXPLICIT_NODE_ENV = ORIGINAL_ENV._EXPLICIT_NODE_ENV;
    }
  });

  it('loads REQUIRE_AUTH=false from .env.development for local development', async () => {
    const { loadEnv } = await import('../../server/config/index.js');

    const cfg = loadEnv();

    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.REQUIRE_AUTH).toBe(false);
  });

  it('does not leak the development auth bypass into explicit non-development modes', async () => {
    process.env.NODE_ENV = 'test';
    process.env._EXPLICIT_NODE_ENV = 'test';
    delete process.env.REQUIRE_AUTH;

    const { loadEnv } = await import('../../server/config/index.js');

    const cfg = loadEnv();

    expect(cfg.NODE_ENV).toBe('test');
    expect(cfg.REQUIRE_AUTH).toBe(true);
  });
});
