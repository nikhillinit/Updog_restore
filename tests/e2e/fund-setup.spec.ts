import { test, expect } from '@playwright/test';
import { REACT_CHURN_PATTERNS, containsCriticalError } from '../constants/error-patterns';

/**
 * E2E smoke tests for FundSetup wizard
 * These tests verify that the fund setup wizard renders without React churn errors
 * and that navigation between steps works correctly.
 */

test.describe('FundSetup Wizard Smoke Tests', () => {
  // Capture console errors for each test
  let consoleLogs: string[];

  test.beforeEach(async ({ page }) => {
    consoleLogs = [];
    
    // Capture console errors and warnings
    page.on('console', (msg) => {
      const type = msg.type();
      if (type === 'error' || type === 'warning') {
        consoleLogs.push(`[${type}] ${msg.text()}`);
      }
    });
    
    // Capture page errors
    page.on('pageerror', (err) => {
      consoleLogs.push(`[pageerror] ${err.message}`);
    });
  });

  test('step 2 (investment-strategy) renders without churn errors', async ({ page }) => {
    await page.goto('/fund-setup?step=2');
    
    // Wait for the step container to be visible
    await expect(page.locator('[data-testid="wizard-step-investment-strategy-container"]')).toBeVisible();
    
    // Check for any React churn errors
    const allLogs = consoleLogs.join('\n');
    expect(allLogs).not.toMatch(REACT_CHURN_PATTERNS);
  });

  test('step 3 (exit-recycling) renders without churn errors', async ({ page }) => {
    await page.goto('/fund-setup?step=3');
    
    // Wait for the step container to be visible
    await expect(page.locator('[data-testid="wizard-step-exit-recycling-container"]')).toBeVisible();
    
    // Check for any React churn errors
    const allLogs = consoleLogs.join('\n');
    expect(allLogs).not.toMatch(REACT_CHURN_PATTERNS);
  });

  test('step 4 (waterfall) renders without churn errors', async ({ page }) => {
    await page.goto('/fund-setup?step=4');
    
    // Wait for the step container to be visible
    await expect(page.locator('[data-testid="wizard-step-waterfall-container"]')).toBeVisible();
    
    // Check for any React churn errors
    const allLogs = consoleLogs.join('\n');
    expect(allLogs).not.toMatch(REACT_CHURN_PATTERNS);
  });

  test('invalid step shows not-found without errors', async ({ page }) => {
    await page.goto('/fund-setup?step=99');
    
    // Wait for the not-found container to be visible
    await expect(page.locator('[data-testid="wizard-step-not-found-container"]')).toBeVisible();
    
    // In DEV mode, we expect at most one warning about invalid step
    const invalidStepWarnings = consoleLogs.filter(log => 
      log.toLowerCase().includes('invalid step')
    );
    expect(invalidStepWarnings.length).toBeLessThanOrEqual(1);
  });

  test('navigation between steps works without hydration errors', async ({ page }) => {
    // Test rendering multiple steps in sequence
    const steps = ['2', '3', '4'];
    
    for (const step of steps) {
      await page.goto(`/fund-setup?step=${step}`);
      // Wait a moment for any React errors to surface
      await page.waitForTimeout(100);
    }
    
    // Check consolidated logs for any critical errors
    const allLogs = consoleLogs.join('\n').toLowerCase();
    
    // These patterns indicate serious React issues
    expect(allLogs).not.toMatch(/maximum update depth/);
    expect(allLogs).not.toMatch(/getsnapshot.*cached/);
    expect(allLogs).not.toMatch(/too many re-renders/);
    expect(allLogs).not.toMatch(/hydration/);
    expect(allLogs).not.toMatch(/act\(\)/);
  });

  test('step 2 interactive elements are functional', async ({ page }) => {
    await page.goto('/fund-setup?step=2');
    
    // Wait for the container
    await expect(page.locator('[data-testid="wizard-step-investment-strategy-container"]')).toBeVisible();
    
    // Test that we can interact with the stage inputs
    const stageNameInput = page.locator('[data-testid="stage-0-name"]').first();
    if (await stageNameInput.isVisible()) {
      await stageNameInput.fill('Test Stage');
      await expect(stageNameInput).toHaveValue('Test Stage');
    }
    
    // Verify no errors after interaction
    const allLogs = consoleLogs.join('\n');
    expect(allLogs).not.toMatch(REACT_CHURN_PATTERNS);
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