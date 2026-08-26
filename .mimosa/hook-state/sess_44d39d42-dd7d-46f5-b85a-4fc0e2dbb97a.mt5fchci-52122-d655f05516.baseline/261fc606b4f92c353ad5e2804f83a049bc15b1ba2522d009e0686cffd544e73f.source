import { test, expect } from '@playwright/test';

test.describe('Demo Banner - MVP', () => {
  test('shows banner when stub mode is enabled', async ({ page }) => {
    // Mock stub-status to return enabled
    await page.route('**/api/stub-status', route =>
      route.fulfill({ 
        status: 200, 
        body: JSON.stringify({ stubMode: true, timestamp: new Date().toISOString() }) 
      })
    );

    await page.goto('/fund-setup?step=2');
    
    // Banner should be visible
    await expect(page.getByText('Demo Mode Active')).toBeVisible();
  });

  test('hides banner when stub mode is disabled', async ({ page }) => {
    // Mock stub-status to return disabled
    await page.route('**/api/stub-status', route =>
      route.fulfill({ 
        status: 200, 
        body: JSON.stringify({ stubMode: false, timestamp: new Date().toISOString() }) 
      })
    );

    await page.goto('/fund-setup?step=2');
    
    // Banner should not be visible
    await expect(page.getByText('Demo Mode Active')).not.toBeVisible();
  });

  test('handles API failure gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('**/api/stub-status', route => route.abort());

    await page.goto('/fund-setup?step=2');
    
    // Banner should not be visible on failure
    await expect(page.getByText('Demo Mode Active')).not.toBeVisible();
    
    // Main content should still work
    await expect(page.getByTestId('wizard-step-investment-strategy-container')).toBeVisible();
  });
});