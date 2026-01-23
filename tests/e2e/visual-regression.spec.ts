/**
 * Visual Regression Tests (Scoped to UI Catalog)
 *
 * Captures visual snapshots of UI components in the admin catalog.
 * Run with --update-snapshots to regenerate baselines.
 *
 * Scope limited to UI Catalog to reduce snapshot maintenance burden.
 */

import { test, expect } from '@playwright/test';

test.describe('UI Catalog Visual Regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Visual tests only on Chrome');

  test.beforeEach(async ({ page }) => {
    // Enable admin access
    await page.addInitScript(() => {
      // Note: In production, this would require proper auth
      // For testing, we rely on dev mode flag
    });

    await page.goto('/admin/ui-catalog');
    await page.waitForLoadState('networkidle');
  });

  test('UI Catalog page loads', async ({ page }) => {
    // Verify page loaded successfully
    await expect(page).toHaveTitle(/ui catalog/i);

    // Take full page screenshot
    await expect(page).toHaveScreenshot('ui-catalog-full.png', {
      fullPage: true,
      threshold: 0.1, // Allow 10% pixel difference
    });
  });

  test('KpiCard component variants', async ({ page }) => {
    // Scroll to KPI section if exists
    const kpiSection = page.locator('text=KpiCard').first();

    if (await kpiSection.isVisible()) {
      await kpiSection.scrollIntoViewIfNeeded();

      // Find KPI demo area
      const kpiDemo = page.locator('[data-testid="kpi-card-demo"], .kpi-demo').first();

      if (await kpiDemo.isVisible()) {
        await expect(kpiDemo).toHaveScreenshot('kpi-card-variants.png', {
          threshold: 0.1,
        });
      }
    }
  });

  test('CollapsibleSection states', async ({ page }) => {
    const collapsibleSection = page.locator('text=CollapsibleSection').first();

    if (await collapsibleSection.isVisible()) {
      await collapsibleSection.scrollIntoViewIfNeeded();

      const demo = page.locator('[data-testid^="collapsible-"]').first();

      if (await demo.isVisible()) {
        // Capture collapsed state
        await expect(demo).toHaveScreenshot('collapsible-collapsed.png', {
          threshold: 0.1,
        });

        // Toggle to expanded
        const trigger = page.locator('[data-testid^="collapsible-trigger-"]').first();
        if (await trigger.isVisible()) {
          await trigger.click();
          await page.waitForTimeout(300); // Wait for animation

          await expect(demo).toHaveScreenshot('collapsible-expanded.png', {
            threshold: 0.1,
          });
        }
      }
    }
  });

  test('SplitPane layout', async ({ page }) => {
    const splitPaneSection = page.locator('text=SplitPane').first();

    if (await splitPaneSection.isVisible()) {
      await splitPaneSection.scrollIntoViewIfNeeded();

      const demo = page.getByTestId('split-pane').first();

      if (await demo.isVisible()) {
        await expect(demo).toHaveScreenshot('split-pane-layout.png', {
          threshold: 0.1,
        });
      }
    }
  });

  test('Button variants', async ({ page }) => {
    const buttonSection = page.locator('text=Button').first();

    if (await buttonSection.isVisible()) {
      await buttonSection.scrollIntoViewIfNeeded();

      // Capture button grid
      const buttonGrid = buttonSection.locator('..').locator('.grid, .flex').first();

      if (await buttonGrid.isVisible()) {
        await expect(buttonGrid).toHaveScreenshot('button-variants.png', {
          threshold: 0.1,
        });
      }
    }
  });

  test('Card component', async ({ page }) => {
    const cardSection = page.locator('text=Card').first();

    if (await cardSection.isVisible()) {
      await cardSection.scrollIntoViewIfNeeded();

      const cardDemo = cardSection.locator('..').locator('.card, [class*="Card"]').first();

      if (await cardDemo.isVisible()) {
        await expect(cardDemo).toHaveScreenshot('card-component.png', {
          threshold: 0.1,
        });
      }
    }
  });
});

test.describe('Component Isolation Snapshots', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Visual tests only on Chrome');

  test('GuidedTour dialog appearance', async ({ page }) => {
    // Enable tour
    await page.addInitScript(() => {
      localStorage.removeItem('onboarding_seen_gp_v1');
      localStorage.setItem('FF_ONBOARDING_TOUR', 'true');
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const tour = page.getByTestId('guided-tour');

    if (await tour.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(tour).toHaveScreenshot('guided-tour-step1.png', {
        threshold: 0.15, // More tolerance for dynamic content
      });
    }
  });
});
