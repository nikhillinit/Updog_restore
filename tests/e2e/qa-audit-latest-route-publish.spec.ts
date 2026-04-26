import { expect, test, type Page } from '@playwright/test';

const FUND_ONE = {
  id: 1,
  name: 'QA Fund I',
  size: 50_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
  deployedCapital: 10_000_000,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  termYears: 10,
};

const FUND_TWO = {
  ...FUND_ONE,
  id: 2,
  name: 'QA Fund II',
  size: 75_000_000,
};

type FundsScenario = 'one' | 'multiple' | 'empty' | 'failed';
type NavigationMethod = 'direct' | 'sidebar' | 'seeded-current-fund';

async function installQaApiStubs(page: Page, scenario: FundsScenario) {
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      if (scenario === 'failed') {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'FUNDS_UNAVAILABLE', message: 'Fund API unavailable' }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          scenario === 'empty' ? [] : scenario === 'multiple' ? [FUND_ONE, FUND_TWO] : [FUND_ONE]
        ),
      });
      return;
    }

    if (url.pathname === '/api/dashboard-summary/1') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fund: FUND_ONE,
          metrics: { totalValue: 46_000_000, irr: 0.18 },
          summary: { deploymentRate: 20 },
          portfolioCompanies: [
            {
              name: 'Alpha Co',
              currentValuation: 20_000_000,
              investmentAmount: 5_000_000,
              sector: 'SaaS',
              stage: 'Seed',
            },
          ],
        }),
      });
      return;
    }

    if (url.pathname === '/api/fund-metrics/1' || url.pathname === '/api/funds/1/metrics') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          actual: { totalCommitted: FUND_ONE.size, totalDeployed: FUND_ONE.deployedCapital },
          projected: null,
          target: null,
          variance: null,
        }),
      });
      return;
    }

    if (url.pathname === '/api/funds/1/performance/timeseries') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fundId: 1,
          fundName: FUND_ONE.name,
          granularity: 'monthly',
          timeseries: [
            {
              date: '2026-01-31',
              actual: { irr: null, tvpi: 2.76, dpi: null, totalValue: 46_000_000 },
              _source: 'database',
            },
          ],
          meta: {
            startDate: '2026-01-01',
            endDate: '2026-01-31',
            dataPoints: 1,
            cacheHit: false,
            computeTimeMs: 1,
          },
        }),
      });
      return;
    }

    if (url.pathname === '/api/funds/1/performance/breakdown') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fundId: 1,
          fundName: FUND_ONE.name,
          asOfDate: '2026-01-31',
          groupBy: url.searchParams.get('groupBy') ?? 'sector',
          breakdown: [
            {
              group: 'SaaS',
              companyCount: 1,
              totalDeployed: 5_000_000,
              currentValue: 20_000_000,
              moic: 4,
              irr: null,
              unrealizedGain: 15_000_000,
              percentOfPortfolio: 1,
            },
          ],
          totals: {
            companyCount: 1,
            totalDeployed: 5_000_000,
            currentValue: 20_000_000,
            averageMOIC: 4,
            portfolioIRR: null,
          },
          meta: {
            cacheHit: false,
            computeTimeMs: 1,
          },
        }),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: [] }),
    });
  });
}

async function captureRoute(page: Page, path: string, method: NavigationMethod) {
  await expect(page.locator('body')).toBeVisible();
  const heading =
    (
      await page
        .locator('h1')
        .first()
        .textContent()
        .catch(() => null)
    )?.trim() ?? '';
  const activeNav =
    (
      await page
        .locator('a[data-active="true"]')
        .first()
        .textContent()
        .catch(() => null)
    )?.trim() ?? '';

  return {
    method,
    requestedPath: path,
    finalUrl: page.url(),
    heading,
    activeNav,
  };
}

test.describe('latest QA route/nav/publish closeout matrix', () => {
  test('model routes with funds available do not redirect to fund setup', async ({
    page,
  }, testInfo) => {
    await installQaApiStubs(page, 'one');

    const captures = [];
    for (const path of [
      '/forecasting',
      '/forecasting?fundId=1',
      '/financial-modeling',
      '/model-results',
    ]) {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      captures.push(await captureRoute(page, path, 'direct'));
      await expect(page).not.toHaveURL(/\/fund-setup\b/);
      if (path.startsWith('/model-results')) {
        await expect(page.getByRole('heading', { name: /^model results$/i })).toBeVisible();
      } else {
        await expect(
          page.getByRole('heading', { name: /financial modeling & forecasting/i })
        ).toBeVisible();
      }
    }

    await testInfo.attach('route-matrix-one-fund.json', {
      body: JSON.stringify(captures, null, 2),
      contentType: 'application/json',
    });
  });

  test('multiple funds without selected context show recovery instead of first-fund results', async ({
    page,
  }) => {
    await installQaApiStubs(page, 'multiple');

    await page.goto('/model-results', { waitUntil: 'domcontentloaded' });

    await expect(page).not.toHaveURL(/\/fund-setup\b/);
    await expect(page).not.toHaveURL(/\/fund-model-results\/1\b/);
    await expect(page.getByRole('heading', { name: /^model results$/i })).toBeVisible();
    await expect(page.getByText(/select a fund to view model results/i)).toBeVisible();
  });

  test('failed funds response shows retryable load error on deterministic workspaces', async ({
    page,
  }) => {
    await installQaApiStubs(page, 'failed');

    await page.goto('/forecasting', { waitUntil: 'domcontentloaded' });

    await expect(page).not.toHaveURL(/\/fund-setup\b/);
    await expect(page.getByRole('heading', { name: /unable to load fund context/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /retry loading funds/i })).toBeVisible();
  });

  test('Performance is reachable and named from the active rendered sidebar', async ({
    page,
  }, testInfo) => {
    await installQaApiStubs(page, 'one');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('aside')).toBeVisible();
    await page.getByRole('link', { name: /performance/i }).dispatchEvent('click');

    const capture = await captureRoute(page, '/performance', 'sidebar');
    await expect(page).toHaveURL(/\/performance\b/);
    await expect(page.getByRole('heading', { name: /fund performance/i })).toBeVisible();

    await testInfo.attach('performance-sidebar-route.json', {
      body: JSON.stringify(capture, null, 2),
      contentType: 'application/json',
    });
  });

  test('sidebar forecasting click carries current fund identity after dashboard selection', async ({
    page,
  }) => {
    await installQaApiStubs(page, 'one');

    await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('aside')).toBeVisible();
    await page.getByRole('link', { name: /forecasting/i }).dispatchEvent('click');

    await expect(page).toHaveURL(/\/forecasting\?fundId=1\b/);
    await expect(
      page.getByRole('heading', { name: /financial modeling & forecasting/i })
    ).toBeVisible();
  });
});
