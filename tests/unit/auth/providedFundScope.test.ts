import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextFunction, Request, Response } from 'express';
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

function makeRequest(authorization?: string, user?: Express.User, cookie?: string): Request {
  return {
    headers: {
      ...(authorization !== undefined ? { authorization } : {}),
      ...(cookie !== undefined ? { cookie } : {}),
    },
    header: vi.fn((name: string) => {
      const normalized = name.toLowerCase();
      if (normalized === 'authorization') return authorization;
      if (normalized === 'cookie') return cookie;
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

  it('fails closed on missing user credentials in production mode', async () => {
    setJwtEnv('production');
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(), res, 77)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(401);
  });

  it('fails closed on missing user credentials in staging mode', async () => {
    setJwtEnv('staging');
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(), res, 77)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(401);
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

  it('allows a scoped browser session cookie for a listed fund', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [77] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const req = makeRequest(undefined, undefined, `updog.session=${token}`);

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(true);
    expect(status).not.toHaveBeenCalled();
    expect(req.user).toMatchObject({
      id: 'scope-test-user',
      email: 'scope-test@example.com',
      fundIds: [77],
    });
  });

  it('rejects simultaneous browser cookie and Bearer credentials', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [77] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();

    await expect(
      enforceProvidedFundScope(
        makeRequest(`Bearer ${token}`, undefined, `updog.session=${token}`),
        res,
        77
      )
    ).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(401);
    expect(json).toHaveBeenCalledWith({ error: 'ambiguous_credentials' });
  });

  it('treats empty fundIds as unrestricted admin scope', async () => {
    setJwtEnv();
    const token = signToken({ role: 'admin', fundIds: [] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(`Bearer ${token}`), res, 999)).resolves.toBe(
      true
    );
    expect(status).not.toHaveBeenCalled();
  });

  it('returns 403 for a non-admin token with empty fund grants', async () => {
    setJwtEnv();
    const token = signToken({ role: 'analyst', fundIds: [] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();

    await expect(enforceProvidedFundScope(makeRequest(`Bearer ${token}`), res, 999)).resolves.toBe(
      false
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: 'You do not have access to fund 999',
    });
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

  it('allows a team-member GET across funds and exposes unrestricted read scope', async () => {
    setJwtEnv();
    const token = signToken({ role: 'analyst', fundIds: [78] });
    const { enforceProvidedFundScope, getVerifiedFundScope } = await import(
      '@/server/lib/auth/provided-fund-scope'
    );
    const { res, status } = makeResponse();
    const req = makeRequest(`Bearer ${token}`);
    req.method = 'GET';

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(true);
    await expect(getVerifiedFundScope(req)).resolves.toEqual({
      unrestricted: true,
      fundIds: [78],
    });
    expect(status).not.toHaveBeenCalled();
  });

  it('keeps a persisting GET strict when forWrite is set', async () => {
    setJwtEnv();
    const token = signToken({ role: 'analyst', fundIds: [78] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const req = makeRequest(`Bearer ${token}`);
    req.method = 'GET';

    await expect(
      enforceProvidedFundScope(req, res, 77, { forWrite: true })
    ).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('keeps cross-fund POST requests strict', async () => {
    setJwtEnv();
    const token = signToken({ role: 'analyst', fundIds: [78] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const req = makeRequest(`Bearer ${token}`);
    req.method = 'POST';

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(403);
  });

  it('keeps LP GET requests fund-scoped', async () => {
    setJwtEnv();
    const token = signToken({ role: 'lp', fundIds: [78] });
    const { enforceProvidedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const req = makeRequest(`Bearer ${token}`);
    req.method = 'GET';

    await expect(enforceProvidedFundScope(req, res, 77)).resolves.toBe(false);
    expect(status).toHaveBeenCalledWith(403);
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
      message: 'Invalid authentication credential',
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
      message: 'Invalid authentication credential',
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

describe('requireProvidedFundScopeFrom', () => {
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

  function makeScopedRequest(
    source: 'body' | 'query',
    fundId: unknown,
    authorization?: string
  ): Request {
    const req = makeRequest(authorization);
    (req as unknown as Record<string, unknown>)[source] = { fundId };
    return req;
  }

  it('allows a canonical body fundId that matches the token scope', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [7] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const next = vi.fn();

    await requireProvidedFundScopeFrom('body')(
      makeScopedRequest('body', 7, `Bearer ${token}`),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('allows a canonical numeric-string query fundId that matches the token scope', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [7] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const next = vi.fn();

    await requireProvidedFundScopeFrom('query')(
      makeScopedRequest('query', '7', `Bearer ${token}`),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('rejects a missing fundId with 400 and does not call next', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [7] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();
    const next = vi.fn();

    await requireProvidedFundScopeFrom('body')(
      makeScopedRequest('body', undefined, `Bearer ${token}`),
      res,
      next as unknown as NextFunction
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: 'invalid_fund_id',
      message: 'Fund ID must be a positive integer',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects zero and negative fundIds with 400', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [7] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const next = vi.fn();

    for (const bad of [0, -1, '0', '-3']) {
      const { res, status } = makeResponse();
      await requireProvidedFundScopeFrom('query')(
        makeScopedRequest('query', bad, `Bearer ${token}`),
        res,
        next as unknown as NextFunction
      );
      expect(status).toHaveBeenCalledWith(400);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects non-canonical fundIds (1e1, leading zero, float, array) with 400', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [10] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const next = vi.fn();

    for (const bad of ['1e1', '0123', '1.5', [10]]) {
      const { res, status } = makeResponse();
      await requireProvidedFundScopeFrom('query')(
        makeScopedRequest('query', bad, `Bearer ${token}`),
        res,
        next as unknown as NextFunction
      );
      expect(status).toHaveBeenCalledWith(400);
    }
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 without calling next when the token is scoped to another fund', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [8] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status, json } = makeResponse();
    const next = vi.fn();

    await requireProvidedFundScopeFrom('query')(
      makeScopedRequest('query', '7', `Bearer ${token}`),
      res,
      next as unknown as NextFunction
    );

    expect(status).toHaveBeenCalledWith(403);
    expect(json).toHaveBeenCalledWith({
      error: 'Forbidden',
      code: 'FUND_ACCESS_DENIED',
      message: 'You do not have access to fund 7',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next for an empty-scope (admin) token', async () => {
    setJwtEnv();
    const token = signToken({ role: 'admin', fundIds: [] });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const next = vi.fn();

    await requireProvidedFundScopeFrom('body')(
      makeScopedRequest('body', 12345, `Bearer ${token}`),
      res,
      next as unknown as NextFunction
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(status).not.toHaveBeenCalled();
  });

  it('returns 401 without calling next for an invalid token', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [7] }, { secret: OTHER_SECRET });
    const { requireProvidedFundScopeFrom } = await import('@/server/lib/auth/provided-fund-scope');
    const { res, status } = makeResponse();
    const next = vi.fn();

    await requireProvidedFundScopeFrom('query')(
      makeScopedRequest('query', '7', `Bearer ${token}`),
      res,
      next as unknown as NextFunction
    );

    expect(status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('getVerifiedFundScope', () => {
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

  it('maps an admin token to unrestricted', async () => {
    setJwtEnv();
    const token = signToken({ role: 'admin', fundIds: [] });
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest(`Bearer ${token}`))).resolves.toEqual({
      unrestricted: true,
      fundIds: [],
    });
  });

  it('maps a non-admin token with empty grants to restricted empty scope', async () => {
    setJwtEnv();
    const token = signToken({ role: 'analyst', fundIds: [] });
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest(`Bearer ${token}`))).resolves.toEqual({
      unrestricted: false,
      fundIds: [],
    });
  });

  it('maps a scoped token to its fund list', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [1, 2] });
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest(`Bearer ${token}`))).resolves.toEqual({
      unrestricted: false,
      fundIds: [1, 2],
    });
  });

  it('maps a scoped browser session cookie to its fund list', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [1, 2] });
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(
      getVerifiedFundScope(makeRequest(undefined, undefined, `updog.session=${token}`))
    ).resolves.toEqual({
      unrestricted: false,
      fundIds: [1, 2],
    });
  });

  it('returns null for an invalid (wrong-secret) token', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [1] }, { secret: OTHER_SECRET });
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest(`Bearer ${token}`))).resolves.toBeNull();
  });

  it('returns null for an expired token', async () => {
    setJwtEnv();
    const token = signToken({ fundIds: [1] }, { expiresIn: '-1s' });
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest(`Bearer ${token}`))).resolves.toBeNull();
  });

  it('mirrors the dev bypass: no token in development resolves to unrestricted', async () => {
    setJwtEnv('development');
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest())).resolves.toEqual({
      unrestricted: true,
      fundIds: [],
    });
  });

  it('honors an upstream user scope when no token is present in test mode', async () => {
    setJwtEnv();
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const req = makeRequest(undefined, {
      id: 'upstream',
      sub: 'upstream',
      email: 'upstream@example.com',
      roles: [],
      fundIds: [99],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    await expect(getVerifiedFundScope(req)).resolves.toEqual({
      unrestricted: false,
      fundIds: [99],
    });
  });

  it('treats an upstream admin as unrestricted when no token is present in test mode', async () => {
    setJwtEnv();
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const req = makeRequest(undefined, {
      id: 'upstream-admin',
      sub: 'upstream-admin',
      email: 'admin@example.com',
      role: 'admin',
      roles: ['admin'],
      fundIds: [],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    await expect(getVerifiedFundScope(req)).resolves.toEqual({
      unrestricted: true,
      fundIds: [],
    });
  });

  it('treats an upstream non-admin with empty grants as restricted in test mode', async () => {
    setJwtEnv();
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');
    const req = makeRequest(undefined, {
      id: 'upstream-analyst',
      sub: 'upstream-analyst',
      email: 'analyst@example.com',
      role: 'analyst',
      roles: ['analyst'],
      fundIds: [],
      ip: '127.0.0.1',
      userAgent: 'vitest',
    });

    await expect(getVerifiedFundScope(req)).resolves.toEqual({
      unrestricted: false,
      fundIds: [],
    });
  });

  it('returns null for missing user credentials outside development/test', async () => {
    setJwtEnv('production');
    const { getVerifiedFundScope } = await import('@/server/lib/auth/provided-fund-scope');

    await expect(getVerifiedFundScope(makeRequest())).resolves.toBeNull();
  });
});
