import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import packageJson from '../../../package.json' with { type: 'json' };

const RELEASE_ENV_KEYS = [
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
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'ENABLE_QUEUES',
  'ALLOW_MEMORY_STORAGE',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'COMMIT_REF',
] as const;

function countRouteRegistrations(
  stack: Array<{ route?: { path?: string }; handle?: { stack?: unknown } }>,
  path: string
): number {
  return stack.reduce((count, layer) => {
    const direct = layer.route?.path === path ? 1 : 0;
    const nested = Array.isArray(layer.handle?.stack)
      ? countRouteRegistrations(
          layer.handle.stack as Array<{ route?: { path?: string }; handle?: { stack?: unknown } }>,
          path
        )
      : 0;
    return count + direct + nested;
  }, 0);
}

describe('/api/version contract', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    vi.resetModules();
    for (const key of RELEASE_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env['NODE_ENV'] = 'production';
    process.env['_EXPLICIT_NODE_ENV'] = 'production';
    process.env['REQUIRE_AUTH'] = '1';
    process.env['JWT_ALG'] = 'HS256';
    process.env['_EXPLICIT_JWT_ALG'] = 'HS256';
    process.env['JWT_SECRET'] = 'version-contract-test-secret-minimum-32-characters';
    process.env['_EXPLICIT_JWT_SECRET'] = process.env['JWT_SECRET'];
    process.env['JWT_ISSUER'] = 'version-contract-test';
    process.env['_EXPLICIT_JWT_ISSUER'] = process.env['JWT_ISSUER'];
    process.env['JWT_AUDIENCE'] = 'version-contract-test';
    process.env['_EXPLICIT_JWT_AUDIENCE'] = process.env['JWT_AUDIENCE'];
    process.env['REDIS_URL'] = 'memory://';
    process.env['_EXPLICIT_REDIS_URL'] = process.env['REDIS_URL'];
    process.env['ENABLE_QUEUES'] = '0';
    process.env['ALLOW_MEMORY_STORAGE'] = '1';
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'vercel-release-sha';
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'railway-release-sha';
    process.env['COMMIT_REF'] = 'generic-release-sha';
  });

  afterEach(() => {
    vi.resetModules();
    for (const key of RELEASE_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it('serves the canonical anonymous public release contract from the actual app', async () => {
    const { makeApp } = await import('../../../server/app');
    const response = await request(makeApp()).get('/api/version');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'arch',
      'commit',
      'environment',
      'nodeVersion',
      'platform',
      'timestamp',
      'version',
    ]);
    expect(response.body).toMatchObject({
      version: packageJson.version,
      commit: 'vercel-release-sha',
      environment: 'production',
    });
    expect(response.body).not.toHaveProperty('deploymentId');
    expect(response.body).not.toHaveProperty('workerType');
    expect(response.body).not.toHaveProperty('provider');
    expect(response.body).not.toHaveProperty('providerId');
    expect(response.body).not.toHaveProperty('controlPlane');
  });

  it('registers /api/version exactly once on the actual app surface', async () => {
    const { makeApp } = await import('../../../server/app');
    const app = makeApp() as unknown as {
      router: { stack: Array<{ route?: { path?: string }; handle?: { stack?: unknown } }> };
    };

    expect(countRouteRegistrations(app.router.stack, '/api/version')).toBe(1);
  });
});
