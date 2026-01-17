/**
 * Vitest configuration for testcontainers-based integration tests
 *
 * Uses Docker containers (PostgreSQL + Redis) for realistic integration testing.
 * Separate from vitest.config.int.ts to avoid conflicts with local dev setup.
 *
 * IMPORTANT: Only includes tests that actually require Docker containers.
 * tests/api/** are excluded - they test client engines and run via vitest.config.int.ts
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

// Complete alias configuration (mirrors vitest.config.ts)
const alias = {
  // Primary path aliases - order matters: more specific first
  '@/core': path.resolve(__dirname, './client/src/core'),
  '@/lib': path.resolve(__dirname, './client/src/lib'),
  '@/utils': path.resolve(__dirname, './client/src/utils'),
  '@/': path.resolve(__dirname, './client/src/'),
  '@': path.resolve(__dirname, './client/src'),

  // Shared and assets
  '@shared/': path.resolve(__dirname, './shared/'),
  '@shared': path.resolve(__dirname, './shared'),
  '@schema': path.resolve(__dirname, './shared/schema'),
  '@assets/': path.resolve(__dirname, './assets/'),
  '@assets': path.resolve(__dirname, './assets'),
};

export default defineConfig({
  resolve: { alias },
  test: {
    name: 'testcontainers',
    globalSetup: ['./tests/setup/global-setup.testcontainers.ts'],
    // Only include tests that actually need Docker containers
    include: [
      'tests/integration/testcontainers-smoke.test.ts',
      'tests/integration/ScenarioMatrixCache.integration.test.ts',
      'tests/integration/cache-monitoring.integration.test.ts',
      'tests/integration/scenarioGeneratorWorker.test.ts',
      'tests/integration/migration-runner.test.ts',
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
