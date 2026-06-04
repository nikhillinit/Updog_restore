import { expect, test, type Page } from '@playwright/test';
import { expectNoUnexpectedApiRequests, installQaAuditApi } from './fixtures/qa-audit-api';

test.afterEach(async ({ page }) => {
  await expectNoUnexpectedApiRequests(page);
});

async function gotoGovernedRoute(page: Page, path: string) {
  await installQaAuditApi(page);
  await page.goto(path, { waitUntil: 'domcontentloaded' });
  await expect(page).not.toHaveURL(/\/(?:auth|login|fund-setup)\b/i);
  await expect(page.locator('main').last()).toBeVisible();
}

async function tabToLocator(
  page: Page,
  target: ReturnType<Page['locator']>,
  maxTabs = 40,
  key = 'Tab'
) {
  for (let index = 0; index < maxTabs; index += 1) {
    await page.keyboard.press(key);
    const isFocused = await target
      .evaluate((element) => element === document.activeElement)
      .catch(() => false);
    if (isFocused) return;
  }

  throw new Error(`Target was not reached by Tab within ${maxTabs} steps`);
}

test.describe('GP UX keyboard smoke', () => {
  test('desktop navigation reaches governed routes by keyboard and marks the active route', async ({
    page,
  }) => {
    await installQaAuditApi(page);

    const routeChecks = [
      { name: /dashboard/i, expectedUrl: /\/dashboard\b/ },
      { name: /portfolio/i, expectedUrl: /\/portfolio\b/ },
      { name: /performance/i, expectedUrl: /\/performance\b/ },
      { name: /model results/i, expectedUrl: /\/fund-model-results\/1\b/ },
      { name: /sensitivity analysis/i, expectedUrl: /\/sensitivity-analysis\b/ },
    ];

    for (const check of routeChecks) {
      await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
      await expect(page).not.toHaveURL(/\/(?:auth|login|fund-setup)\b/i);
      await expect(page.locator('aside')).toBeVisible();

      const link = page.locator('aside').getByRole('link', { name: check.name });
      await expect(link).toBeVisible();
      await tabToLocator(page, link);
      await expect(link).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(check.expectedUrl);
      await expect(page.locator('aside').getByRole('link', { name: check.name })).toHaveAttribute(
        'aria-current',
        'page'
      );
    }
  });

  test('mobile navigation opens by keyboard and keeps shared route labels', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoGovernedRoute(page, '/dashboard');

    const toggle = page.getByRole('button', { name: /navigation/i });
    await expect(toggle).toBeVisible();
    await tabToLocator(page, toggle);
    await page.keyboard.press('Enter');
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');

    const mobileNav = page.getByRole('navigation', { name: /mobile/i });
    const portfolioLink = mobileNav.getByRole('link', { name: 'Portfolio' });
    await tabToLocator(page, portfolioLink, 12);
    await expect(portfolioLink).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/portfolio\b/);
  });

  test('sensitivity controls expose named keyboard targets', async ({ page }) => {
    await gotoGovernedRoute(page, '/sensitivity-analysis');

    await expect(page.getByRole('tab', { name: 'Monte Carlo' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    const simulationRuns = page.getByRole('spinbutton', { name: 'Simulation Runs' });
    await expect(simulationRuns).toBeVisible();
    await tabToLocator(page, simulationRuns);
    await expect(simulationRuns).toBeFocused();

    const simulationSlider = page.getByRole('slider', { name: /simulation runs slider/i });
    await expect(simulationSlider).toBeVisible();
    await tabToLocator(page, simulationSlider, 8);
    await expect(simulationSlider).toBeFocused();

    const runBacktest = page.getByRole('button', { name: /run backtest/i });
    await expect(runBacktest).toBeVisible();
    await tabToLocator(page, runBacktest, 20);
    await expect(runBacktest).toBeFocused();

    const monteCarloTab = page.getByRole('tab', { name: 'Monte Carlo' });
    const oneWayTab = page.getByRole('tab', { name: 'One-Way' });
    await tabToLocator(page, monteCarloTab, 30, 'Shift+Tab');
    await page.keyboard.press('ArrowRight');
    await expect(oneWayTab).toBeFocused();
    await expect(oneWayTab).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('button', { name: /run sweep/i })).toBeVisible();
  });
});
