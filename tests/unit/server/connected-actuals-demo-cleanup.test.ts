import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Pool } from 'pg';
import { describe, expect, it, vi } from 'vitest';

import { closeServer, runConnectedActualsDemo } from '../../helpers/connected-actuals-demo';

const { portfolioCleanup } = vi.hoisted(() => ({ portfolioCleanup: vi.fn() }));

vi.mock('../../../server/websocket/dev-dashboard.js', () => ({ default: vi.fn() }));
vi.mock('../../../server/websocket/portfolio-metrics.js', () => ({
  default: vi.fn(function () {
    return { cleanup: portfolioCleanup };
  }),
  setPortfolioMetricsWS: vi.fn(),
}));
vi.mock('../../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

describe('connected actuals demo cleanup', () => {
  it('closes a never-listened server so close-bound cleanup runs', async () => {
    const server = createServer();
    const { setupWebSocketServers } = await import('../../../server/websocket/index');
    setupWebSocketServers(server);

    await expect(closeServer(server)).resolves.toBeUndefined();

    expect(portfolioCleanup).toHaveBeenCalledOnce();
    expect(server.listening).toBe(false);
    expect(server.address()).toBeNull();
  });

  it('rejects an unexpected server close error', async () => {
    const error = Object.assign(new Error('close failed'), { code: 'EIO' });
    const server = {
      close: (callback: (error?: Error) => void) => callback(error),
    } as unknown as Server;

    await expect(closeServer(server)).rejects.toBe(error);
  });

  it('preserves failed-listen and cleanup errors while completing teardown', async () => {
    const primaryError = new Error('demo failed');
    const cleanupError = new Error('cleanup failed');
    const connectionString = 'postgresql://postgres:postgres@127.0.0.1:5432/connected_demo';
    const identityRows = [{ current_database: 'connected_demo', inet_server_addr: '127.0.0.1' }];
    const inputPool = new Pool({ connectionString });
    const runtimePool = new Pool({ connectionString });
    const inputQuery = vi
      .spyOn(inputPool, 'query')
      .mockResolvedValue({ rows: identityRows } as never);
    const runtimeQuery = vi
      .spyOn(runtimePool, 'query')
      .mockResolvedValue({ rows: identityRows } as never);
    const runtimeEnd = vi.spyOn(runtimePool, 'end').mockResolvedValue(undefined);
    const providerTeardown = vi.fn().mockRejectedValue(cleanupError);
    const routeTeardown = vi.fn().mockResolvedValue(undefined);
    const setReady = vi.fn();
    const closeBoundCleanup = vi.fn();
    const server = createServer();
    server.once('close', closeBoundCleanup);
    vi.spyOn(server, 'listen').mockImplementation((() => {
      queueMicrotask(() => server.emit('error', primaryError));
      return server;
    }) as typeof server.listen);

    vi.resetModules();
    vi.doMock('../../../server/config/index.js', () => ({
      loadEnv: () => ({ ALLOW_MEMORY_STORAGE: false, REQUIRE_AUTH: true }),
    }));
    vi.doMock('../../../server/providers.js', () => ({
      buildProviders: vi.fn().mockResolvedValue({ teardown: providerTeardown }),
    }));
    vi.doMock('../../../server/server.js', () => ({
      createServer: vi.fn().mockResolvedValue(server),
    }));
    vi.doMock('../../../server/health/state.js', () => ({ setReady }));
    vi.doMock('../../../server/db.js', () => ({ pool: runtimePool }));
    vi.doMock('../../../server/routes.js', () => ({ stopRouteServices: routeTeardown }));

    const artifactDir = await mkdtemp(path.join(tmpdir(), 'connected-actuals-cleanup-'));
    const originalEnv = { ...process.env };
    Object.assign(process.env, {
      RUN_CONNECTED_ACTUALS_DEMO: '1',
      DATABASE_URL: connectionString,
      CONNECTED_DEMO_ARTIFACT_DIR: artifactDir,
      CONNECTED_DEMO_TEST_SENTINEL: 'unchanged',
    });
    const expectedEnv = { ...process.env };

    try {
      const rejection = await runConnectedActualsDemo({
        pool: inputPool,
        connectionString,
        fundId: 1,
        actorId: 2,
        fixture: { request: {} as never },
        artifactDir,
      }).catch((error: unknown) => error);

      expect(rejection).toBeInstanceOf(AggregateError);
      expect((rejection as AggregateError).errors).toEqual([primaryError, cleanupError]);
      expect(closeBoundCleanup).toHaveBeenCalledOnce();
      expect(routeTeardown).toHaveBeenCalledOnce();
      expect(providerTeardown).toHaveBeenCalledOnce();
      expect(runtimeEnd).toHaveBeenCalledOnce();
      expect(setReady).toHaveBeenLastCalledWith(false);
      expect(process.env).toEqual(expectedEnv);
      expect(server.listening).toBe(false);
      expect(server.address()).toBeNull();
    } finally {
      for (const key of Object.keys(process.env)) delete process.env[key];
      Object.assign(process.env, originalEnv);
      inputQuery.mockRestore();
      runtimeQuery.mockRestore();
      runtimeEnd.mockRestore();
      await Promise.all([inputPool.end(), runtimePool.end()]);
      await rm(artifactDir, { recursive: true, force: true });
    }
  });
});
