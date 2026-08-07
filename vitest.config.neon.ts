/**
 * Vitest configuration for the real Neon-driver transaction lane.
 *
 * The suite owns its PostgreSQL, HTTP proxy, and WebSocket proxy containers so
 * it can exercise both Neon Drizzle drivers without importing server/db.ts.
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { createVitestAlias } from './vitest.config.shared.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const alias = createVitestAlias(projectRoot, {
  includeAppServer: true,
  includeClientUtils: true,
});

export default defineConfig({
  root: projectRoot,
  resolve: { alias },
  test: {
    name: 'neon',
    include: ['tests/integration/neon-http/**/*.test.ts'],
    environment: 'node',
    testTimeout: 120000,
    hookTimeout: 120000,
    teardownTimeout: 30000,
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks',
    maxWorkers: 1,
    isolate: false,
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      REDIS_URL: 'memory://',
    },
  },
});
