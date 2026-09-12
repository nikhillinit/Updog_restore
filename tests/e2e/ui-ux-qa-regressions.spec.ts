import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';
import { installQaAuditApi, MOCK_FUND, makeDualForecastResponse } from './fixtures/qa-audit-api';

const fund = { ...MOCK_FUND, establishmentDate: null, isActive: true };
const session = { user: { id: 'qa', email: 'qa@example.com', role: 'admin', fundIds: [1] } };
const overview = {
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
  sourceRecordCounts: { companies: 2 },
  metrics: {
    totalInvested: '200000',
    totalValue: '300000',
    averageMOIC: '1.5',
    returnPct: '50',
    totalCompanies: 2,
    activeCompanies: 2,
    exitedCompanies: 0,
  },
  companies: ['QA Company', '=1+1'].map((name, index) => ({
    id: index + 1,
    name,
    sector: 'Software',
    stage: 'Seed',
    status: 'active',
    invested: '100000.00',
    currentValue: '150000.00',
    moic: '1.5',
  })),
  meta: {
    mode: 'live',
    requestedAsOf: null,
    resolvedAsOf: null,
    source: 'live',
    historicalAvailable: false,
  },
};

test.beforeEach(async ({ page }) => {
  await installQaAuditApi(page);
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: session }));
  await page.route('**/api/funds', (route) => route.fulfill({ json: [fund] }));
  await page.route('**/api/portfolio-overview?*', (route) => route.fulfill({ json: overview }));
});

test('help availability, session identity, 404 recovery and authenticated login', async ({
  page,
}) => {
  await page.goto('/help');
  await expect(page.getByRole('button', { name: 'Read docs' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Watch tutorials' })).toBeDisabled();
  await expect(page.getByRole('link', { name: 'Send Message' })).toHaveAttribute(
    'href',
    'mailto:support@pressonventures.com'
  );
  await expect(page.getByText('Release notes are not available in this workspace.')).toBeVisible();
  await expect(page.getByText('v2.4.0')).toHaveCount(0);

  await page.goto('/settings');
  await expect(page.getByText('qa@example.com', { exact: true })).toBeVisible();
  await expect(page.getByText('manager@pressonfund.com')).toHaveCount(0);

  await page.goto('/qa-page-that-does-not-exist');
  await expect(page.getByRole('heading', { name: '404 Page Not Found' })).toBeVisible();
  await page.getByRole('link', { name: 'Back to Dashboard' }).focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto('/login');
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.route('**/api/auth/session', (route) => route.fulfill({ status: 401, json: {} }));
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Sign in' })).toBeVisible();
  await expect(page.getByLabel('Username')).toHaveAttribute('required', '');
});

test('backtest history failure is distinct from empty and retry recovers', async ({ page }) => {
  let failed = true;
  await page.route('**/api/backtesting/fund/1/history?*', (route) =>
    route.fulfill(
      failed
        ? { status: 400, json: { error: 'VALIDATION_ERROR' } }
        : { json: { history: [], total: 0 } }
    )
  );
  await page.goto('/sensitivity-analysis');
  await expect(
    page.getByRole('alert').filter({ hasText: 'Backtest history is unavailable' })
  ).toBeVisible();
  await expect(page.getByText('No previous backtests')).toHaveCount(0);
  failed = false;
  await page.getByRole('button', { name: 'Retry history' }).click();
  await expect(page.getByText('No previous backtests')).toBeVisible();
  await expect(page.getByLabel('End Date')).toHaveValue(`${new Date().getUTCFullYear()}-01-01`);
});

test('portfolio CSV downloads exact filtered decimal data and sanitizes formulas', async ({
  page,
}) => {
  await page.goto('/portfolio');
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
  await page.getByLabel('Search companies', { exact: true }).fill('=1+1');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export CSV' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('portfolio-1-current.csv');
  const csv = await readFile((await download.path())!, 'utf8');
  expect(csv).toContain("'=1+1");
  expect(csv).toContain('100000.00');
  expect(csv).toContain('150000.00');
  expect(csv).not.toContain('QA Company');
  await expect(page.getByText('Portfolio export started', { exact: true })).toBeVisible();
  await page.getByLabel('Search companies', { exact: true }).fill('no-match');
  await expect(page.getByRole('button', { name: 'Export CSV' })).toBeDisabled();
  await page.getByLabel('As-of month').focus();
  await expect(page.getByLabel('As-of month')).toBeFocused();
});

test('header and performance distinguish portfolio estimates from LP returns', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByText('Net IRR', { exact: true })).toHaveCount(0);
  await expect(page.getByText(/not reconciled LP returns/)).toBeVisible();
  await page.getByRole('tab', { name: 'Performance', exact: true }).click();
  await expect(page.getByText('IRR estimate', { exact: true })).toHaveCount(2);
  await expect(page.getByText(/Target 20/)).toHaveCount(0);
  await page.getByRole('button', { name: 'Share with LPs' }).click();
  await expect(page.getByLabel('GP Returns', { exact: true })).toBeVisible();
  await expect(page.getByLabel('GP Commitment', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('unsupported legacy forecast and missing targets never render drift comparisons', async ({
  page,
}) => {
  await page.goto('/forecasting?fundId=1');
  await expect(page.getByText('Forecast comparison unavailable', { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Legacy projections do not provide a verified fund-specific basis/)
  ).toBeVisible();
  await expect(page.getByLabel('Forecast drift summary')).toHaveCount(0);
  await expect(page.getByText('Dashboard IRR', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Deployment', { exact: true })).toHaveCount(0);
  const forecast = makeDualForecastResponse({
    fundId: 1,
    fundName: fund.name,
    asOfDate: '2026-09-12T00:00:00.000Z',
    actual: {
      currentNAV: 150000,
      totalCalled: 100000,
      totalDistributions: 0,
      tvpi: 1.5,
      dpi: null,
      rvpi: 1.5,
      irr: null,
    },
  });
  forecast.config = {
    source: 'legacy_default_missing_target_metrics',
    version: 1,
    publishedAt: null,
    fallbackReason: 'Missing targetMetrics',
  };
  await page.route('**/api/funds/1/dual-forecast', (route) => route.fulfill({ json: forecast }));
  await page.reload();
  await expect(page.getByText(/Published target metrics are unavailable/)).toBeVisible();
  await expect(page.getByLabel('Forecast drift summary')).toHaveCount(0);
});

test('workspace label uses only the matching fund identity even when results fail', async ({
  page,
}) => {
  await page.route('**/api/funds/1/results', (route) =>
    route.fulfill({ status: 500, json: { error: 'RESULTS_UNAVAILABLE' } })
  );
  for (const path of [
    '/fund-model-results/1',
    '/fund-model-results/1/moic-analysis',
    '/fund-model-results/1/scenarios',
  ]) {
    await page.goto(path);
    await expect(page.getByTestId('workspace-nav-fund')).toHaveText(fund.name);
  }
  await page.goto('/fund-model-results/99');
  await expect(page.getByTestId('workspace-nav-fund')).toHaveText('Fund 99');
});

test('wizard validation blocks empty steps and defaults have no invented history', async ({
  page,
}, testInfo) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET' && /\/api\/funds/.test(request.url()))
      writes.push(request.url());
  });
  await page.goto('/fund-setup?step=1');
  await page.getByRole('button', { name: 'Next Step' }).click();
  await expect(page).toHaveURL(/step=1$/);
  await expect(
    page.getByText('Complete all required fund basics before continuing.')
  ).toBeVisible();
  await expect(page.locator('[aria-invalid="true"]')).toHaveCount(3);
  await page.screenshot({ path: testInfo.outputPath('wizard-invalid.png') });
  expect(
    (
      await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze()
    ).violations
  ).toEqual([]);
  await page.goto('/fund-setup?step=2');
  await expect(page.getByText('5 investment stages defined')).toBeVisible();
  await expect(page.locator('main')).toHaveCount(1);
  await expect(page.getByText(/Last edited just now/)).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('supported live and held V2 comparisons keep their served values and provenance', async ({
  page,
}) => {
  for (const currentForecastV2 of ['live', 'held'] as const) {
    const forecast = makeDualForecastResponse({
      fundId: 1,
      fundName: fund.name,
      asOfDate: '2026-03-31T00:00:00.000Z',
      currentForecastV2,
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
    await page.goto('/forecasting?fundId=1');
    await expect(page.getByText('Fund Value Forecast', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Forecast drift summary')).toContainText('-$8M');
    await expect(page.getByText('Forecast comparison unavailable', { exact: true })).toHaveCount(0);
    if (currentForecastV2 === 'held')
      await expect(
        page
          .getByRole('tabpanel', { name: 'Fund Projection' })
          .getByText('Current forecast is held', { exact: true })
      ).toBeVisible();
  }
});

for (const width of [1440, 390]) {
  test(`affected surfaces render with keyboard, axe and reduced motion at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors: string[] = [];
    const consoleMessages: Array<{ level: string; text: string; url: string }> = [];
    const failedResponses: Array<{ status: number; url: string }> = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (['warning', 'error'].includes(message.type()))
        consoleMessages.push({
          level: message.type(),
          text: message.text(),
          url: message.location().url ?? '',
        });
    });
    page.on('response', (response) => {
      if (response.status() >= 400)
        failedResponses.push({ status: response.status(), url: response.url() });
    });
    for (const path of [
      '/help',
      '/settings',
      '/portfolio',
      '/forecasting?fundId=1',
      '/qa-missing',
    ]) {
      await page.goto(path);
      await expect(page.locator('main')).toHaveCount(1);
      await expect(page.locator('main')).not.toHaveText('');
      await expect(page.locator('vite-error-overlay')).toHaveCount(0);
      // Wait for the scoped data-dependent surface before inspecting its DOM.
      if (path === '/portfolio') {
        await expect(page.getByRole('button', { name: 'Export CSV' })).toBeEnabled();
        expect(
          await page.getByRole('button', { name: 'Export CSV' }).evaluate((element) =>
            getComputedStyle(element)
              .transitionDuration.split(',')
              .every((value) => Number.parseFloat(value) <= 0.001)
          )
        ).toBe(true);
      }
      if (path.startsWith('/forecasting'))
        await expect(
          page.getByText('Forecast comparison unavailable', { exact: true })
        ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`${path.replaceAll(/[^a-z]/g, '_')}-${width}.png`),
      });
      const accessibility = await new AxeBuilder({ page })
        .include('main')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      expect(
        accessibility.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) }))
      ).toEqual([]);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
      ).toBe(true);
    }
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
    expect(errors).toEqual([]);
    await testInfo.attach('console-health', {
      body: JSON.stringify({ errors, consoleMessages, failedResponses }, null, 2),
      contentType: 'application/json',
    });
  });
}
