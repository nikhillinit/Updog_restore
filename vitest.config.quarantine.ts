import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const projectRoot = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: {
      '@': resolve(projectRoot, './client/src'),
      '@/core': resolve(projectRoot, './client/src/core'),
      '@/lib': resolve(projectRoot, './client/src/lib'),
      '@shared': resolve(projectRoot, './shared'),
      '@assets': resolve(projectRoot, './assets'),
      '@server': resolve(projectRoot, './server'),
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
    setupFiles: ['tests/test-infrastructure.ts', 'tests/unit/setup.ts', 'tests/setup/reserves-setup.ts'],
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
