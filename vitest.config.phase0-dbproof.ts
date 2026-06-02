import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import { createVitestAlias } from './vitest.config.shared.mjs';

const projectRoot = dirname(fileURLToPath(import.meta.url));
const alias = createVitestAlias(projectRoot, {
  includeAppServer: true,
  includeTestMocks: true,
  includeUpstashRedisMock: true,
});

export default defineConfig({
  root: projectRoot,
  resolve: { alias },
  test: {
    name: 'phase0-dbproof',
    include: ['tests/integration/phase0-migrated-postgres.test.ts'],
    exclude: [
      'tests/unit/**/*',
      'tests/synthetics/**/*',
      '**/*.quarantine.test.ts',
      'tests/quarantine/**/*',
    ],
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
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
