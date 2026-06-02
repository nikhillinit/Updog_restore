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
    name: 'server',
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
      // Re-quarantined 2026-04-08: test asserts against pre-Phase-2A FundCreateV1
      // contract (managementFee/carryPercentage as whole-number percent, extra
      // keys deployedCapital/status/termYears, flat response). Current contract
      // is strict decimal ratios + wrapped { success, data } envelope. Product
      // decision required on whether to rewrite the tests or delete them. See
      // .planning/phases/05-test-hygiene-resurrection/05-02-FINDINGS.md.
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
    maxWorkers: 1, // Prevent parallel execution that could conflict
    isolate: false, // Keep integration files in one fork worker.
  },
});
