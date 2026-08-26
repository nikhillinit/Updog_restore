import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

import { createVitestAlias } from '../../../vitest.config.shared.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const testSecret = 'test-secret-'.repeat(4);
const alias = createVitestAlias(projectRoot, {
  includeAppServer: true,
  includeAssets: true,
  includeTestMocks: true,
  includeUpstashRedisMock: true,
});

export default defineConfig({
  root: projectRoot,
  resolve: { alias },
  test: {
    environment: 'node',
    globals: true,
    isolate: true,
    pool: 'forks',
    maxWorkers: 1,
    include: ['tests/unit/services/internal-economics/lp-economics-run-service.test.ts'],
    setupFiles: [
      resolve(projectRoot, 'tests/setup/node-setup-redis.ts'),
      resolve(projectRoot, 'tests/setup/db-delegate-link.ts'),
      resolve(projectRoot, 'tests/setup/test-infrastructure.ts'),
    ],
    env: {
      NODE_ENV: 'test',
      _EXPLICIT_NODE_ENV: 'test',
      TZ: process.env['TZ'] ?? 'UTC',
      REDIS_URL: 'memory://',
      JWT_SECRET: testSecret,
      JWT_ALG: 'HS256',
      JWT_ISSUER: 'updog',
      JWT_AUDIENCE: 'updog-app',
      ALERTMANAGER_WEBHOOK_SECRET: testSecret,
    },
  },
});
