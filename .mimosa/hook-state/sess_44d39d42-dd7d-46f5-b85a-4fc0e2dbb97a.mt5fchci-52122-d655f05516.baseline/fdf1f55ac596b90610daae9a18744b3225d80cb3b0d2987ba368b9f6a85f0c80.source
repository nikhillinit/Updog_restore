import { test, expect } from '@playwright/test';
import { testIds } from '../../client/src/lib/testIds';

test.describe('Fund Setup Wizard E2E', () => {
  test('completes full wizard flow with retry logic', async ({ page }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:5000';
    
    // Set reasonable timeouts with retry logic
    page.setDefaultTimeout(30000);
    
    // Navigate to base URL with retry
    let retries = 3;
    while (retries > 0) {
      try {
        await page.goto(baseURL, { waitUntil: 'networkidle', timeout: 30000 });
        break;
      } catch (error) {
        retries--;
        if (retries === 0) throw error;
        await page.waitForTimeout(5000); // Wait before retry
      }
    }

    // Navigate to wizard - use data-testid when available
    const wizardLink = page.getByRole('link', { name: /wizard|setup|create fund/i }).first();
    await wizardLink.waitFor({ state: 'visible', timeout: 10000 });
    await wizardLink.click();

    // Step 1: Fund Basics (if visible)
    const step1Container = page.getByTestId(testIds.wizard.step1.container);
    if (await step1Container.isVisible().catch(() => false)) {
      await page.getByTestId(testIds.wizard.step1.fundName).fill('Test Fund 2025');
      await page.getByTestId(testIds.wizard.step1.fundSize).fill('100000000');
      await page.getByTestId(testIds.wizard.navigation.next).click();
    }

    // Step 2: Terms (if visible)
    const step2Container = page.getByTestId(testIds.wizard.step2.container);
    if (await step2Container.isVisible().catch(() => false)) {
      await page.getByTestId(testIds.wizard.step2.reservePercent).fill('20');
      await page.getByTestId(testIds.wizard.step2.managementFee).fill('2');
      await page.getByTestId(testIds.wizard.navigation.next).click();
    }

    // Step 3: Investment Strategy
    const step3Container = page.getByTestId(testIds.wizard.step3.container);
    if (await step3Container.isVisible().catch(() => false)) {
      await page.getByTestId(testIds.wizard.step3.deploymentPeriod).fill('3');
      await page.getByTestId(testIds.wizard.step3.followOnRatio).fill('0.5');
      await page.getByTestId(testIds.wizard.navigation.next).click();
    }

    // Step 4: Review & Confirm
    const step4Container = page.getByTestId(testIds.wizard.step4.container);
    if (await step4Container.isVisible().catch(() => false)) {
      // Wait for summary to load
      await page.getByTestId(testIds.wizard.step4.summary).waitFor({ state: 'visible' });
      await page.getByTestId(testIds.wizard.step4.confirmButton).click();
    }

    // Verify completion - look for success message or redirect
    await expect(page).toHaveURL(/.*(?:complete|success|dashboard)/i, { timeout: 15000 });
  });

  test('validates required fields and shows errors', async ({ page }) => {
    const baseURL = process.env.BASE_URL || 'http://localhost:5000';
    
    await page.goto(baseURL, { waitUntil: 'networkidle' });
    
    // Navigate to wizard
    const wizardLink = page.getByRole('link', { name: /wizard|setup|create fund/i }).first();
    await wizardLink.waitFor({ state: 'visible', timeout: 10000 });
    await wizardLink.click();
    
    // Try to proceed without filling required fields
    const nextButton = page.getByTestId(testIds.wizard.navigation.next);
    if (await nextButton.isVisible().catch(() => false)) {
      await nextButton.click();
      
      // Check for validation error
      const errorElement = page.getByTestId(testIds.wizard.validation.error);
      await expect(errorElement).toBeVisible({ timeout: 5000 });
    }
  });
});
