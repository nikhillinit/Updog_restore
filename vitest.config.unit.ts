import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@/core': path.resolve(__dirname, './client/src/core'),
      '@/lib': path.resolve(__dirname, './client/src/lib'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './assets'),
      '@server': path.resolve(__dirname, './server'),
      // Mock @upstash/redis for tests
      '@upstash/redis': path.resolve(__dirname, './tests/mocks/upstash-redis.ts'),
    }
  },
  test: {
    name: 'unit',
    include: ['tests/unit/**/*.{test,spec}.ts?(x)'],
    exclude: [
      'tests/integration/**/*',
      'tests/synthetics/**/*',
      'tests/quarantine/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
    ],
    environment: 'jsdom', // Changed from 'node' to support React component testing
    testTimeout: 20000,
    hookTimeout: 20000,
    teardownTimeout: 5000,
    setupFiles: ['tests/test-infrastructure.ts', 'tests/unit/setup.ts'],
    env: {
      NODE_ENV: 'test'
    },
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    retry: process.env.CI ? 2 : 0,
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'reports/junit-main.xml' }]]
      : ['default'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.config.*',
        '**/*.d.ts'
      ]
    }
  }
});