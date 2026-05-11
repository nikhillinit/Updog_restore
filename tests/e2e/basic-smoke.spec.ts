import { test, expect, type Page } from '@playwright/test';
import { readMainText } from './fixtures/qa-audit-api';

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

const unexpectedSmokeApiRequestsByPage = new WeakMap<Page, string[]>();

function smokeApiRequestLabel(page: Page): string[] {
  return unexpectedSmokeApiRequestsByPage.get(page) ?? [];
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
        body: JSON.stringify({
          fund: SMOKE_FUND,
          metrics: { totalValue: 0, irr: 0, tvpi: 0, dpi: 0 },
          summary: { deploymentRate: 0, companiesCount: 0, targetCompanies: 20 },
          portfolioCompanies: [],
        }),
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

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/metrics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(SMOKE_UNIFIED_METRICS),
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
    const pageText = await readMainText(page);
    expect(pageText).not.toMatch(/cannot be reached|connection refused/i);
  });

  test('should handle direct navigation to common routes', async ({ page }) => {
    test.setTimeout(30000);

    const routes = ['/', '/dashboard', '/fund-setup'];

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 10000 });
      const pageText = await readMainText(page);
      expect(pageText).not.toMatch(/cannot be reached|connection refused/i);

      await page.screenshot({
        path: `test-results/smoke-${route.replace('/', 'root')}.png`,
        fullPage: true,
      });
    }
  });

  test('reserves demo renders and shows a numeric reserve ratio', async ({ page }) => {
    await page.goto('/reserves-demo', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/reserves-demo\b/);
    await expect(page.locator('[data-testid="demo-root"]')).toBeVisible();

    const ratioText = await page.locator('[data-testid="demo-ratio"]').first().textContent();
    const ratio = Number((ratioText || '').replace(/[^\d.]/g, ''));
    expect(ratio).toBeGreaterThan(0);

    await page.screenshot({
      path: 'test-results/reserves-demo.png',
      fullPage: true,
    });
  });

  test('pipeline route renders the pipeline workspace', async ({ page }) => {
    await page.goto('/pipeline', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/pipeline\b/);
    await expect(page.getByRole('heading', { name: /deal pipeline/i })).toBeVisible();
    const pageText = await readMainText(page);
    expect(pageText).toMatch(/deal pipeline/i);
    await expect(page.getByTestId('pipeline-toolbar')).toBeVisible();
  });

  test('reports baseline CTA opens the variance tracking workspace', async ({ page }) => {
    await page.goto('/reports', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/reports\b/);
    await expect(page.getByRole('heading', { name: /reports & documentation/i })).toBeVisible();
    const pageText = await readMainText(page);
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
    const varianceText = await readMainText(page);
    expect(varianceText).toMatch(/variance|reports/i);
  });
});
