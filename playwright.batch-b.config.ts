import { defineConfig, devices } from '@playwright/test';
import path from 'node:path';

const baseURL = 'http://localhost:5187';
process.env.BATCH_B_RUNTIME_FILE = path.resolve('.cache/batch-b-runtime.json');

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'fund-workspace-real-backend.spec.ts',
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
    url: `${baseURL}/readyz`,
    reuseExistingServer: false,
    timeout: 180_000,
    gracefulShutdown: { signal: 'SIGTERM', timeout: 15_000 },
    env: { TZ: 'UTC', BATCH_B_RUNTIME_FILE: process.env.BATCH_B_RUNTIME_FILE },
  },
});
