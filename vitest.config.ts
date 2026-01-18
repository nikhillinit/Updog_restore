import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

// Derive project root in ESM-compatible way (no __dirname in Vitest ESM configs)
const projectRoot = dirname(fileURLToPath(import.meta.url));

// Shared alias constant (single source of truth)
// Vitest test.projects don't inherit root-level resolve.alias (Vitest <1.0 behavior)
// so we extract this constant and explicitly add to each project that needs it
const alias = {
  // Primary path aliases (mirrors vite.config.ts)
  // Note: '@/' must come before '@' to match more specific paths first
  '@/core': resolve(projectRoot, './client/src/core'),
  '@/lib': resolve(projectRoot, './client/src/lib'),
  '@/server': resolve(projectRoot, './server'),
  '@/metrics/reserves-metrics': resolve(projectRoot, './tests/mocks/metrics-mock.ts'),
  '@/server/utils/logger': resolve(projectRoot, './tests/mocks/server-logger.ts'),
  '@/': resolve(projectRoot, './client/src/'),
  '@': resolve(projectRoot, './client/src'),

  // Shared and assets
  '@shared/': resolve(projectRoot, './shared/'),
  '@shared': resolve(projectRoot, './shared'),
  '@schema': resolve(projectRoot, './shared/schema'),
  '@assets': resolve(projectRoot, './assets'),

  // Test mocks
  '@upstash/redis': resolve(projectRoot, './tests/mocks/upstash-redis.ts'),
};

export default defineConfig({
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
    // CI optimization: Reduce thread count to fix memory mode failures
    maxThreads: process.env['CI'] ? 4 : undefined,
    minThreads: 1,
    // Setup file for global mocks (Sentry, etc.)
    setupFiles: ['./tests/setup/vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      reportsDirectory: './coverage',
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
    // Modern test.projects configuration (replaces deprecated environmentMatchGlobs)
    projects: [
      {
        resolve: { alias }, // Explicit alias for server project (projects don't inherit root resolve)
        esbuild: {
          jsxInject: "import React from 'react'",
        },
        test: {
          name: 'server',
          environment: 'node',
          globalTeardown: './tests/setup/global-teardown.ts',
          // Unit tests only - integration/api tests run via vitest.config.int.ts
          // Also includes reflection system regression tests
          include: ['tests/unit/**/*.test.ts', 'tests/perf/**/*.test.ts', 'tools/reflection/tests/**/*.test.ts'],
          exclude: ['**/*.quarantine.test.ts', 'tests/quarantine/**/*'],
          setupFiles: [
            './tests/setup/node-setup-redis.ts', // FIRST: Mock Redis before any imports
            './tests/setup/db-delegate-link.ts', // wire delegate before any tests
            './tests/setup/test-infrastructure.ts',
            './tests/setup/node-setup.ts',
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
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/jsdom-setup.ts'],
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
