import { defineConfig, devices } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

const explicitJwtEnv = {
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_ISSUER: process.env.JWT_ISSUER,
  JWT_AUDIENCE: process.env.JWT_AUDIENCE,
  JWT_ALG: process.env.JWT_ALG,
  MANUAL_GP_JWT_SECRET: process.env.MANUAL_GP_JWT_SECRET,
};

loadDotenv({ path: '.env', override: true });
loadDotenv({ path: `.env.${process.env.NODE_ENV ?? 'development'}`, override: true });

for (const [key, value] of Object.entries(explicitJwtEnv)) {
  if (value !== undefined) {
    process.env[key] = value;
  }
}

const baseURL = process.env.MANUAL_GP_BASE_URL ?? process.env.BASE_URL ?? 'http://localhost:5173';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report/manual-gp' }],
    ['json', { outputFile: 'test-results/manual-gp-results.json' }],
  ],
  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30 * 1000,
    navigationTimeout: 30 * 1000,
  },
  projects: [
    {
      name: 'manual-gp-live-proof',
      testMatch: '**/manual-gp-live-proof.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  timeout: 5 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
});
