import { describe, it, expect } from 'vitest';

/**
 * Import-smoke tests verify that critical server modules can be imported
 * without triggering side effects (e.g., starting the server, connecting
 * to Redis, or reading env vars at module scope).
 *
 * If any of these fail, it means an import is eagerly executing code that
 * should be deferred to explicit function calls.
 */

describe('import-smoke: side-effect-free module loading', () => {
  it('bootstrap exports bootstrap() without starting the server', async () => {
    // bootstrap.ts transitively loads providers.js + server.js which are heavy;
    // 30s covers cold module resolution when running full suite in CI
    const mod = await import('../../../server/bootstrap.js');
    expect(typeof mod.bootstrap).toBe('function');
  }, 30_000);

  it('config/index exports loadEnv without calling it', async () => {
    const mod = await import('../../../server/config/index.js');
    expect(typeof mod.loadEnv).toBe('function');
    expect(typeof mod.getConfig).toBe('function');
  });

  it('lib/auth/jwt exports verifiers without triggering config', async () => {
    const mod = await import('../../../server/lib/auth/jwt.js');
    expect(typeof mod.verifyAccessToken).toBe('function');
    expect(typeof mod.verifyAccessTokenAsync).toBe('function');
    expect(typeof mod.signToken).toBe('function');
    expect(typeof mod.requireAuth).toBe('function');
  });

  it('lib/secure-context exports types and functions without DB access', async () => {
    const mod = await import('../../../server/lib/secure-context.js');
    expect(typeof mod.extractUserContext).toBe('function');
    expect(typeof mod.requireSecureContext).toBe('function');
  });

  it('health/state exports without triggering side effects', async () => {
    const mod = await import('../../../server/health/state.js');
    expect(typeof mod.setReady).toBe('function');
    expect(typeof mod.isReady).toBe('function');
  });
});
