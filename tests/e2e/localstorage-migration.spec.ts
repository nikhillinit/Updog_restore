import { test, expect } from '@playwright/test';

// Update to match your persist key:
const PERSIST_KEY = 'investment-strategy'; // or 'updog-fund-wizard' - check your store

test('migration: old schema -> new store; last-stage=0; gating works', async ({ page }) => {
  await page.addInitScript(([key]) => {
    // Simulate old shape (object-based + missing months)
    const old = {
      stages: [
        { id: 'seed',   name: 'Seed',     graduationRate: 35, exitRate: 35 },
        { id: 'a',      name: 'Series A', graduationRate: 60, exitRate: 25 },
        { id: 'growth', name: 'Growth',   graduationRate: 10, exitRate: 60 } // invalid: last stage grad > 0
      ]
    };
    localStorage.setItem(key, JSON.stringify(old));
  }, [PERSIST_KEY]);

  await page.goto('/fund-setup'); // adapt route if needed

  // Navigate to the Investment Strategy step if not default
  // e.g., await page.click('[data-testid="nav-investment-strategy"]');

  // Last stage graduate should be coerced to 0 and input disabled
  const lastGrad = page.locator('[data-testid^="stage-"]').last().locator('input[data-testid$="-graduate"]');
  await expect(lastGrad).toBeDisabled();
  await expect(lastGrad).toHaveValue('0');

  // Make an invalid row (sum > 100) to ensure Next disables
  await page.locator('[data-testid="stage-0-graduate"]').fill('80');
  await page.locator('[data-testid="stage-0-exit"]').fill('40');
  await expect(page.locator('[data-testid="wizard-next"]')).toBeDisabled();

  // Fix; Next enabled
  await page.locator('[data-testid="stage-0-exit"]').fill('20');
  await expect(page.locator('[data-testid="wizard-next"]')).toBeEnabled();

  // Verify remain calculation
  const remainDisplay = page.locator('[data-testid="stage-0-remain"]');
  await expect(remainDisplay).toHaveText('0%'); // 100 - 80 - 20 = 0
});

test('migration: preserves stage names and applies business rules', async ({ page }) => {
  await page.addInitScript(([key]) => {
    const old = {
      stages: [
        { id: '1', name: 'Pre-Seed', graduationRate: 50, exitRate: 30 },
        { id: '2', name: 'Seed',     graduationRate: 40, exitRate: 40 },
        { id: '3', name: 'Series A', graduationRate: 99, exitRate: 1 } // will be forced to 0 graduation
      ]
    };
    localStorage.setItem(key, JSON.stringify(old));
  }, [PERSIST_KEY]);

  await page.goto('/fund-setup');

  // Check stage names preserved
  await expect(page.locator('[data-testid="stage-0-name"]')).toHaveValue('Pre-Seed');
  await expect(page.locator('[data-testid="stage-1-name"]')).toHaveValue('Seed');
  await expect(page.locator('[data-testid="stage-2-name"]')).toHaveValue('Series A');

  // Verify last stage graduation forced to 0
  await expect(page.locator('[data-testid="stage-2-graduate"]')).toHaveValue('0');
  await expect(page.locator('[data-testid="stage-2-graduate"]')).toBeDisabled();
});
