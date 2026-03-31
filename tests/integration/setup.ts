/**
 * Integration test setupFiles - runs in the worker process per test file.
 *
 * Worker-only hygiene. Server lifecycle and BASE_URL/PORT wiring are managed by
 * global-setup.ts (runs once for the entire suite via globalSetup).
 */

import { beforeAll } from 'vitest';
import { resolveIntegrationBaseUrl } from './base-url';

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

  // Vitest/Vite can surface BASE_URL as "/" in Node tests; normalize it to the
  // actual integration server origin before specs build request URLs.
  process.env.BASE_URL = resolveIntegrationBaseUrl();
});

// Force UTC timezone for consistent date handling
process.env.TZ = 'UTC';

// Integration test environment
process.env.NODE_ENV = 'test';
process.env._EXPLICIT_NODE_ENV = process.env.NODE_ENV;
