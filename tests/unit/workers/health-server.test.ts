import packageJson from '../../../package.json' with { type: 'json' };
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createWorkerHealthApp, resetWorkerStats } from '../../../workers/health-server';

const RELEASE_ENV_KEYS = [
  'NODE_ENV',
  'npm_package_version',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'COMMIT_REF',
] as const;

describe('worker health app', () => {
  const originalEnv = new Map<string, string | undefined>();

  beforeEach(() => {
    resetWorkerStats();
    for (const key of RELEASE_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env['NODE_ENV'] = 'production';
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'worker-railway-sha';
  });

  afterEach(() => {
    resetWorkerStats();
    for (const key of RELEASE_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it('serves release identity without inventing queue registration or consumption', async () => {
    const response = await request(createWorkerHealthApp()).get('/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'healthy',
      version: packageJson.version,
      commit: 'worker-railway-sha',
      environment: 'production',
      workers: [],
      metrics: { totalJobsProcessed: 0, totalErrors: 0 },
    });
    expect(response.body).not.toHaveProperty('queue');
    expect(response.body).not.toHaveProperty('registered');
    expect(response.body).not.toHaveProperty('consuming');
  });
});
