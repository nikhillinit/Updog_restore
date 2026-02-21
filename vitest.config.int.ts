import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@/core': path.resolve(__dirname, './client/src/core'),
      '@/lib': path.resolve(__dirname, './client/src/lib'),
      '@/server': path.resolve(__dirname, './server'),
      '@/metrics/reserves-metrics': path.resolve(__dirname, './tests/mocks/metrics-mock.ts'),
      '@/server/utils/logger': path.resolve(__dirname, './tests/mocks/server-logger.ts'),
      '@/': path.resolve(__dirname, './client/src/'),
      '@': path.resolve(__dirname, './client/src'),
      '@shared/': path.resolve(__dirname, './shared/'),
      '@shared': path.resolve(__dirname, './shared'),
      '@schema': path.resolve(__dirname, './shared/schema'),
      '@assets/': path.resolve(__dirname, './assets/'),
      '@assets': path.resolve(__dirname, './assets'),
      '@upstash/redis': path.resolve(__dirname, './tests/mocks/upstash-redis.ts'),
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
      // Quarantined: server startup healthz timeout after ~31 per-file spawn/kill cycles
      // in singleFork mode. Root cause: setupFiles spawns a new server per test file;
      // after ~31 cycles the CI runner can no longer start new servers within 30s.
      // Fix: migrate to globalSetup for shared server lifecycle (tracked separately).
      'tests/api/funds.contract.spec.ts',
      'tests/integration/dev-memory-mode.test.ts',
      'tests/integration/forbidden-tokens.test.ts',
      'tests/integration/fund-calculation.test.ts',
      'tests/integration/security/auth.int.spec.ts',
      'tests/integration/security/headers.int.spec.ts',
      'tests/integration/security/injection.int.spec.ts',
      'tests/integration/zero-variance-bridge/oracle.test.ts',
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
