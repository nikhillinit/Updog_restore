import type { Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const ORIGIN = 'http://localhost:5173';
const originalEnvironment = { ...process.env };

let makeApp: typeof import('../../../server/app').makeApp;
let server: Server | undefined;
let providers:
  | Awaited<ReturnType<typeof import('../../../server/providers.js').buildProviders>>
  | undefined;
let setReady: ((ready: boolean) => void) | undefined;

function configureMemoryEnvironment(): void {
  process.env['NODE_ENV'] = 'test';
  process.env['_EXPLICIT_NODE_ENV'] = 'test';
  process.env['REDIS_URL'] = 'memory://';
  process.env['_EXPLICIT_REDIS_URL'] = 'memory://';
  process.env['ENABLE_QUEUES'] = '0';
  process.env['ALLOW_MEMORY_STORAGE'] = '1';
  process.env['SESSION_SECRET'] = 'phase5a-session-secret-at-least-32-characters';
  process.env['JWT_SECRET'] = 'phase5a-jwt-secret-at-least-32-characters';
  process.env['CORS_ORIGIN'] = ORIGIN;
  process.env['ALLOWED_ORIGINS'] = ORIGIN;
  delete process.env['DATABASE_URL'];
  delete process.env['NEON_DATABASE_URL'];
  delete process.env['RATE_LIMIT_REDIS_URL'];
  delete process.env['QUEUE_REDIS_URL'];
  delete process.env['SESSION_REDIS_URL'];
}

function restoreEnvironment(): void {
  for (const key of Object.keys(process.env)) {
    if (!(key in originalEnvironment)) delete process.env[key];
  }
  Object.assign(process.env, originalEnvironment);
}

async function closeServer(): Promise<void> {
  if (!server?.listening) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
}

beforeAll(async () => {
  configureMemoryEnvironment();
  ({ makeApp } = await import('../../../server/app'));
  const [{ loadEnv }, providersModule, serverModule, healthState] = await Promise.all([
    import('../../../server/config/index.js'),
    import('../../../server/providers.js'),
    import('../../../server/server.js'),
    import('../../../server/health/state.js'),
  ]);

  const config = loadEnv();
  const builtProviders = await providersModule.buildProviders(config);
  providers = builtProviders;
  server = await serverModule.createServer(config, builtProviders);
  setReady = healthState.setReady;
  setReady(true);
});

afterAll(async () => {
  setReady?.(false);
  await closeServer();
  await providers?.teardown?.();
  restoreEnvironment();
});

describe('actuals pilot CORS exposure', () => {
  it('exposes ETag, Retry-After, and X-Request-ID on makeApp()', async () => {
    const response = await request(makeApp())
      .get('/healthz')
      .set('Origin', ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(response.headers['access-control-expose-headers']).toBe(
      'ETag, Retry-After, X-Request-ID'
    );
  });

  it('exposes ETag and Retry-After on createServer()', async () => {
    const response = await request(server!)
      .get('/healthz')
      .set('Origin', ORIGIN);

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(response.headers['access-control-expose-headers']).toContain('ETag');
    expect(response.headers['access-control-expose-headers']).toContain('Retry-After');
    expect(response.headers['access-control-expose-headers']).toContain('X-Request-ID');
  });
});
