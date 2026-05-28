/**
 * Vitest configuration for testcontainers-based integration tests
 *
 * Uses Docker containers (PostgreSQL + Redis) for realistic integration testing.
 * Separate from vitest.config.int.ts to avoid conflicts with local dev setup.
 *
 * IMPORTANT: Only includes tests that actually require Docker containers.
 * tests/api/** are excluded - they test client engines and run via vitest.config.int.ts
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
    name: 'testcontainers',
    globalSetup: ['./tests/setup/global-setup.testcontainers.ts'],
    // Only include tests that actually work with testcontainers
    // Other tests have pre-existing issues tracked in separate issues
    include: [
      'tests/integration/testcontainers-smoke.test.ts',
      'tests/integration/migration-runner.test.ts',
      // DISABLED: Pre-existing issues - fix in separate PRs
      // 'tests/integration/ScenarioMatrixCache.integration.test.ts', // bucket allocation validation
      // 'tests/integration/cache-monitoring.integration.test.ts', // server/db.ts imports database-mock
      // 'tests/integration/scenarioGeneratorWorker.test.ts', // server imports need database-mock
    ],
    exclude: [
      'tests/unit/**/*',
      'tests/synthetics/**/*',
      'tests/api/**/*', // API tests don't need Docker - run via vitest.config.int.ts
      'tests/integration/setup.ts', // Exclude local setup file
    ],
    environment: 'node',
    testTimeout: 60000, // Longer timeout for container startup
    hookTimeout: 60000,
    teardownTimeout: 30000,
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Prevent parallel execution that could conflict with containers
      },
    },
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      REDIS_URL: 'memory://', // Prevent real Redis connections
    },
  },
});
