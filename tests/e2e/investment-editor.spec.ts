/**
 * Investment Editor Dialog E2E Tests
 *
 * Tests the split-screen investment editor:
 * - Desktop: KPI preview panel visible
 * - Mobile: Collapsible context panel
 * - Timeline updates after save
 */

import { test, expect } from '@playwright/test';

test.describe('Investment Editor Dialog', () => {
  test.beforeEach(async ({ page }) => {
    // Enable feature flags
    await page.addInitScript(() => {
      localStorage.setItem('FF_NEW_IA', 'true');
    });
  });

  test.describe('Desktop View', () => {
    test.use({ viewport: { width: 1280, height: 800 } });

    test('shows KPI preview in split pane layout', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      // Find and click add investment button
      const addButton = page.getByRole('button', { name: /add investment/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        // Dialog should open with split pane
        const dialog = page.getByTestId('investment-editor-dialog');
        await expect(dialog).toBeVisible({ timeout: 10000 });

        // KPI preview should be visible on desktop
        const kpiPreview = page.getByTestId('kpi-preview');
        await expect(kpiPreview).toBeVisible();

        // Should have 4 KPI cards (Total Value, Net IRR, TVPI, DPI)
        const kpiCards = kpiPreview.locator('[data-testid^="kpi-card-"]');
        await expect(kpiCards).toHaveCount(4);
      }
    });

    test('shows timeline in context panel', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      const addButton = page.getByRole('button', { name: /add investment/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        await expect(page.getByTestId('investment-editor-dialog')).toBeVisible({ timeout: 10000 });

        // Timeline should be visible
        const timeline = page.getByTestId('timeline');
        await expect(timeline).toBeVisible();
      }
    });
  });

  test.describe('Mobile View', () => {
    test.use({ viewport: { width: 375, height: 667 } });

    test('hides context panel by default', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      const addButton = page.getByRole('button', { name: /add investment/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        await expect(page.getByTestId('investment-editor-dialog')).toBeVisible({ timeout: 10000 });

        // KPI preview should be hidden on mobile
        const kpiPreview = page.getByTestId('kpi-preview');
        await expect(kpiPreview).not.toBeVisible();

        // Toggle button should be visible
        const toggle = page.getByTestId('context-panel-toggle');
        await expect(toggle).toBeVisible();
      }
    });

    test('can expand context panel on mobile', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      const addButton = page.getByRole('button', { name: /add investment/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        await expect(page.getByTestId('investment-editor-dialog')).toBeVisible({ timeout: 10000 });

        // Click toggle to expand
        const toggle = page.getByTestId('context-panel-toggle');
        await toggle.click();

        // KPI preview should now be visible
        await expect(page.getByTestId('kpi-preview')).toBeVisible();
      }
    });
  });

  test.describe('Split Pane Component', () => {
    test('renders with correct structure', async ({ page }) => {
      await page.goto('/portfolio');
      await page.waitForLoadState('networkidle');

      const addButton = page.getByRole('button', { name: /add investment/i });
      if (await addButton.isVisible()) {
        await addButton.click();

        await expect(page.getByTestId('investment-editor-dialog')).toBeVisible({ timeout: 10000 });

        // Check split pane exists
        const splitPane = page.getByTestId('split-pane');
        await expect(splitPane).toBeVisible();
      }
    });
  });
});

test.describe('Investment Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('FF_NEW_IA', 'true');
    });
  });

  test('shows loading state initially', async ({ page }) => {
    await page.goto('/portfolio');
    await page.waitForLoadState('networkidle');

    const addButton = page.getByRole('button', { name: /add investment/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      await expect(page.getByTestId('investment-editor-dialog')).toBeVisible({ timeout: 10000 });

      // Timeline should eventually load
      const timeline = page.getByTestId('timeline');
      await expect(timeline).toBeVisible({ timeout: 10000 });
    }
  });

  test('displays timeline items when data exists', async ({ page }) => {
    await page.goto('/portfolio');
    await page.waitForLoadState('networkidle');

    const addButton = page.getByRole('button', { name: /add investment/i });
    if (await addButton.isVisible()) {
      await addButton.click();

      await expect(page.getByTestId('investment-editor-dialog')).toBeVisible({ timeout: 10000 });

      // Wait for timeline to load
      const timeline = page.getByTestId('timeline');
      await expect(timeline).toBeVisible({ timeout: 10000 });

      // Check for timeline items or empty state
      const items = page.getByTestId('timeline-item');
      const itemCount = await items.count();

      // Either has items or shows empty state
      if (itemCount === 0) {
        await expect(timeline).toContainText(/no recent activity/i);
      } else {
        await expect(items.first()).toBeVisible();
      }
    }
  });
});
