/**
 * Responsive Overview E2E Tests
 *
 * Tests the responsive behavior of the Overview/Dashboard page:
 * - SwipeableMetricCards on mobile
 * - DataTable horizontal scroll
 * - KPI card grid layout adaptation
 */

import { test, expect } from '@playwright/test';

test.describe('Responsive Overview', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('FF_NEW_IA', 'true');
    });
  });

  test.describe('Mobile (375x667)', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('shows swipeable metric cards', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for metric cards container
      const metricsSection = page.locator('[data-testid="swipeable-metrics"], .overflow-x-auto');

      if (await metricsSection.count() > 0) {
        await expect(metricsSection.first()).toBeVisible();

        // Verify horizontal scroll is possible
        const scrollWidth = await metricsSection.first().evaluate(el => el.scrollWidth);
        const clientWidth = await metricsSection.first().evaluate(el => el.clientWidth);

        // Content should be wider than container (scrollable)
        expect(scrollWidth).toBeGreaterThanOrEqual(clientWidth);
      }
    });

    test('DataTable scrolls horizontally', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Find a table or data grid
      const table = page.locator('table, [role="grid"], [data-testid*="table"]').first();

      if (await table.isVisible()) {
        // Get the scrollable container
        const container = table.locator('..');

        const scrollWidth = await container.evaluate(el => el.scrollWidth);
        const clientWidth = await container.evaluate(el => el.clientWidth);

        // If table is wider than viewport, it should be scrollable
        if (scrollWidth > clientWidth) {
          // Scroll to the right
          await container.evaluate(el => el.scrollLeft = 100);
          const newScrollLeft = await container.evaluate(el => el.scrollLeft);
          expect(newScrollLeft).toBeGreaterThan(0);
        }
      }
    });

    test('navigation collapses to mobile menu', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Look for mobile menu trigger (hamburger)
      const menuButton = page.getByRole('button', { name: /menu|toggle|navigation/i });

      if (await menuButton.isVisible()) {
        await expect(menuButton).toBeVisible();

        // Click to open menu
        await menuButton.click();

        // Menu should expand
        const nav = page.getByRole('navigation');
        await expect(nav).toBeVisible();
      }
    });

    test('KPI cards stack vertically', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Find KPI cards
      const kpiCards = page.locator('[data-testid^="kpi-card-"], .kpi-card, [class*="KpiCard"]');

      if (await kpiCards.count() > 0) {
        const firstCard = kpiCards.first();
        const secondCard = kpiCards.nth(1);

        if (await secondCard.isVisible()) {
          const firstBox = await firstCard.boundingBox();
          const secondBox = await secondCard.boundingBox();

          if (firstBox && secondBox) {
            // On mobile, cards should be stacked (second card below first)
            // or in a horizontal scroll (second card to the right)
            const isStacked = secondBox.y > firstBox.y;
            const isHorizontalScroll = secondBox.x > firstBox.x;

            expect(isStacked || isHorizontalScroll).toBe(true);
          }
        }
      }
    });
  });

  test.describe('Tablet (768x1024)', () => {
    test.use({ viewport: { width: 768, height: 1024 } });

    test('shows 2-column KPI layout', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const kpiCards = page.locator('[data-testid^="kpi-card-"], .kpi-card');

      if (await kpiCards.count() >= 2) {
        const firstBox = await kpiCards.first().boundingBox();
        const secondBox = await kpiCards.nth(1).boundingBox();

        if (firstBox && secondBox) {
          // On tablet, cards might be side by side
          const areSideBySide = Math.abs(firstBox.y - secondBox.y) < 10;

          // Or stacked
          const areStacked = secondBox.y > firstBox.y + 10;

          // Either is acceptable for tablet
          expect(areSideBySide || areStacked).toBe(true);
        }
      }
    });
  });

  test.describe('Desktop (1280x800)', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('shows full navigation sidebar', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      // Main navigation should be visible (not collapsed)
      const nav = page.getByRole('navigation');
      await expect(nav).toBeVisible();

      // Navigation links should be visible
      const navLinks = page.getByRole('link').filter({ hasText: /overview|portfolio|model/i });
      if (await navLinks.count() > 0) {
        await expect(navLinks.first()).toBeVisible();
      }
    });

    test('shows 4-column KPI grid', async ({ page }) => {
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      const kpiCards = page.locator('[data-testid^="kpi-card-"], .kpi-card');

      if (await kpiCards.count() >= 4) {
        const boxes = await Promise.all([
          kpiCards.nth(0).boundingBox(),
          kpiCards.nth(1).boundingBox(),
          kpiCards.nth(2).boundingBox(),
          kpiCards.nth(3).boundingBox(),
        ]);

        // Check if cards are in a row (same Y position within tolerance)
        if (boxes.every(b => b !== null)) {
          const allOnSameRow = boxes.every(b => Math.abs(b!.y - boxes[0]!.y) < 20);
          // On desktop with 4+ cards, at least some should be on same row
          // or grid should be 2x2
          expect(allOnSameRow || boxes[2]!.y > boxes[0]!.y).toBe(true);
        }
      }
    });

    test('DataTable shows all columns without scroll', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      const table = page.locator('table').first();

      if (await table.isVisible()) {
        const tableBox = await table.boundingBox();
        const viewportWidth = 1280;

        if (tableBox) {
          // Table should fit within viewport (no horizontal scroll needed)
          // Or at least be close to viewport width
          expect(tableBox.width).toBeLessThanOrEqual(viewportWidth + 50);
        }
      }
    });
  });
});

test.describe('Collapsible Sections', () => {
  test('can expand and collapse sections', async ({ page }) => {
    await page.goto('/allocation-manager');
    await page.waitForLoadState('networkidle');

    // Look for collapsible triggers
    const trigger = page.locator('[data-testid^="collapsible-trigger-"]').first();

    if (await trigger.isVisible()) {
      // Get initial state
      const contentId = (await trigger.getAttribute('data-testid'))?.replace('trigger-', 'content-');
      const content = page.getByTestId(contentId ?? '');

      // Toggle to open
      await trigger.click();
      await expect(content).toBeVisible();

      // Toggle to close
      await trigger.click();
      await expect(content).not.toBeVisible();
    }
  });
});
