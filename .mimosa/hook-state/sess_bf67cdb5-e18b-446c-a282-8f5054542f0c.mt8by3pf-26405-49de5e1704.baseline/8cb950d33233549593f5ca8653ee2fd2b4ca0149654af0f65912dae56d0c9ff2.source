import { defineConfig, devices } from '@playwright/test';

/**
 * Simple Playwright configuration for testing against external URLs
 * Use this when you don't need to start the local dev server
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html'],
    ['line'],
    ['json', { outputFile: 'test-results/results.json' }]
  ],
  
  use: {
    baseURL: process.env.BASE_URL || 'https://updog-restore.vercel.app',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 30 * 1000,
    navigationTimeout: 30 * 1000,
  },

  projects: [
    // Production smoke tests
    {
      name: 'production-smoke',
      testMatch: '**/production-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    
    // Basic functionality tests against production
    {
      name: 'basic-tests',
      testMatch: ['**/basic-smoke.spec.ts', '**/basic-navigation.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['production-smoke'],
    },
  ],

  timeout: 5 * 60 * 1000,
  expect: {
    timeout: 10 * 1000,
  },
});