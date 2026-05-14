import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import jwt from 'jsonwebtoken';

const TEST_SECRET = 'provided-scope-test-secret-minimum-32-chars';
const OTHER_SECRET = 'provided-scope-other-secret-minimum-32-chars';
const TEST_ISSUER = 'updog-test';
const TEST_AUDIENCE = 'updog-app-test';
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
] as const;

type EnvKey = (typeof ENV_KEYS)[number];

function setJwtEnv(nodeEnv: 'development' | 'test' | 'staging' | 'production' = 'test'): void {
  process.env.NODE_ENV = nodeEnv;
  process.env._EXPLICIT_NODE_ENV = nodeEnv;
  process.env.REQUIRE_AUTH = nodeEnv === 'development' ? '0' : '1';
  process.env.JWT_ALG = 'HS256';
  process.env._EXPLICIT_JWT_ALG = 'HS256';
  process.env.JWT_SECRET = TEST_SECRET;
  process.env._EXPLICIT_JWT_SECRET = TEST_SECRET;
  process.env.JWT_ISSUER = TEST_ISSUER;
  process.env._EXPLICIT_JWT_ISSUER = TEST_ISSUER;
  process.env.JWT_AUDIENCE = TEST_AUDIENCE;
  process.env._EXPLICIT_JWT_AUDIENCE = TEST_AUDIENCE;
}

function signToken(
  payload: Record<string, unknown>,
  options: { secret?: string; expiresIn?: string } = {}
): string {
  return jwt.sign(
    {
      sub: 'scope-test-user',
      email: 'scope-test@example.com',
      role: 'user',
      ...payload,
    },
    options.secret ?? TEST_SECRET,
    {
      algorithm: 'HS256',
      issuer: TEST_ISSUER,
      audience: TEST_AUDIENCE,
      expiresIn: options.expiresIn ?? '1h',
    }
  );
}

function makeRequest(authorization?: string, user?: Express.User): Request {
  return {
    header: vi.fn((name: string) => {
      const normalized = name.toLowerCase();
      if (normalized === 'authorization') return authorization;
      if (normalized === 'user-agent') return 'vitest';
      return undefined;
    }),
    ip: '127.0.0.1',
    user,
  } as unknown as Request;
}

function makeResponse(): {
  res: Response;
  status: ReturnType<typeof vi.fn>;
  json: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });

  return {
    res: { status } as unknown as Response,
    status,
    json,
  };
}

describe('enforceProvidedFundScope', () => {
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

  it('allows missing bearer tokens in development auth-bypass mode', async () => {
    setJwtEnv('development');
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(), res, 77)).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
  });

  it('honors upstream user fund scope when no bearer token is provided in test mode', async () => {
    setJwtEnv();
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();
    const req = makeRequest(undefined, {
      id: 'upstream-user',
      sub: 'upstream-user',
      email: 'upstream@example.com',
      roles: [],
      fundIds: [99],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: 'You do not have access to fund 77',
    });
  });

  it('throws on missing bearer tokens in production mode', async () => {
    setJwtEnv('production');
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(), res, 77)).rejects.toThrow(
      'Missing bearer token while enforcing provided fund scope in production'
    );
  });

  it('throws on missing bearer tokens in staging mode', async () => {
    setJwtEnv('staging');
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(), res, 77)).rejects.toThrow(
      'Missing bearer token while enforcing provided fund scope in staging'
    );
  });

  it('allows scoped bearer tokens for listed funds', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [77] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const req = makeRequest(`Bearer ${token}`);

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({
      id: 'scope-test-user',
      email: 'scope-test@example.com',
      fundIds: [77],
    });
  });

  it('treats empty fundIds as unrestricted admin or service scope', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(`Bearer ${token}`), res, 999)).resolves.toBe(
      true
    );
    expect(status).not.toHaveBeenCalled();
  });

  it('returns 403 for tokens scoped to a different fund', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [78] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(`Bearer ${token}`), res, 77)).resolves.toBe(
      false
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: 'You do not have access to fund 77',
    });
  });

  it('returns 401 for wrong-secret tokens', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [77] }, { secret: OTHER_SECRET });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(`Bearer ${token}`), res, 77)).resolves.toBe(
      false
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Invalid authorization token',
    });
  });

  it('returns 401 for expired tokens', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [77] }, { expiresIn: '-1s' });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(`Bearer ${token}`), res, 77)).resolves.toBe(
      false
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({
      error: 'Unauthorized',
      message: 'Invalid authorization token',
    });
  });

  it('preserves upstream orgId and lpId when the token omits them', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [77] });
    const existingUser: Express.User = {
      id: 'upstream-user',
      sub: 'upstream-user',
      email: 'upstream@example.com',
      role: 'lp',
      roles: ['lp'],
      orgId: 'org-from-upstream',
      lpId: 42,
      fundIds: [77],
      ip: '127.0.0.1',
      userAgent: 'upstream',
    };
    const req = makeRequest(`Bearer ${token}`, existingUser);
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res } = makeResponse();

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(true);

    expect(req.user).toMatchObject({
      id: 'scope-test-user',
      orgId: 'org-from-upstream',
      lpId: 42,
      fundIds: [77],
    });
  });
});
