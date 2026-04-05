import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

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
  '@assets/': resolve(projectRoot, './assets/'),
  '@assets': resolve(projectRoot, './assets'),
  '@upstash/redis': resolve(projectRoot, './tests/mocks/upstash-redis.ts'),
};

export default defineConfig({
  root: projectRoot,
  resolve: { alias },
  test: {
    name: 'phase0-dbproof',
    include: ['tests/integration/phase0-migrated-postgres.test.ts'],
    exclude: [
      'tests/unit/**/*',
      'tests/synthetics/**/*',
      '**/*.quarantine.test.ts',
      'tests/quarantine/**/*',
    ],
    environment: 'node',
    globals: true,
    clearMocks: true,
    restoreMocks: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    teardownTimeout: 30000,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
    env: {
      NODE_ENV: 'test',
      TZ: 'UTC',
      REDIS_URL: 'memory://',
    },
  },
});
