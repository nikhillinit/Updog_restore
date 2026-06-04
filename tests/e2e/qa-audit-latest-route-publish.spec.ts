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

const ROUTE_UNIFIED_METRICS = {
  fundId: FUND_ONE.id,
  fundName: FUND_ONE.name,
  actual: {
    asOfDate: '2026-01-31T00:00:00.000Z',
    totalCommitted: FUND_ONE.size,
    totalCalled: 12_500_000,
    totalDeployed: FUND_ONE.deployedCapital,
    totalUncalled: 37_500_000,
    currentNAV: 46_000_000,
    totalDistributions: 1_000_000,
    totalValue: 47_000_000,
    irr: 0.18,
    tvpi: 2.76,
    dpi: 0.06,
    rvpi: 2.7,
    activeCompanies: 1,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: 1,
    deploymentRate: 20,
    averageCheckSize: FUND_ONE.deployedCapital,
  },
  projected: null,
  target: {
    targetFundSize: FUND_ONE.size,
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
      actual: FUND_ONE.deployedCapital,
      target: 12_500_000,
      variance: -2_500_000,
      percentDeviation: -20,
      status: 'behind',
    },
    performanceVariance: {
      actualIRR: 0.18,
      targetIRR: 0.2,
      variance: -0.02,
      status: 'below',
    },
    tvpiVariance: {
      actual: 2.76,
      projected: 2.76,
      target: 2.5,
      varianceVsProjected: 0,
      varianceVsTarget: 0.26,
    },
    paceVariance: {
      status: 'behind',
      monthsDeviation: -3,
      periodElapsedPercent: 25,
      capitalDeployedPercent: 20,
    },
    portfolioVariance: {
      actualCompanies: 1,
      targetCompanies: 20,
      variance: -19,
      onTrack: false,
    },
  },
  lastUpdated: '2026-01-31T00:00:00.000Z',
};

const ROUTE_DUAL_FORECAST = {
  fundId: FUND_ONE.id,
  fundName: FUND_ONE.name,
  asOfDate: ROUTE_UNIFIED_METRICS.actual.asOfDate,
  series: [
    {
      quarterIndex: 0,
      label: 'Q1 2026',
      date: '2026-03-31',
      construction: {
        nav: ROUTE_UNIFIED_METRICS.actual.currentNAV,
        calledCapital: ROUTE_UNIFIED_METRICS.actual.totalCalled,
        distributions: ROUTE_UNIFIED_METRICS.actual.totalDistributions,
        tvpi: ROUTE_UNIFIED_METRICS.actual.tvpi,
        dpi: ROUTE_UNIFIED_METRICS.actual.dpi,
        rvpi: ROUTE_UNIFIED_METRICS.actual.rvpi,
        irr: ROUTE_UNIFIED_METRICS.actual.irr,
      },
      actual: {
        nav: ROUTE_UNIFIED_METRICS.actual.currentNAV,
        calledCapital: ROUTE_UNIFIED_METRICS.actual.totalCalled,
        distributions: ROUTE_UNIFIED_METRICS.actual.totalDistributions,
        tvpi: ROUTE_UNIFIED_METRICS.actual.tvpi,
        dpi: ROUTE_UNIFIED_METRICS.actual.dpi,
        rvpi: ROUTE_UNIFIED_METRICS.actual.rvpi,
        irr: ROUTE_UNIFIED_METRICS.actual.irr,
      },
      currentMode: 'actual',
      current: {
        nav: ROUTE_UNIFIED_METRICS.actual.currentNAV,
        calledCapital: ROUTE_UNIFIED_METRICS.actual.totalCalled,
        distributions: ROUTE_UNIFIED_METRICS.actual.totalDistributions,
        tvpi: ROUTE_UNIFIED_METRICS.actual.tvpi,
        dpi: ROUTE_UNIFIED_METRICS.actual.dpi,
        rvpi: ROUTE_UNIFIED_METRICS.actual.rvpi,
        irr: ROUTE_UNIFIED_METRICS.actual.irr,
      },
    },
    {
      quarterIndex: 1,
      label: 'Q2 2026',
      date: '2026-06-30',
      construction: {
        nav: 48_000_000,
        calledCapital: 15_000_000,
        distributions: 1_250_000,
        tvpi: 2.9,
        dpi: 0.08,
        rvpi: 2.82,
        irr: 0.19,
      },
      actual: null,
      currentMode: 'forecast',
      current: {
        nav: 47_500_000,
        calledCapital: 14_500_000,
        distributions: 1_200_000,
        tvpi: 2.84,
        dpi: 0.07,
        rvpi: 2.77,
        irr: 0.185,
      },
    },
  ],
  sources: {
    construction: 'construction_forecast_jcurve',
    current: 'projected_metrics_calculator',
    actual: 'actual_metrics_calculator',
  },
  config: {
    source: 'published',
    version: 1,
    publishedAt: '2026-01-31T00:00:00.000Z',
    fallbackReason: null,
  },
  warnings: [],
};

const unexpectedApiRequestsByPage = new WeakMap<Page, string[]>();

function requestLabel(request: { method: () => string; url: () => string }): string {
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}${url.search}`;
}

async function installQaApiStubs(page: Page, scenario: FundsScenario) {
  const unexpectedRequests: string[] = [];
  unexpectedApiRequestsByPage.set(page, unexpectedRequests);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/telemetry/wizard' || url.pathname === '/api/metrics/rum') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

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
        body: JSON.stringify(ROUTE_UNIFIED_METRICS),
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds/1/dual-forecast') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(ROUTE_DUAL_FORECAST),
      });
      return;
    }

    if (url.pathname === '/api/funds/1/results') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 'ready',
          fundId: FUND_ONE.id,
          fund: {
            name: FUND_ONE.name,
            vintageYear: FUND_ONE.vintageYear,
            size: FUND_ONE.size,
          },
          lifecycle: {
            fundId: FUND_ONE.id,
            configState: {
              latestVersion: 1,
              draftVersion: null,
              publishedVersion: 1,
              hasDraft: false,
              hasPublished: true,
              publishedAt: '2026-01-31T00:00:00.000Z',
              draftUpdatedAt: null,
              publishedUpdatedAt: '2026-01-31T00:00:00.000Z',
            },
            calculationState: {
              status: 'ready',
              configVersion: 1,
              runId: 1,
              correlationId: 'qa-route-publish',
              dispatchState: 'dispatched',
              availableSnapshotTypes: ['RESERVE', 'PACING'],
              expectedSnapshotTypes: ['RESERVE', 'PACING'],
              lastCalculatedAt: '2026-01-31T00:00:00.000Z',
              lastError: null,
              legacyEvidence: false,
            },
            legacy: { engineResultsPresent: false },
          },
          sections: {
            reserve: { status: 'unavailable', reason: 'Route publish fixture' },
            pacing: { status: 'unavailable', reason: 'Route publish fixture' },
            scorecard: {
              status: 'available',
              payload: {
                fundName: { value: FUND_ONE.name, source: 'funds' },
                fundSize: { value: FUND_ONE.size, source: 'funds' },
                vintageYear: { value: FUND_ONE.vintageYear, source: 'funds' },
              },
            },
            scenarios: { status: 'unavailable', reason: 'Route publish fixture' },
            waterfall: { status: 'unavailable', reason: 'Route publish fixture' },
            economics: { status: 'unavailable', reason: 'Route publish fixture' },
          },
        }),
      });
      return;
    }

    if (url.pathname === '/api/funds/1/lifecycle-history') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ fundId: 1, entries: [] }),
      });
      return;
    }

    if (url.pathname === '/api/funds/1/results-comparison') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ comparisonStatus: 'no_previous_version', metricDeltas: [] }),
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

    const label = requestLabel(request);
    unexpectedRequests.push(label);
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'UNEXPECTED_ROUTE_PUBLISH_API_REQUEST', request: label }),
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
  test.afterEach(async ({ page }) => {
    expect(unexpectedApiRequestsByPage.get(page) ?? []).toEqual([]);
  });

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
        await expect(page).toHaveURL(/\/fund-model-results\/1\b/);
        await expect(
          page.getByRole('main').getByRole('heading', { name: /^QA Fund I$/i })
        ).toBeVisible();
      } else if (path === '/forecasting' || path === '/financial-modeling') {
        await expect(
          page.getByRole('heading', { name: /financial modeling & forecasting/i })
        ).toBeVisible();
        await expect(page.getByText(/fund value forecast/i)).toBeVisible();
        await expect(
          page.getByText(/select or create a fund to view forecasting data/i)
        ).not.toBeVisible();
      } else {
        await expect(
          page.getByRole('heading', { name: /financial modeling & forecasting/i })
        ).toBeVisible();
        await expect(page.getByText(/fund value forecast/i)).toBeVisible();
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

  test('direct forecasting with multiple funds requires explicit selection', async ({ page }) => {
    await installQaApiStubs(page, 'multiple');

    await page.goto('/forecasting', { waitUntil: 'domcontentloaded' });

    await expect(page).not.toHaveURL(/\/fund-setup\b/);
    await expect(
      page.getByRole('heading', { name: /financial modeling & forecasting/i })
    ).toBeVisible();
    await expect(page.getByText(/select or create a fund to view forecasting data/i)).toBeVisible();
    await expect(
      page.getByText(/forecasting stays unavailable until an active fund context exists/i)
    ).toBeVisible();
    await expect(page.getByText(/fund value forecast/i)).not.toBeVisible();
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
    await page.locator('aside').hover();
    await expect(page.locator('aside').getByText(FUND_ONE.name)).toBeVisible();
    const forecastLink = page.getByRole('link', { name: /forecasting/i });
    await expect(forecastLink).toHaveAttribute('href', '/forecasting?fundId=1');
    await forecastLink.dispatchEvent('click');

    await expect(page).toHaveURL(/\/forecasting\?fundId=1\b/);
    await expect(
      page.getByRole('heading', { name: /financial modeling & forecasting/i })
    ).toBeVisible();
  });
});
