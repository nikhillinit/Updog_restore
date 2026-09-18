import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { createVitestAlias } from './vitest.config.shared.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: createVitestAlias(projectRoot, {
      includeAppServer: true,
      includeUpstashRedisMock: true,
    }),
  },
  test: {
    name: 'request-rls',
    include: ['server/middleware/__tests__/request-rls-boundary.pg.test.ts'],
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    teardownTimeout: 30_000,
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
