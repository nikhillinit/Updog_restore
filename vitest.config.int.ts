import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: {
      '@/core': resolve(projectRoot, './client/src/core'),
      '@/lib': resolve(projectRoot, './client/src/lib'),
      '@/server': resolve(projectRoot, './server'),
      '@/metrics/reserves-metrics': resolve(projectRoot, './tests/mocks/metrics-mock.ts'),
      '@/server/utils/logger': resolve(projectRoot, './tests/mocks/server-logger.ts'),
      '@/': resolve(projectRoot, './client/src/'),
      '@': resolve(projectRoot, './client/src'),
      '@shared/': resolve(projectRoot, './shared/'),
      '@shared': resolve(projectRoot, './shared'),
      '@schema': resolve(projectRoot, './shared/schema'),
      '@assets/': resolve(projectRoot, './assets/'),
      '@assets': resolve(projectRoot, './assets'),
      '@upstash/redis': resolve(projectRoot, './tests/mocks/upstash-redis.ts'),
    },
  },
  test: {
    name: 'integration',
    globalSetup: ['tests/integration/global-setup.ts'],
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
      '**/*.quarantine.test.ts',
      'tests/quarantine/**/*',
      // Testcontainers tests require Docker - run via testcontainers-ci.yml instead
      'tests/integration/testcontainers-smoke.test.ts',
      'tests/integration/ScenarioMatrixCache.integration.test.ts',
      'tests/integration/cache-monitoring.integration.test.ts',
      'tests/integration/scenarioGeneratorWorker.test.ts',
      'tests/integration/migration-runner.test.ts',
      // Quarantined: 6/6 tests timeout at 30s each, causing cascade resource exhaustion
      'tests/integration/fund-idempotency.spec.ts',
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
