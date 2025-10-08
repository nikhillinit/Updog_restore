import { defineConfig } from 'vitest/config';

/**
 * Base Vitest configuration for package-level tests
 * Individual packages extend this config and override as needed
 */
export const baseConfig = defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/index.ts',
        '**/*.test.ts'
      ]
    }
  }
});

export default baseConfig;
