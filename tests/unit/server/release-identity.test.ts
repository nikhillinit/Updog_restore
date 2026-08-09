import packageJson from '../../../package.json' with { type: 'json' };
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const RELEASE_ENV_KEYS = [
  'NODE_ENV',
  'npm_package_version',
  'VERCEL_GIT_COMMIT_SHA',
  'RAILWAY_GIT_COMMIT_SHA',
  'COMMIT_REF',
] as const;

const originalEnv = new Map<string, string | undefined>();

describe('release identity', () => {
  beforeEach(() => {
    for (const key of RELEASE_ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    process.env['NODE_ENV'] = 'test';
  });

  afterEach(() => {
    for (const key of RELEASE_ENV_KEYS) {
      const value = originalEnv.get(key);
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    originalEnv.clear();
  });

  it('uses checked-out package.json version instead of npm runtime metadata', async () => {
    process.env['npm_package_version'] = '0.0.0-stale';

    const { ENGINE_VERSION, VERSION, getReleaseIdentity, getVersionInfo } =
      await import('../../../server/version');

    expect(VERSION).toBe(packageJson.version);
    expect(getReleaseIdentity().version).toBe(packageJson.version);
    expect(getVersionInfo()).toMatchObject({
      engine_version: ENGINE_VERSION,
      app_version: packageJson.version,
      commit_sha: 'local',
      environment: 'test',
    });
  });

  it('prefers Vercel commit over provider-neutral fallbacks', async () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = 'vercel-sha';
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'railway-sha';
    process.env['COMMIT_REF'] = 'generic-sha';

    const { getReleaseIdentity } = await import('../../../server/version');

    expect(getReleaseIdentity().commit).toBe('vercel-sha');
  });

  it('prefers Railway commit over COMMIT_REF when Vercel is absent', async () => {
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'railway-sha';
    process.env['COMMIT_REF'] = 'generic-sha';

    const { getReleaseIdentity } = await import('../../../server/version');

    expect(getReleaseIdentity().commit).toBe('railway-sha');
  });

  it('falls through empty provider commits to COMMIT_REF and then local', async () => {
    process.env['VERCEL_GIT_COMMIT_SHA'] = '  ';
    process.env['RAILWAY_GIT_COMMIT_SHA'] = 'railway-sha';
    process.env['COMMIT_REF'] = 'generic-sha';

    const { getReleaseIdentity, getVersionInfo } = await import('../../../server/version');

    expect(getReleaseIdentity().commit).toBe('railway-sha');

    delete process.env['RAILWAY_GIT_COMMIT_SHA'];
    expect(getReleaseIdentity().commit).toBe('generic-sha');
    expect(getVersionInfo().commit_sha).toBe('generic-sha');

    delete process.env['COMMIT_REF'];
    expect(getReleaseIdentity().commit).toBe('local');
  });
});
