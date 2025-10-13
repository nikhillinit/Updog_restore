import { defineConfig } from 'vitest/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vitest configuration for Excel parity tests
 *
 * These tests verify that our financial calculations (XIRR, TVPI, DPI)
 * match Excel's outputs within acceptable tolerance (1e-6).
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@/core': path.resolve(__dirname, './client/src/core'),
      '@/lib': path.resolve(__dirname, './client/src/lib'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets': path.resolve(__dirname, './assets'),
    },
  },
  test: {
    reporters: process.env.CI ? ['default', 'github-actions'] : 'default',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 5000,
    retry: process.env.CI ? 2 : 0,
    pool: 'threads',

    // Node environment for parity tests (no DOM needed)
    environment: 'node',

    // Include only parity tests
    include: ['tests/parity/**/*.{test,spec}.ts'],

    // Exclude everything else
    exclude: [
      'tests/unit/**/*',
      'tests/integration/**/*',
      'tests/synthetics/**/*',
      'tests/quarantine/**/*',
      'tests/e2e/**/*',
      '**/*.quarantine.{test,spec}.ts?(x)',
    ],

    env: {
      NODE_ENV: 'test',
      TZ: 'UTC'
    },
  },
});
