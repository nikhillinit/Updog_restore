import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';
import { createVitestAlias } from './vitest.config.shared.mjs';

// Derive project root in ESM-compatible way (no __dirname in Vitest ESM configs)
const projectRoot = dirname(fileURLToPath(import.meta.url));

const alias = createVitestAlias(projectRoot, {
  includeAppServer: true,
  includeAssets: true,
  includeTestMocks: true,
  includeUpstashRedisMock: true,
});

// Resolve setup/teardown files against the config location so sandbox worktrees
// don't depend on the primary workspace path when Vitest spawns Vite.
const testPaths = {
  vitestSetup: resolve(projectRoot, './tests/setup/vitest.setup.ts'),
  globalTeardown: resolve(projectRoot, './tests/setup/global-teardown.ts'),
  nodeSetupRedis: resolve(projectRoot, './tests/setup/node-setup-redis.ts'),
  dbDelegateLink: resolve(projectRoot, './tests/setup/db-delegate-link.ts'),
  testInfrastructure: resolve(projectRoot, './tests/setup/test-infrastructure.ts'),
  nodeSetup: resolve(projectRoot, './tests/setup/node-setup.ts'),
  jsdomSetup: resolve(projectRoot, './tests/setup/jsdom-setup.ts'),
  coverageDir: resolve(projectRoot, './coverage'),
};

export default defineConfig({
  cacheDir: '.cache/vite-vitest',
  resolve: {
    alias, // Use shared constant
  },
  test: {
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    testTimeout: 30000, // Increased for Testcontainers startup
    hookTimeout: 20000,
    teardownTimeout: 5000,
    retry: process.env['CI'] ? 2 : 0,
    pool: 'threads', // Try threads instead of forks for React 18
    // CI optimization: Reduce worker count to fix memory mode failures
    ...(process.env['CI'] ? { maxWorkers: 4 } : {}),
    // Setup file for global mocks (Sentry, etc.)
    setupFiles: [testPaths.vitestSetup],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: testPaths.coverageDir,
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        '**/*.config.{js,ts}',
        '**/*.d.ts',
        'migrations/**',
        'scripts/**',
        '.github/**',
        'repo/**',
        'ai-logs/**', // Exclude AI logs from coverage
        'observability/**',
        'workers/**',
        // Test files
        'tests/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
      ],
      include: ['client/src/**/*.{js,ts,tsx}', 'server/**/*.{js,ts}', 'shared/**/*.{js,ts}'],
    },
    // Unit tests configuration (default)
    // Keep jsdom as default for React component tests
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true, // enable rAF/timers like a visible tab
        resources: 'usable', // be lenient loading resources
      },
    },
    // Project-specific environments for server and client unit tests.
    projects: [
      {
        resolve: { alias }, // Explicit alias for server project (projects don't inherit root resolve)
        esbuild: {
          jsxInject: "import React from 'react'",
        },
        test: {
          name: 'server',
          environment: 'node',
          globalTeardown: testPaths.globalTeardown,
          // Unit tests only - integration/api tests run via vitest.config.int.ts
          // Also includes reflection system regression tests
          include: [
            'tests/unit/**/*.test.ts',
            'tests/unit/scripts/**/*.test.mjs',
            'tests/perf/**/*.test.ts',
            'tests/regressions/**/*.test.ts',
          ],
          exclude: ['**/*.quarantine.test.ts', 'tests/quarantine/**/*'],
          setupFiles: [
            testPaths.nodeSetupRedis, // FIRST: Mock Redis before any imports
            testPaths.dbDelegateLink, // wire delegate before any tests
            testPaths.testInfrastructure,
            testPaths.nodeSetup,
          ],
        },
      },
      {
        resolve: { alias }, // Explicit alias for client project (for consistency)
        esbuild: {
          jsxInject: "import React from 'react'",
        },
        test: {
          name: 'client',
          environment: 'jsdom',
          // Simplified: All .test.tsx files run in jsdom environment
          include: ['tests/unit/**/*.test.tsx'],
          exclude: [
            'tests/quarantine/**/*',
            '**/*.quarantine.test.tsx',
            'tests/unit/lib/dual-forecast-display.test.tsx',
            'tests/unit/fund-setup.smoke.test.tsx',
            'tests/unit/pages/portfolio-constructor.test.tsx',
          ],
          setupFiles: [testPaths.testInfrastructure, testPaths.jsdomSetup],
          environmentOptions: {
            jsdom: {
              pretendToBeVisual: true, // enable rAF/timers like a visible tab
              resources: 'usable', // be lenient loading resources
            },
          },
        },
      },
    ],
    include: ['tests/unit/**/*.{test,spec}.ts?(x)', ...configDefaults.include], // Include default Vitest patterns
    exclude: [
      'tests/integration/**/*',
      'tests/synthetics/**/*',
      'tests/quarantine/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
      'tests/unit/fund-setup.smoke.test.tsx', // explicitly excluded - requires real browser
      'tests/unit/pages/portfolio-constructor.test.tsx', // quarantined - imports removed react-router-dom
      'tests/e2e/**/*',
      '**/*.template.test.ts',
      '**/*.template.{test,spec}.ts?(x)', // Template files - not executable tests
    ],
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      REDIS_URL: 'memory://', // Prevent real Redis connections in tests
      // JWT configuration (min 32 chars required by server/config.ts:16)
      JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation',
      JWT_ALG: 'HS256',
      JWT_ISSUER: 'updog', // CORRECTED: Must match server/config.ts:15 defaults
      JWT_AUDIENCE: 'updog-app', // CORRECTED: Must match server/config.ts:15 defaults
      // Alertmanager webhook signature validation
      ALERTMANAGER_WEBHOOK_SECRET: 'test-alertmanager-webhook-secret-minimum-32-characters-long',
    },
  },
});
