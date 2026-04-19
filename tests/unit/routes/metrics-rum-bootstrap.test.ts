import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';

const { installRumIngressGuardsMock } = vi.hoisted(() => ({
  installRumIngressGuardsMock: vi.fn(),
}));

vi.mock('../../../server/routes/metrics-rum-ingress.js', () => ({
  installRumIngressGuards: installRumIngressGuardsMock,
}));

import { makeApp } from '../../../server/app';

describe('RUM bootstrap wiring', () => {
  beforeEach(() => {
    installRumIngressGuardsMock.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it('installs the shared rum ingress helper in makeApp', () => {
    makeApp();

    expect(installRumIngressGuardsMock).toHaveBeenCalledTimes(1);
  });

  it('installs the shared rum ingress helper in createServer with memory providers', async () => {
    process.env.NODE_ENV = 'development';
    process.env.REDIS_URL = 'memory://';
    process.env._EXPLICIT_REDIS_URL = process.env.REDIS_URL;
    process.env.ENABLE_QUEUES = '0';
    process.env.ALLOW_MEMORY_STORAGE = '1';
    delete process.env.DATABASE_URL;
    delete process.env.NEON_DATABASE_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.QUEUE_REDIS_URL;
    delete process.env.SESSION_REDIS_URL;

    const configModule = await import('../../../server/config/index.js');
    const providersModule = await import('../../../server/providers.js');
    const serverModule = await import('../../../server/server.js');

    const cfg = configModule.loadEnv();
    const providers = await providersModule.buildProviders(cfg);
    let app: Server | null = null;

    try {
      app = await serverModule.createServer(cfg, providers);
      expect(app).toBeDefined();
      expect(installRumIngressGuardsMock).toHaveBeenCalledTimes(1);
    } finally {
      await providers.teardown?.();
      await new Promise<void>((resolve, reject) => {
        if (!app || !app.listening) {
          resolve();
          return;
        }

        app.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }
  }, 20000);
});
