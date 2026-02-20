import { test, expect } from '@playwright/test';
import { REACT_CHURN_PATTERNS } from '../constants/error-patterns';

/**
 * E2E smoke tests for FundSetup wizard
 * These tests verify that the fund setup wizard renders without React churn errors
 * and that navigation between steps works correctly.
 */

test.describe('FundSetup Wizard Smoke Tests', () => {
  // Enhanced error capture
  let consoleLogs: string[];
  let pageErrors: string[];
  let networkErrors: string[];

  test.beforeEach(async ({ page }, testInfo) => {
    consoleLogs = [];
    pageErrors = [];
    networkErrors = [];

    // Capture console errors, warnings, and debug (some libs only log there)
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        consoleLogs.push(`[${type}] ${msg.text()}`);
      }
      // Include debug logs in non-CI for troubleshooting
      if (!process.env.CI && type === 'debug') {
        consoleLogs.push(`[debug] ${msg.text()}`);
      }
    });

    // Capture unhandled page errors
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });

    // Capture network failures (500+ errors)
    page.on('response', (response) => {
      if (response.status() >= 500) {
        networkErrors.push(`HTTP ${response.status()} ${response.url()}`);
      }
    });

    // Expose logs to test context for better diagnostics
    (testInfo as any)._consoleLogs = consoleLogs;
    (testInfo as any)._pageErrors = pageErrors;
    (testInfo as any)._networkErrors = networkErrors;
  });

  test.afterEach(async ({}, testInfo) => {
    // Retrieve logs from test context
    const logs = (testInfo as any)._consoleLogs || [];
    const errors = (testInfo as any)._pageErrors || [];
    const network = (testInfo as any)._networkErrors || [];

    // Combine all error sources
    const allIssues = [...errors, ...network, ...logs].join('\n');

    // Check for React churn patterns
    if (allIssues) {
      expect(allIssues).not.toMatch(REACT_CHURN_PATTERNS);
    }

    // Log details on failure for debugging
    if (testInfo.status === 'failed') {
      console.error('Test failed with the following issues:');
      if (errors.length) console.error('Page errors:', errors);
      if (network.length) console.error('Network errors:', network);
      if (logs.length) console.error('Console logs:', logs);
    }
  });

  test('step 2 (investment-strategy) renders without churn errors', async ({ page }) => {
    await page.goto('/fund-setup?step=2');

    // Wait for the step container to be visible
    await expect(
      page.locator('[data-testid="wizard-step-investment-strategy-container"]')
    ).toBeVisible();

    // Error checking is handled by afterEach hook
  });

  test('step 3 (exit-recycling) renders without churn errors', async ({ page }) => {
    await page.goto('/fund-setup?step=3');

    // Wait for the step container to be visible
    await expect(
      page.locator('[data-testid="wizard-step-exit-recycling-container"]')
    ).toBeVisible();
  });

  test('step 4 (waterfall) renders without churn errors', async ({ page }) => {
    await page.goto('/fund-setup?step=4');

    // Wait for the step container to be visible
    await expect(page.locator('[data-testid="wizard-step-waterfall-container"]')).toBeVisible();
  });

  test('invalid step shows not-found without errors', async ({ page }, testInfo) => {
    await page.goto('/fund-setup?step=99');

    // Wait for the not-found container to be visible
    await expect(page.locator('[data-testid="wizard-step-not-found-container"]')).toBeVisible();

    // In production mode, we shouldn't see invalid step warnings
    // (they're DEV-only warnings)
    const logs = (testInfo as any)._consoleLogs || [];
    const invalidStepWarnings = logs.filter((log: string) =>
      log.toLowerCase().includes('invalid step')
    );
    expect(invalidStepWarnings.length).toBe(0);
  });

  test('navigation between steps works without hydration errors', async ({ page }) => {
    // Test rendering multiple steps in sequence
    const steps = ['2', '3', '4'];

    for (const step of steps) {
      await page.goto(`/fund-setup?step=${step}`);
      // Wait for the corresponding container to be visible
      const containerTestId =
        step === '2' ? 'investment-strategy' : step === '3' ? 'exit-recycling' : 'waterfall';
      await expect(
        page.locator(`[data-testid="wizard-step-${containerTestId}-container"]`)
      ).toBeVisible();
    }

    // Error checking is handled by afterEach hook
  });

  test('step 2 interactive elements are functional', async ({ page }) => {
    await page.goto('/fund-setup?step=2');

    // Wait for the container
    await expect(
      page.locator('[data-testid="wizard-step-investment-strategy-container"]')
    ).toBeVisible();

    // Test that we can interact with the stage inputs
    const stageNameInput = page.locator('[data-testid="stage-0-name"]').first();
    if (await stageNameInput.isVisible()) {
      await stageNameInput.fill('Test Stage');
      await expect(stageNameInput).toHaveValue('Test Stage');
    }

    // Error checking is handled by afterEach hook
  });
});

test.describe('FundSetup Wizard Performance', () => {
  test('initial load performance is acceptable', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/fund-setup?step=2');
    await page.waitForSelector('[data-testid="wizard-step-investment-strategy-container"]');

    const loadTime = Date.now() - startTime;

    // Initial load should be under 3 seconds
    expect(loadTime).toBeLessThan(3000);
  });

  test('step transitions are smooth', async ({ page }) => {
    await page.goto('/fund-setup?step=2');
    await page.waitForSelector('[data-testid="wizard-step-investment-strategy-container"]');

    const startTime = Date.now();

    // Navigate to next step
    await page.goto('/fund-setup?step=3');
    await page.waitForSelector('[data-testid="wizard-step-exit-recycling-container"]');

    const transitionTime = Date.now() - startTime;

    // Step transitions should be under 1 second
    expect(transitionTime).toBeLessThan(1000);
  });
});
