import { test, expect, type Page } from '@playwright/test';
import { makeDashboardSummaryFixture } from './fixtures/dashboard-summary';
import actualsFixture from './fixtures/actuals-publish.json' with { type: 'json' };
import {
  ActualMetricsV2Schema,
  ActualsPreviewResponseV1Schema,
  ActualsPublishReceiptV1Schema,
  FinancialFactsLatestReferenceV1Schema,
} from '../../shared/contracts/lp-reporting/actuals-pilot.contract';

const ROUTE_READY_TIMEOUT_MS = 60_000;

const SMOKE_FUND = {
  id: 1,
  name: 'Smoke Fund I',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2024,
  deployedCapital: 0,
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  termYears: 10,
};

const EMPTY_VARIANCE_DASHBOARD = {
  success: true,
  data: {
    defaultBaseline: null,
    recentBaselines: [],
    activeAlerts: [],
    alertsBySeverity: {
      critical: 0,
      warning: 0,
      info: 0,
      urgent: 0,
    },
    alertsByseverity: {
      critical: 0,
      warning: 0,
      info: 0,
      urgent: 0,
    },
    summary: {
      totalBaselines: 0,
      totalActiveAlerts: 0,
      lastAnalysisDate: null,
      overallRiskLevel: 'low',
      trendDirection: 'stable',
    },
    recentReports: [],
  },
};

const EMPTY_VARIANCE_LIST = {
  success: true,
  data: [],
  count: 0,
};

const SMOKE_UNIFIED_METRICS = {
  fundId: SMOKE_FUND.id,
  fundName: SMOKE_FUND.name,
  actual: {
    asOfDate: '2026-01-31T00:00:00.000Z',
    totalCommitted: SMOKE_FUND.size,
    totalCalled: 0,
    totalDeployed: 0,
    totalUncalled: SMOKE_FUND.size,
    currentNAV: 0,
    totalDistributions: 0,
    totalValue: 0,
    irr: 0,
    tvpi: 0,
    dpi: 0,
    rvpi: 0,
    activeCompanies: 0,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: 0,
    deploymentRate: 0,
    averageCheckSize: 0,
  },
  projected: null,
  target: {
    targetFundSize: SMOKE_FUND.size,
    targetIRR: 0.2,
    targetTVPI: 2.5,
    targetDPI: 1,
    targetDeploymentYears: 4,
    targetCompanyCount: 20,
    targetAverageCheckSize: 2_500_000,
    targetReserveRatio: 0.4,
  },
  variance: {
    deploymentVariance: {
      actual: 0,
      target: 0,
      variance: 0,
      percentDeviation: 0,
      status: 'on_track',
    },
    performanceVariance: {
      actualIRR: 0,
      targetIRR: 0.2,
      variance: -0.2,
      status: 'unknown',
    },
    tvpiVariance: {
      actual: 0,
      projected: 0,
      target: 2.5,
      varianceVsProjected: 0,
      varianceVsTarget: -2.5,
    },
    paceVariance: {
      status: 'on_track',
      monthsDeviation: 0,
      periodElapsedPercent: 0,
      capitalDeployedPercent: 0,
    },
    portfolioVariance: {
      actualCompanies: 0,
      targetCompanies: 20,
      variance: -20,
      onTrack: false,
    },
  },
  lastUpdated: '2026-01-31T00:00:00.000Z',
  _status: {
    engines: {
      target: 'idle',
      variance: 'idle',
    },
  },
};

const SMOKE_PERFORMANCE_TIMESERIES = {
  fundId: SMOKE_FUND.id,
  fundName: SMOKE_FUND.name,
  granularity: 'monthly',
  timeseries: [
    {
      date: '2025-10-31',
      actual: { irr: 0.12, tvpi: 1.2, dpi: 0.1, totalValue: 60_000_000 },
      _source: 'database',
    },
    {
      date: '2025-11-30',
      actual: { irr: 0.14, tvpi: 1.3, dpi: 0.15, totalValue: 65_000_000 },
      _source: 'database',
    },
    {
      date: '2025-12-31',
      actual: { irr: 0.16, tvpi: 1.4, dpi: 0.2, totalValue: 70_000_000 },
      _source: 'database',
    },
  ],
  meta: {
    startDate: '2025-01-01',
    endDate: '2025-12-31',
    dataPoints: 3,
    cacheHit: false,
    computeTimeMs: 1,
  },
};

const SMOKE_PERFORMANCE_BREAKDOWN = {
  fundId: SMOKE_FUND.id,
  fundName: SMOKE_FUND.name,
  asOfDate: '2025-12-31',
  groupBy: 'sector',
  breakdown: [
    {
      group: 'Infrastructure',
      companyCount: 2,
      totalDeployed: 20_000_000,
      currentValue: 30_000_000,
      moic: 1.5,
      irr: 0.16,
      unrealizedGain: 10_000_000,
      percentOfPortfolio: 100,
    },
  ],
  totals: {
    companyCount: 2,
    totalDeployed: 20_000_000,
    currentValue: 30_000_000,
    averageMOIC: 1.5,
    portfolioIRR: 0.16,
  },
  meta: {
    cacheHit: false,
    computeTimeMs: 1,
  },
};

const unexpectedSmokeApiRequestsByPage = new WeakMap<Page, string[]>();

function smokeApiRequestLabel(page: Page): string[] {
  return unexpectedSmokeApiRequestsByPage.get(page) ?? [];
}

async function readSmokeMainText(page: Page) {
  const main = page.locator('main').last();
  const normalizedMainText = async () =>
    ((await main.textContent()) ?? '').replace(/\s+/g, ' ').trim();

  await expect(main).toBeVisible();
  await expect
    .poll(normalizedMainText, { timeout: ROUTE_READY_TIMEOUT_MS })
    .not.toBe('Loading page...');
  return normalizedMainText();
}

async function installSmokeApiStubs(page: Page) {
  const unexpectedRequests: string[] = [];
  unexpectedSmokeApiRequestsByPage.set(page, unexpectedRequests);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/telemetry/wizard' || url.pathname === '/api/metrics/rum') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/auth/session') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: {
            id: '1',
            email: 'smoke@example.com',
            role: 'admin',
            fundIds: [SMOKE_FUND.id],
          },
        }),
      });
      return;
    }

    if (url.pathname.startsWith('/api/v1/image/')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/deals/opportunities') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
          pagination: {
            hasMore: false,
            nextCursor: null,
            count: 0,
          },
        }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/deals/stages') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [],
        }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/dashboard-summary/1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          makeDashboardSummaryFixture({
            fund: SMOKE_FUND,
            metrics: { totalValue: 0, irr: 0, tvpi: 0, dpi: 0 },
            deploymentRate: 0,
            portfolioCompanies: [],
          })
        ),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/fund-metrics/1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SMOKE_UNIFIED_METRICS),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === '/api/portfolio' ||
        url.pathname === '/api/portfolio-companies' ||
        url.pathname === '/api/pipeline' ||
        url.pathname === '/api/reports')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (url.pathname.endsWith('/calculated-metrics')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          totalCommitted: SMOKE_FUND.size,
          totalInvested: 0,
          totalValue: 0,
          irr: 0,
          moic: 0,
          dpi: 0,
          tvpi: 0,
          activeInvestments: 0,
          exited: 0,
          avgCheckSize: 0,
          deploymentRate: 0,
          remainingCapital: SMOKE_FUND.size,
        }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/data') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fund: SMOKE_FUND,
          investments: [],
          valuations: [],
          capitalCalls: [],
          distributions: [],
          feeExpenses: [],
        }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/variance-dashboard') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_VARIANCE_DASHBOARD),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === '/api/funds/1/variance-reports' ||
        url.pathname === '/api/funds/1/baselines' ||
        url.pathname === '/api/funds/1/alerts')
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(EMPTY_VARIANCE_LIST),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/current-plan-versions') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === '/api/funds/1/construction-reconciliation/latest'
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ state: 'no_persisted_reconciliation' }),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/metrics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SMOKE_UNIFIED_METRICS),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/performance/timeseries') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SMOKE_PERFORMANCE_TIMESERIES),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/performance/breakdown') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SMOKE_PERFORMANCE_BREAKDOWN),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([SMOKE_FUND]),
      });
      return;
    }

    const requestLabel = `${request.method()} ${url.pathname}${url.search}`;
    unexpectedRequests.push(requestLabel);
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'UNEXPECTED_SMOKE_API_REQUEST', request: requestLabel }),
    });
  });
}

test.describe('Basic Smoke Tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeEach(async ({ page }) => {
    await installSmokeApiStubs(page);
  });

  test.afterEach(async ({ page }) => {
    expect(smokeApiRequestLabel(page)).toEqual([]);
  });

  test('should be able to access the application', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    await expect(page).toHaveURL(/\/dashboard\b/);
    const pageText = await readSmokeMainText(page);
    expect(pageText).not.toMatch(/cannot be reached|connection refused/i);
  });

  test('should handle direct navigation to common routes', async ({ page }) => {
    test.setTimeout(120000);

    const routes = ['/', '/dashboard', '/fund-setup'];

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const pageText = await readSmokeMainText(page);
      expect(pageText).not.toMatch(/cannot be reached|connection refused/i);

      await page.screenshot({
        path: `test-results/smoke-${route.replace('/', 'root')}.png`,
        fullPage: true,
      });
    }
  });

  test('mobile dashboard shell does not create document-level horizontal overflow', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/dashboard?demo', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/dashboard\b/);
    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible();

    const overflow = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    }));

    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
    expect(overflow.bodyScrollWidth).toBeLessThanOrEqual(overflow.clientWidth);
  });

  test('performance route renders without Recharts dimension warnings', async ({ page }) => {
    test.setTimeout(90000);

    const chartWarnings: string[] = [];
    page.on('console', (message) => {
      if (
        message.type() === 'warning' &&
        /width\(-?\d+\).*height\(-?\d+\).*greater than 0/i.test(message.text())
      ) {
        chartWarnings.push(message.text());
      }
    });

    await page.goto('/performance?demo', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/performance\b/);
    await expect(page.getByText('Portfolio Performance')).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT_MS,
    });
    await expect(page.getByText('Internal Rate of Return (IRR)')).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT_MS,
    });
    await page.waitForTimeout(500);

    expect(chartWarnings).toEqual([]);
  });

  test('pipeline view toggle buttons have accessible names and pressed state', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/pipeline?demo', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/pipeline\b/);

    const kanbanButton = page.getByRole('button', { name: /kanban view/i });
    const listButton = page.getByRole('button', { name: /list view/i });

    await expect(kanbanButton).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
    await expect(listButton).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
    await expect(kanbanButton).toHaveAttribute('aria-controls', 'pipeline-view-region');
    await expect(listButton).toHaveAttribute('aria-controls', 'pipeline-view-region');
    await expect(kanbanButton).toHaveAttribute('aria-pressed', 'true');

    await listButton.click();
    await expect(listButton).toHaveAttribute('aria-pressed', 'true');
  });

  test('pipeline route renders the pipeline workspace', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/pipeline', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/pipeline\b/);
    await expect(page.getByRole('heading', { name: /deal pipeline/i })).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT_MS,
    });
    const pageText = await readSmokeMainText(page);
    expect(pageText).toMatch(/deal pipeline/i);
    await expect(page.getByTestId('pipeline-toolbar')).toBeVisible();
  });

  test('reports baseline CTA opens the variance tracking workspace', async ({ page }) => {
    test.setTimeout(90000);

    await page.goto('/reports', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/reports\b/);
    await expect(page.getByRole('heading', { name: /reports & documentation/i })).toBeVisible();
    const pageText = await readSmokeMainText(page);
    expect(pageText).toMatch(/reports & documentation/i);
    await expect(page.getByText(/baseline required/i)).toBeVisible();

    const openVarianceTrackingButton = page
      .getByRole('button', {
        name: /^open variance tracking$/i,
      })
      .first();
    await expect(openVarianceTrackingButton).toBeVisible();
    await openVarianceTrackingButton.click();

    await expect(page).toHaveURL(/\/variance-tracking\?tab=reports/);
    await expect(page.getByText(/404 page not found/i)).not.toBeVisible();
    await expect(page.getByRole('heading', { name: /variance tracking/i })).toBeVisible();
    const varianceText = await readSmokeMainText(page);
    expect(varianceText).toMatch(/variance|reports/i);
  });
});

// Golden responses come from the real PostgreSQL publisher, codec, and projector.
const actualsReceipt = ActualsPublishReceiptV1Schema.parse(actualsFixture.receipt);
const actualsLatest = FinancialFactsLatestReferenceV1Schema.parse(actualsFixture.latestReference);
const actualsMetrics = ActualMetricsV2Schema.parse(actualsFixture.metrics);
const actualsPreviews = {
  ledger: ActualsPreviewResponseV1Schema.parse(actualsFixture.previews.ledger),
  valuation: ActualsPreviewResponseV1Schema.parse(actualsFixture.previews.valuation),
};

async function selectActualsFiles(page: Page, ledgerCsv = actualsFixture.ledgerCsv) {
  await page.getByLabel('Ledger CSV', { exact: true }).setInputFiles({
    name: actualsFixture.publishRequest.ledger.fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(ledgerCsv),
  });
  await page.getByLabel('Valuation CSV (optional)', { exact: true }).setInputFiles({
    name: actualsFixture.publishRequest.valuation.fileName,
    mimeType: 'text/csv',
    buffer: Buffer.from(actualsFixture.valuationCsv),
  });
}

async function previewActuals(page: Page, navigate = true) {
  if (navigate) await page.goto('/lp-reporting/imports', { waitUntil: 'domcontentloaded' });
  await expect(page.getByLabel('Reporting cutoff', { exact: true })).toBeVisible({
    timeout: ROUTE_READY_TIMEOUT_MS,
  });
  await page
    .getByLabel('Reporting cutoff', { exact: true })
    .fill(actualsFixture.publishRequest.asOfDate);
  await selectActualsFiles(page);
  await page.getByRole('button', { name: 'Preview actuals', exact: true }).click();
}

test.describe('Actuals publication smoke', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApiStubs(page);
    await page.route('**/api/auth/csrf', async (route) => {
      await route.fulfill({ json: { csrfToken: 'actuals-smoke-csrf-token' } });
    });
  });

  test.afterEach(async ({ page }) => {
    expect(smokeApiRequestLabel(page)).toEqual([]);
  });

  test('actuals publish recovers the identical command after reload and reads its snapshot', async ({
    page,
  }) => {
    const commands: Array<{
      body: string | null;
      key: string | undefined;
      ifMatch: string | undefined;
      csrf: string | undefined;
    }> = [];
    let previewCount = 0;
    const selectedSnapshots: string[] = [];
    await page.route('**/api/funds/1/financial-facts/latest-reference', async (route) => {
      await route.fulfill({
        json: commands.length ? actualsLatest : { ...actualsLatest, head: null },
      });
    });
    await page.route('**/api/funds/1/imports/actuals/dry-run', async (route) => {
      previewCount += 1;
      const isLedger = route.request().postDataJSON().templateVersion === 'actuals-ledger/1.0.0';
      await route.fulfill({ json: isLedger ? actualsPreviews.ledger : actualsPreviews.valuation });
    });
    await page.route('**/api/funds/1/imports/actuals/publish', async (route) => {
      const headers = route.request().headers();
      commands.push({
        body: route.request().postData(),
        key: headers['idempotency-key'],
        ifMatch: headers['if-match'],
        csrf: headers['x-csrf-token'],
      });
      await route.fulfill(
        commands.length === 1
          ? {
              status: 503,
              json: {
                code: 'MUTATION_OUTCOME_UNKNOWN',
                message: 'Publish may have completed. Retry sends the identical request.',
              },
            }
          : { status: 200, json: actualsReceipt }
      );
    });
    await page.route('**/api/funds/1/actuals/metrics?*', async (route) => {
      selectedSnapshots.push(
        new URL(route.request().url()).searchParams.get('factsSnapshotId') ?? ''
      );
      await route.fulfill({ json: actualsMetrics });
    });

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible({
      timeout: ROUTE_READY_TIMEOUT_MS,
    });
    await page.evaluate(() => {
      window.history.pushState(null, '', '/lp-reporting/imports');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await previewActuals(page, false);
    await page
      .getByLabel('Coverage evidence note')
      .fill(actualsFixture.publishRequest.coverage.evidenceNote);
    await page.getByRole('button', { name: 'Publish actuals', exact: true }).click();
    await expect(page.getByTestId('actuals-publish-error')).toContainText(
      'MUTATION_OUTCOME_UNKNOWN'
    );
    await expect(page.getByRole('button', { name: 'Retry publish', exact: true })).toBeEnabled();
    expect(commands).toHaveLength(1);
    expect(commands[0]?.key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(commands[0]?.ifMatch).toBe('"financial-facts:none"');
    expect(commands[0]?.csrf).toBe('actuals-smoke-csrf-token');
    await page.locator('a[href="/dashboard"]').first().click();
    await expect(page).toHaveURL(/\/lp-reporting\/imports$/);
    const historyNavigation = page.waitForEvent('framenavigated');
    await page.evaluate(() => window.history.back());
    await historyNavigation;
    await expect(page).toHaveURL(/\/lp-reporting\/imports$/);

    const stored = await page.evaluate(() =>
      Object.entries(sessionStorage).filter(([key]) => key.startsWith('actuals-publish:v1:'))
    );
    expect(stored).toHaveLength(1);
    expect(stored[0]?.[1]).not.toContain(actualsFixture.ledgerCsv);
    expect(stored[0]?.[1]).not.toContain(actualsFixture.publishRequest.ledger.payload);
    expect(stored[0]?.[1]).not.toContain(actualsFixture.publishRequest.valuation.payload);

    page.on('dialog', (dialog) => void dialog.accept());
    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.getByText(/reselect the same|reselect same/i)).toBeVisible();
    await selectActualsFiles(page, `${actualsFixture.ledgerCsv}\n`);
    await expect(page.getByRole('button', { name: 'Retry publish', exact: true })).toBeDisabled();
    expect(commands).toHaveLength(1);
    expect(previewCount).toBe(2);

    await selectActualsFiles(page);
    await expect(page.getByRole('button', { name: 'Retry publish', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Retry publish', exact: true }).click();
    await expect(page.getByTestId('actuals-publish-receipt')).toBeVisible();
    await expect(page.getByTestId('actuals-metrics-readback')).toContainText('NAV_UNAVAILABLE');
    expect(commands).toHaveLength(2);
    expect(commands[1]).toEqual(commands[0]);
    expect(previewCount).toBe(2);
    expect(selectedSnapshots).toEqual([String(actualsReceipt.facts.snapshotId)]);
    expect(
      await page.evaluate(() =>
        Object.keys(sessionStorage).filter((key) => key.startsWith('actuals-publish:v1:'))
      )
    ).toEqual([]);
    await page.screenshot({ path: 'test-results/actuals-publish-desktop.png', fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    const overflow = await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      width: document.documentElement.scrollWidth,
    }));
    expect(overflow.width).toBeLessThanOrEqual(overflow.viewport);
    const receiptOverflow = await page
      .getByTestId('actuals-publish-receipt')
      .evaluate((element) => ({
        width: element.scrollWidth,
        available: element.clientWidth,
      }));
    expect(receiptOverflow.width).toBeLessThanOrEqual(receiptOverflow.available);

    await page.screenshot({ path: 'test-results/actuals-publish-mobile.png', fullPage: true });
  });

  test('actuals publish hides publication when preview is blocked', async ({ page }) => {
    await page.route('**/api/funds/1/financial-facts/latest-reference', async (route) => {
      await route.fulfill({ json: { ...actualsLatest, head: null } });
    });
    await page.route('**/api/funds/1/imports/actuals/dry-run', async (route) => {
      const isLedger = route.request().postDataJSON().templateVersion === 'actuals-ledger/1.0.0';
      await route.fulfill({
        json: isLedger
          ? {
              ...actualsPreviews.ledger,
              canPublish: false,
              issues: [
                {
                  code: 'FUND_LEDGER_NOT_PILOT_OWNED',
                  rowNumber: 0,
                  column: null,
                  severity: 'error',
                  message: 'Fund ledger contains rows outside the actuals pilot.',
                },
              ],
            }
          : actualsPreviews.valuation,
      });
    });
    await previewActuals(page);
    await expect(page.getByText('FUND_LEDGER_NOT_PILOT_OWNED')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Publish actuals', exact: true })).toHaveCount(0);
  });

  test('actuals publish refuses metrics from a different receipt snapshot', async ({ page }) => {
    await page.route('**/api/funds/1/financial-facts/latest-reference', async (route) => {
      await route.fulfill({ json: { ...actualsLatest, head: null } });
    });
    await page.route('**/api/funds/1/imports/actuals/dry-run', async (route) => {
      const isLedger = route.request().postDataJSON().templateVersion === 'actuals-ledger/1.0.0';
      await route.fulfill({ json: isLedger ? actualsPreviews.ledger : actualsPreviews.valuation });
    });
    await page.route('**/api/funds/1/imports/actuals/publish', async (route) => {
      await route.fulfill({ status: 201, json: actualsReceipt });
    });
    await page.route('**/api/funds/1/actuals/metrics?*', async (route) => {
      await route.fulfill({ json: { ...actualsMetrics, financialFactsSnapshotId: 999 } });
    });
    await previewActuals(page);
    await page
      .getByLabel('Coverage evidence note')
      .fill(actualsFixture.publishRequest.coverage.evidenceNote);
    await page.getByRole('button', { name: 'Publish actuals', exact: true }).click();
    await expect(page.getByTestId('actuals-publish-receipt')).toBeVisible();
    await expect(page.getByTestId('actuals-metrics-identity-mismatch')).toContainText(
      /match|mismatch/i
    );
    await expect(page.getByTestId('actuals-metrics-readback').getByRole('table')).toHaveCount(0);
  });
});
