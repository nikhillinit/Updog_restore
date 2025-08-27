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
    name: 'unit',
    include: ['tests/unit/**/*.test.ts', 'tests/unit/**/*.spec.ts'],
    exclude: ['tests/integration/**/*', 'tests/synthetics/**/*'],
    environment: 'node',
    testTimeout: 10000,
    hookTimeout: 10000,
    teardownTimeout: 5000,
    setupFiles: ['tests/unit/setup.ts'],
    globals: true,
    clearMocks: true,
    restoreMocks: true,
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