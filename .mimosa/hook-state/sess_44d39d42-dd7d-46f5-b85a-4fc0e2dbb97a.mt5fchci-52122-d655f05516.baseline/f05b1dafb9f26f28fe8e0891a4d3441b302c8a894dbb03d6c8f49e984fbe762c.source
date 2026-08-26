import { defineConfig, devices } from '@playwright/test';

const API_PORT = process.env.LP_REPORTING_E2E_API_PORT ?? '5000';
const CLIENT_PORT = process.env.LP_REPORTING_E2E_CLIENT_PORT ?? '5173';
const HOST = 'localhost';
const BASE_URL = process.env.BASE_URL ?? `http://${HOST}:${CLIENT_PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: ['**/lp-reporting-package-flow.spec.ts'],
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report-lp-reporting' }],
    ['json', { outputFile: 'test-results/lp-reporting-results.json' }],
    ['junit', { outputFile: 'test-results/lp-reporting-junit.xml' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: BASE_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
    acceptDownloads: true,
  },
  webServer: process.env.BASE_URL?.startsWith('http')
    ? undefined
    : {
        command:
          'npx concurrently -k -s first --names api,client "npm run dev:api" "npm run dev:client -- --host localhost"',
        url: BASE_URL,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          PORT: API_PORT,
          VITE_API_PORT: API_PORT,
          VITE_CLIENT_PORT: CLIENT_PORT,
          CLIENT_URL: BASE_URL,
          CORS_ORIGIN: `${BASE_URL},http://localhost:${CLIENT_PORT}`,
          REQUIRE_AUTH: '0',
          ALLOW_MEMORY_STORAGE: '1',
          DATABASE_URL: 'postgresql://user:pass@localhost:5432/mock',
          REDIS_URL: 'memory://',
          ENABLE_QUEUES: '0',
          JWT_SECRET: 'lp-reporting-e2e-jwt-secret-minimum-32-chars',
          SESSION_SECRET: 'lp-reporting-e2e-session-secret-minimum-32-chars',
        },
      },
  timeout: 5 * 60 * 1000,
  expect: {
    timeout: 15_000,
  },
});
