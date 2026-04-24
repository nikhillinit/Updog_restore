import { test, expect, type Page } from '@playwright/test';

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

async function installSmokeApiStubs(page: Page) {
  await page.route('**/api/telemetry/wizard', async (route) => {
    await route.fulfill({ status: 204, body: '' });
  });

  await page.route('**/api/deals/opportunities**', async (route) => {
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
  });

  await page.route('**/api/deals/stages', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: [],
      }),
    });
  });

  await page.route('**/api/funds*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

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
        body: JSON.stringify({
          actual: {
            totalCommitted: SMOKE_FUND.size,
            totalDeployed: 0,
          },
          projected: null,
          target: null,
          variance: null,
          _status: {
            engines: {
              target: 'idle',
              variance: 'idle',
            },
          },
        }),
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

    await route.fulfill({ status: 204, body: '' });
  });
}

test.describe('Basic Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    await installSmokeApiStubs(page);
  });

  test('should be able to access the application', async ({ page }) => {
    test.setTimeout(60000);

    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });

    await expect(page).toHaveURL(/\/dashboard\b/);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.locator('body')).not.toContainText(/cannot be reached|connection refused/i);
  });

  test('should handle direct navigation to common routes', async ({ page }) => {
    test.setTimeout(30000);

    const routes = ['/', '/dashboard', '/fund-setup'];

    for (const route of routes) {
      await page.goto(route, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await expect(page.locator('body')).toBeVisible();
      await expect(page.locator('body')).not.toContainText(/cannot be reached|connection refused/i);

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
    await expect(page.getByTestId('pipeline-toolbar')).toBeVisible();
  });

  test('reports baseline CTA opens the variance tracking workspace', async ({ page }) => {
    await page.goto('/reports', { waitUntil: 'domcontentloaded', timeout: 10000 });

    await expect(page).toHaveURL(/\/reports\b/);
    await expect(page.getByRole('heading', { name: /reports & documentation/i })).toBeVisible();
    await expect(page.getByText(/baseline required/i)).toBeVisible();

    const openVarianceTrackingButton = page.getByRole('button', {
      name: /^open variance tracking$/i,
    });
    await expect(openVarianceTrackingButton).toBeVisible();
    await openVarianceTrackingButton.click();

    await expect(page).toHaveURL(/\/variance-tracking\?tab=reports/);
    await expect(page.getByText(/404 page not found/i)).not.toBeVisible();
  });
});
