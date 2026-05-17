import { expect, type Page, type Route } from '@playwright/test';

export const MOCK_FUND = {
  id: 1,
  name: 'Test Fund I',
  size: 100_000_000,
  managementFee: 0.02,
  carryPercentage: 0.2,
  vintageYear: 2025,
  deployedCapital: 16_700_000,
  status: 'active',
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  termYears: 10,
};

export const MOCK_COMPANIES = [
  {
    id: 1,
    name: 'TechCorp',
    sector: 'SaaS',
    stage: 'Series A',
    invested: 5_000_000,
    currentValue: 12_500_000,
    moic: 2.5,
    status: 'active',
  },
  {
    id: 2,
    name: 'HealthAI',
    sector: 'HealthTech',
    stage: 'Seed',
    invested: 6_700_000,
    currentValue: 18_000_000,
    moic: 2.69,
    status: 'active',
  },
  {
    id: 3,
    name: 'DataFlow',
    sector: 'Data',
    stage: 'Series B',
    invested: 5_000_000,
    currentValue: 15_600_000,
    moic: 3.12,
    status: 'active',
  },
];

const unexpectedApiRequestsByPage = new WeakMap<Page, string[]>();

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

const FUND_RESULTS = {
  status: 'ready',
  fundId: MOCK_FUND.id,
  fund: {
    name: MOCK_FUND.name,
    vintageYear: MOCK_FUND.vintageYear,
    size: MOCK_FUND.size,
  },
  lifecycle: {
    fundId: MOCK_FUND.id,
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
      correlationId: 'qa-correlation',
      dispatchState: 'dispatched',
      availableSnapshotTypes: ['RESERVE', 'PACING'],
      expectedSnapshotTypes: ['RESERVE', 'PACING'],
      lastCalculatedAt: '2026-01-31T00:00:00.000Z',
      lastError: null,
      legacyEvidence: false,
    },
    legacy: {
      engineResultsPresent: false,
    },
  },
  sections: {
    reserve: {
      status: 'available',
      calculatedAt: '2026-01-31T00:00:00.000Z',
      source: 'fund_snapshots',
      legacyEvidence: false,
      payload: {
        totalAllocation: 10_000_000,
        reserveRatio: 0.4,
        avgConfidence: 0.8,
        allocations: [
          {
            allocation: 2_000_000,
            confidence: 0.8,
            rationale: 'QA reserve fixture',
          },
        ],
      },
    },
    pacing: {
      status: 'available',
      calculatedAt: '2026-01-31T00:00:00.000Z',
      source: 'fund_snapshots',
      legacyEvidence: false,
      payload: {
        deploymentRate: 0.167,
        yearsToFullDeploy: 5,
        totalQuarters: 20,
        marketCondition: 'neutral',
        deployments: [
          {
            quarter: 1,
            deployment: 1_000_000,
            note: 'QA pacing fixture',
          },
        ],
      },
    },
    scorecard: {
      status: 'available',
      payload: {
        fundName: { value: MOCK_FUND.name, source: 'funds' },
        fundSize: { value: MOCK_FUND.size, source: 'funds' },
        vintageYear: { value: MOCK_FUND.vintageYear, source: 'funds' },
        lastCalculatedAt: {
          value: '2026-01-31T00:00:00.000Z',
          source: 'fund_state',
        },
      },
    },
    scenarios: {
      status: 'unavailable',
      reason: 'Scenario results are not part of the QA fixture',
    },
    waterfall: {
      status: 'unavailable',
      reason: 'Waterfall results are not part of the QA fixture',
    },
    economics: {
      status: 'unavailable',
      reason: 'Economics results are not part of the QA fixture',
    },
  },
};

const UNIFIED_METRICS = {
  fundId: MOCK_FUND.id,
  fundName: MOCK_FUND.name,
  actual: {
    asOfDate: '2026-01-31T00:00:00.000Z',
    totalCommitted: MOCK_FUND.size,
    totalCalled: 20_000_000,
    totalDeployed: MOCK_FUND.deployedCapital,
    totalUncalled: 80_000_000,
    currentNAV: 46_100_000,
    totalDistributions: 1_000_000,
    totalValue: 47_100_000,
    irr: 0.185,
    tvpi: 2.36,
    dpi: 0.05,
    rvpi: 2.31,
    activeCompanies: MOCK_COMPANIES.length,
    exitedCompanies: 0,
    writtenOffCompanies: 0,
    totalCompanies: MOCK_COMPANIES.length,
    deploymentRate: 16.7,
    averageCheckSize: MOCK_FUND.deployedCapital / MOCK_COMPANIES.length,
  },
  projected: {
    asOfDate: '2026-01-31T00:00:00.000Z',
    projectionDate: '2026-01-31T00:00:00.000Z',
    projectedDeployment: [],
    projectedDistributions: [],
    projectedNAV: [],
    expectedTVPI: 2.5,
    expectedIRR: 0.2,
    expectedDPI: 1.0,
    totalReserveNeeds: 10_000_000,
    allocatedReserves: 2_000_000,
    unallocatedReserves: 8_000_000,
    reserveAllocationRate: 20,
    deploymentPace: 'behind',
    quartersRemaining: 16,
    recommendedQuarterlyDeployment: 2_000_000,
  },
  target: {
    targetFundSize: MOCK_FUND.size,
    targetIRR: 0.2,
    targetTVPI: 2.5,
    targetDPI: 1.0,
    targetDeploymentYears: 4,
    targetCompanyCount: 20,
    targetAverageCheckSize: 5_000_000,
    targetReserveRatio: 0.4,
  },
  variance: {
    deploymentVariance: {
      actual: MOCK_FUND.deployedCapital,
      target: 25_000_000,
      variance: -8_300_000,
      percentDeviation: -33.2,
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
      projected: 2.5,
      target: 2.5,
      varianceVsProjected: -0.14,
      varianceVsTarget: -0.14,
    },
    paceVariance: {
      status: 'behind',
      monthsDeviation: -6,
      periodElapsedPercent: 25,
      capitalDeployedPercent: 16.7,
    },
    portfolioVariance: {
      actualCompanies: MOCK_COMPANIES.length,
      targetCompanies: 20,
      variance: MOCK_COMPANIES.length - 20,
      onTrack: false,
    },
  },
  lastUpdated: '2026-01-31T00:00:00.000Z',
};

function asJson(body: unknown, status = 200) {
  return {
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill(asJson(body, status));
}

function requestLabel(route: Route): string {
  const request = route.request();
  const url = new URL(request.url());
  return `${request.method()} ${url.pathname}${url.search}`;
}

export async function installQaAuditApi(page: Page) {
  const unexpectedRequests: string[] = [];
  unexpectedApiRequestsByPage.set(page, unexpectedRequests);

  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());

    if (url.pathname === '/api/telemetry/wizard') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname === '/api/metrics/rum') {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (url.pathname.startsWith('/api/v1/image/')) {
      await route.fulfill({ status: 204, body: '' });
      return;
    }

    if (request.method() === 'GET' && url.pathname === '/api/funds') {
      await fulfillJson(route, [MOCK_FUND]);
      return;
    }

    if (url.pathname === '/api/dashboard-summary/1') {
      await fulfillJson(route, {
        fund: MOCK_FUND,
        metrics: { totalValue: 46_100_000, irr: 0.18, tvpi: 2.76, dpi: 0.05 },
        summary: { deploymentRate: 16.7, companiesCount: 3, targetCompanies: 20 },
        portfolioCompanies: MOCK_COMPANIES,
      });
      return;
    }

    if (url.pathname === '/api/fund-metrics/1' || url.pathname === '/api/funds/1/metrics') {
      await fulfillJson(route, UNIFIED_METRICS);
      return;
    }

    if (url.pathname === '/api/funds/1/data') {
      await fulfillJson(route, {
        fund: MOCK_FUND,
        investments: [],
        valuations: [],
        capitalCalls: [],
        distributions: [],
        feeExpenses: [],
      });
      return;
    }

    if (url.pathname === '/api/portfolio' || url.pathname === '/api/portfolio-companies') {
      await fulfillJson(route, MOCK_COMPANIES);
      return;
    }

    if (url.pathname === '/api/deals/opportunities') {
      await fulfillJson(route, {
        success: true,
        data: [],
        pagination: { hasMore: false, nextCursor: null, count: 0 },
      });
      return;
    }

    if (url.pathname === '/api/deals/stages') {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }

    if (url.pathname === '/api/pipeline' || url.pathname === '/api/reports') {
      await fulfillJson(route, []);
      return;
    }

    if (url.pathname === '/api/funds/1/variance-dashboard') {
      await fulfillJson(route, EMPTY_VARIANCE_DASHBOARD);
      return;
    }

    if (
      url.pathname === '/api/funds/1/variance-reports' ||
      url.pathname === '/api/funds/1/baselines' ||
      url.pathname === '/api/funds/1/alerts'
    ) {
      await fulfillJson(route, { success: true, data: [], count: 0 });
      return;
    }

    if (url.pathname === '/api/funds/1/performance/timeseries') {
      await fulfillJson(route, {
        fundId: 1,
        fundName: MOCK_FUND.name,
        granularity: 'monthly',
        timeseries: [
          {
            date: '2026-01-31',
            actual: { irr: 0.18, tvpi: 2.76, dpi: 0.05, totalValue: 46_100_000 },
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
      });
      return;
    }

    if (url.pathname === '/api/funds/1/performance/breakdown') {
      await fulfillJson(route, {
        fundId: 1,
        fundName: MOCK_FUND.name,
        asOfDate: '2026-01-31',
        groupBy: url.searchParams.get('groupBy') ?? 'sector',
        breakdown: MOCK_COMPANIES.map((company) => ({
          group: company.sector,
          companyCount: 1,
          totalDeployed: company.invested,
          currentValue: company.currentValue,
          moic: company.moic,
          irr: null,
          unrealizedGain: company.currentValue - company.invested,
          percentOfPortfolio: company.invested / 16_700_000,
        })),
        totals: {
          companyCount: 3,
          totalDeployed: 16_700_000,
          currentValue: 46_100_000,
          averageMOIC: 2.77,
          portfolioIRR: 0.18,
        },
        meta: { cacheHit: false, computeTimeMs: 1 },
      });
      return;
    }

    if (url.pathname === '/api/funds/1/performance/comparison') {
      await fulfillJson(route, {
        fundId: 1,
        fundName: MOCK_FUND.name,
        comparisons: [],
        meta: { cacheHit: false, computeTimeMs: 1 },
      });
      return;
    }

    if (url.pathname === '/api/funds/1/allocations/latest') {
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

    if (url.pathname === '/api/funds/1/allocation-scenarios') {
      await fulfillJson(route, { scenarios: [] });
      return;
    }

    if (url.pathname === '/api/funds/1/results') {
      await fulfillJson(route, FUND_RESULTS);
      return;
    }

    if (url.pathname === '/api/funds/1/lifecycle-history') {
      await fulfillJson(route, { fundId: 1, entries: [] });
      return;
    }

    if (url.pathname === '/api/funds/1/results-comparison') {
      await fulfillJson(route, { fundId: 1, comparisons: [] });
      return;
    }

    if (url.pathname.startsWith('/api/funds/1/sensitivity/')) {
      await fulfillJson(route, { success: true, data: [] });
      return;
    }

    if (url.pathname === '/api/backtesting/scenarios') {
      await fulfillJson(route, {
        scenarios: ['financial_crisis_2008', 'covid_2020', 'bull_market_2021'],
      });
      return;
    }

    if (url.pathname === '/api/backtesting/fund/1/history') {
      await fulfillJson(route, {
        fundId: 1,
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

    unexpectedRequests.push(requestLabel(route));
    await fulfillJson(
      route,
      { error: 'UNEXPECTED_API_REQUEST', request: requestLabel(route) },
      500
    );
  });
}

export async function expectNoUnexpectedApiRequests(page: Page) {
  expect(unexpectedApiRequestsByPage.get(page) ?? []).toEqual([]);
}

export function mainContent(page: Page) {
  return page.locator('main').last();
}

async function normalizedMainText(page: Page) {
  return ((await mainContent(page).textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

export async function readMainText(page: Page) {
  const main = mainContent(page);
  await expect(main).toBeVisible();
  await expect
    .poll(() => normalizedMainText(page), { timeout: 10_000 })
    .not.toBe('Loading page...');
  return normalizedMainText(page);
}

export async function captureMainPageState(page: Page, route: string) {
  const pageText = (await readMainText(page)).substring(0, 1_200);
  const has404 = /page not found|404/i.test(pageText);
  const hasLoadingSpinner = await page
    .locator('.animate-spin')
    .first()
    .isVisible()
    .catch(() => false);
  const title = await page.title().catch(() => '');

  return {
    route,
    url: page.url(),
    title,
    has404,
    hasLoadingSpinner,
    pageText,
  };
}
