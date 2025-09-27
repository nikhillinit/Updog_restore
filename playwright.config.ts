import { defineConfig, devices } from '@playwright/test';

// Compute consistent URLs and ports
const PREVIEW_PORT = process.env.PORT || '4173';
const HOST = process.env.CI ? '127.0.0.1' : 'localhost';
const PREVIEW_URL = process.env.BASE_URL ?? `http://${HOST}:${PREVIEW_PORT}`;

/**
 * @see https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './tests',
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
    ['line'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
    ['github'],
    ['json', { outputFile: 'test-results/results.json' }],
    ['junit', { outputFile: 'test-results/junit.xml' }]
  ],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: PREVIEW_URL,

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'retry-with-trace',
    
    /* Headless mode in CI */
    headless: !!process.env.CI,
    
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
      testMatch: ['**/dashboard-functionality.spec.ts', '**/navigation-and-routing.spec.ts', '**/fund-setup-workflow.spec.ts', '**/fund-setup.spec.ts'],
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
    command: `npm run build && npm run preview -- --port=${PREVIEW_PORT} --host=${HOST} --strictPort`,
    url: PREVIEW_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { PORT: PREVIEW_PORT },
  },

  /* Global timeout for the whole test suite */
  timeout: 5 * 60 * 1000, // 5 minutes

  /* Expect timeout for assertions */
  expect: {
    timeout: 10 * 1000,
  },
});