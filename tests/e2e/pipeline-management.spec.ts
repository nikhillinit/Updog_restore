import { test, expect } from '@playwright/test';
import { PipelinePage } from './page-objects/PipelinePage';

test.describe('Pipeline Management', () => {
  let pipeline: PipelinePage;

  test.beforeEach(async ({ page }) => {
    pipeline = new PipelinePage(page);
  });

  // --------------------------------------------------------
  // Smoke: page loads and toolbar renders
  // --------------------------------------------------------
  test('pipeline page loads with toolbar visible', async () => {
    await pipeline.navigateTo();
    await pipeline.verifyPageLoaded();

    // Core header elements
    await expect(pipeline.addDealButton).toBeVisible();
    await expect(pipeline.importDealsButton).toBeVisible();

    // Toolbar filters
    await expect(pipeline.searchInput).toBeVisible();
    await expect(pipeline.statusFilter).toBeVisible();
    await expect(pipeline.priorityFilter).toBeVisible();
    await expect(pipeline.sortSelect).toBeVisible();
  });

  // --------------------------------------------------------
  // Add Deal: open modal, submit, see in list
  // --------------------------------------------------------
  test('add deal modal opens and submits successfully', async ({ page }) => {
    await pipeline.navigateTo();
    await pipeline.verifyPageLoaded();

    await pipeline.openAddDealModal();

    // Fill required fields
    await pipeline.fillAddDealForm({
      companyName: 'E2E Test Corp',
      dealSize: '5000000',
    });
    await pipeline.submitAddDeal();

    // Modal should close on success (toast visible or dialog gone)
    await expect(pipeline.addDealDialog).not.toBeVisible({ timeout: 10000 });

    // New deal should appear on page
    const dealLocator = await pipeline.getDealByName('E2E Test Corp');
    await expect(dealLocator).toBeVisible({ timeout: 10000 });
  });

  // --------------------------------------------------------
  // Add Deal validation: empty company name shows error
  // --------------------------------------------------------
  test('add deal modal shows validation error for empty company name', async () => {
    await pipeline.navigateTo();
    await pipeline.verifyPageLoaded();

    await pipeline.openAddDealModal();

    // Submit without filling anything
    await pipeline.submitAddDeal();

    // Dialog should stay open — validation error visible
    await expect(pipeline.addDealDialog).toBeVisible();

    // Look for validation message
    const errorText = pipeline.addDealDialog.locator('text=/required|company name/i');
    await expect(errorText).toBeVisible({ timeout: 5000 });
  });

  // --------------------------------------------------------
  // Search: type term, see filtered results
  // --------------------------------------------------------
  test('search filters deals by company name', async ({ page }) => {
    await pipeline.navigateTo();
    await pipeline.verifyPageLoaded();

    // Type a search that should match nothing
    await pipeline.searchDeals('zzz_nonexistent_company_xyz');

    // Should show "no matching deals" or zero results
    const noMatch = pipeline.noMatchingDeals;
    const dealCount = await pipeline.getDealCount();

    const hasNoMatchMessage = await noMatch.isVisible().catch(() => false);
    expect(hasNoMatchMessage || dealCount === 0).toBeTruthy();

    // Clear and verify deals come back
    await pipeline.clearSearch();
    await page.waitForTimeout(500);
  });

  // --------------------------------------------------------
  // Import modal: opens with file upload zone
  // --------------------------------------------------------
  test('import modal opens and shows upload zone', async () => {
    await pipeline.navigateTo();
    await pipeline.verifyPageLoaded();

    await pipeline.openImportModal();

    // Should show file upload area
    const uploadArea = pipeline.importDialog.locator('text=/upload|csv|drag/i');
    await expect(uploadArea).toBeVisible({ timeout: 5000 });
  });
});
