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
    }
  },
  test: {
    name: 'quarantine',
    include: [
      'tests/quarantine/**/*.{test,spec}.ts?(x)',
      '**/*.quarantine.{test,spec}.ts?(x)',
    ],
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 30000,
    teardownTimeout: 5000,
    setupFiles: ['tests/unit/setup.ts', 'tests/setup/reserves-setup.ts'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    isolate: true,
    maxConcurrency: 1,
    retry: process.env.CI ? 2 : 0,
    reporters: process.env.CI
      ? ['default', ['junit', { outputFile: 'reports/junit-quarantine.xml' }]]
      : ['default'],
  }
});