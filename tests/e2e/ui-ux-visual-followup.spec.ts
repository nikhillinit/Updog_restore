import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { installQaAuditApi, MOCK_FUND, makeDualForecastResponse } from './fixtures/qa-audit-api';

const hostileMessage =
  'SELECT private_column FROM private_funds WHERE token=$1 params: private-value';
const fund = { ...MOCK_FUND, establishmentDate: null, isActive: true };
const routes = [
  '/',
  '/dashboard',
  '/portfolio',
  '/pipeline',
  '/performance',
  '/fund-setup',
  '/reports',
  '/settings',
  '/help',
  '/forecasting?fundId=1',
];

test.beforeEach(async ({ page }) => {
  await installQaAuditApi(page);
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      json: { user: { id: 'qa', email: 'qa@example.com', role: 'admin', fundIds: [1] } },
    })
  );
  await page.route('**/api/funds', (route) => route.fulfill({ json: [fund] }));
  await page.route('**/api/portfolio-overview?*', (route) =>
    route.fulfill({
      json: {
        fundId: 1,
        generatedAt: '2026-09-12T00:00:00.000Z',
        currency: 'USD',
        provenance: {
          sourceKind: 'imported_actual',
          actionability: 'actionable',
          isFinanciallyActionable: true,
          generatedAt: '2026-09-12T00:00:00.000Z',
          warnings: [],
        },
        sourceRecordCounts: { companies: 1 },
        metrics: {
          totalInvested: '100000',
          totalValue: '150000',
          averageMOIC: '1.5',
          returnPct: '50',
          totalCompanies: 1,
          activeCompanies: 1,
          exitedCompanies: 0,
        },
        companies: [
          {
            id: 1,
            name: 'QA Company',
            sector: 'Software',
            stage: 'Seed',
            status: 'active',
            invested: '100000.00',
            currentValue: '150000.00',
            moic: '1.5',
          },
        ],
        meta: {
          mode: 'live',
          requestedAsOf: null,
          resolvedAsOf: null,
          source: 'live',
          historicalAvailable: false,
        },
      },
    })
  );
  const forecast = makeDualForecastResponse({
    fundId: 1,
    fundName: fund.name,
    asOfDate: '2026-03-31T00:00:00.000Z',
    currentForecastV2: 'live',
    actual: {
      currentNAV: 46000000,
      totalCalled: 20000000,
      totalDistributions: 1000000,
      tvpi: 2.35,
      dpi: 0.05,
      rvpi: 2.3,
      irr: 0.18,
    },
  });
  forecast.sources.current = 'current_forecast_v2';
  await page.route('**/api/funds/1/dual-forecast', (route) => route.fulfill({ json: forecast }));
  await page.emulateMedia({ reducedMotion: 'reduce' });
});

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test.describe(`${viewport.width}px`, () => {
    test.use({ viewport });

    for (const path of routes) {
      test(`rendered route ${path}`, async ({ page }, testInfo) => {
        const errors: string[] = [];
        const warnings: string[] = [];
        const failed: string[] = [];
        page.on('pageerror', (error) => errors.push(error.message));
        page.on('console', (message) => {
          if (['warning', 'error'].includes(message.type())) warnings.push(message.text());
        });
        page.on('response', (response) => {
          if (response.status() >= 400) failed.push(`${response.status()} ${response.url()}`);
        });
        await page.goto(path);
        await expect(page.locator('main h1').first()).toBeVisible();
        await expect(page.getByRole('banner')).toHaveCount(1);
        await expect(page.locator('main')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('vite-error-overlay')).toHaveCount(0);
        if (path === '/portfolio')
          await expect(
            page.getByText('QA Company', { exact: true }).filter({ visible: true }).first()
          ).toBeVisible();
        if (path.startsWith('/forecasting'))
          await expect(page.getByText('Fund Value Forecast', { exact: true })).toBeVisible();
        const logout = await page
          .getByRole('button', { name: 'Log out', exact: true })
          .boundingBox();
        expect(logout?.width).toBeGreaterThanOrEqual(44);
        expect(logout?.height).toBeGreaterThanOrEqual(44);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true
        );
        await page.screenshot({ path: testInfo.outputPath('page.png'), fullPage: true });
        const axe = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        await testInfo.attach('route-evidence', {
          body: JSON.stringify(
            { path, url: page.url(), viewport, errors, warnings, failed, axe: axe.violations },
            null,
            2
          ),
          contentType: 'application/json',
        });
        expect(errors).toEqual([]);
        expect(warnings).toEqual([]);
        expect(failed).toEqual([]);
        expect(
          axe.violations.map((v) => ({ id: v.id, targets: v.nodes.map((n) => n.target) }))
        ).toEqual([]);
        if (path === '/dashboard') {
          await page.getByRole('tab', { name: 'Overview', exact: true }).focus();
          await page.keyboard.press('ArrowRight');
          const performanceTab = page.getByRole('tab', { name: 'Performance', exact: true });
          await expect(performanceTab).toHaveAttribute('aria-selected', 'true');
          const panel = page.getByRole('tabpanel', { name: 'Performance', exact: true });
          await expect(panel).toBeVisible();
          await expect(panel.getByText('Supported performance metrics')).toBeVisible();
        }
      });
    }

    test('fund failure stays recoverable without leaking server details or redirecting to setup', async ({
      page,
    }, testInfo) => {
      let broken = true;
      await page.route('**/api/funds', (route) =>
        route.fulfill(
          broken
            ? { status: 500, json: { error: 'Database query failed', message: hostileMessage } }
            : { json: [fund] }
        )
      );
      for (const path of ['/', '/dashboard', '/portfolio', '/performance', '/forecasting']) {
        await page.goto(path);
        await expect(
          page.getByRole('heading', { name: 'Unable to load fund context' })
        ).toBeVisible();
        await expect(page).not.toHaveURL(/fund-setup/);
        await expect(page.locator('body')).not.toContainText('private_column');
        await expect(page.locator('body')).not.toContainText('private-value');
        await expect(page.locator('main')).toHaveCount(1);
        const retry = await page.getByRole('button', { name: 'Retry loading funds' }).boundingBox();
        expect(retry?.height).toBeGreaterThanOrEqual(44);
      }
      await page.screenshot({ path: testInfo.outputPath('fund-recovery.png') });
      broken = false;
      await page.getByRole('button', { name: 'Retry loading funds' }).focus();
      await page.keyboard.press('Enter');
      await expect(
        page.getByRole('heading', { name: 'Financial Modeling & Forecasting' })
      ).toBeVisible();
      await expect(page.getByRole('heading', { name: 'Unable to load fund context' })).toHaveCount(
        0
      );
    });

    test('empty fund setup, named controls, information targets and settings actions', async ({
      page,
    }, testInfo) => {
      await page.route('**/api/funds', (route) => route.fulfill({ json: [] }));
      await page.goto('/');
      await expect(page).toHaveURL(/fund-setup/);
      await expect(
        page.getByRole('heading', { name: 'Fund Construction Wizard', level: 1 })
      ).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
      await expect(page.getByRole('switch', { name: 'Evergreen Fund Structure' })).toHaveCount(1);
      const tooltip = page.getByRole('button', {
        name: /Average initial check from capital allocation rows/,
      });
      await expect(tooltip).toBeVisible();
      {
        const box = await tooltip.boundingBox();
        expect(box?.height).toBeGreaterThanOrEqual(44);
        expect(box?.width).toBeGreaterThanOrEqual(44);
        await tooltip.focus();
        await expect(page.getByRole('tooltip')).toBeVisible();
        await page.keyboard.press('Escape');
      }
      if (viewport.width === 1440) {
        const disabled = await page.locator('aside button:disabled').evaluateAll((es) =>
          es.map((e) => ({
            w: e.getBoundingClientRect().width,
            h: e.getBoundingClientRect().height,
          }))
        );
        expect(disabled.every((box) => box.w >= 44 && box.h >= 44)).toBe(true);
      } else {
        await page.getByRole('button', { name: 'Navigation', exact: true }).click();
        await expect(page.getByRole('navigation', { name: 'Mobile' })).toBeVisible();
        await page.getByRole('button', { name: 'Navigation', exact: true }).click();
      }
      await page.screenshot({ path: testInfo.outputPath('wizard.png') });
      await page.route('**/api/funds', (route) => route.fulfill({ json: [fund] }));
      await page.goto('/settings');
      await expect(page.getByRole('switch', { name: 'Email Digests' })).toBeDisabled();
      await expect(page.getByRole('switch', { name: 'KPI Reminders' })).toBeDisabled();
      const deployed = page.getByRole('button', { name: /^Deployed:/ });
      const remaining = page.getByRole('button', { name: /^Remaining:/ });
      await deployed.focus();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await remaining.focus();
      await expect(deployed).toHaveAttribute('data-state', 'closed');
      await expect(remaining).toHaveAttribute('data-state', 'instant-open');
      await expect(page.getByRole('tooltip')).toHaveCount(1);
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);
      await deployed.hover();
      await expect(page.getByRole('tooltip')).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(page.getByRole('tooltip')).toHaveCount(0);

      await page.getByRole('link', { name: 'Open portfolio' }).click();
      await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
      if (viewport.width === 1440) {
        const sidebar = page
          .locator('aside')
          .filter({ has: page.getByRole('navigation', { name: 'Primary', exact: true }) });
        await sidebar.locator('a').first().focus();
        await expect(sidebar).toHaveClass(/w-64/);
        await page.getByRole('button', { name: 'Log out' }).focus();
        await expect(sidebar).toHaveClass(/w-16/);
      }
    });
  });
}
