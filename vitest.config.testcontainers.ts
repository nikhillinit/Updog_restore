/**
 * Vitest configuration for testcontainers-based integration tests
 *
 * Uses Docker containers (PostgreSQL + Redis) for realistic integration testing.
 * Separate from vitest.config.int.ts to avoid conflicts with local dev setup.
 */
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@/': path.resolve(__dirname, './client/src/'),
      '@shared/': path.resolve(__dirname, './shared/'),
      '@shared': path.resolve(__dirname, './shared'),
      '@assets/': path.resolve(__dirname, './assets/'),
    },
  },
  test: {
    name: 'testcontainers',
    globalSetup: ['./tests/setup/global-setup.testcontainers.ts'],
    include: [
      'tests/integration/**/*.int.spec.ts',
      'tests/integration/**/*.spec.ts',
      'tests/integration/**/*.test.ts',
      'tests/api/**/*.test.ts',
      'tests/api/**/*.spec.ts',
    ],
    exclude: [
      'tests/unit/**/*',
      'tests/synthetics/**/*',
      'tests/integration/setup.ts', // Exclude local setup - use global testcontainers setup
    ],
    environment: 'node',
    testTimeout: 60000, // Longer timeout for container startup
    hookTimeout: 60000,
    teardownTimeout: 30000,
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Prevent parallel execution that could conflict with containers
      },
    },
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
    },
  },
});
