import { test, expect, type Page } from '@playwright/test';

const PERFORMANCE_FUND = {
  id: 1,
  name: 'Performance Test Fund',
  size: 25_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2024,
  deployedCapital: 0,
  status: 'active',
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  termYears: 10,
};

const TIMESERIES_RESPONSE = {
  fundId: 1,
  fundName: PERFORMANCE_FUND.name,
  granularity: 'monthly',
  timeseries: [
    {
      date: '2024-01-01',
      actual: {
        asOfDate: '2024-01-01T00:00:00.000Z',
        irr: 0.12,
        tvpi: 1.4,
        dpi: 0.15,
        totalValue: 10_500_000,
      },
      _source: 'database',
    },
    {
      date: '2024-02-01',
      actual: {
        asOfDate: '2024-02-01',
        irr: 0.14,
        tvpi: 1.45,
        dpi: 0.18,
        totalValue: 10_900_000,
      },
      _source: 'interpolated',
    },
    {
      date: '2024-03-01',
      actual: {
        asOfDate: '2024-03-01',
      },
      _source: 'unavailable',
    },
  ],
  meta: {
    startDate: '2024-01-01',
    endDate: '2024-03-01',
    dataPoints: 3,
    cacheHit: false,
    computeTimeMs: 8,
  },
};

const BREAKDOWN_RESPONSE = {
  fundId: 1,
  fundName: PERFORMANCE_FUND.name,
  asOfDate: '2024-03-01',
  groupBy: 'sector',
  breakdown: [
    {
      group: 'SaaS',
      companyCount: 1,
      totalDeployed: 5_000_000,
      currentValue: 8_000_000,
      moic: 1.6,
      irr: 0.18,
      unrealizedGain: 3_000_000,
      percentOfPortfolio: 100,
    },
  ],
  totals: {
    companyCount: 1,
    totalDeployed: 5_000_000,
    currentValue: 8_000_000,
    averageMOIC: 1.6,
    portfolioIRR: 0.18,
  },
  meta: {
    cacheHit: false,
    computeTimeMs: 6,
  },
};

async function installPerformanceApiStubs(page: Page) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/telemetry/wizard') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([PERFORMANCE_FUND]),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/performance/timeseries') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(TIMESERIES_RESPONSE),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/performance/breakdown') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(BREAKDOWN_RESPONSE),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/performance/comparison') {
      await route.fulfill({
        status: 501,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'UNSUPPORTED_CAPABILITY',
          message: 'Comparison is not exposed on the mounted performance route',
          field: 'comparison',
          timestamp: new Date().toISOString(),
        }),
      });
      return;
    }

    await route.fulfill({
      status: 204,
      contentType: 'application/json',
      body: '',
    });
  });
}

test.describe('Performance Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await installPerformanceApiStubs(page);
    await page.goto('/performance', { waitUntil: 'domcontentloaded' });
    await page.waitForLoadState('networkidle');
  });

  test('renders the mounted performance route with supported tabs only', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Fund Performance' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Time Series' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Breakdown' })).toBeVisible();
    await expect(page.getByRole('tab', { name: /comparison/i })).toHaveCount(0);
  });

  test('shows source-quality messaging when derived timeseries points remain visible', async ({ page }) => {
    await expect(page.getByTestId('timeseries-source-note')).toBeVisible();
    await expect(page.getByText(/interpolated between persisted metric snapshots/i)).toBeVisible();
    await expect(
      page.getByText(/shown as unavailable rather than inferred from mutable current state/i)
    ).toBeVisible();
  });

  test('keeps mounted controls usable without surfacing unsupported comparison affordances', async ({
    page,
  }) => {
    await expect(page.getByRole('button', { name: 'Export' }).first()).toBeVisible();
    await expect(page.locator('[role="combobox"]').first()).toBeVisible();
    await expect(page.getByRole('tab', { name: /comparison/i })).toHaveCount(0);
  });
});
