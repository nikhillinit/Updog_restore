import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import healthRouter from '../../../server/routes/health';
import packageJson from '../../../package.json' with { type: 'json' };

const RELEASE_ENV_KEYS = [
  'NODE_ENV',
  'npm_package_version',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'COMMIT_REF',
] as const;

describe('/api/version contract', () => {
  const originalEnv = new Map<string, string | undefined>();
  let app: ReturnType<typeof express>;

  beforeEach(() => {
    for (const key of RELEASE_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env['NODE_ENV'] = 'production';
    app = express();
    app.use(healthRouter);
  });

  afterEach(() => {
    for (const key of RELEASE_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it('returns exact package version, selected commit, and environment from winning route', async () => {
    process.env['npm_package_version'] = '0.0.0-stale';
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'vercel-release-sha';
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'railway-release-sha';
    process.env['COMMIT_REF'] = 'generic-release-sha';

    const response = await request(app).get('/api/version');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      version: packageJson.version,
      commit: 'vercel-release-sha',
      environment: 'production',
    });
  });
});
