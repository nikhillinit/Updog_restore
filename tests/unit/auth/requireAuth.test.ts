import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';

const DEV_SECRET = 'dev-secret-only-for-tests-1234567890';
const ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'REQUIRE_AUTH',
  'JWT_ALG',
  '_EXPLICIT_JWT_ALG',
  'JWT_SECRET',
  '_EXPLICIT_JWT_SECRET',
  'JWT_ISSUER',
  '_EXPLICIT_JWT_ISSUER',
  'JWT_AUDIENCE',
  '_EXPLICIT_JWT_AUDIENCE',
  'JWT_JWKS_URL',
  '_EXPLICIT_JWT_JWKS_URL',
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

describe('requireAuth middleware', () => {
  const originalEnv = new Map<EnvKey, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it('bypasses bearer auth in development when REQUIRE_AUTH=0', async () => {
    process.env.NODE_ENV = 'development';
    process.env._EXPLICIT_NODE_ENV = 'development';
    process.env.REQUIRE_AUTH = '0';
    process.env.JWT_ALG = 'HS256';
    process.env._EXPLICIT_JWT_ALG = 'HS256';
    process.env.JWT_SECRET = DEV_SECRET;
    process.env._EXPLICIT_JWT_SECRET = DEV_SECRET;
    process.env.JWT_ISSUER = 'updog-dev';
    process.env._EXPLICIT_JWT_ISSUER = 'updog-dev';
    process.env.JWT_AUDIENCE = 'updog-app-dev';
    process.env._EXPLICIT_JWT_AUDIENCE = 'updog-app-dev';

    const { requireAuth } = await import('@/server/lib/auth/jwt');

    const req = {
      header: vi.fn().mockReturnValue(undefined),
      ip: '127.0.0.1',
      user: undefined,
    } as unknown as Request;
    const sendStatus = vi.fn();
    const res = { sendStatus } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth()(req, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(sendStatus).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({
      id: '1',
      sub: 'dev-user',
      email: 'dev@example.com',
      role: 'admin',
      fundIds: [],
    });
  });

  it('returns 401 without a bearer token when auth is enforced', async () => {
    process.env.NODE_ENV = 'test';
    process.env._EXPLICIT_NODE_ENV = 'test';
    process.env.REQUIRE_AUTH = '1';
    process.env.JWT_ALG = 'HS256';
    process.env._EXPLICIT_JWT_ALG = 'HS256';
    process.env.JWT_SECRET = DEV_SECRET;
    process.env._EXPLICIT_JWT_SECRET = DEV_SECRET;
    process.env.JWT_ISSUER = 'updog-dev';
    process.env._EXPLICIT_JWT_ISSUER = 'updog-dev';
    process.env.JWT_AUDIENCE = 'updog-app-dev';
    process.env._EXPLICIT_JWT_AUDIENCE = 'updog-app-dev';

    const { requireAuth } = await import('@/server/lib/auth/jwt');

    const req = {
      header: vi.fn().mockReturnValue(undefined),
      ip: '127.0.0.1',
      user: undefined,
    } as unknown as Request;
    const sendStatus = vi.fn();
    const res = { sendStatus } as unknown as Response;
    const next = vi.fn() as unknown as NextFunction;

    await requireAuth()(req, res, next);

    expect(sendStatus).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
