/**
 * Integration test setupFiles - runs in the worker process per test file.
 *
 * Sets environment variables only. Server lifecycle is managed by
 * global-setup.ts (runs once for the entire suite via globalSetup).
 */

import { beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Guard against whatwg-fetch pollution: some transitive dependencies
// import whatwg-fetch which overwrites globalThis.fetch with a browser-only
// implementation that requires XMLHttpRequest (crashes in Node).
// We stash the real Node fetch on globalThis ONCE (first setupFiles eval)
// and restore it on every subsequent beforeAll to undo any pollution.
const NATIVE_FETCH_KEY = '__nativeFetch' as const;
type GlobalWithFetch = typeof globalThis & { [NATIVE_FETCH_KEY]?: typeof fetch };
const g = globalThis as GlobalWithFetch;
if (!g[NATIVE_FETCH_KEY]) {
  g[NATIVE_FETCH_KEY] = globalThis.fetch;
}
beforeAll(() => {
  if (g[NATIVE_FETCH_KEY]) {
    globalThis.fetch = g[NATIVE_FETCH_KEY];
  }
});

const PORT_FILE = path.join(os.tmpdir(), 'vitest-int-server.json');

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Integration test environment
process.env.NODE_ENV = 'test';
process.env._EXPLICIT_NODE_ENV = process.env.NODE_ENV;

const VALID_TEST_JWT_SECRET = 'integration-test-jwt-secret-must-be-at-least-32-characters-long';
const VALID_TEST_JWT_ISSUER = 'updog-api';
const VALID_TEST_JWT_AUDIENCE = 'updog-client';
const VALID_TEST_CORS_ORIGIN = 'http://localhost:5173,http://localhost:5174,http://localhost:5175';

function sanitizeSecrets(env: NodeJS.ProcessEnv): void {
  if (!env.JWT_SECRET || env.JWT_SECRET.trim().length < 32) {
    env.JWT_SECRET = VALID_TEST_JWT_SECRET;
  }

  if (!env.JWT_ISSUER?.trim()) {
    env.JWT_ISSUER = VALID_TEST_JWT_ISSUER;
  }

  if (!env.JWT_AUDIENCE?.trim()) {
    env.JWT_AUDIENCE = VALID_TEST_JWT_AUDIENCE;
  }

  if (
    env.HEALTH_KEY !== undefined &&
    (env.HEALTH_KEY.trim().length < 16 ||
      env.HEALTH_KEY === 'undefined' ||
      env.HEALTH_KEY === 'null')
  ) {
    delete env.HEALTH_KEY;
  }
}

sanitizeSecrets(process.env);
process.env._EXPLICIT_JWT_SECRET = process.env.JWT_SECRET;
process.env._EXPLICIT_JWT_ISSUER = process.env.JWT_ISSUER;
process.env._EXPLICIT_JWT_AUDIENCE = process.env.JWT_AUDIENCE;
process.env.JWT_ALG = process.env.JWT_ALG || 'HS256';
process.env._EXPLICIT_JWT_ALG = process.env.JWT_ALG;
process.env.DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/povc_test';
process.env.REDIS_URL = 'memory://';
process.env._EXPLICIT_REDIS_URL = process.env.REDIS_URL;
process.env.ENABLE_QUEUES = '0';
process.env.CORS_ORIGIN = VALID_TEST_CORS_ORIGIN;

// Read server connection info written by global-setup.ts
try {
  const raw = fs.readFileSync(PORT_FILE, 'utf-8');
  const info: { port: string; baseUrl: string } = JSON.parse(raw);
  process.env.PORT = info.port;
  process.env.BASE_URL = info.baseUrl;
} catch {
  // Fallback: external server or already set via env
  if (!process.env.BASE_URL || process.env.BASE_URL === 'http://localhost:0') {
    process.env.PORT = process.env.PORT || '5000';
    process.env.BASE_URL = `http://localhost:${process.env.PORT}`;
  }
}
