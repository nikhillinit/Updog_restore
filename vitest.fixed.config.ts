import { defineConfig } from 'vitest/config';
import path from 'path';

// Shared alias constant
const alias = {
  '@/core': path.resolve(__dirname, './client/src/core'),
  '@/lib': path.resolve(__dirname, './client/src/lib'),
  '@/server': path.resolve(__dirname, './server'),
  '@/metrics/reserves-metrics': path.resolve(__dirname, './tests/mocks/metrics-mock.ts'),
  '@/': path.resolve(__dirname, './client/src/'),
  '@': path.resolve(__dirname, './client/src'),
  '@shared/': path.resolve(__dirname, './shared/'),
  '@shared': path.resolve(__dirname, './shared'),
  '@assets': path.resolve(__dirname, './assets'),
  '@upstash/redis': path.resolve(__dirname, './tests/mocks/upstash-redis.ts'),
};

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    reporters: process.env.CI ? ['default', 'github-actions'] : 'default',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    testTimeout: 20000,
    hookTimeout: 20000,
    teardownTimeout: 5000,
    retry: process.env.CI ? 2 : 0,
    pool: 'threads',
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
        '**/tests/**',
        '**/__tests__/**',
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
    // Modern test.projects configuration
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'server',
          environment: 'node',
          globals: true,  // ADD GLOBALS HERE
          include: ['tests/unit/**/*.test.ts'],
          // USE THE FIXED SETUP FILE
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/node-setup-fixed.ts'],
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'client',
          environment: 'jsdom',
          globals: true,  // ADD GLOBALS HERE TOO
          include: ['tests/unit/**/*.test.tsx'],
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/jsdom-setup.ts'],
          environmentOptions: {
            jsdom: {
              pretendToBeVisual: true,
              resources: 'usable',
            },
          },
        },
      },
    ],
    setupFiles: ['./tests/setup/test-infrastructure.ts'],
    include: ['tests/unit/**/*.{test,spec}.ts?(x)'],
    exclude: [
      'tests/integration/**/*',
      'tests/synthetics/**/*',
      'tests/quarantine/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
      'tests/unit/fund-setup.smoke.test.tsx',
      'tests/e2e/**/*',
    ],
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
    },
  },
});