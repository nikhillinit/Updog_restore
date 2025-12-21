/**
 * Feature Flag Matrix E2E Tests
 *
 * Tests all combinations of feature flags:
 * 1. Both OFF (legacy mode)
 * 2. NEW_IA ON, KPI OFF
 * 3. NEW_IA OFF, KPI ON
 * 4. Both ON
 *
 * Uses parameterized test pattern for maintainability.
 */

import type { Page } from '@playwright/test';
import { test, expect } from '@playwright/test';

// Type for feature flag state
type FeatureFlagState = {
  enable_new_ia: boolean;
  enable_kpi_selectors: boolean;
};

// Test matrix - single source of truth for all flag combinations
const testMatrix: { name: string; flags: FeatureFlagState }[] = [
  {
    name: 'All Flags OFF (Legacy Mode)',
    flags: { enable_new_ia: false, enable_kpi_selectors: false },
  },
  {
    name: 'New IA ON / KPI OFF',
    flags: { enable_new_ia: true, enable_kpi_selectors: false },
  },
  {
    name: 'New IA OFF / KPI ON',
    flags: { enable_new_ia: false, enable_kpi_selectors: true },
  },
  {
    name: 'All Flags ON (Full New Features)',
    flags: { enable_new_ia: true, enable_kpi_selectors: true },
  },
];

/**
 * Helper: Set feature flags via localStorage before page loads
 */
async function setupFeatureFlags(page: Page, flags: FeatureFlagState) {
  await page.addInitScript((flagsToSet) => {
    window.localStorage.setItem(
      'ff_enable_new_ia',
      flagsToSet.enable_new_ia ? '1' : '0'
    );
    window.localStorage.setItem(
      'ff_enable_kpi_selectors',
      flagsToSet.enable_kpi_selectors ? '1' : '0'
    );
  }, flags);
}

test.describe('Feature Flag Matrix E2E Tests', () => {
  // Dynamically generate tests for each flag combination
  for (const scenario of testMatrix) {
    test(`Scenario: ${scenario.name}`, async ({ page }) => {
      // 1. SETUP: Apply feature flags for this scenario
      await setupFeatureFlags(page, scenario.flags);

      // 2. ACTION: Navigate (use /funds to test redirects)
      await page.goto('/funds');

      // 3. ASSERTIONS

      // A. Test Route Redirects
      if (scenario.flags.enable_new_ia) {
        // Should redirect to /portfolio
        await expect(page).toHaveURL('/portfolio', { timeout: 3000 });
      } else {
        // Should stay on /funds
        await expect(page).toHaveURL('/funds');
      }

      // B. Verify Sidebar Item Counts
      // Note: Adjust selector to match your actual sidebar structure
      const sidebarItems = page.locator('nav[aria-label="Primary"] button, nav aside button');
      const expectedCount = scenario.flags.enable_new_ia ? 5 : 26;

      await expect(sidebarItems).toHaveCount(expectedCount, {
        timeout: 5000,
      });

      // C. Verify Correct Header Component Renders
      const dynamicHeader = page.getByTestId('dynamic-fund-header');
      const kpiHeader = page.getByTestId('header-kpis');

      if (scenario.flags.enable_kpi_selectors) {
        await expect(kpiHeader).toBeVisible({ timeout: 3000 });
        await expect(dynamicHeader).not.toBeVisible();
      } else {
        await expect(dynamicHeader).toBeVisible({ timeout: 3000 });
        await expect(kpiHeader).not.toBeVisible();
      }

      // D. Additional checks for new IA mode
      if (scenario.flags.enable_new_ia) {
        // Verify new IA labels are present
        await expect(page.getByRole('link', { name: /overview/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /model/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /operate/i })).toBeVisible();
        await expect(page.getByRole('link', { name: /report/i })).toBeVisible();
      }
    });
  }
});

test.describe('Legacy Route Redirects (NEW_IA=true)', () => {
  test.beforeEach(async ({ page }) => {
    await setupFeatureFlags(page, {
      enable_new_ia: true,
      enable_kpi_selectors: false,
    });
  });

  const redirectTests = [
    { from: '/funds', to: '/portfolio' },
    { from: '/investments', to: '/portfolio' },
    { from: '/dashboard', to: '/overview' },
    { from: '/planning', to: '/model' },
    { from: '/analytics', to: '/report' },
    { from: '/kpi-manager', to: '/operate' },
  ];

  for (const { from, to } of redirectTests) {
    test(`redirects ${from} → ${to}`, async ({ page }) => {
      await page.goto(from);
      await expect(page).toHaveURL(to, { timeout: 3000 });
    });
  }
});

test.describe('No Redirects (NEW_IA=false)', () => {
  test.beforeEach(async ({ page }) => {
    await setupFeatureFlags(page, {
      enable_new_ia: false,
      enable_kpi_selectors: false,
    });
  });

  test('legacy routes remain unchanged', async ({ page }) => {
    await page.goto('/funds');
    await expect(page).toHaveURL('/funds');

    await page.goto('/dashboard');
    await expect(page).toHaveURL('/dashboard');
  });
});

test.describe('Console Errors Check', () => {
  test('no console errors in any flag state', async ({ page }) => {
    const consoleErrors: string[] = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    // Test each scenario
    for (const scenario of testMatrix) {
      await setupFeatureFlags(page, scenario.flags);
      await page.goto('/');
      await page.waitForLoadState('networkidle');

      expect(
        consoleErrors.filter((e) => !e.includes('favicon')), // Ignore favicon errors
        `No console errors in scenario: ${scenario.name}`
      ).toHaveLength(0);
    }
  });
});
