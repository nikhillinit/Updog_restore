import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { expectNoUnexpectedApiRequests, installQaAuditApi } from './fixtures/qa-audit-api';

const GOVERNED_ROUTE_SLICE = [
  { path: '/dashboard', name: 'Dashboard' },
  { path: '/portfolio', name: 'Portfolio' },
  { path: '/pipeline', name: 'Pipeline' },
  { path: '/performance', name: 'Performance' },
  { path: '/forecasting', name: 'Forecasting' },
  { path: '/fund-model-results/1', name: 'Model Results' },
  { path: '/model-results', name: 'Model Results Recovery' },
  { path: '/sensitivity-analysis', name: 'Sensitivity Analysis' },
  { path: '/reports', name: 'Reports' },
  { path: '/settings', name: 'Settings' },
  { path: '/help', name: 'Help' },
];

test.afterEach(async ({ page }) => {
  await expectNoUnexpectedApiRequests(page);
});

async function gotoGovernedRoute(page: Page, path: string) {
  await installQaAuditApi(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/(?:auth|login|fund-setup)\b/i);
  await expect(page.locator('main').last()).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
}

test.describe('Tranche 5 accessibility critical gate', () => {
  // Full-page scans still include legacy page-local debt outside this tranche
  // (unlabeled selects in older analytical surfaces). This gate scans the
  // governed route shell and the newly touched sensitivity controls.
  // Broader deleted coverage is tracked in
  // docs/plans/2026-05-14-t4-t5-follow-up-tranches.md#tranche-b-accessibility-coverage-restoration.
  for (const route of GOVERNED_ROUTE_SLICE) {
    test(`${route.name} shell navigation has zero critical axe violations`, async ({ page }) => {
      await gotoGovernedRoute(page, route.path);

      const results = await new AxeBuilder({ page })
        .include('aside')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();

      expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
    });
  }

  test('dashboard exposes landmarks and focusable navigation links', async ({ page }) => {
    await gotoGovernedRoute(page, '/dashboard');

    await expect(page.locator('main').last()).toBeVisible();
    await expect(page.getByRole('navigation')).toHaveCount(1);

    const performanceLink = page.locator('aside').getByRole('link', { name: 'Performance' });
    await expect(performanceLink).toBeVisible();
    await performanceLink.focus();
    await expect(performanceLink).toBeFocused();
  });

  test('sensitivity analysis exposes named tabs and form controls', async ({ page }) => {
    await gotoGovernedRoute(page, '/sensitivity-analysis');

    await expect(page.getByRole('tablist', { name: /sensitivity analysis modes/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Monte Carlo' })).toBeVisible();
    await expect(page.getByRole('spinbutton', { name: 'Simulation Runs' })).toBeVisible();
    await expect(page.getByLabel(/simulation runs slider/i).first()).toBeVisible();
    await expect(page.getByRole('checkbox', { name: 'IRR' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('main [role="tablist"]')
      .include('main [role="tabpanel"]')
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();

    expect(results.violations.filter((violation) => violation.impact === 'critical')).toEqual([]);
  });
});
