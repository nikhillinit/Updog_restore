/**
 * Wizard Review Step E2E Tests
 *
 * Tests the Step 7 (Review & Create) functionality:
 * - Review page loads
 * - Summary sections display
 * - Create button enabled/disabled based on validation
 */

import { test, expect } from '@playwright/test';

test.describe('Wizard Review Step', () => {
  test.beforeEach(async ({ page }) => {
    // Enable feature flags
    await page.addInitScript(() => {
      localStorage.setItem('FF_NEW_IA', 'true');
    });
  });

  test('Review step loads at step=7', async ({ page }) => {
    await page.goto('/fund-setup?step=7');
    await page.waitForLoadState('networkidle');

    // Review step should be visible
    const reviewStep = page.getByTestId('review-step');
    await expect(reviewStep).toBeVisible({ timeout: 10000 });

    // Should show "Review & Create Fund" heading
    await expect(page.getByRole('heading', { name: /review.*create/i })).toBeVisible();
  });

  test('displays summary sections', async ({ page }) => {
    await page.goto('/fund-setup?step=7');
    await page.waitForLoadState('networkidle');

    // Should have Fund Basics section
    await expect(page.getByText('Fund Basics')).toBeVisible();

    // Should have Economics section
    await expect(page.getByText('Economics')).toBeVisible();

    // Should have Investment Strategy section
    await expect(page.getByText('Investment Strategy')).toBeVisible();
  });

  test('shows validation status', async ({ page }) => {
    await page.goto('/fund-setup?step=7');
    await page.waitForLoadState('networkidle');

    // Should show validation summary (either ready, warnings, or missing)
    const validationAlert = page.locator('[role="alert"]');
    await expect(validationAlert).toBeVisible();

    // Alert should contain field count
    await expect(validationAlert).toContainText(/\d+ of \d+ fields configured/);
  });

  test('can navigate back to step 6', async ({ page }) => {
    await page.goto('/fund-setup?step=7');
    await page.waitForLoadState('networkidle');

    // Find and click back button
    const backButton = page.getByRole('button', { name: /back/i });
    await expect(backButton).toBeVisible();

    await backButton.click();

    // Should navigate to step 6
    await expect(page).toHaveURL(/step=6/);
  });

  test('shows create fund button', async ({ page }) => {
    await page.goto('/fund-setup?step=7');
    await page.waitForLoadState('networkidle');

    // Create button should exist
    const createButton = page.getByTestId('create-fund-button');
    await expect(createButton).toBeVisible();

    // Button should have "Create Fund" text
    await expect(createButton).toContainText(/create fund/i);
  });

  test('step 7 is accessible in wizard flow', async ({ page }) => {
    // Start at step 1
    await page.goto('/fund-setup?step=1');
    await page.waitForLoadState('networkidle');

    // Verify we can navigate through all steps
    for (let step = 1; step <= 7; step++) {
      await page.goto(`/fund-setup?step=${step}`);
      await page.waitForLoadState('networkidle');

      // Each step should load without error
      const notFound = page.locator('text=Step Not Found');
      await expect(notFound).not.toBeVisible();
    }
  });
});
