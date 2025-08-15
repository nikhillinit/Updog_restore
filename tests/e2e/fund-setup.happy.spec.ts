import { test, expect } from '@playwright/test';

test('fund creation happy path', async ({ page }) => {
  await page.goto('/fund-setup');
  
  // Fill basic fund info
  await page.fill('[data-testid="fund-name"]', 'POVC Test Fund');
  await page.fill('[data-testid="fund-size"]', '50000000');
  
  // Navigate through wizard steps
  await page.click('[data-testid="next-step"]');
  
  // Set minimum valid stage values; last stage grad disabled/0
  await page.fill('[data-testid="stage-0-graduate"]', '35');
  await page.fill('[data-testid="stage-0-exit"]', '35');
  
  // Complete wizard
  await page.click('[data-testid="save-fund"]');
  
  // Assert success
  await expect(page.getByText('Fund saved successfully')).toBeVisible();
});