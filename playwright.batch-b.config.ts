import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const runtime = process.env.BATCH_B_RUNTIME === 'built' ? 'built' : 'dev';
const baseURL = runtime === 'built' ? 'http://localhost:5188' : 'http://localhost:5187';
process.env.BATCH_B_RUNTIME_FILE = path.resolve('.cache/batch-b-runtime.json');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['fund-workspace-real-backend.spec.ts', 'fund-workspace-recovery.spec.ts'],
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  workers: 1,
  timeout: 180_000,
  expect: { timeout: 20_000 },
  outputDir: 'test-results/batch-b',
  reporter: [['line'], ['json', { outputFile: 'test-results/batch-b-results.json' }]],
  use: {
    ...devices['Desktop Chrome'],
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import tsx tests/e2e/support/batch-b-server.ts',
    url: runtime === 'built' ? `${baseURL}/api/health/ready` : `${baseURL}/readyz`,
    reuseExistingServer: false,
    timeout: runtime === 'built' ? 600_000 : 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    env: {
      TZ: 'UTC',
      BATCH_B_RUNTIME_FILE: process.env.BATCH_B_RUNTIME_FILE,
      ...(process.env.BATCH_B_RUNTIME !== undefined
        ? { BATCH_B_RUNTIME: process.env.BATCH_B_RUNTIME }
        : {}),
    },
  },
});
