import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { configDefaults, defineConfig } from 'vitest/config';

const projectRoot = dirname(fileURLToPath(import.meta.url));

const alias = {
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
  '@assets': resolve(projectRoot, './assets'),
  '@upstash/redis': resolve(projectRoot, './tests/mocks/upstash-redis.ts'),
};

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
  resolve: {
    alias,
  },
  test: {
    reporters: process.env['CI'] ? ['default', 'github-actions'] : ['default'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 20000,
    teardownTimeout: 5000,
    retry: process.env['CI'] ? 2 : 0,
    pool: 'threads',
    maxThreads: process.env['CI'] ? 4 : undefined,
    minThreads: 1,
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
        'ai-logs/**',
        'observability/**',
        'workers/**',
        'tests/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
      ],
      include: ['client/src/**/*.{js,ts,tsx}', 'server/**/*.{js,ts}', 'shared/**/*.{js,ts}'],
    },
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true,
        resources: 'usable',
      },
    },
    projects: [
      {
        resolve: { alias },
        esbuild: {
          jsxInject: "import React from 'react'",
        },
        test: {
          name: 'server',
          environment: 'node',
          globalTeardown: testPaths.globalTeardown,
          include: [
            'tests/unit/**/*.test.ts',
            'tests/perf/**/*.test.ts',
            'tests/regressions/**/*.test.ts',
          ],
          exclude: ['**/*.quarantine.test.ts', 'tests/quarantine/**/*'],
          setupFiles: [
            testPaths.nodeSetupRedis,
            testPaths.dbDelegateLink,
            testPaths.testInfrastructure,
            testPaths.nodeSetup,
          ],
        },
      },
      {
        resolve: { alias },
        esbuild: {
          jsxInject: "import React from 'react'",
        },
        test: {
          name: 'client',
          environment: 'jsdom',
          include: ['tests/unit/**/*.test.tsx'],
          exclude: [
            'tests/quarantine/**/*',
            '**/*.quarantine.test.tsx',
            'tests/unit/fund-setup.smoke.test.tsx',
            'tests/unit/pages/portfolio-constructor.test.tsx',
          ],
          setupFiles: [testPaths.testInfrastructure, testPaths.jsdomSetup],
          environmentOptions: {
            jsdom: {
              pretendToBeVisual: true,
              resources: 'usable',
            },
          },
        },
      },
    ],
    include: ['tests/unit/**/*.{test,spec}.ts?(x)', ...configDefaults.include],
    exclude: [
      'tests/integration/**/*',
      'tests/synthetics/**/*',
      'tests/quarantine/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
      'tests/unit/fund-setup.smoke.test.tsx',
      'tests/unit/pages/portfolio-constructor.test.tsx',
      'tests/e2e/**/*',
      '**/*.template.test.ts',
      '**/*.template.{test,spec}.ts?(x)',
    ],
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      REDIS_URL: 'memory://',
      JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-characters-long-for-hs256-validation',
      JWT_ALG: 'HS256',
      JWT_ISSUER: 'updog',
      JWT_AUDIENCE: 'updog-app',
      ALERTMANAGER_WEBHOOK_SECRET: 'test-alertmanager-webhook-secret-minimum-32-characters-long',
    },
  },
});
