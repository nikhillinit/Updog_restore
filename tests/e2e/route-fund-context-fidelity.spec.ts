import { expect, test, type Page, type Route } from '@playwright/test';

const ROUTE_READY_TIMEOUT_MS = 60_000;
const APP_BASE_URL = process.env.BASE_URL ?? 'http://localhost:4173';

const FIDELITY_FUND = {
  id: 314,
  name: 'Fund 314 - Fidelity Seed',
  size: 62_500_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2026,
  deployedCapital: 16_700_000,
  status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  termYears: 10,
};

const FIDELITY_COMPANIES = [
  {
    id: 10,
    name: 'Northstar Systems',
    sector: 'Infrastructure',
    stage: 'Series A',
    invested: 5_000_000,
    currentValue: 13_200_000,
    moic: 2.64,
    status: 'active',
  },
  {
    id: 11,
    name: 'Clearpath Bio',
    sector: 'Healthcare',
    stage: 'Seed',
    invested: 6_700_000,
    currentValue: 18_400_000,
    moic: 2.75,
    status: 'active',
  },
  {
    id: 12,
    name: 'Atlas Data',
    sector: 'Data',
    stage: 'Series B',
    invested: 5_000_000,
    currentValue: 15_500_000,
    moic: 3.1,
    status: 'active',
  },
];

const FIDELITY_METRICS = {
  fundId: FIDELITY_FUND.id,
  fundName: FIDELITY_FUND.name,
  actual: {
    asOfDate: '2026-02-01T00:00:00.000Z',
    totalCommitted: FIDELITY_FUND.size,
    totalCalled: 20_000_000,
    totalDeployed: FIDELITY_FUND.deployedCapital,
    totalUncalled: 42_500_000,
    currentNAV: 46_100_000,
    totalDistributions: 1_000_000,
    totalValue: 47_100_000,
    irr: 0.185,
    tvpi: 2.36,
    dpi: 0.05,
    rvpi: 2.31,
    activeCompanies: FIDELITY_COMPANIES.length,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: FIDELITY_COMPANIES.length,
    deploymentRate: 26.72,
    averageCheckSize: FIDELITY_FUND.deployedCapital / FIDELITY_COMPANIES.length,
  },
  projected: null,
  target: {
    targetFundSize: FIDELITY_FUND.size,
    targetIRR: 0.2,
    targetTVPI: 2.5,
    targetDPI: 1,
    targetDeploymentYears: 4,
    targetCompanyCount: 20,
    targetAverageCheckSize: 3_125_000,
    targetReserveRatio: 0.4,
  },
  variance: {
    deploymentVariance: {
      actual: FIDELITY_FUND.deployedCapital,
      target: 20_000_000,
      variance: -3_300_000,
      percentDeviation: -16.5,
      status: 'behind',
    },
    performanceVariance: {
      actualIRR: 0.185,
      targetIRR: 0.2,
      variance: -0.015,
      status: 'below',
    },
    tvpiVariance: {
      actual: 2.36,
      projected: 2.36,
      target: 2.5,
      varianceVsProjected: 0,
      varianceVsTarget: -0.14,
    },
    paceVariance: {
      status: 'behind',
      monthsDeviation: -2,
      periodElapsedPercent: 25,
      capitalDeployedPercent: 26.72,
    },
    portfolioVariance: {
      actualCompanies: FIDELITY_COMPANIES.length,
      targetCompanies: 20,
      variance: FIDELITY_COMPANIES.length - 20,
      onTrack: false,
    },
  },
  lastUpdated: '2026-02-01T00:00:00.000Z',
};

const EMPTY_VARIANCE_DASHBOARD = {
  success: true,
  data: {
    defaultBaseline: null,
    recentBaselines: [],
    activeAlerts: [],
    alertsBySeverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
    alertsByseverity: { critical: 0, warning: 0, info: 0, urgent: 0 },
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

const ROUTE_SLICE = [
  '/dashboard',
  '/portfolio',
  '/portfolio?tab=reserve-planning',
  '/performance',
  `/forecasting?fundId=${FIDELITY_FUND.id}`,
  `/fund-model-results/${FIDELITY_FUND.id}`,
  '/sensitivity-analysis',
  '/reports',
  '/pipeline',
] as const;

interface RouteFidelityApiTracker {
  unexpectedRequests: string[];
  observedFundRequests: string[];
}

function jsonResponse(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill(jsonResponse(body, status));
}

function requestLabel(route: Route) {
  const request = route.request();
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}${url.search}`;
}

function fundResultsResponse() {
  return {
    status: 'ready',
    fundId: FIDELITY_FUND.id,
    fund: {
      name: FIDELITY_FUND.name,
      vintageYear: FIDELITY_FUND.vintageYear,
      size: FIDELITY_FUND.size,
    },
    lifecycle: {
      fundId: FIDELITY_FUND.id,
      configState: {
        latestVersion: 1,
        draftVersion: null,
        publishedVersion: 1,
        hasDraft: false,
        hasPublished: true,
        publishedAt: '2026-02-01T00:00:00.000Z',
        draftUpdatedAt: null,
        publishedUpdatedAt: '2026-02-01T00:00:00.000Z',
      },
      calculationState: {
        status: 'ready',
        configVersion: 1,
        runId: 1,
        correlationId: 'route-fund-fidelity',
        dispatchState: 'dispatched',
        availableSnapshotTypes: ['RESERVE', 'PACING'],
        expectedSnapshotTypes: ['RESERVE', 'PACING'],
        lastCalculatedAt: '2026-02-01T00:00:00.000Z',
        lastError: null,
        legacyEvidence: false,
      },
      legacy: { engineResultsPresent: false },
    },
    sections: {
      reserve: { status: 'unavailable', reason: 'Route fidelity fixture' },
      pacing: { status: 'unavailable', reason: 'Route fidelity fixture' },
      scorecard: {
        status: 'available',
        payload: {
          fundName: { value: FIDELITY_FUND.name, source: 'funds' },
          fundSize: { value: FIDELITY_FUND.size, source: 'funds' },
          vintageYear: { value: FIDELITY_FUND.vintageYear, source: 'funds' },
        },
      },
      scenarios: { status: 'unavailable', reason: 'Route fidelity fixture' },
      waterfall: { status: 'unavailable', reason: 'Route fidelity fixture' },
      economics: { status: 'unavailable', reason: 'Route fidelity fixture' },
    },
  };
}

async function installRouteFidelityApi(page: Page): Promise<RouteFidelityApiTracker> {
  const unexpectedRequests: string[] = [];
  const observedFundRequests: string[] = [];

  await page.addInitScript(() => {
    window.localStorage.setItem('ff_enable_kpi_selectors', '0');
  });

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const label = requestLabel(route);

    if (url.pathname.includes('/fund') || url.pathname.includes('/portfolio')) {
      observedFundRequests.push(label);
    }

    if (
      url.pathname === '/api/telemetry/wizard' ||
      url.pathname === '/api/metrics/rum' ||
      url.pathname.startsWith('/api/v1/image/')
    ) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      await fulfillJson(route, [FIDELITY_FUND]);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/dashboard-summary/${FIDELITY_FUND.id}`
    ) {
      await fulfillJson(route, {
        fund: FIDELITY_FUND,
        metrics: {
          totalValue: FIDELITY_METRICS.actual.totalValue,
          irr: FIDELITY_METRICS.actual.irr,
          tvpi: FIDELITY_METRICS.actual.tvpi,
          dpi: FIDELITY_METRICS.actual.dpi,
        },
        summary: {
          deploymentRate: FIDELITY_METRICS.actual.deploymentRate,
          companiesCount: FIDELITY_COMPANIES.length,
          targetCompanies: 20,
        },
        portfolioCompanies: FIDELITY_COMPANIES,
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === `/api/funds/${FIDELITY_FUND.id}/metrics` ||
        url.pathname === `/api/fund-metrics/${FIDELITY_FUND.id}`)
    ) {
      await fulfillJson(route, FIDELITY_METRICS);
      return;
    }

    if (request.method() === 'GET' && url.pathname === `/api/funds/${FIDELITY_FUND.id}/data`) {
      await fulfillJson(route, {
        fund: FIDELITY_FUND,
        investments: [],
        valuations: [],
        capitalCalls: [],
        distributions: [],
        feeExpenses: [],
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === '/api/portfolio' || url.pathname === '/api/portfolio-companies')
    ) {
      await fulfillJson(route, FIDELITY_COMPANIES);
      return;
    }

    if (request.method() === 'GET' && url.pathname.endsWith('/calculated-metrics')) {
      await fulfillJson(route, {
        totalCommitted: FIDELITY_METRICS.actual.totalCommitted,
        totalInvested: FIDELITY_METRICS.actual.totalDeployed,
        totalValue: FIDELITY_METRICS.actual.totalValue,
        irr: FIDELITY_METRICS.actual.irr,
        moic: FIDELITY_METRICS.actual.totalValue / FIDELITY_METRICS.actual.totalDeployed,
        dpi: FIDELITY_METRICS.actual.dpi,
        tvpi: FIDELITY_METRICS.actual.tvpi,
        activeInvestments: FIDELITY_COMPANIES.length,
        exited: 0,
        avgCheckSize: FIDELITY_METRICS.actual.averageCheckSize,
        deploymentRate: FIDELITY_METRICS.actual.deploymentRate,
        remainingCapital:
          FIDELITY_METRICS.actual.totalCommitted - FIDELITY_METRICS.actual.totalDeployed,
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/deals/opportunities') {
      await fulfillJson(route, {
        success: true,
        data: [],
        pagination: { hasMore: false, nextCursor: null, count: 0 },
      });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/deals/stages') {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === '/api/pipeline' || url.pathname === '/api/reports')
    ) {
      await fulfillJson(route, []);
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/variance-dashboard`
    ) {
      await fulfillJson(route, EMPTY_VARIANCE_DASHBOARD);
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === `/api/funds/${FIDELITY_FUND.id}/variance-reports` ||
        url.pathname === `/api/funds/${FIDELITY_FUND.id}/baselines` ||
        url.pathname === `/api/funds/${FIDELITY_FUND.id}/alerts`)
    ) {
      await fulfillJson(route, { success: true, data: [], count: 0 });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/performance/timeseries`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        fundName: FIDELITY_FUND.name,
        granularity: 'monthly',
        timeseries: [
          {
            date: '2026-02-01',
            actual: {
              irr: FIDELITY_METRICS.actual.irr,
              tvpi: FIDELITY_METRICS.actual.tvpi,
              dpi: FIDELITY_METRICS.actual.dpi,
              totalValue: FIDELITY_METRICS.actual.totalValue,
            },
            _source: 'database',
          },
        ],
        meta: {
          startDate: '2026-01-01',
          endDate: '2026-02-01',
          dataPoints: 1,
          cacheHit: false,
          computeTimeMs: 1,
        },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/performance/breakdown`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        fundName: FIDELITY_FUND.name,
        asOfDate: '2026-02-01',
        groupBy: url.searchParams.get('groupBy') ?? 'sector',
        breakdown: FIDELITY_COMPANIES.map((company) => ({
          group: company.sector,
          companyCount: 1,
          totalDeployed: company.invested,
          currentValue: company.currentValue,
          moic: company.moic,
          irr: null,
          unrealizedGain: company.currentValue - company.invested,
          percentOfPortfolio: company.invested / FIDELITY_FUND.deployedCapital,
        })),
        totals: {
          companyCount: FIDELITY_COMPANIES.length,
          totalDeployed: FIDELITY_FUND.deployedCapital,
          currentValue: FIDELITY_METRICS.actual.currentNAV,
          averageMOIC: 2.77,
          portfolioIRR: FIDELITY_METRICS.actual.irr,
        },
        meta: { cacheHit: false, computeTimeMs: 1 },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/performance/comparison`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        fundName: FIDELITY_FUND.name,
        comparisons: [],
        meta: { cacheHit: false, computeTimeMs: 1 },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/allocations/latest`
    ) {
      await fulfillJson(route, {
        companies: [],
        metadata: {
          total_planned_cents: 0,
          total_deployed_cents: 0,
          companies_count: 0,
          last_updated_at: null,
        },
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/funds/${FIDELITY_FUND.id}/allocation-scenarios`
    ) {
      await fulfillJson(route, { scenarios: [] });
      return;
    }

    if (request.method() === 'GET' && url.pathname === `/api/funds/${FIDELITY_FUND.id}/results`) {
      await fulfillJson(route, fundResultsResponse());
      return;
    }

    if (
      request.method() === 'GET' &&
      (url.pathname === `/api/funds/${FIDELITY_FUND.id}/lifecycle-history` ||
        url.pathname === `/api/funds/${FIDELITY_FUND.id}/results-comparison`)
    ) {
      await fulfillJson(route, { fundId: FIDELITY_FUND.id, entries: [], comparisons: [] });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname.startsWith(`/api/funds/${FIDELITY_FUND.id}/sensitivity/`)
    ) {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/backtesting/scenarios') {
      await fulfillJson(route, {
        scenarios: ['financial_crisis_2008', 'covid_2020', 'bull_market_2021'],
      });
      return;
    }

    if (
      request.method() === 'GET' &&
      url.pathname === `/api/backtesting/fund/${FIDELITY_FUND.id}/history`
    ) {
      await fulfillJson(route, {
        fundId: FIDELITY_FUND.id,
        pagination: {
          limit: Number(url.searchParams.get('limit') ?? 10),
          offset: Number(url.searchParams.get('offset') ?? 0),
          count: 0,
          hasMore: false,
        },
        history: [],
      });
      return;
    }

    unexpectedRequests.push(label);
    await fulfillJson(
      route,
      { error: 'UNEXPECTED_ROUTE_FUND_FIDELITY_API_REQUEST', request: label },
      500
    );
  });

  return { unexpectedRequests, observedFundRequests };
}

async function readHeaderText(page: Page) {
  const header = page.locator('div.sticky').filter({
    has: page.getByRole('heading', { name: FIDELITY_FUND.name }),
  });
  await expect(header).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
  await expect(header.getByText('Live metrics')).toBeVisible({ timeout: ROUTE_READY_TIMEOUT_MS });
  return ((await header.textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

function expectHeaderFacts(headerText: string) {
  expect(headerText).toContain(FIDELITY_FUND.name);
  expect(headerText).toContain('Fund Size: $63M');
  expect(headerText).toContain('27% Deployed');
  expect(headerText).toContain('Total Invested$17M');
  expect(headerText).toContain('Current Value$47M');
  expect(headerText).toContain('Active3');
  expect(headerText).toContain('Remaining$46M');

  expect(headerText).not.toContain('$100M');
  expect(headerText).not.toContain('$150.0M');
  expect(headerText).not.toContain('$43M');
  expect(headerText).not.toContain('$0');
  expect(headerText).not.toMatch(/(^|\D)68%($|\D)/);
}

test.describe('route fund context fidelity', () => {
  for (const routePath of ROUTE_SLICE) {
    test(`shows canonical active fund facts on ${routePath}`, async ({ page }) => {
      const consoleFailures: string[] = [];
      const failedResponses: string[] = [];

      page.on('console', (message) => {
        if (message.type() === 'error') {
          consoleFailures.push(message.text());
        }
      });
      page.on('response', (response) => {
        const url = new URL(response.url());
        if (url.pathname.startsWith('/api/') && response.status() >= 400) {
          failedResponses.push(`${response.status()} ${url.pathname}${url.search}`);
        }
      });

      const apiTracker = await installRouteFidelityApi(page);
      await page.goto(new URL(routePath, APP_BASE_URL).toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 30_000,
      });

      const headerText = await readHeaderText(page);
      expectHeaderFacts(headerText);

      expect(apiTracker.observedFundRequests).not.toEqual(
        expect.arrayContaining([expect.stringMatching(/\/api\/funds?\/1(?:\/|\b)/)])
      );
      expect(apiTracker.observedFundRequests).toEqual(
        expect.arrayContaining([
          expect.stringMatching(new RegExp(`/api/funds/${FIDELITY_FUND.id}/metrics\\b`)),
        ])
      );
      expect(apiTracker.unexpectedRequests).toEqual([]);
      expect(failedResponses).toEqual([]);
      expect(consoleFailures).toEqual([]);
    });
  }
});
