import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      // Primary path aliases (mirrors vite.config.ts)
      // Note: '@/' must come before '@' to match more specific paths first
      '@/core': path.resolve(__dirname, './client/src/core'),
      '@/lib': path.resolve(__dirname, './client/src/lib'),
      '@/server': path.resolve(__dirname, './server'),
      '@/metrics/reserves-metrics': path.resolve(__dirname, './tests/mocks/metrics-mock.ts'),
      '@/': path.resolve(__dirname, './client/src/'),
      '@': path.resolve(__dirname, './client/src'),

      // Shared and assets
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './assets'),

      // Server-side path (without @ prefix)
      '@server': path.resolve(__dirname, './server'),

      // Test mocks
      '@upstash/redis': path.resolve(__dirname, './tests/mocks/upstash-redis.ts'),
    },
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
    pool: 'threads',  // Try threads instead of forks for React 18
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
        'ai-logs/**',
        'observability/**',
        'workers/**',
        // Test files
        'tests/**',
        '**/*.test.{js,ts,tsx}',
        '**/*.spec.{js,ts,tsx}',
      ],
      include: [
        'client/src/**/*.{js,ts,tsx}',
        'server/**/*.{js,ts}',
        'shared/**/*.{js,ts}',
      ],
    },
    // Unit tests configuration (default)
    // Keep jsdom as default for React component tests
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        pretendToBeVisual: true, // enable rAF/timers like a visible tab
        resources: 'usable',     // be lenient loading resources
      },
    },
    // Modern test.projects configuration (replaces deprecated environmentMatchGlobs)
    projects: [
      {
        test: {
          name: 'server',
          environment: 'node',
          // Simplified: All .test.ts files run in Node environment
          include: ['tests/unit/**/*.test.ts'],
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/node-setup.ts']
        }
      },
      {
        test: {
          name: 'client',
          environment: 'jsdom',
          // Simplified: All .test.tsx files run in jsdom environment
          include: ['tests/unit/**/*.test.tsx'],
          setupFiles: ['./tests/setup/test-infrastructure.ts', './tests/setup/jsdom-setup.ts'],
          environmentOptions: {
            jsdom: {
              pretendToBeVisual: true, // enable rAF/timers like a visible tab
              resources: 'usable',     // be lenient loading resources
            }
          }
        }
      }
    ],
    setupFiles: ['./tests/setup/test-infrastructure.ts'],
    include: ['tests/unit/**/*.{test,spec}.ts?(x)'],
    exclude: [
      'tests/integration/**/*',
      'tests/synthetics/**/*',
      'tests/quarantine/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
      'tests/unit/fund-setup.smoke.test.tsx', // explicitly excluded - requires real browser
      'tests/e2e/**/*',
    ],
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC'
    },
  },
});
