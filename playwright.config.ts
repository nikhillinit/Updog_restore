import { defineConfig, devices } from '@playwright/test';

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests/e2e',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */ 
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [
    ['html'],
    ['line'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:5000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',
    
    /* Take screenshot on failure */
    screenshot: 'only-on-failure',
    
    /* Record video on failure */
    video: 'retain-on-failure',
    
    /* Global timeout for each test */
    actionTimeout: 30 * 1000,
    
    /* Timeout for navigation actions */
    navigationTimeout: 30 * 1000,
  },

  /* Configure projects for major browsers */
  projects: [
    // Smoke tests - fastest, run first
    {
      name: 'smoke',
      testMatch: '**/basic-smoke.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },

    // Core functionality tests
    {
      name: 'core',
      testMatch: ['**/dashboard-functionality.spec.ts', '**/navigation-and-routing.spec.ts', '**/fund-setup-workflow.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },

    // Extended functionality
    {
      name: 'extended',
      testMatch: ['**/user-authentication.spec.ts', '**/portfolio-management.spec.ts'],
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['core'],
    },

    // Performance tests
    {
      name: 'performance',
      testMatch: '**/performance.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },

    // Accessibility tests
    {
      name: 'accessibility',
      testMatch: '**/accessibility.spec.ts',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['smoke'],
    },

    // Production smoke tests (when BASE_URL is external)
    {
      name: 'production',
      testMatch: '**/production-smoke.spec.ts',
      use: { 
        ...devices['Desktop Chrome'],
        baseURL: process.env.PROD_URL || process.env.BASE_URL,
      },
    },

    // Mobile testing
    {
      name: 'mobile',
      testMatch: ['**/basic-smoke.spec.ts', '**/navigation-and-routing.spec.ts'],
      use: { ...devices['iPhone 13'] },
      dependencies: ['core'],
    },

    // Firefox testing
    {
      name: 'firefox',
      testMatch: ['**/basic-smoke.spec.ts', '**/dashboard-functionality.spec.ts'],
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['core'],
    },

    // Webkit/Safari testing
    {
      name: 'webkit',
      testMatch: ['**/basic-smoke.spec.ts'],
      use: { ...devices['Desktop Safari'] },
      dependencies: ['smoke'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: process.env.BASE_URL?.startsWith('http') ? undefined : {
    command: 'npm run dev',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
    env: {
      PORT: '5000',
    },
  },

  /* Global timeout for the whole test suite */
  timeout: 5 * 60 * 1000, // 5 minutes

  /* Expect timeout for assertions */
  expect: {
    timeout: 10 * 1000,
  },
});