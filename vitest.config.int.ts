import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, './client/src/'),
      '@shared/': path.resolve(__dirname, './shared/'),
      '@assets/': path.resolve(__dirname, './assets/'),
    },
  },
  test: {
    name: 'integration',
    include: [
      'tests/integration/**/*.int.spec.ts',
      'tests/integration/**/*.spec.ts',
      'tests/integration/**/*.test.ts',
      'tests/api/**/*.test.ts',
      'tests/api/**/*.spec.ts',
    ],
    exclude: [
      'tests/unit/**/*',
      'tests/synthetics/**/*',
      // Testcontainers tests require Docker - run via testcontainers-ci.yml instead
      'tests/integration/testcontainers-smoke.test.ts',
      'tests/integration/ScenarioMatrixCache.integration.test.ts',
      'tests/integration/cache-monitoring.integration.test.ts',
      'tests/integration/scenarioGeneratorWorker.test.ts',
      'tests/integration/migration-runner.test.ts',
    ],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 10000,
    setupFiles: ['tests/integration/setup.ts'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks', // Better isolation for integration tests
    poolOptions: {
      forks: {
        singleFork: true, // Prevent parallel execution that could conflict
      },
    },
  },
});
