/**
 * Integration test for memory-only development mode
 * Verifies zero Redis connections in dev:quick
 * @group integration
 * Tests: Memory-only providers, Redis-free operation, server initialization
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import type { Server } from 'node:http';

const MEMORY_MODE_ENV_KEYS = [
  'NODE_ENV',
  '_EXPLICIT_NODE_ENV',
  'REDIS_URL',
  '_EXPLICIT_REDIS_URL',
  'ENABLE_QUEUES',
  'ALLOW_MEMORY_STORAGE',
  'DATABASE_URL',
  'NEON_DATABASE_URL',
  'RATE_LIMIT_REDIS_URL',
  'QUEUE_REDIS_URL',
  'SESSION_REDIS_URL',
  'SHUTDOWN_RETRY_AFTER_SECONDS',
] as const;

type MemoryModeEnvKey = (typeof MEMORY_MODE_ENV_KEYS)[number];

const originalEnv = new Map<MemoryModeEnvKey, string | undefined>();

function snapshotEnv(): void {
  originalEnv.clear();
  for (const key of MEMORY_MODE_ENV_KEYS) {
    originalEnv.set(key, process.env[key]);
  }
}

function restoreEnv(): void {
  for (const [key, value] of originalEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

describe('Dev memory mode', () => {
  let app: Server;
  let providers: any;
  let loadEnv: typeof import('../../server/config/index.js').loadEnv;
  let buildProviders: typeof import('../../server/providers.js').buildProviders;
  let createServer: typeof import('../../server/server.js').createServer;

  beforeAll(async () => {
    snapshotEnv();

    // Set up memory-only environment
    process.env.NODE_ENV = 'development';
    process.env._EXPLICIT_NODE_ENV = 'development';
    process.env.REDIS_URL = 'memory://';
    process.env._EXPLICIT_REDIS_URL = process.env.REDIS_URL;
    process.env.ENABLE_QUEUES = '0';
    process.env.ALLOW_MEMORY_STORAGE = '1';
    delete process.env.DATABASE_URL;
    delete process.env.NEON_DATABASE_URL;
    delete process.env.RATE_LIMIT_REDIS_URL;
    delete process.env.QUEUE_REDIS_URL;
    delete process.env.SESSION_REDIS_URL;

    // Dynamic imports to prevent side effects at module load time
    const configModule = await import('../../server/config/index.js');
    const providersModule = await import('../../server/providers.js');
    const serverModule = await import('../../server/server.js');

    loadEnv = configModule.loadEnv;
    buildProviders = providersModule.buildProviders;
    createServer = serverModule.createServer;

    const cfg = loadEnv();
    providers = await buildProviders(cfg);
    app = await createServer(cfg, providers);
  });

  afterAll(async () => {
    try {
      await providers?.teardown?.();
    } finally {
      restoreEnv();
      vi.resetModules();
    }
  });

  it('providers should be in memory mode', () => {
    expect(providers.mode).toBe('memory');
    expect(!!providers.rateLimitStore).toBe(false); // Should use memory store
    expect(providers.queue?.enabled).toBe(false);
  });

  it('should serve health endpoint without Redis', async () => {
    const res = await request(app).get('/healthz').expect(200);

    expect(res.body.status).toBe('ok');
  });

  it('should expose memory storage through readiness checks', async () => {
    const res = await request(app).get('/readyz').expect(200);

    expect(res.body).toHaveProperty('checks.storage', 'memory');
    expect(res.body).toHaveProperty('storage.kind', 'memory');
  });

  it('should handle API requests with memory cache', async () => {
    // Test that cache is working in memory mode
    expect(providers.cache).toBeDefined();

    // Test basic cache operations
    await providers.cache.set('test-key', 'test-value', 60);
    const value = await providers.cache.get('test-key');
    expect(value).toBe('test-value');

    await providers.cache.del('test-key');
    const deletedValue = await providers.cache.get('test-key');
    expect(deletedValue).toBeNull();
  });

  it('should have version headers', async () => {
    const res = await request(app).get('/healthz').expect(200);

    expect(res.headers['x-service-version']).toBeDefined();
    expect(res.headers['x-service-name']).toBe('fund-platform-api');
  });
});
